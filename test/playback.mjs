// Headless checks of the diagram playback (ui/playback.ts) and the engine
// trace it plays (ui/simulate.ts's trace): compile DSL through the real
// backend (output/Main), trace the run, and assert what the animate toggle
// reads — levels identical to the chart's, rates that conserve against
// them, one shared scale for tanks and one for pipes, loop activity, and
// each loop's causal pulse route. Both modules are dependency-free with
// type-only imports, so node runs them directly (type stripping).
// Run with:   node test/playback.mjs
import * as M from '../output/Main/index.js';
import { simulate, trace, hasNumbers, T_END, DT } from '../ui/simulate.ts';
import { playback, loopPlans, loopActivity, pulseAt, waterSpans, HOP_SECONDS } from '../ui/playback.ts';
import { exampleList } from '../ui/example.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };
const sys = (input) => {
  const out = JSON.parse(M.go(input));
  if (typeof out === 'string') throw new Error(`compile error for ${JSON.stringify(input)}: ${out}`);
  return out;
};
const example = (label) => {
  const ex = exampleList.find(x => x.label === label);
  if (!ex) throw new Error(`no example ${label}`);
  return ex.content;
};
const idOf = (system, label) => {
  const n = system.nodes.find(x => x.label === label);
  if (!n) throw new Error(`no node ${label}`);
  return n.id;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const steps = (tEnd) => Math.round(tEnd / DT);

// The trace IS the chart's run: for every numeric example, its levels are
// simulate()'s sample for sample, and every faucet's rate series aligns
// with them one-for-one (steps + 1 samples) — at the default horizon and
// a longer one.
for (const { label, content } of exampleList) {
  const system = sys(content);
  if (!hasNumbers(system) || !system.nodes.some(n => n.type === 'stock')) continue;
  for (const tEnd of [T_END, 17]) {
    const run = trace(system, tEnd);
    const chart = simulate(system, tEnd);
    if (run.dt !== DT || run.tEnd !== tEnd) fail(label, `trace carries dt=${run.dt} tEnd=${run.tEnd}`);
    if (JSON.stringify(run.stocks) !== JSON.stringify(chart))
      fail(label, `trace levels differ from simulate() at t=${tEnd}`);
    const faucets = system.nodes.filter(n => n.type === 'faucet');
    if (run.rates.length !== faucets.length)
      fail(label, `${run.rates.length} rate series for ${faucets.length} faucets`);
    if (run.rates.some(r => r.rates.length !== steps(tEnd) + 1))
      fail(label, `rate series must carry ${steps(tEnd) + 1} samples at t=${tEnd}`);
  }
}

// The rates are the APPLIED ones — post-ration — so they conserve: every
// stock's step from sample i to i+1 is its inflows' minus its outflows'
// rates[i]·DT (the engine's v1 wiring: a faucet drains the stock of its
// first stock→faucet pipe and fills that of its first faucet→stock pipe).
for (const { label, content } of exampleList) {
  const system = sys(content);
  if (!hasNumbers(system) || !system.nodes.some(n => n.type === 'stock')) continue;
  const run = trace(system);
  const type = new Map(system.nodes.map(n => [n.id, n.type]));
  const rateOf = new Map(run.rates.map(r => [r.id, r.rates]));
  const flows = system.links.filter(l => l.type === 'flow');
  const wires = system.nodes.filter(n => n.type === 'faucet').map(f => ({
    rates: rateOf.get(f.id),
    source: flows.find(l => l.target === f.id && type.get(l.source) === 'stock')?.source ?? null,
    sink: flows.find(l => l.source === f.id && type.get(l.target) === 'stock')?.target ?? null,
  }));
  let worst = null;
  for (const s of run.stocks) {
    for (let i = 0; i < s.levels.length - 1; i++) {
      let net = 0;
      for (const w of wires) {
        if (w.sink === s.id) net += w.rates[i] * DT;
        if (w.source === s.id) net -= w.rates[i] * DT;
      }
      const step = s.levels[i + 1] - s.levels[i];
      if (!near(step, net, 1e-9) && worst == null)
        worst = `${s.label} step ${i}: moved ${step}, rates say ${net}`;
    }
  }
  if (worst) fail(`${label} conservation`, worst);
}

// figures 5 & 6: the tub drains at exactly 5 until it is empty; the
// closing sample (t = 10, the tub dry) rations the outflow to 0. The tank
// reads the level over the run's peak (the opening 50), interpolating
// between Euler steps and clamping outside the run.
{
  const system = sys(example('figure 5 & 6'));
  const run = trace(system);
  const tub = idOf(system, 'water in tub'), out = idOf(system, 'outflow'), inf = idOf(system, 'inflow');
  const outRates = run.rates.find(r => r.id === out).rates;
  if (!outRates.slice(0, steps(T_END)).every(v => v === 5) || outRates[steps(T_END)] !== 0)
    fail('figure 5 trace', `outflow must run 5 then close dry, got ${outRates.slice(-3)}`);
  if (!run.rates.find(r => r.id === inf).rates.every(v => v === 0))
    fail('figure 5 trace', 'the bare inflow is a closed tap');
  const pb = playback(run);
  if (pb.tEnd !== T_END) fail('figure 5 playback', `tEnd ${pb.tEnd}`);
  if (pb.fill(tub, 0) !== 1 || pb.fill(tub, 5) !== 0.5 || pb.fill(tub, 10) !== 0)
    fail('figure 5 playback', `fills ${pb.fill(tub, 0)} / ${pb.fill(tub, 5)} / ${pb.fill(tub, 10)}, want 1 / 0.5 / 0`);
  if (pb.level(tub, 5) !== 25) fail('figure 5 playback', `level at t=5: ${pb.level(tub, 5)}, want 25`);
  // Every sample time reads its sample exactly, float dust in i·DT and all.
  const tubLevels = run.stocks[0].levels;
  if (!tubLevels.every((v, i) => pb.level(tub, i * DT) === v))
    fail('figure 5 playback', 'sample times must read their samples exactly');
  if (pb.level(tub, DT / 2) !== 49.875)
    fail('figure 5 playback', `half a step in: ${pb.level(tub, DT / 2)}, want 49.875 (linear)`);
  if (pb.level(tub, -3) !== 50 || pb.level(tub, 99) !== 0)
    fail('figure 5 playback', 'times outside the run clamp to its ends');
  if (pb.pace(out, 3) !== 1 || pb.pace(inf, 3) !== 0 || pb.pace(out, 10) !== 0)
    fail('figure 5 playback', `paces ${pb.pace(out, 3)} / ${pb.pace(inf, 3)} / ${pb.pace(out, 10)}`);
  if (pb.level('stock#999', 3) !== 0 || pb.fill('stock#999', 3) !== 0 || pb.pace('faucet#999', 3) !== 0)
    fail('figure 5 playback', 'an id the run does not hold reads 0');
}

// One level scale for every tank: figure 11's iced coffee fills against
// the HOT coffee's 100 (the run's peak), so the two converge on the same
// room-temperature fill instead of the iced tank brimming at its own ~17.
{
  const system = sys(example('figure 10 & 11'));
  const pb = playback(trace(system));
  const hot = idOf(system, 'hot coffee'), iced = idOf(system, 'iced coffee');
  if (pb.fill(hot, 0) !== 1 || pb.fill(iced, 0) !== 0)
    fail('figure 11 scale', `opening fills ${pb.fill(hot, 0)} / ${pb.fill(iced, 0)}, want 1 / 0`);
  for (const t of [2.5, 5, 10]) {
    if (!near(pb.fill(iced, t), pb.level(iced, t) / 100))
      fail('figure 11 scale', `iced fill at t=${t} must be its level over the hot coffee's 100`);
  }
  if (!(Math.abs(pb.fill(hot, 10) - 0.18) < 0.07 && Math.abs(pb.fill(iced, 10) - 0.18) < 0.07))
    fail('figure 11 scale', `both tanks close on 18/100, got ${pb.fill(hot, 10)} / ${pb.fill(iced, 10)}`);
}

// One rate scale for every pipe and pulse: figure 13's five accounts open
// with the same tank (100 each) and the 10% account's interest running
// five times the 2% one's — never inverted, as a per-account scale would —
// and it is the 10% account that ends brimming.
{
  const system = sys(example('figure 12 & 13'));
  const pb = playback(trace(system));
  const accounts = ['two', 'four', 'six', 'eight', 'ten'].map(w => idOf(system, `${w} percent interest`));
  const opening = accounts.map(a => pb.fill(a, 0));
  if (!opening.every(f => f === opening[0]) || !(opening[0] > 0 && opening[0] < 1))
    fail('figure 13 scale', `accounts must open on one fill, got ${opening}`);
  const two = idOf(system, 'interest at two'), ten = idOf(system, 'interest at ten');
  if (!near(pb.pace(ten, 0), 5 * pb.pace(two, 0), 1e-12))
    fail('figure 13 scale', `10% pace ${pb.pace(ten, 0)} must be 5x the 2% ${pb.pace(two, 0)}`);
  if (pb.fill(accounts[4], 10) !== 1 || !(pb.fill(accounts[0], 10) < 0.5))
    fail('figure 13 scale', `ending fills ${accounts.map(a => pb.fill(a, 10).toFixed(3))}`);
  if (pb.pace(ten, 10) !== 1) fail('figure 13 scale', 'the 10% interest at the horizon is the run\'s peak flow');
}

// Loop activity reads the busiest member faucet's pace. figure 22: births
// (R0) outpace deaths (B1) at every sample — 0.21 against 0.09 of one
// population, the constant 7:3 dominance — and births at the horizon is
// the run's peak flow.
{
  const system = sys(example('figure 21 & 22'));
  const pb = playback(trace(system));
  const plans = loopPlans(system.nodes, system.links);
  const r = plans.find(p => p.name === 'R0'), b = plans.find(p => p.name === 'B1');
  if (!r || !b) fail('figure 22 activity', `loops ${plans.map(p => p.name)}`);
  else {
    const ts = Array.from({ length: steps(T_END) + 1 }, (_, i) => i * DT);
    if (!ts.every(t => loopActivity(pb, r, t) > loopActivity(pb, b, t)))
      fail('figure 22 activity', 'the births loop must outpace the deaths loop throughout');
    if (!ts.every(t => near(loopActivity(pb, b, t) / loopActivity(pb, r, t), 0.09 / 0.21, 1e-9)))
      fail('figure 22 activity', 'deaths run at 3/7 of births at every sample');
    if (loopActivity(pb, r, 10) !== 1) fail('figure 22 activity', `births peak at the horizon, got ${loopActivity(pb, r, 10)}`);
  }
}

// figure 16: only the furnace loop is live. Its opening rate (1.2 × 8) is
// the run's peak and fades as the room warms; the heat-to-outside loop's
// bare faucet is a closed tap — activity 0, a loop that never pulses.
{
  const system = sys(example('figure 15 & 16'));
  const pb = playback(trace(system));
  const plans = loopPlans(system.nodes, system.links);
  const furnace = plans.find(p => p.name === 'B0'), leak = plans.find(p => p.name === 'B1');
  if (loopActivity(pb, furnace, 0) !== 1 || !(loopActivity(pb, furnace, 5) < loopActivity(pb, furnace, 1)))
    fail('figure 16 activity', `furnace activity ${loopActivity(pb, furnace, 0)} → ${loopActivity(pb, furnace, 5)}`);
  if (![0, 2.5, 5, 10].every(t => loopActivity(pb, leak, t) === 0))
    fail('figure 16 activity', 'the unmodeled leak loop must stay quiet');
}

// Pulse routes. A hop reads `from -> to` in CAUSAL order (a reversed pipe
// crosses from its faucet back to the stock it drains), `~` marking the
// reversal, `@` the depth; within a depth, order is irrelevant.
const route = (system, plan) => {
  const byId = new Map(system.nodes.map(n => [n.id, n]));
  const name = (id) => {
    const n = byId.get(id);
    return n.type === 'port' ? byId.get(n.parent).label : n.label;
  };
  return plan.hops
    .map(h => {
      const [s, t] = [name(h.link.source), name(h.link.target)];
      const [from, to] = h.reversed ? [t, s] : [s, t];
      return `${h.depth}:${from}->${to}${h.link.type === 'flow' ? (h.reversed ? ' ~pipe' : ' pipe') : ''}`;
    })
    .sort()
    .join(' | ');
};
const expectRoute = (label, system, loopName, want, depths) => {
  const plan = loopPlans(system.nodes, system.links).find(p => p.name === loopName);
  if (!plan) { fail(label, `no loop ${loopName}`); return; }
  const got = route(system, plan);
  const wantStr = [...want].sort().join(' | ');
  if (got !== wantStr) fail(label, `${loopName} route:\n  got  ${got}\n  want ${wantStr}`);
  if (plan.depths !== depths) fail(label, `${loopName} depths ${plan.depths}, want ${depths}`);
  return plan;
};
{
  // figure 10 & 11: both coffees close a three-hop cycle from their stock —
  // the cooling OUTflow crossed back from tap to tank, the heating INflow
  // with the material.
  const system = sys(example('figure 10 & 11'));
  const b0 = expectRoute('figure 10 route', system, 'B0', [
    '0:hot coffee->discrepancy', '1:discrepancy->cooling', '2:cooling->hot coffee ~pipe'], 3);
  expectRoute('figure 10 route', system, 'B1', [
    '0:iced coffee->warming discrepancy', '1:warming discrepancy->heating', '2:heating->iced coffee pipe'], 3);
  if (b0 && b0.faucets.join() !== idOf(system, 'cooling')) fail('figure 10 route', `B0 faucets ${b0.faucets}`);
  // pulseAt: one hop at a time, HOP_SECONDS each, then home.
  if (b0) {
    const at = (age) => pulseAt(b0, age).map(p => `${p.hop.depth}@${p.frac.toFixed(2)}`).join();
    if (at(0) !== '0@0.00' || at(HOP_SECONDS * 1.5) !== '1@0.50' || at(HOP_SECONDS * 2.98) !== '2@0.98')
      fail('figure 10 pulse', `positions ${at(0)} / ${at(HOP_SECONDS * 1.5)} / ${at(HOP_SECONDS * 2.98)}`);
    if (at(HOP_SECONDS * 3) !== '' || at(-0.1) !== '' || at(NaN) !== '')
      fail('figure 10 pulse', 'a pulse is gone once home (and never before it is born)');
  }
}
{
  // The epidemic: one faucet, two loops — the R loop fills `infected`
  // along the inflow, the B loop drains `susceptible` back against it.
  const system = sys(example('epidemic'));
  expectRoute('epidemic route', system, 'R0', ['0:infected->infection', '1:infection->infected pipe'], 2);
  expectRoute('epidemic route', system, 'B1', ['0:susceptible->infection', '1:infection->susceptible ~pipe'], 2);
}
{
  // figure 9 (value-less): the four-hop balancing loop, stock to stock.
  const system = sys(example('figure 9'));
  expectRoute('figure 9 route', system, 'B0', [
    '0:energy available for work->discrepancy', '1:discrepancy->coffee intake',
    '2:coffee intake->metabolic mobilization of energy',
    '3:metabolic mobilization of energy->energy available for work pipe'], 4);
}
{
  // figure 37's partial annotation fans out: capital reaches profit and
  // extraction at once, and extraction's arrow into profit follows.
  const system = sys(example('figure 37'));
  const b2 = expectRoute('figure 37 route', system, 'B2', [
    '0:capital->profit', '0:capital->extraction', '1:extraction->profit'], 2);
  if (b2 && pulseAt(b2, 0.1).length !== 2) fail('figure 37 pulse', 'two hops in flight at depth 0');
}
{
  // Edge cases: a stock-less loop starts at its lowest id; a stock with no
  // way out yields the start to a member with one; a link the walk never
  // reaches sets out from its own tail at depth 0; a lone member has no
  // route; a faucet-less loop reads no activity.
  const dots = sys('R(a -> b)\nb -> a');
  expectRoute('dot loop', dots, 'R0', ['0:a->b', '1:b->a'], 2);
  const intoStock = sys('[s]\nR(x -> s)');
  expectRoute('stock sink', intoStock, 'R0', ['0:x->s'], 1);
  const twoTails = sys('R(a -> b <- c)');
  expectRoute('two tails', twoTails, 'R0', ['0:a->b', '0:c->b'], 1);
  const lone = sys('R(a)');
  expectRoute('lone member', lone, 'R0', [], 0);
  const plan = loopPlans(dots.nodes, dots.links)[0];
  if (loopActivity(playback(trace(dots)), plan, 0) !== null)
    fail('dot loop', 'a loop with no faucet reads null activity');
  if (loopPlans(sys('[a: 1] =>f |').nodes, []).length !== 0)
    fail('no loops', 'a model without annotations plans no pulses');
}
{
  // Plans accept links whose endpoints d3 already rewrote to node objects
  // (the app plans on its recycled, force-bound copies).
  const system = sys(example('figure 10 & 11'));
  const byId = new Map(system.nodes.map(n => [n.id, n]));
  const bound = system.links.map(l => ({ ...l, source: byId.get(l.source), target: byId.get(l.target) }));
  const a = loopPlans(system.nodes, system.links).map(p => p.hops.map(h => `${h.depth}${h.reversed}`).join());
  const b = loopPlans(system.nodes, bound).map(p => p.hops.map(h => `${h.depth}${h.reversed}`).join());
  if (a.join('|') !== b.join('|')) fail('bound links', `plans differ: ${a} vs ${b}`);
}

{
  // The water line never strikes through a stock's texts: a box whose band
  // it crosses cuts its padded width out; boxes it misses leave it whole; a
  // box wider than the tank hides it; slivers under a pixel go.
  const show = (spans) => spans.map(([a, z]) => `${a}..${z}`).join(' ') || '(none)';
  const expect = (label, got, want) => {
    if (show(got) !== want) fail(`water line: ${label}`, `got ${show(got)}, want ${want}`);
  };
  const name = { x: -26, y: -8, width: 52, height: 14 }; // band -9.5..7.5 with the pad
  const readout = { x: -15, y: 9, width: 30, height: 12 }; // band 7.5..22.5
  expect('no texts', waterSpans(0, -47, 47, []), '-47..47');
  expect('through the name', waterSpans(0, -47, 47, [name, readout]), '-47..-29 29..47');
  expect('through the readout', waterSpans(16, -47, 47, [name, readout]), '-47..-18 18..47');
  expect('clear of both', waterSpans(30, -47, 47, [name, readout]), '-47..47');
  expect('above the name', waterSpans(-9.6, -47, 47, [name]), '-47..47');
  expect('at the padded band edge', waterSpans(-9.5, -47, 47, [name]), '-47..-29 29..47');
  expect('between the two bands', waterSpans(7.5, -47, 47, [name, readout]), '-47..-29 29..47');
  expect('a name wider than the tank', waterSpans(0, -47, 47, [{ x: -60, y: -8, width: 120, height: 14 }]), '(none)');
  expect('a sliver under a pixel', waterSpans(0, -47, 47, [{ x: -43.5, y: -8, width: 87, height: 14 }]), '(none)');
  expect('an off-centre box', waterSpans(0, -47, 47, [{ x: 10, y: -8, width: 20, height: 14 }]), '-47..7 33..47');
  expect('a custom gap', waterSpans(0, -47, 47, [name], 0), '-47..-26 26..47');
}

console.log(failures ? `${failures} FAILURE(S)` : 'PLAYBACK CHECKS PASSED');
process.exit(failures ? 1 : 0);
