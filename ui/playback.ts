// The diagram's playback — what the animate toggle plays: the very run the
// chart plots, re-read as animation state at any moment t of it. Each
// stock's tank fills to its level, each flow pipe runs at its faucet's
// applied rate, and each feedback loop pulses at the pace of its busiest
// faucet, every pulse tracing the loop's causal route hop by hop.
//
// Levels and rates each share ONE scale across the whole model — the
// run's peak level over every stock, its peak |rate| over every faucet —
// the chart's single y-axis in miniature, so the diagram shows the same
// comparisons the chart does: figure 11's two coffees converge on one
// fill, figure 13's five accounts open level and diverge, births outpace
// deaths through figure 22's pipes. A per-stock (or per-band) scale would
// open the 2% account's tank FULLER than the 10% one's — the same 100
// against a smaller peak — and pulse its loop faster. The cost is the
// chart's own: a stock counted in small units (the skydiver's speed beside
// its altitude) reads low in its tank just as its line sits low in the
// chart, and the tank's readout keeps the number.
//
// Pure and dependency-free (type-only imports), like simulate.ts, so node
// runs it headlessly (test/playback.mjs); app.ts owns the DOM and clock.
import type { Trace } from "./simulate";
import type { Link, Node } from "./type";

// d3 rewrites link endpoints from id strings to node objects once a system
// has been through the force simulation; accept both.
const endId = (end: Link["source"]): string =>
  typeof end === "object" && end !== null ? String((end as Node).id) : String(end);

