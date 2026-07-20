import * as d3 from "d3";

import * as interpreter from '../output/Main/index'
import type { Node, Link, System } from "./type";
import faucetSvg from './shape/faucet.svg'
import cloudSvg from './shape/cloud.svg'
import { exampleList } from "./example";

const container = d3.select('body')
  .append('div')
  .attr('class', 'container')
  .style('display', 'flex')
  .style('flex-direction', 'column')
const pre = container
  .append('pre')
  .attr('class', 'pre-output')
  .style('order', 9)
  .style('min-height', '2em')
  .style('border', '1px solid black')
  .style('white-space', 'pre-wrap')
  .style('word-wrap', 'break-word')
const examples = container
  .append('div')
  .style('order', 2)
examples.append('button')
  .text('a->b')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b=>c d')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('[a]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b->[c]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b=>c [d]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('|->a->b=>c [d]=>e|')
  .on('click', function () {
    loadExample(this.textContent);
  });
exampleList.map(x => {
  const { label, content } = x
  examples.append('button')
    .text(label)
    .on('click', function () {
      loadExample(content);
    });
})


const svgWidth = 700
const svgHeight = 600
// Current viewBox, eased toward the auto-fit target each tick (zoom-out only).
let viewX = 0, viewY = 0, viewW = svgWidth, viewH = svgHeight;

const svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any> = container
  .append('svg')
  .attr('class', 'svg')
  .style('order', 1)
  .style('width', svgWidth)
  .style('height', svgHeight)
  .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
  .style('border', '1px solid black')
  .on("click", click)
const textInput = container
  .append('textarea')
  .attr('class', 'text-input')
  .style('order', 2)
  .style('width', '80em')
  .style('height', '10em')
  .on('input', function (e: Event) {
    try {
      if (!(e.target instanceof HTMLTextAreaElement)) {
        throw new Error("Event target is not a HTMLTextAreaElement");
      }
      const input = e.target.value;
      const output = interpreter.go(input);
      const result = JSON.parse(output) as unknown;
      if (typeof result === 'string') {
        // Compile error: show it and keep the last good graph on screen.
        pre.style('color', '#b00020')
          .style('border', '1px solid #b00020')
          .text(result);
        return;
      }
      const parse = result as System;
      console.log('parse::', parse)

      pre.style('color', null)
        .style('border', '1px solid black')
        .text(JSON.stringify(parse, null, 2));
      update(parse)
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Error occurred while processing input:", error.message, error);
        console.error(error);
        return
      }
      console.error("An unknown error occurred:", error);
    }
  })

// Arrowhead markers. Both anchor their BASE at the path's end (refX 0) so the
// line stops cleanly where the triangle starts and the head extends beyond it —
// no line poking out around the narrowing tip. Sized in user-space pixels.
const flowArrowLength = 24; // big solid head for pipes (Meadows notation)
const infoArrowLength = 9;  // small head for thin info arcs
const defs = svg.append("defs");
defs.append("marker")
  .attr("id", "flow-arrow")
  .attr("viewBox", "0 0 10 10")
  .attr("refX", 0)
  .attr("refY", 5)
  .attr("markerWidth", flowArrowLength)
  .attr("markerHeight", flowArrowLength)
  .attr("markerUnits", "userSpaceOnUse")
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,0L10,5L0,10Z")
  .attr("fill", "#999");
defs.append("marker")
  .attr("id", "info-arrow")
  .attr("viewBox", "0 0 10 10")
  .attr("refX", 0)
  .attr("refY", 5)
  .attr("markerWidth", infoArrowLength)
  .attr("markerHeight", infoArrowLength)
  .attr("markerUnits", "userSpaceOnUse")
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,0L10,5L0,10Z")
  .attr("fill", "#000");
// Small open circle at an info arc's tail (Meadows notation): centered on the
// path's start point, so the trimmed arc must begin at the source's edge.
const infoTailRadius = 4;
defs.append("marker")
  .attr("id", "info-tail")
  .attr("viewBox", "0 0 10 10")
  .attr("refX", 5)
  .attr("refY", 5)
  .attr("markerWidth", infoTailRadius * 2)
  .attr("markerHeight", infoTailRadius * 2)
  .attr("markerUnits", "userSpaceOnUse")
  .attr("orient", "auto")
  .append("circle")
  .attr("cx", 5)
  .attr("cy", 5)
  .attr("r", 4)
  .attr("fill", "#fff")
  .attr("stroke", "#000")
  .attr("stroke-width", 1.5);

