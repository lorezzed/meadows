import * as d3 from "d3";

import * as interpreter from '../output/Main/index'
import type { Node, Link, System } from "./type";
import faucetSvg from './shape/faucet.svg'
import cloudSvg from './shape/cloud.svg'
import { exampleList } from "./example";
import { goalRefs, hasNumbers, simulate } from "./simulate";
import { createChart, STOCK_PALETTE } from "./chart";

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
// The behavior-over-time panel. Appended right after the diagram svg: both
// carry flex order 1, and equal orders resolve by DOM position, so it sits
// directly below the diagram and above the order-2 examples/textarea.
const chart = createChart(container)
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

// What a node displays: its name, plus its value annotation when it carries
// one ("water in tub: 50", "outflow: 5", "inflow: 0 @5: 5" for a rate
// schedule). Display only — node ids and the compiler's name registry stay
// keyed on the bare name, so `[water in tub]` written elsewhere still
// resolves to the same node.
const displayLabel = (d: Node): string => {
  if (d.value == null) return d.label;
  const steps = (d.steps ?? []).map(s => ` @${s.at}: ${s.value}`).join("");
  return `${d.label}: ${d.value}${steps}`;
};

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
// labels are not simulation nodes and feel no forces). A two-member loop —
// figure 12's stock⇄faucet — also records its connecting info arc, so the
// letter can park inside the arc's balloon instead of on the pipe between
// the members.
type LoopInstance = { name: string, letter: string, members: Node[], arc?: Link };
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
  // A flow pipe's rest length is the distance between its endpoints' layout
  // slots (including a branch's vertical drop), so the pipe holds its faucet in
  // the slot it was laid out in rather than reeling it back toward its
  // reservoir. Info arrows keep the fixed rest length (they aren't slotted).
  .force("link", d3.forceLink<Node, Link>(systemLinks).id(d => d.id)
    .distance(l => l.type === "flow"
      ? Math.max(40, Math.hypot(
          ((l.source as Node).gx ?? 0) - ((l.target as Node).gx ?? 0),
          ((l.source as Node).gy ?? 0) - ((l.target as Node).gy ?? 0)))
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
  // No forceCenter: it rigidly translates ALL nodes every tick (unscaled by
  // alpha) until their MEAN sits at the canvas center. With bands pinned to
  // absolute slots, that forbids any asymmetric rest pose — figure 9's aux
  // web could never hang below its band, and every settle or drag slid the
  // whole diagram. Bands anchor the layout absolutely; floaters hold to the
  // weak pulls below.
  // Stocks pull hard to their slot x (evenly spaced per band, see update());
  // everything else gets only gentle x-centering — too strong crowds each band
  // inward, and collision then escapes vertically (waving the line).
  .force("x", d3.forceX<Node>(d => d.gx ?? svgWidth / 2).strength(d => d.gx != null ? 0.25 : 0.02))
  // Stocks pin to their band's y hardest, other band members strongly (forming
  // a horizontal line); floating nodes get only a barely-there tie-breaker
  // toward their float line (floatY in update()) — weak enough that a dot
  // dragged to the other side of its band stays there (links + charge
  // dominate) instead of drifting back.
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
    // would otherwise keep a stale `group`/`loop`/`value`/`steps` after
    // losing it upstream (the JSON simply omits the key, so Object.assign
    // wouldn't overwrite).
    return prev ? Object.assign(prev, { group: null, loop: null, value: null, steps: null }, d) : { ...d };
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
    .call(sel => sel.select<SVGTextElement>("text").text(displayLabel))
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
    .call(sel => sel.select<SVGTextElement>("text").text(displayLabel))
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
    .call(sel => sel.select<SVGTextElement>("text").text(displayLabel))
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
  // Link endpoints are still id strings here (the force rewrites them to
  // node objects later), so match the two-member arc by id either way.
  const endIdOf = (e: Link["source"]) =>
    typeof e === "object" && e !== null ? (e as Node).id : String(e);
  const loopInstances: LoopInstance[] = [...loopMembers.entries()]
    .map(([name, members]) => {
      const ids = new Set(members.map(m => m.id));
      const arc = members.length === 2
        ? links.find(l => l.type !== "flow" && ids.has(endIdOf(l.source)) && ids.has(endIdOf(l.target)))
        : undefined;
      return { name, letter: name.charAt(0), members, arc };
    });
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
  const rowGap = 120; // vertical drop from a band to a branch row below it
  // Floaters rest at the canvas midline — the open inter-band region — but
  // with a single band the midline IS the band line: dots seeded on it get
  // kicked out to an arbitrary side, splitting the aux web above/below the
  // flow. Bias them one row below instead, where the reference figures hang
  // their aux webs (figure 9). The pull toward floatY stays a tie-breaker, so
  // a dot dragged above the band still stays put.
  const floatY = groupCount === 1 ? svgHeight / 2 + rowGap : svgHeight / 2;
  for (const d of nodes) {
    d.inFlow = d.group != null;
    d.gy = d.group == null
      ? floatY
      : svgHeight / 2 + (d.group - (groupCount - 1) / 2) * bandGap;
  }

  // Lay each band out as a direction-aware horizontal main row, dropping extra
  // flows onto rows below. Within a row, nodes are ordered by walking the flow
  // links (not by the order statements were written), so every pipe reads
  // left-to-right: inflows approach a stock from its left, outflows leave to
  // its right. A stock's FIRST inflow and FIRST outflow stay on its band; each
  // further dead-end flow becomes a branch on a row `rowGap` lower — an extra
  // outflow to the stock's lower right (pipe elbows down out of the stock,
  // then runs right), an extra inflow from its lower left (pipe runs right,
  // then elbows up into the stock's bottom). A two-in/two-out reservoir thus
  // matches the Meadows reference: rain/evaporation on the band, river
  // inflow/discharge on the row below. Every faucet still sits on a horizontal
  // pipe and nothing overlaps: each slot is wide enough for the node's icon,
  // label and collision radius; main rows are centred, branch rows hang off
  // their parent stock, and the auto-fit viewBox zooms to fit.
  const parserId = (id: string) => {
    const n = parseInt(id.slice(id.indexOf("#") + 1), 10);
    return isNaN(n) ? 0 : n;
  };
  // Link endpoints arrive from the compiler as id strings, but d3's link force
  // rewrites them to node objects once it has seen them (the click-to-add path
  // re-updates with such links) — normalize before using one as a key.
  const endId = (e: Link["source"]): string =>
    typeof e === "object" && e !== null ? (e as Node).id : String(e);
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const slotHalf = (d: Node) => {
    const icon = d.type === "stock" ? stockWidth / 2 : d.type === "cloud" ? cloudWidth / 2 : d.type === "dot" ? dotRadius : faucetWidth / 2;
    const collide = d.type === "stock" ? 62 : d.type === "cloud" ? 30 : d.type === "dot" ? 26 : 24;
    return Math.max(icon, displayLabel(d).length * 3, collide);
  };
  const slotPad = 10; // extra breathing room between adjacent slots

  // Flow adjacency in both directions, for walking chains and spotting branches.
  const outL = new Map<string, Link[]>();
  const inL = new Map<string, Link[]>();
  for (const l of links) {
    if (l.type !== "flow") continue;
    const o = outL.get(endId(l.source)) ?? [];
    o.push(l);
    outL.set(endId(l.source), o);
    const i = inL.get(endId(l.target)) ?? [];
    i.push(l);
    inL.set(endId(l.target), i);
  }
  // A dead-end branch hanging off a stock: from a faucet, follow the flow
  // downstream (an extra outflow draining away) or upstream (an extra inflow
  // fed from outside), bailing out (null) if it reaches a stock — such a chain
  // rejoins the main graph rather than dead-ending. Returns the member ids.
  const collectBranch = (rootId: string, dir: "up" | "down"): string[] | null => {
    const members: string[] = [];
    const seen = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      const node = nodeById.get(x);
      if (!node) continue;
      if (node.type === "stock") return null;
      members.push(x);
      if (dir === "down") for (const l of outL.get(x) ?? []) stack.push(endId(l.target));
      else for (const l of inL.get(x) ?? []) stack.push(endId(l.source));
    }
    return members;
  };

  // Pull each stock's extra dead-end flows out into branch rows. The first
  // flow of each direction (source order) stays inline on the band; further
  // ones drop below, outflows branching to the right and inflows arriving from
  // the left, with in/out branch levels counted separately so an extra inflow
  // and an extra outflow share one row (as in the reference reservoir figure).
  const branchNodes = new Set<string>();
  const branches: { parent: Node, members: Node[], level: number, side: "in" | "out" }[] = [];
  const extractBranches = (d: Node, ls: Link[], dir: "up" | "down") => {
    const far = (l: Link) => dir === "down" ? endId(l.target) : endId(l.source);
    const sorted = ls.slice().sort((a, b) => parserId(far(a)) - parserId(far(b)));
    let level = 0;
    for (let i = 1; i < sorted.length; i++) {
      const l = sorted[i];
      if (!l) continue;
      const ids = collectBranch(far(l), dir);
      if (!ids) continue; // not a clean dead end — leave it inline on the row
      const members = ids.map(id => nodeById.get(id)).filter((n): n is Node => !!n);
      members.forEach(m => branchNodes.add(m.id));
      branches.push({ parent: d, members, level: ++level, side: dir === "down" ? "out" : "in" });
      l.elbow = true; // the stock<->faucet pipe draws as an elbow (see ticked)
    }
  };
  for (const d of nodes) {
    if (d.type !== "stock" || d.group == null) continue;
    extractBranches(d, outL.get(d.id) ?? [], "down");
    extractBranches(d, inL.get(d.id) ?? [], "up");
  }

  // Order a row's nodes by walking its flow links (Kahn's algorithm), so each
  // row reads left-to-right along the flow direction regardless of statement
  // order or writing direction (`<=` chains). Parser id breaks ties — and flow
  // cycles, where the walk restarts at the lowest remaining id.
  const flowOrder = (arr: Node[]): Node[] => {
    const ids = new Set(arr.map(d => d.id));
    const indeg = new Map(arr.map(d => [d.id, 0] as [string, number]));
    const succ = new Map<string, string[]>();
    for (const l of links) {
      if (l.type !== "flow") continue;
      const s = endId(l.source), t = endId(l.target);
      if (!ids.has(s) || !ids.has(t)) continue;
      indeg.set(t, (indeg.get(t) ?? 0) + 1);
      const a = succ.get(s) ?? [];
      a.push(t);
      succ.set(s, a);
    }
    const byId = arr.slice().sort((a, b) => parserId(a.id) - parserId(b.id));
    const order: Node[] = [];
    const placed = new Set<string>();
    while (order.length < arr.length) {
      const next = byId.find(d => !placed.has(d.id) && (indeg.get(d.id) ?? 0) <= 0)
        ?? byId.find(d => !placed.has(d.id));
      if (!next) break;
      placed.add(next.id);
      order.push(next);
      for (const t of succ.get(next.id) ?? []) indeg.set(t, (indeg.get(t) ?? 0) - 1);
    }
    return order;
  };

  // Slot a set of nodes onto a row from startX, left-to-right in flow order;
  // returns the row's right edge.
  const slotRow = (arr: Node[], startX: number) => {
    let cursor = startX;
    for (const d of flowOrder(arr)) {
      cursor += slotHalf(d);
      d.gx = cursor;
      cursor += slotHalf(d) + slotPad;
    }
    return cursor - slotPad;
  };
  // Total width a row of nodes will occupy, for right-aligning inflow branches.
  const rowWidth = (arr: Node[]) =>
    arr.reduce((w, d) => w + 2 * slotHalf(d), 0) + Math.max(0, arr.length - 1) * slotPad;

  // Main rows: every band member that isn't a branch node (or a dot), centred.
  const mainByBand = new Map<number, Node[]>();
  for (const d of nodes) {
    d.gx = undefined; // clear stale slots on recycled nodes
    if (d.group != null && d.type !== "dot" && !branchNodes.has(d.id)) {
      const arr = mainByBand.get(d.group) ?? [];
      arr.push(d);
      mainByBand.set(d.group, arr);
    }
  }
  for (const arr of mainByBand.values()) {
    const right = slotRow(arr, 0);
    const shift = svgWidth / 2 - right / 2; // centre the row on the canvas
    for (const d of arr) d.gx = (d.gx ?? 0) + shift;
  }
  // Branch rows: drop `level * rowGap` below the parent's band. An outflow
  // branch runs rightward from under the stock (elbow: down, then right); an
  // inflow branch ends just left of it, reading toward the stock (elbow:
  // right, then up into the stock's bottom). The elbow verticals sit a quarter
  // stock-width either side of centre, so an inflow and an outflow branch
  // sharing a row never share a pipe line.
  for (const b of branches) {
    const y = (b.parent.gy ?? svgHeight / 2) + b.level * rowGap;
    for (const d of b.members) d.gy = y;
    const px = b.parent.gx ?? svgWidth / 2;
    if (b.side === "out") slotRow(b.members, px + stockWidth / 4);
    else slotRow(b.members, px - stockWidth / 4 - rowWidth(b.members));
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

  // A brand-new node starts life at (or near) where the layout wants it; d3
  // would otherwise spawn it on a small spiral at the ORIGIN — the top-left
  // corner. From there, same-row neighbours have to thread through each
  // other's collision discs to reach their slots and jam on the wrong side,
  // and the initial charge burst flings clumped floaters far off-canvas,
  // stranding the auto-fit viewBox zoomed out when alpha dies before the
  // easing catches up. Slotted nodes seed exactly at their slot; floaters
  // (dots) seed on the same phyllotaxis spiral d3 uses, centred on their
  // float rest point (canvas mid-x, floatY). Recycled nodes keep their
  // position (drags and edits stay smooth).
  nodes.forEach((d, i) => {
    if (d.x != null || d.y != null) return;
    if (d.gx != null && d.gy != null) {
      d.x = d.gx;
      d.y = d.gy;
    } else {
      const r = 10 * Math.sqrt(0.5 + i), a = i * 2.399963229728653; // d3's spiral
      d.x = svgWidth / 2 + r * Math.cos(a);
      d.y = (d.gy ?? svgHeight / 2) + r * Math.sin(a);
    }
  });

  simulation.nodes(nodes);

  const linkForce = simulation.force<d3.ForceLink<Node, Link>>("link");
  if (!linkForce) {
    throw new Error("Link force is not defined in the simulation.");
  }
  linkForce.links(links);
  simulation.alpha(0.5).restart();

  // Behavior-over-time panel (figure 6 to the diagram's figure 5): when the
  // model carries numbers and has a stock to plot, simulate it and draw the
  // chart, giving each stock the same accent color on its diagram rect and
  // its chart line. Without numbers everything stays as before — black
  // strokes, no chart.
  const numeric = hasNumbers(system);
  const stockIds = nodes.filter(n => n.type === "stock").map(n => n.id)
    .sort((a, b) => parserId(a) - parserId(b));
  const colorOf = (id: string): string =>
    (numeric ? STOCK_PALETTE[stockIds.indexOf(id)] : undefined) ?? "#000";
  nodeStock.select<SVGRectElement>("rect").attr("stroke", d => colorOf(d.id));
  if (numeric && stockIds.length > 0) chart.render(simulate(system), colorOf, goalRefs(system));
  else chart.hide();
}

// How round the info arcs are: arc radius = chord length × this factor, so it
// fixes the arc's angular sweep regardless of distance. Must be ≥ 0.5:
//   0.5  -> semicircle (180°), maximum minor-arc roundness
//   0.55 -> ~131° arc, the pronounced swoop of the Meadows reference figure
//   0.6  -> ~113° arc
//   1.0  -> 60° arc, the gentle bend this app previously drew
// The same radius serves the MAJOR (large-flag) arcs used for same-band
// feedback loops, where roundness inverts: the balloon's apex sits
// (κ + √(κ²−¼)) × chord off the chord — ≈ 0.78 × chord at 0.55 — so the
// loop encloses real area instead of hugging the pipe it feeds back along.
const infoArcCurvature = 0.55;
const infoArcRadius = (chord: number) => chord * infoArcCurvature;

// A feedback arc between two members of the SAME band — figure 12's stock
// arrowing into its own faucet, figure 42's capital → depreciation — cannot
// read as a loop when drawn as a minor arc: it hugs the pipe connecting the
// two. Draw it as the major arc instead (the reference figures' balloon),
// leaving room for the R/B letter inside. Cross-band and floater arcs keep
// the minor bow.
const arcLarge = (s: Node, t: Node): 0 | 1 =>
  s.group != null && s.group === t.group ? 1 : 0;

// The info-link arc is an arc of the circle of radius `infoArcRadius(chord)`
// through both endpoints, drawn with the given sweep and large-arc flags.
// Move both endpoints along that same circle — start forward by `mStart`,
// end back by `mEnd` arc-pixels — so the shortened path still lies exactly
// on the original arc and both markers orient to their true tangents.
// The two circle centers mirror across the chord: for a minor arc the
// sweep-1 center sits at w = +1 opposite the bulge (sweep-0 mirrors it);
// a major arc uses the other center, putting it inside the balloon. Angular
// travel runs in the direction of `w` for either arc, so the start advances
// by +w and the end backs up by -w arc-pixels.
function trimArc(sx: number, sy: number, tx: number, ty: number, mStart: number, mEnd: number, sweep: 0 | 1, large: 0 | 1 = 0): { start: { x: number, y: number }, end: { x: number, y: number } } {
  const untrimmed = { start: { x: sx, y: sy }, end: { x: tx, y: ty } };
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  const r = infoArcRadius(d);
  // Path length available for trimming: a minor arc has roughly its chord,
  // a major arc the rest of its circle.
  const arcLen = large ? r * (2 * Math.PI - 2 * Math.asin(Math.min(1, d / (2 * r)))) : d;
  if (arcLen < mStart + mEnd + 8) return untrimmed; // too short to trim
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const ux = dx / d, uy = dy / d;
  const w = sweep === 1 ? 1 : -1;
  const cSide = large ? 1 : -1;
  const cx = mx + cSide * w * uy * h, cy = my - cSide * w * ux * h;
  const a0 = Math.atan2(sy - cy, sx - cx);
  const a1 = Math.atan2(ty - cy, tx - cx);
  const as = a0 + w * (mStart / r); // arc length -> angle, along travel
  const ae = a1 - w * (mEnd / r);
  return {
    start: { x: cx + r * Math.cos(as), y: cy + r * Math.sin(as) },
    end: { x: cx + r * Math.cos(ae), y: cy + r * Math.sin(ae) },
  };
}

// Bulge apex of the candidate arc for a sweep flag: the arc's midpoint sits
// perpendicular to the chord off its midpoint — (r - h) out for a minor arc,
// (r + h) for a major one (same side; the balloon just reaches further) —
// sweep 1 on one side, sweep 0 mirrored. Used to score which side has more
// room, and to park a two-member loop's letter inside its balloon.
function arcBulge(sx: number, sy: number, tx: number, ty: number, sweep: 0 | 1, large: 0 | 1 = 0): { x: number, y: number } | null {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d === 0) return null;
  const r = infoArcRadius(d);
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const off = large ? r + h : r - h;
  const ux = dx / d, uy = dy / d;
  const w = sweep === 1 ? 1 : -1;
  return { x: (sx + tx) / 2 + w * uy * off, y: (sy + ty) / 2 - w * ux * off };
}

