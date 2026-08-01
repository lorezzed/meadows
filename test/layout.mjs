// Headless regression check of the diagram layout: compile DSL through the real
// backend (output/Main), run ui/layout.ts's computeLayout on the graph, and
// assert the structural invariants the app relies on — band flatness, stock
// slots, cloud edges — then settle the EXACT force simulation and assert stock
// clearance. ui/layout.ts is imported directly (node strips its types); it does
// a runtime `import * as d3`, which loads headlessly (d3-selection only touches
// `document` when a selection method runs, never at import).
// Run with:   node test/layout.mjs
import * as M from '../output/Main/index.js';
import {
  computeLayout, createSimulation,
  svgWidth, svgHeight, stockWidth, stockHeight, rowGap,
} from '../ui/layout.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };
const ok = (label, cond, msg) => { if (!cond) fail(label, msg); };

// Compile to a graph and lay it out. Value-less models are used throughout, so
// the app's displayLabel-based slot width equals this label-length estimate.
const laidOut = (input) => {
  const out = JSON.parse(M.go(input));
  if (typeof out === 'string') throw new Error(`compile error for ${JSON.stringify(input)}: ${out}`);
  computeLayout(out.nodes, out.links, (d) => d.label.length * 3);
  return out;
};

const collideR = (d) =>
  d.type === 'stock' ? 62 : d.type === 'cloud' ? 30 : d.type === 'dot' ? 26 : d.type === 'port' ? 0 : 24;

// Settle the real forces from the layout targets (seed x/y at gx/gy so the run
// is deterministic — no phyllotaxis spiral, no coincidence jiggle — and fast).
const settle = (g, ticks = 400) => {
  for (const d of g.nodes) { d.x = d.gx ?? svgWidth / 2; d.y = d.gy ?? svgHeight / 2; }
  const sim = createSimulation(g.nodes, g.links);
  sim.stop();
  for (let i = 0; i < ticks; i++) sim.tick();
  return g;
};

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const byGroup = (nodes, g) => nodes.filter((n) => n.group === g);
const flowTargets = (g) => new Set(g.links.filter((l) => l.type === 'flow').map((l) => l.target));
const flowSources = (g) => new Set(g.links.filter((l) => l.type === 'flow').map((l) => l.source));

// --- Single band: bathtub (cloud -> inflow -> [tub] -> outflow -> cloud) ------
{
  const g = laidOut('|=>inflow[water in tub]=>outflow|');
  const groups = new Set(g.nodes.filter((n) => n.group != null).map((n) => n.group));
  ok('single/band-count', groups.size === 1, `expected 1 band, got ${groups.size}`);

  const tub = g.nodes.find((n) => n.type === 'stock');
  ok('single/stock-y', near(tub.gy, svgHeight / 2), `single-band stock should sit at the midline, got ${tub.gy}`);

  // Cloud edges + left-to-right flow order: source cloud is the band's min gx,
  // sink cloud its max gx, stock strictly between the two faucets.
  const band = byGroup(g.nodes, 0);
  const xs = band.map((n) => n.gx);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const clouds = band.filter((n) => n.type === 'cloud');
  ok('single/two-clouds', clouds.length === 2, `expected 2 clouds, got ${clouds.length}`);
  const srcCloud = clouds.find((c) => flowSources(g).has(c.id));
  const sinkCloud = clouds.find((c) => flowTargets(g).has(c.id));
  ok('single/src-cloud-left', near(srcCloud.gx, minX), `source cloud should be the band's left edge (${minX}), got ${srcCloud.gx}`);
  ok('single/sink-cloud-right', near(sinkCloud.gx, maxX), `sink cloud should be the band's right edge (${maxX}), got ${sinkCloud.gx}`);
  const inflow = g.nodes.find((n) => n.label === 'inflow');
  const outflow = g.nodes.find((n) => n.label === 'outflow');
  ok('single/flow-order',
    srcCloud.gx < inflow.gx && inflow.gx < tub.gx && tub.gx < outflow.gx && outflow.gx < sinkCloud.gx,
    `left-to-right order broken: ${JSON.stringify({ src: srcCloud.gx, in: inflow.gx, tub: tub.gx, out: outflow.gx, sink: sinkCloud.gx })}`);

  // The main row is flat: every banded node shares the stock's y.
  ok('single/row-flat', band.every((n) => near(n.gy, tub.gy)), 'all banded nodes should share the band y');
}

