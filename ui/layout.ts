// The diagram's band/slot/branch layout and its force simulation, extracted
// from app.ts so a headless regression test (test/layout.mjs) can drive the
// EXACT same math and forces the app uses — no drift. app.ts imports the
// geometry constants, `computeLayout`, and `createSimulation` from here; the
// test imports the same three and asserts band flatness, stock slots, cloud
// edges, and post-settle clearance. d3 imports headlessly (d3-selection only
// touches `document` when a selection method is called, never at module load),
// so `node` can run this via type-stripping like simulate.ts / highlight.ts.
import * as d3 from "d3";
import type { Node, Link } from "./type";

// Canvas size. The auto-fit viewBox (in app.ts) zooms out from here.
export const svgWidth = 700;
export const svgHeight = 600;
// Vertical drop from a band to a branch row (or the single-band float row)
// below it. app.ts's float-seed spawn reads it too, so it lives here.
export const rowGap = 120;

// Meadows size hierarchy, faucet held at 40px as the reference unit: stocks
// dominate (~2.3x the faucet, 4:3), clouds sit between, aux dots are tiny.
export const dotRadius = 5;
export const stockWidth = 96;
export const stockHeight = 72;
export const faucetWidth = 40;
export const faucetHeight = 40;
// In the artwork the tap's base — the part the pipe passes through in the
// reference figures — is centred at 79% of the icon's height, not its middle.
// Draw the icon lifted by that excess so the base straddles the pipe line
// (= the node point) and the handle rises above it; everything that AIMS at
// a faucet (label, info arcs) shifts by the same amount via aimY.
export const faucetLift = faucetHeight * (0.79 - 0.5);
export const cloudWidth = 52;
export const cloudHeight = 52;
// A port (the boundary dot the compiler mints where an info arrow meets a
// stock) draws as the Meadows open tail circle promoted to a node, pinned
// inside the stock's rect.
export const portRadius = 4;

// Link endpoints arrive from the compiler as id strings, but d3's link force
// rewrites them to node objects once it has seen them (a recycled node from a
// prior update carries such links) — normalize before using one as a key.
const endId = (e: Link["source"]): string =>
  typeof e === "object" && e !== null ? (e as Node).id : String(e);

// The integer the compiler minted into an id ("dot#3" -> 3): slot ordering
// keys on it (mint order is statement order).
const parserId = (id: string): number => {
  const n = parseInt(id.slice(id.indexOf("#") + 1), 10);
  return isNaN(n) ? 0 : n;
};

// Compute every node's layout target — `gx`/`gy` (the force targets) and
// `inFlow` — and mark branch flows `elbow`, all in place on the passed nodes
// and links. Pure: reads only the compiler fields plus a label-width estimate
// (app.ts passes `displayLabel(d).length * 3`; the width only affects slot
// spacing). `labelWidth` is injected so this module needn't know about
// displayLabel/formula rendering.
export function computeLayout(
  nodes: Node[],
  links: Link[],
  labelWidth: (n: Node) => number,
): void {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as [string, Node]));

  // Lay nodes out in horizontal bands. The compiler assigns each node a `group`
  // (a flow-connected chain of stocks/faucets/clouds), numbered top to bottom;
  // dots and reservoir-less faucets have no group and float.
  const gs = nodes.map((n) => n.group).filter((g): g is number => g != null);
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
  const slotHalf = (d: Node) => {
    const icon = d.type === "stock" ? stockWidth / 2 : d.type === "cloud" ? cloudWidth / 2 : d.type === "dot" ? dotRadius : faucetWidth / 2;
    const collide = d.type === "stock" ? 62 : d.type === "cloud" ? 30 : d.type === "dot" ? 26 : 24;
    return Math.max(icon, labelWidth(d), collide);
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
      const members = ids.map((id) => nodeById.get(id)).filter((n): n is Node => !!n);
      members.forEach((m) => branchNodes.add(m.id));
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
    const ids = new Set(arr.map((d) => d.id));
    const indeg = new Map(arr.map((d) => [d.id, 0] as [string, number]));
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
      const next = byId.find((d) => !placed.has(d.id) && (indeg.get(d.id) ?? 0) <= 0)
        ?? byId.find((d) => !placed.has(d.id));
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
}

// Build the diagram's force simulation with its exact forces. app.ts adds
// `.on("tick", ...)`; the test ticks it manually to settle. Bands anchor the
// layout absolutely (there is deliberately no forceCenter — it rigidly
// translates ALL nodes each tick until their mean sits at the canvas center,
// which would forbid any asymmetric rest pose and slide the whole diagram on
// every settle/drag); floaters hold to the weak pulls below.
export function createSimulation(nodes: Node[], links: Link[]): d3.Simulation<Node, Link> {
  return d3.forceSimulation<Node, Link>(nodes)
    // Flow pipes stay stiff, but info arrows are soft suggestions: at the d3
    // default strength they reel a dragged dot back to rest-length, so e.g.
    // `growth goal` could never float above its band. A flow pipe's rest length
    // is the distance between its endpoints' layout slots (including a branch's
    // vertical drop), so the pipe holds its faucet in the slot it was laid out
    // in rather than reeling it back toward its reservoir; info arrows keep the
    // fixed rest length (they aren't slotted).
    .force("link", d3.forceLink<Node, Link>(links).id((d) => d.id)
      .distance((l) => l.type === "flow"
        ? Math.max(40, Math.hypot(
            ((l.source as Node).gx ?? 0) - ((l.target as Node).gx ?? 0),
            ((l.source as Node).gy ?? 0) - ((l.target as Node).gy ?? 0)))
        : 80)
      .strength((l) => l.type === "flow" ? 0.5 : 0.2))
    // Stocks are the diagram's anchors: they repel harder than other nodes;
    // dots repel a bit more than faucets/clouds so the aux web spreads through
    // the inter-band region. Ports are force-inert satellites (fx/fy-pinned in
    // ticked), with zero charge/collision.
    .force("charge", d3.forceManyBody<Node>().strength((d) =>
      d.type === "stock" ? -300 : d.type === "dot" ? -250 : d.type === "port" ? 0 : -200))
    // Collision radii track the size hierarchy so big shapes push neighbors out
    // of their space; dots are tiny but their label above needs clearance.
    .force("collide", d3.forceCollide<Node>().radius((d) =>
      d.type === "stock" ? 62 : d.type === "cloud" ? 30 : d.type === "dot" ? 26 : d.type === "port" ? 0 : 24
    ).strength(0.85))
    // Stocks pull hard to their slot x (evenly spaced per band); everything else
    // gets only gentle x-centering — too strong crowds each band inward, and
    // collision then escapes vertically (waving the line).
    .force("x", d3.forceX<Node>((d) => d.gx ?? svgWidth / 2).strength((d) => d.gx != null ? 0.25 : 0.02))
    // Stocks pin to their band's y hardest, other band members strongly
    // (forming a horizontal line); floating nodes get only a barely-there
    // tie-breaker toward their float line (weak enough that a dot dragged to
    // the other side of its band stays there — links + charge dominate).
    .force("y", d3.forceY<Node>((d) => d.gy ?? svgHeight / 2).strength((d) => d.type === "stock" ? 1.0 : d.inFlow ? 0.9 : 0.01));
}