function ticked() {
  nodeDot.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeStock.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeFaucet.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeCloud.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  // A loop letter sits at the centroid of its member nodes, tracking them
  // through the simulation (and through drags) for free. A two-member loop's
  // centroid lands ON the pipe between its members, so that letter parks
  // inside the drawn feedback arc instead — midway between the arc's chord
  // and its bulge apex, on whichever side the arc currently bows.
  loopLabel.attr("transform", d => {
    const s = d.arc?.source, t = d.arc?.target;
    if (typeof s === "object" && typeof t === "object" && s !== null && t !== null) {
      const sx = (s as Node).x ?? 0, sy = (s as Node).y ?? 0;
      const tx = (t as Node).x ?? 0, ty = (t as Node).y ?? 0;
      const b = arcBulge(sx, sy, tx, ty, d.arc?.sweep ?? 1, arcLarge(s as Node, t as Node));
      if (b) return `translate(${((sx + tx) / 2 + b.x) / 2},${((sy + ty) / 2 + b.y) / 2})`;
    }
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
    const large = arcLarge(s, t);
    const c1 = clearance(arcBulge(sx, sy, tx, ty, 1, large));
    const c0 = clearance(arcBulge(sx, sy, tx, ty, 0, large));
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
        // Branch connectors keep every faucet on a horizontal pipe (not a
        // slope). An extra OUTflow — stock on the band feeding a faucet on the
        // row below — drops out of the stock's bottom, then turns right
        // through its faucet (faucet target, so no head to trim). An extra
        // INflow — faucet on the row below feeding the stock — runs right from
        // its faucet, then turns up into the stock's bottom, stopping an
        // arrowhead short of the edge so the head's tip lands exactly on it.
        // The verticals are offset a quarter stock-width right/left of centre
        // respectively, so opposite branches never overlap their pipes.
        if (d.elbow && source.type === "stock" && target.type === "faucet") {
          const ex = sx + stockWidth / 4;
          return `M${ex},${sy + stockHeight / 2}L${ex},${ty}L${tx},${ty}`;
        }
        if (d.elbow && source.type === "faucet" && target.type === "stock") {
          const ex = tx - stockWidth / 4;
          return `M${sx},${sy}L${ex},${sy}L${ex},${ty + stockHeight / 2 + flowArrowLength}`;
        }
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
      const large = arcLarge(source, target);
      const r = infoArcRadius(dr);
      const a = trimArc(sx, sy, tx, ty, edgeOf(source) + infoTailRadius, edgeOf(target) + infoArrowLength, sweep, large);
      return `M${a.start.x},${a.start.y}A${r},${r} 0 ${large},${sweep} ${a.end.x},${a.end.y}`;
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
    const padX = Math.max(edgeOf(d) + 12, displayLabel(d).length * 3);
    const padY = edgeOf(d) + 24;
    x0 = Math.min(x0, d.x - padX); y0 = Math.min(y0, d.y - padY);
    x1 = Math.max(x1, d.x + padX); y1 = Math.max(y1, d.y + padY);
  }
  // A same-band feedback balloon swings well past its endpoint nodes, so an
  // outer band's loop would clip at the canvas edge — union the major arcs'
  // bulge apexes too (the loop letter parks inside the balloon, so this
  // covers it as well).
  infoLink.each(d => {
    const s = d.source as Node, t = d.target as Node;
    if (!arcLarge(s, t)) return;
    const b = arcBulge(s.x ?? 0, s.y ?? 0, t.x ?? 0, t.y ?? 0, d.sweep ?? 1, 1);
    if (!b) return;
    x0 = Math.min(x0, b.x - 12); y0 = Math.min(y0, b.y - 12);
    x1 = Math.max(x1, b.x + 12); y1 = Math.max(y1, b.y + 12);
  });
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
  // A button load replaces the whole diagram, so don't recycle the previous
  // example's positions (ids like "stock#2" recur across examples, and nodes
  // migrating across the canvas jam on each other's collision discs) — start
  // every node fresh at its layout slot. Typing edits still recycle.
  simulation.nodes([]);
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