// Flow pipes render BELOW the nodes (a faucet must sit on top of its pipe).
let flowLink = svg.append("g")
  .attr("fill", "none")
  .selectAll<SVGPathElement, Link>("path");

// Meadows size hierarchy, faucet held at 40px as the reference unit: stocks
// dominate (~2.3x the faucet, 4:3), clouds sit between, aux dots are tiny.
const dotRadius = 5;
const stockWidth = 96;
const stockHeight = 72;
const faucetWidth = 40;
const faucetHeight = 40
const cloudWidth = 52;
const cloudHeight = 52;

// Distance from a node's center to where links should stop. Stock uses its
// half-width (pipes enter horizontally); info arcs into a stock's top/bottom
// stop a touch early — acceptable scalar approximation.
function edgeOf(d: Node): number {
  switch (d.type) {
    case "stock": return stockWidth / 2;
    case "cloud": return cloudWidth / 2;
    case "dot": return dotRadius + 4;
    default: return faucetWidth / 2;
  }
}

// Each node is a <g> that holds its shape *and* its text label, so the two
// move together (positioned via a transform in ticked()).
let nodeDot = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeStock = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeFaucet = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeCloud = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");

// Info links render ABOVE the nodes so their open tail circles (and heads) stay
// visible where they meet a stock/cloud, and the arcs read as continuous rather
// than vanishing behind shapes.
let infoLink = svg.append("g")
  .attr("fill", "none")
  .selectAll<SVGPathElement, Link>("path");

// Loop letters render topmost: each R(...)/B(...) annotation floats its letter
// at the centroid of the member nodes carrying its name (a pure overlay — loop
// labels are not simulation nodes and feel no forces).
type LoopInstance = { name: string, letter: string, members: Node[] };
let loopLabel = svg.append("g")
  .selectAll<SVGTextElement, LoopInstance>("text");

const systemNodes: Node[] = [];
const systemLinks: Link[] = []
const system: System = { nodes: systemNodes, links: systemLinks }

const simulation = d3.forceSimulation<Node, Link>(systemNodes)
  // Flow pipes stay stiff, but info arrows are soft suggestions: at the d3
  // default strength they reel a dragged dot back to rest-length, so e.g.
  // `growth goal` could never float above its band — every equilibrium sat
  // pinned on the band line. Soft arrows let hand placement win.
  // A flow pipe's rest length is the horizontal gap between its endpoints' row
  // slots, so the pipe pulls its faucet toward the slot it was laid out in
  // rather than toward its reservoir — a long branch pipe then holds its faucet
  // out along the wide row instead of collapsing it back onto the stock. Info
  // arrows keep the fixed rest length (they aren't slotted).
  .force("link", d3.forceLink<Node, Link>(systemLinks).id(d => d.id)
    .distance(l => l.type === "flow"
      ? Math.max(40, Math.abs(((l.source as Node).gx ?? 0) - ((l.target as Node).gx ?? 0)))
      : 80)
    .strength(l => l.type === "flow" ? 0.5 : 0.2))
  // Stocks are the diagram's anchors: they repel harder than other nodes;
  // dots repel a bit more than faucets/clouds so the aux web spreads through
  // the inter-band region instead of clumping at the midline.
  .force("charge", d3.forceManyBody<Node>().strength(d =>
    d.type === "stock" ? -300 : d.type === "dot" ? -250 : -200))
  // Collision radii track the size hierarchy so big shapes push neighbors out
  // of their space; dots are tiny but their label above needs clearance.
  .force("collide", d3.forceCollide<Node>().radius(d =>
    d.type === "stock" ? 62 : d.type === "cloud" ? 30 : d.type === "dot" ? 26 : 24
  ).strength(0.85))
  .force("center", d3.forceCenter<Node>(svgWidth / 2, svgHeight / 2))
  // Stocks pull hard to their slot x (evenly spaced per band, see update());
  // everything else gets only gentle x-centering — too strong crowds each band
  // inward, and collision then escapes vertically (waving the line).
  .force("x", d3.forceX<Node>(d => d.gx ?? svgWidth / 2).strength(d => d.gx != null ? 0.25 : 0.02))
  // Stocks pin to their band's y hardest, other band members strongly (forming
  // a horizontal line); floating nodes get only a barely-there tie-breaker
  // toward center — weak enough that a dot dragged to the other side of its
  // band stays there (links + charge dominate) instead of drifting back.
  .force("y", d3.forceY<Node>(d => d.gy ?? svgHeight / 2).strength(d => d.type === "stock" ? 1.0 : d.inFlow ? 0.9 : 0.01))
  .on("tick", ticked);