// The integer the parser minted for an id ("stock#5" -> 5); ids sort
// lexicographically otherwise ("stock#10" < "stock#2").
const parserId = (id: string): number => {
  const n = Number(id.split("#").pop());
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

// A run re-read at any moment t (clamped to [0, tEnd]): each series
// interpolates linearly between its DT samples, so a tank glides between
// Euler steps instead of stair-stepping twenty times a time unit. A t on a
// sample (i·DT, float dust and all) reads that sample exactly.
export type Playback = {
  tEnd: number;
  // A stock's level at t (0 for an id the run doesn't hold).
  level(id: string, t: number): number;
  // Its tank: the level over the run's peak level, 0..1.
  fill(id: string, t: number): number;
  // A faucet's pace: its applied rate over the run's peak |rate|, -1..1
  // (negative only when a negative factor or gain runs the tap backward).
  pace(id: string, t: number): number;
};

export function playback(run: Trace): Playback {
  const levels = new Map(run.stocks.map(s => [s.id, s.levels] as [string, number[]]));
  const rates = new Map(run.rates.map(r => [r.id, r.rates] as [string, number[]]));
  let peakLevel = 0;
  let peakRate = 0;
  for (const s of run.stocks) for (const v of s.levels) peakLevel = Math.max(peakLevel, v);
  for (const r of run.rates) for (const v of r.rates) peakRate = Math.max(peakRate, Math.abs(v));
  const at = (xs: number[] | undefined, t: number): number => {
    if (!xs || xs.length === 0) return 0;
    let s = Math.max(0, Math.min(xs.length - 1, t / run.dt));
    const near = Math.round(s);
    if (Math.abs(s - near) < 1e-9) s = near;
    const i = Math.floor(s);
    const a = xs[i] ?? 0, b = xs[Math.min(xs.length - 1, i + 1)] ?? a;
    return a + (b - a) * (s - i);
  };
  return {
    tEnd: run.tEnd,
    level: (id, t) => at(levels.get(id), t),
    fill: (id, t) => (peakLevel > 0 ? Math.min(1, at(levels.get(id), t) / peakLevel) : 0),
    pace: (id, t) => (peakRate > 0 ? Math.max(-1, Math.min(1, at(rates.get(id), t) / peakRate)) : 0),
  };
}

// A feedback loop's pulse route. A loop annotation tags its members — the
// nodes named inside `R(...)`/`B(...)` — and its drawn boundary is every
// link joining two of them (a port standing for its stock, as for the loop
// letter's parking in app.ts). A pulse follows those links in CAUSAL
// order: an info arrow as drawn, a flow pipe from its faucet to its stock
// — an inflow with the material, an outflow AGAINST it (the drain acts on
// the tank it empties). It sets out from a member stock (the level the
// loop feeds back on; lowest parser id first, else any member with a way
// out), and crossing one link is one hop: the hops a breadth-first walk
// reaches at the same depth run at once. A loop annotated as a proper
// cycle therefore carries one pulse around and home — figure 10's hot
// coffee → discrepancy → cooling → hot coffee — while a partial annotation
// fans out from its stock instead (figure 37's B(profit <- capital ->
// extraction) leaves capital both ways). Links the walk from the start
// never reaches set out from their own tails, at depth 0.
export type Hop = { link: Link; reversed: boolean; depth: number };
export type LoopPlan = {
  // The compiler's loop name ("R0", "B1", …).
  name: string;
  // Member faucets in parser-id order: what the loop's activity reads.
  faucets: string[];
  // In walk order; `reversed` crosses the link target → source.
  hops: Hop[];
  // Hops a pulse crosses before it is home (0: a route-less loop).
  depths: number;
};

// The source-order counter the compiler numbers loops by ("B12" -> 12).
const loopOrdinal = (name: string): number => {
  const n = parseInt(name.slice(1), 10);
  return isNaN(n) ? 0 : n;
};

export function loopPlans(nodes: Node[], links: Link[]): LoopPlan[] {
  const byId = new Map(nodes.map(n => [n.id, n] as [string, Node]));
  const resolve = (id: string): string => {
    const n = byId.get(id);
    return n?.type === "port" && n.parent != null ? n.parent : id;
  };
  const names = [...new Set(nodes.flatMap(n => n.loop ?? []))]
    .sort((a, b) => loopOrdinal(a) - loopOrdinal(b));
  return names.map(name => {
    // Stocks first, so the walk sets out from a level when the loop has one.
    const members = nodes
      .filter(n => n.loop?.includes(name))
      .sort((a, b) => Number(b.type === "stock") - Number(a.type === "stock") || parserId(a.id) - parserId(b.id));
    const ids = new Set(members.map(m => m.id));
    const edges: { link: Link; from: string; to: string; reversed: boolean }[] = [];
    for (const link of links) {
      const s = resolve(endId(link.source)), t = resolve(endId(link.target));
      if (s === t || !ids.has(s) || !ids.has(t)) continue;
      // A pipe INTO a faucet is an outflow: causally the tap acts back on
      // the tank it drains, so the pulse crosses it target → source.
      const reversed = link.type === "flow" && byId.get(t)?.type === "faucet";
      edges.push(reversed ? { link, from: t, to: s, reversed } : { link, from: s, to: t, reversed });
    }
    const depth = new Map<string, number>();
    const used = new Set<number>();
    const hops: Hop[] = [];
    for (;;) {
      // Every member the walks have reached has spent all its outgoing
      // links, so a start is always an unreached member with one to cross.
      const start = members.find(m => !depth.has(m.id) && edges.some((e, k) => !used.has(k) && e.from === m.id));
      if (!start) break;
      depth.set(start.id, 0);
      const queue = [start.id];
      while (queue.length > 0) {
        const u = queue.shift()!;
        const d = depth.get(u) ?? 0;
        edges.forEach((e, k) => {
          if (used.has(k) || e.from !== u) return;
          used.add(k);
          hops.push({ link: e.link, reversed: e.reversed, depth: d });
          if (!depth.has(e.to)) {
            depth.set(e.to, d + 1);
            queue.push(e.to);
          }
        });
      }
    }
    return {
      name,
      faucets: members.filter(m => m.type === "faucet").map(m => m.id).sort((a, b) => parserId(a) - parserId(b)),
      hops,
      depths: hops.reduce((m, h) => Math.max(m, h.depth + 1), 0),
    };
  });
}

// Wall seconds a pulse spends crossing one hop.
export const HOP_SECONDS = 0.5;

// Where a pulse `age` seconds old is: every hop at its current depth, with
// how far across (0..1, linear — the caller eases), or nothing once it has
// crossed its last hop.
export function pulseAt(plan: LoopPlan, age: number): { hop: Hop; frac: number }[] {
  if (!(age >= 0)) return [];
  const depth = Math.floor(age / HOP_SECONDS);
  if (depth >= plan.depths) return [];
  const frac = age / HOP_SECONDS - depth;
  return plan.hops.filter(h => h.depth === depth).map(hop => ({ hop, frac }));
}

// How busy a loop is at t: its busiest member faucet's |pace| — 0 while
// every tap in it is shut, 1 at the run's peak flow. Null when the loop
// names no faucet at all (the caller beats it steadily instead).
export function loopActivity(pb: Playback, plan: LoopPlan, t: number): number | null {
  if (plan.faucets.length === 0) return null;
  return plan.faucets.reduce((m, f) => Math.max(m, Math.abs(pb.pace(f, t))), 0);
}

// A text's box in its stock's own coordinates (what SVG getBBox() gives).
export type TextBox = { x: number; y: number; width: number; height: number };

// The spans of a tank's water line left visible at height y across
// [x0, x1]: a box whose band the line crosses (padded 1.5px, so the
// 1.5px stroke never grazes a glyph) cuts its width, padded `gap` px each
// side, out of the line — so the line never strikes through the stock's
// name or readout, stopping short of the words and resuming past them. A
// box wider than the tank leaves nothing (the tint still marks the level);
// slivers under a pixel are dropped.
export function waterSpans(y: number, x0: number, x1: number, boxes: TextBox[], gap = 3): [number, number][] {
  let spans: [number, number][] = [[x0, x1]];
  for (const b of boxes) {
    if (y < b.y - 1.5 || y > b.y + b.height + 1.5) continue;
    const cut0 = b.x - gap, cut1 = b.x + b.width + gap;
    spans = spans
      .flatMap(([a, z]): [number, number][] => [[a, Math.min(z, cut0)], [Math.max(a, cut1), z]])
      .filter(([a, z]) => z - a > 1);
  }
  return spans;
}