// --- Two stocks in one band: distinct, non-overlapping slots ------------------
{
  const g = laidOut('|=>f[a]=>gg[b]=>h|');
  const stocks = g.nodes.filter((n) => n.type === 'stock');
  ok('slots/two-stocks', stocks.length === 2, `expected 2 stocks, got ${stocks.length}`);
  ok('slots/same-band', stocks[0].group === 0 && stocks[1].group === 0, 'both stocks should be in band 0');
  ok('slots/flat', near(stocks[0].gy, stocks[1].gy), `stocks should share a y, got ${stocks[0].gy} vs ${stocks[1].gy}`);
  ok('slots/no-overlap', Math.abs(stocks[0].gx - stocks[1].gx) >= stockWidth,
    `stock slots overlap: |${stocks[0].gx} - ${stocks[1].gx}| < ${stockWidth}`);
}

// --- Two bands: distinct band lines, symmetric about the midline --------------
{
  const g = laidOut('|=>f[a]=>x|\n|=>gg[b]=>y|');
  const groups = [...new Set(g.nodes.filter((n) => n.group != null).map((n) => n.group))].sort();
  ok('bands/count', groups.length === 2, `expected 2 bands, got ${groups.length}`);
  const y0 = g.nodes.find((n) => n.group === 0 && n.type === 'stock').gy;
  const y1 = g.nodes.find((n) => n.group === 1 && n.type === 'stock').gy;
  ok('bands/distinct', !near(y0, y1), `bands should have distinct y, both ${y0}`);
  ok('bands/symmetric', near((y0 + y1) / 2, svgHeight / 2), `bands should straddle the midline, mean ${(y0 + y1) / 2}`);
  ok('bands/order', y0 < y1, `band 0 should sit above band 1, got ${y0} !< ${y1}`);
}

// --- Branch row: a stock's 2nd outflow drops a row below, pipe elbows ---------
{
  // [lake] gets inflow rain (main) + outflow evaporation (first, stays inline)
  // + outflow discharge (second, dead-ends to a cloud -> branch row below).
  const g = laidOut('|=>rain[lake]=>evaporation|\n[lake]=>discharge|');
  const lake = g.nodes.find((n) => n.type === 'stock');
  const evap = g.nodes.find((n) => n.label === 'evaporation');
  const disc = g.nodes.find((n) => n.label === 'discharge');
  ok('branch/evap-inline', near(evap.gy, lake.gy), `first outflow should stay on the band, got ${evap.gy} vs ${lake.gy}`);
  ok('branch/disc-below', near(disc.gy, lake.gy + rowGap), `second outflow should drop one rowGap, got ${disc.gy} (want ${lake.gy + rowGap})`);
  const discLink = g.links.find((l) => l.type === 'flow' && l.source === lake.id && l.target === disc.id);
  ok('branch/elbow', discLink && discLink.elbow === true, 'the branch pipe (lake -> discharge) should be flagged elbow');
}

// --- Clearance: after settling the real forces, nothing sits inside a stock ---
for (const input of [
  '|=>inflow[water in tub]=>outflow|',
  '|=>f[a]=>x|\n|=>gg[b]=>y|',
  '|=>births[population]=>deaths|\nfertility->births\nmortality->deaths',
]) {
  const g = settle(laidOut(input));
  const stocks = g.nodes.filter((n) => n.type === 'stock');
  const others = g.nodes.filter((n) => n.type !== 'port');
  for (const s of stocks) {
    for (const n of others) {
      if (n === s) continue;
      const inside = Math.abs(n.x - s.x) < stockWidth / 2 && Math.abs(n.y - s.y) < stockHeight / 2;
      ok('clearance', !inside, `${n.type} "${n.label}" settled inside stock "${s.label}" for ${JSON.stringify(input)}`);
    }
  }
  // Sanity: the settle actually produced finite coordinates.
  ok('clearance/finite', g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    `non-finite settled positions for ${JSON.stringify(input)}`);
}

console.log(failures ? `${failures} FAILURE(S)` : 'LAYOUT CHECKS PASSED');
process.exit(failures ? 1 : 0);