let nextId = systemNodes.length;

update(system);

function update(system: System) {
  // Make a shallow copy to protect against mutation, while recycling old nodes to preserve position and velocity.
  const old = new Map(simulation.nodes().map(d => [d.id, d] as [string, Node]));
  const nodes = system.nodes.map(d => {
    const prev = old.get(d.id);
    // Clear the Maybe-omitted compiler fields before merging: a recycled node
    // would otherwise keep a stale `group`/`loop` after losing it upstream
    // (the JSON simply omits the key, so Object.assign wouldn't overwrite).
    return prev ? Object.assign(prev, { group: null, loop: null }, d) : { ...d };
  });
  const links = system.links.map(d => ({ ...d }));

  flowLink = flowLink
    .data(links.filter(l => l.type === "flow"))
    .join("path")
    .attr("fill", "none");
  infoLink = infoLink
    .data(links.filter(l => l.type !== "flow"))
    .join("path")
    .attr("fill", "none");
  nodeDot = nodeDot
    .data(nodes.filter(x => x.type === 'dot'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("circle")
        .attr("r", dotRadius)
        .attr("fill", "#fff")
        .attr("stroke", "#000")
        .attr("stroke-width", 1.5);
      // Label above the tiny circle so it stays visible.
      appendLabel(g, -12);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeStock = nodeStock
    .data(nodes.filter(x => x.type === 'stock'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("rect")
        .attr("x", -stockWidth / 2)
        .attr("y", -stockHeight / 2)
        .attr("width", stockWidth)
        .attr("height", stockHeight)
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .attr("fill", "#fff");
      // Label inside the rectangle, slightly larger than the others.
      appendLabel(g, 0, 12);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeFaucet = nodeFaucet
    .data(nodes.filter(x => x.type === 'faucet'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("image")
        .attr("href", faucetSvg)
        .attr("x", -faucetWidth / 2)
        .attr("y", -faucetHeight / 2)
        .attr("width", faucetWidth)
        .attr("height", faucetHeight);
      // Label above the icon, as in the reference figure.
      appendLabel(g, -28);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeCloud = nodeCloud
    .data(nodes.filter(x => x.type === 'cloud'), d => d.id)
    .join(enter => {
      // Clouds carry no label (theirs is just "|").
      const g = enter.append("g");
      g.append("image")
        .attr("href", cloudSvg)
        .attr("x", -cloudWidth / 2)
        .attr("y", -cloudHeight / 2)
        .attr("width", cloudWidth)
        .attr("height", cloudHeight);
      return g;
    })
    .call(drag(), undefined);

  // One floating letter per loop annotation: group the nodes by loop name
  // (a node can be in several loops) and derive each letter from its name
  // ("R0" -> "R"). ticked() parks the letter at its members' centroid.
  const loopMembers = new Map<string, Node[]>();
  for (const d of nodes) {
    for (const name of d.loop ?? []) {
      const arr = loopMembers.get(name) ?? [];
      arr.push(d);
      loopMembers.set(name, arr);
    }
  }
  const loopInstances: LoopInstance[] = [...loopMembers.entries()]
    .map(([name, members]) => ({ name, letter: name.charAt(0), members }));
  loopLabel = loopLabel
    .data(loopInstances, d => d.name)
    .join("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.32em")
    .attr("font-size", 28)
    .attr("font-family", "sans-serif")
    .attr("fill", "#444")
    .attr("pointer-events", "none")
    .text(d => d.letter);

  // Lay nodes out in horizontal bands. The compiler assigns each node a `group`
  // (a flow-connected chain of stocks/faucets/clouds), numbered top to bottom;
  // dots and reservoir-less faucets have no group and float.
  const gs = nodes.map(n => n.group).filter((g): g is number => g != null);
  const groupCount = gs.length ? Math.max(...gs) + 1 : 0;
  // Allocate the vertical gap between bands dynamically (any number of groups):
  // spread them to fill the canvas — outer bands near the top/bottom edges,
  // leaving the middle open for the floating aux web — but never tighter than a
  // comfortable minimum. With many bands the stack overflows the canvas and the
  // auto-fit viewBox zooms out, keeping the gap readable rather than cramming.
  const bandMargin = svgHeight * 0.12;
  const minBandGap = 200;
  const bandGap = groupCount > 1
    ? Math.max(minBandGap, (svgHeight - 2 * bandMargin) / (groupCount - 1))
    : 0;
  for (const d of nodes) {
    d.inFlow = d.group != null;
    d.gy = d.group == null
      ? svgHeight / 2
      : svgHeight / 2 + (d.group - (groupCount - 1) / 2) * bandGap;
  }

  // Lay every band member out along its horizontal line as one spaced,
  // left-to-right sequence (ordered by source, i.e. parser id), so faucets and
  // clouds get their own room instead of piling onto the stocks. A stock with a
  // second outflow therefore reads as one wide row — the extra branch sits
  // further along the line, reached by a longer pipe — with nothing
  // overlapping. The whole row is centred on the canvas; when it runs wider than
  // the canvas the auto-fit viewBox zooms out to keep it in view.
  const parserId = (id: string) => {
    const n = parseInt(id.slice(id.indexOf("#") + 1), 10);
    return isNaN(n) ? 0 : n;
  };
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  // Half the horizontal room a node claims on its row: the largest of its icon
  // half-width, its label half-width (~3px/char, as the viewBox padding also
  // assumes), and its collision radius (so the spacing force can't shove
  // neighbours off their slots). Keeps adjacent nodes and labels from touching.
  const slotHalf = (d: Node) => {
    const icon = d.type === "stock" ? stockWidth / 2 : d.type === "cloud" ? cloudWidth / 2 : d.type === "dot" ? dotRadius : faucetWidth / 2;
    const collide = d.type === "stock" ? 62 : d.type === "cloud" ? 30 : d.type === "dot" ? 26 : 24;
    return Math.max(icon, d.label.length * 3, collide);
  };
  const slotPad = 10; // extra breathing room between adjacent slots
  const membersByBand = new Map<number, Node[]>();
  for (const d of nodes) {
    d.gx = undefined; // clear stale slots on recycled nodes
    if (d.group != null && d.type !== "dot") {
      const arr = membersByBand.get(d.group) ?? [];
      arr.push(d);
      membersByBand.set(d.group, arr);
    }
  }
  for (const arr of membersByBand.values()) {
    arr.sort((a, b) => parserId(a.id) - parserId(b.id));
    // Walk left to right: each node's centre sits its own half-width past the
    // previous node's far edge (plus padding), so no two slots overlap.
    let cursor = 0;
    for (const d of arr) {
      cursor += slotHalf(d);
      d.gx = cursor;
      cursor += slotHalf(d) + slotPad;
    }
    const span = cursor - slotPad;          // left edge of first .. right edge of last
    const shift = svgWidth / 2 - span / 2;   // centre the row on the canvas
    for (const d of arr) d.gx = (d.gx ?? 0) + shift;
  }

  // Flow links render as thick gray straight pipes (Meadows notation); the
  // segment entering a stock/cloud carries the big triangular arrowhead — none
  // into a faucet, where the pipe visually passes through. Info links are thin
  // black curved arcs with a small head and an open circle at the tail.
  const styleLink = (sel: d3.Selection<SVGPathElement, Link, any, any>) => sel
    .attr("stroke", d => d.type === "flow" ? "#999" : "#000")
    .attr("stroke-width", d => d.type === "flow" ? 8 : 1.5)
    .attr("stroke-opacity", 1)
    .attr("marker-start", d => d.type === "flow" ? null : "url(#info-tail)")
    .attr("marker-end", d => {
      if (d.type !== "flow") return "url(#info-arrow)";
      const t = nodeById.get(d.target as string);
      return t && t.type !== "faucet" ? "url(#flow-arrow)" : null;
    });
  styleLink(flowLink);
  styleLink(infoLink);

  simulation.nodes(nodes);

  const linkForce = simulation.force<d3.ForceLink<Node, Link>>("link");
  if (!linkForce) {
    throw new Error("Link force is not defined in the simulation.");
  }
  linkForce.links(links);
  simulation.alpha(0.5).restart();
}

// How round the info arcs are: arc radius = chord length × this factor, so it
// fixes the arc's angular sweep regardless of distance. Must be ≥ 0.5:
//   0.5  -> semicircle (180°), maximum roundness
//   0.6  -> ~113° arc, the pronounced swoop of the Meadows reference figure
//   0.75 -> ~84° arc, halfway
//   1.0  -> 60° arc, the gentle bend this app previously drew
const infoArcCurvature = 0.6;
const infoArcRadius = (chord: number) => chord * infoArcCurvature;

// The info-link arc is the minor arc of the circle of radius
// `infoArcRadius(chord)` through both endpoints, drawn with the given sweep
// flag. Move both endpoints along that same circle — start forward by
// `mStart`, end back by `mEnd` arc-pixels — so the shortened path still lies
// exactly on the original arc and both markers orient to their true tangents.
// For a minor arc the sweep-1 circle center always sits at w = +1 (and the
// sweep-0 center mirrors it at w = -1); angular travel runs in the direction
// of `w`, so the start advances by +w and the end backs up by -w arc-pixels.
function trimArc(sx: number, sy: number, tx: number, ty: number, mStart: number, mEnd: number, sweep: 0 | 1): { start: { x: number, y: number }, end: { x: number, y: number } } {
  const untrimmed = { start: { x: sx, y: sy }, end: { x: tx, y: ty } };
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d < mStart + mEnd + 8) return untrimmed; // too short to trim
  const r = infoArcRadius(d);
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const ux = dx / d, uy = dy / d;
  const w = sweep === 1 ? 1 : -1;
  const cx = mx - w * uy * h, cy = my + w * ux * h;
  const a0 = Math.atan2(sy - cy, sx - cx);
  const a1 = Math.atan2(ty - cy, tx - cx);
  const as = a0 + w * (mStart / r); // arc length -> angle, along travel
  const ae = a1 - w * (mEnd / r);
  return {
    start: { x: cx + r * Math.cos(as), y: cy + r * Math.sin(as) },
    end: { x: cx + r * Math.cos(ae), y: cy + r * Math.sin(ae) },
  };
}

// Bulge apex of the candidate arc for a sweep flag: the minor arc's midpoint
// sits (r - h) off the chord midpoint, perpendicular to the chord — sweep 1
// on one side, sweep 0 mirrored. Used to score which side has more room.
function arcBulge(sx: number, sy: number, tx: number, ty: number, sweep: 0 | 1): { x: number, y: number } | null {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d === 0) return null;
  const r = infoArcRadius(d);
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const ux = dx / d, uy = dy / d;
  const w = sweep === 1 ? 1 : -1;
  return { x: (sx + tx) / 2 + w * uy * (r - h), y: (sy + ty) / 2 - w * ux * (r - h) };
}

function ticked() {
  nodeDot.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeStock.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeFaucet.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeCloud.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  // A loop letter sits at the centroid of its member nodes, tracking them
  // through the simulation (and through drags) for free.
  loopLabel.attr("transform", d => {
    const n = d.members.length || 1;
    const cx = d.members.reduce((acc, m) => acc + (m.x ?? 0), 0) / n;
    const cy = d.members.reduce((acc, m) => acc + (m.y ?? 0), 0) / n;
    return `translate(${cx},${cy})`;
  });

  // Each info arc bows away from the nearest clutter: score both candidate
  // bulge apexes by their clearance to the nearest uninvolved node and keep
  // the roomier side. Without this the sweep flag was a constant, so the bow
  // side was an accident of chord direction — a dot dragged above its band
  // got arcs sagging back down into the band. Hysteresis keeps near-ties
  // from flickering while the simulation jiggles; ties keep the legacy side.
  const sweepHysteresis = 16;
  const obstacles = simulation.nodes();
  infoLink.each(d => {
    const s = d.source as Node, t = d.target as Node;
    const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0;
    const clearance = (b: { x: number, y: number } | null) => {
      if (!b) return 0;
      let min = Infinity;
      for (const n of obstacles) {
        if (n === s || n === t) continue;
        min = Math.min(min, Math.hypot((n.x ?? 0) - b.x, (n.y ?? 0) - b.y));
      }
      return min;
    };
    const c1 = clearance(arcBulge(sx, sy, tx, ty, 1));
    const c0 = clearance(arcBulge(sx, sy, tx, ty, 0));
    if (d.sweep === undefined) d.sweep = c0 > c1 ? 0 : 1;
    else if ((d.sweep === 1 ? c0 - c1 : c1 - c0) > sweepHysteresis) d.sweep = d.sweep === 1 ? 0 : 1;
  });

  const pathFor = (d: Link) => {
      const source = d.source as Node;
      const target = d.target as Node;
      const sx = source.x ?? 0, sy = source.y ?? 0;
      const tx = target.x ?? 0, ty = target.y ?? 0;
      const dx = tx - sx, dy = ty - sy;
      const dr = Math.hypot(dx, dy);
      if (dr === 0) return `M${sx},${sy}L${tx},${ty}`;
      if (d.type === "flow") {
        // Straight pipe. The line stops at the arrowhead's BASE (marker refX
        // 0), so reservoir targets are trimmed by node edge + head length and
        // the tip lands on the node's edge. Faucet ends stay untrimmed — the
        // faucet icon sits on top of the pipe.
        const st = source.type === "faucet" ? 0 : edgeOf(source);
        const tt = target.type === "faucet" ? 0 : edgeOf(target) + flowArrowLength;
        const f = dr > st + tt + 6 ? 1 : dr / (st + tt + 6); // degenerate: scale down
        const ux = dx / dr, uy = dy / dr;
        return `M${sx + ux * st * f},${sy + uy * st * f}L${tx - ux * tt * f},${ty - uy * tt * f}`;
      }
      // Info arc: move both endpoints along the arc's own circle so the tail
      // circle sits on the source's edge and the small head at the target's,
      // instead of buried under the shapes. The radius must match trimArc's.
      const sweep = d.sweep ?? 1;
      const r = infoArcRadius(dr);
      const a = trimArc(sx, sy, tx, ty, edgeOf(source) + infoTailRadius, edgeOf(target) + infoArrowLength, sweep);
      return `M${a.start.x},${a.start.y}A${r},${r} 0 0,${sweep} ${a.end.x},${a.end.y}`;
  };
  flowLink.attr("d", pathFor);
  infoLink.attr("d", pathFor);

  // Zoom out (never in) so all nodes stay visible: target viewBox = union of
  // the nominal canvas and the padded node bbox, eased 20%/tick for smoothness.
  // Pads follow each node's own size; the x-pad also grows with the label so
  // wide names ("yield per unit capital") never clip — ~3px per char ≈ half
  // the rendered width at font-size 10; the y-pad leaves room for the labels
  // that sit above dots and faucets.
  let x0 = 0, y0 = 0, x1 = svgWidth, y1 = svgHeight;
  for (const d of simulation.nodes()) {
    if (d.x == null || d.y == null) continue;
    const padX = Math.max(edgeOf(d) + 12, d.label.length * 3);
    const padY = edgeOf(d) + 24;
    x0 = Math.min(x0, d.x - padX); y0 = Math.min(y0, d.y - padY);
    x1 = Math.max(x1, d.x + padX); y1 = Math.max(y1, d.y + padY);
  }
  const ease = 0.2;
  viewX += (x0 - viewX) * ease;
  viewY += (y0 - viewY) * ease;
  viewW += ((x1 - x0) - viewW) * ease;
  viewH += ((y1 - y0) - viewH) * ease;
  svg.attr("viewBox", `${viewX} ${viewY} ${viewW} ${viewH}`);
}

function click(event: MouseEvent) {
  const [x, y] = d3.pointer(event);
  nextId++;
  const newNode: Node = { type: "dot", id: `${nextId}`, label: `${nextId}`, x, y };
  const nearest = systemNodes[systemNodes.length - 1];
  if (nearest) {
    systemLinks.push({ source: nearest.id, target: newNode.id, type: "arrow" });
  }
  systemNodes.push(newNode);
  update({ ...system });
}

function loadExample(text: string) {
  textInput.property('value', text);
  textInput.node()?.dispatchEvent(new Event('input'));
}

// Append a centered text label to a per-node <g>; the text moves with the
// shape (the group carries the transform). `y` shifts the label off the shape
// (negative = above); 0 keeps it vertically centered on the node.
function appendLabel(g: d3.Selection<SVGGElement, Node, SVGGElement, unknown>, y = 0, fontSize = 10) {
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("y", y)
    .attr("dy", "0.32em")
    .attr("font-size", fontSize)
    .attr("font-family", "sans-serif")
    .attr("fill", "#000")
    .attr("pointer-events", "none");
}

function drag() {
  return d3.drag<any, Node>()
    .on("start", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      d.fx = null;
      d.fy = null;
    })
}
