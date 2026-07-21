// Pure stock-flow simulation (no d3, no DOM — importable headlessly).
// Derives each stock's level over time from the compiled graph: stock
// `value` = initial level; a faucet's rate is piecewise-constant — `value`
// from t=0, overridden by each `steps` entry from its `at` time onward
// (both default to 0: an unannotated faucet is a closed tap). Flow-link
// direction decides which stock a faucet drains (stock→faucet) and fills
// (faucet→stock); clouds, dots, and chained faucets are infinite sources/
// sinks. Forward Euler over T_END/DT steps; each step rations a stock's
// outflows by what it holds (min(1, level/demand)), so levels never go
// negative and chained stocks conserve — an empty tub stops draining.
//
// A faucet can instead be GOAL-SEEKING (the balancing-loop archetype of
// figures 10 & 11): when the info arrows into it lead back — through
// value-less relay dots like `discrepancy` — to exactly one valued dot,
// that constant is its goal and its annotation becomes a gain:
// rate = gain × (level − goal) draining an outflow, gain × (goal − level)
// filling an inflow, clamped at 0 — exponential approach to the goal from
// either side, flattening as the discrepancy shrinks.
//
// A faucet with NO annotation of its own reads the same web as REINFORCING
// (the compound-interest loop of figures 12 & 13) — provided the walk also
// reaches back to the faucet's own stock, i.e. the level→faucet info arrow
// that closes the R loop is actually drawn. Then the constant multiplies
// the level: rate = factor × level — exponential growth filling, exponential
// decay draining. Without the drawn feedback a bare faucet stays a closed
// tap, exactly as before.
import type { Link, Node, System } from "./type";

export const T_END = 10; // simulated time units
export const DT = 0.05;  // Euler step

// levels[i] is the stock's level at t = i * DT (T_END/DT + 1 samples).
export type StockSeries = { id: string; label: string; levels: number[] };

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

export function hasNumbers(system: System): boolean {
  return system.nodes.some(n => n.value != null);
}

// A faucet's attached stock side(s) — the first stock→faucet flow link and
// the first faucet→stock one; further attachments are ignored (v1 rule) —
// plus the feedback reading of its info-arrow web, when one matches. The
// web is walked backwards from the faucet, straight through value-less
// relay dots; anything else (stocks, faucets, clouds) ends a branch.
// Exactly one valued dot reached arms a feedback rate — which one depends
// on where the number sits (a faucet with stocks on both sides keeps the
// plain constant-rate reading: no single level to feed back — as does an
// ambiguous web with two constants):
//   - a faucet with its own annotation reads the dot as its GOAL and the
//     annotation as a gain (figures 10 & 11): rate = gain × discrepancy.
//   - a bare faucet whose web also reaches its own attached stock — the
//     drawn level→faucet arrow closing figure 12's R loop — reads the dot
//     as a FACTOR on that level (figures 12 & 13): rate = factor × level.
//     The loop must be drawn: a bare faucet fed only a constant stays a
//     closed tap.
type Wiring = {
  id: string;
  source: string | null;
  sink: string | null;
  goal: Node | null;
  factor: Node | null;
};

function faucetWiring(system: System): Wiring[] {
  const stockIds = new Set(system.nodes.filter(n => n.type === "stock").map(n => n.id));
  const nodeById = new Map(system.nodes.map(n => [n.id, n] as [string, Node]));
  const flows = system.links.filter(l => l.type === "flow");
  const arrowsInto = new Map<string, string[]>();
  for (const l of system.links) {
    if (l.type === "flow") continue;
    const t = endId(l.target);
    arrowsInto.set(t, [...(arrowsInto.get(t) ?? []), endId(l.source)]);
  }
  const infoWeb = (fid: string, attached: string): { dot: Node | null; loops: boolean } => {
    const dots = new Set<Node>();
    let loops = false;
    const seen = new Set<string>();
    const stack = [...(arrowsInto.get(fid) ?? [])];
    while (stack.length) {
      const id = stack.pop();
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      if (id === attached) loops = true;
      const n = nodeById.get(id);
      if (!n || n.type !== "dot") continue;
      if (n.value != null) dots.add(n);
      else stack.push(...(arrowsInto.get(id) ?? []));
    }
    const [only] = dots;
    return { dot: dots.size === 1 && only ? only : null, loops };
  };
  return system.nodes
    .filter(n => n.type === "faucet")
    .map(f => {
      const src = flows.find(l => endId(l.target) === f.id && stockIds.has(endId(l.source)));
      const snk = flows.find(l => endId(l.source) === f.id && stockIds.has(endId(l.target)));
      const source = src ? endId(src.source) : null;
      const sink = snk ? endId(snk.target) : null;
      const attached = (source === null) !== (sink === null) ? source ?? sink : null;
      const web = attached != null ? infoWeb(f.id, attached) : null;
      const goal = f.value != null ? (web?.dot ?? null) : null;
      const factor = f.value == null && web?.loops ? web.dot : null;
      return { id: f.id, source, sink, goal, factor };
    });
}

// The chart's dashed reference rules: each constant serving as at least one
// goal-seeking faucet's goal, once, in parser-id order.
export type GoalRef = { id: string; label: string; value: number };

export function goalRefs(system: System): GoalRef[] {
  const seen = new Map<string, GoalRef>();
  for (const w of faucetWiring(system)) {
    if (w.goal && w.goal.value != null && !seen.has(w.goal.id))
      seen.set(w.goal.id, { id: w.goal.id, label: w.goal.label, value: w.goal.value });
  }
  return [...seen.values()].sort((a, b) => parserId(a.id) - parserId(b.id));
}

export function simulate(system: System): StockSeries[] {
  const stocks = system.nodes
    .filter(n => n.type === "stock")
    .sort((a, b) => parserId(a.id) - parserId(b.id));
  const level = new Map<string, number>(stocks.map(s => [s.id, s.value ?? 0]));

  // Each faucet moves rate(t)·DT per step from its source stock to its sink
  // stock (see faucetWiring); a side with no stock is an infinite reservoir.
  // A faucet's plain rate is its schedule's last segment whose start time is
  // ≤ t: the initial `value` at t=0 plus any `steps`, kept sorted by time
  // (stable, so a step written at t=0 overrides the initial). A goal-seeking
  // faucet reads the same schedule as its gain instead, and a reinforcing
  // one has no schedule at all — its rate is factor × level (see the rate
  // loop).
  const wireById = new Map(faucetWiring(system).map(w => [w.id, w] as [string, Wiring]));
  const faucets = system.nodes
    .filter(n => n.type === "faucet")
    .map(f => {
      const w = wireById.get(f.id);
      const segs = [{ at: 0, rate: f.value ?? 0 }]
        .concat((f.steps ?? []).map(s => ({ at: s.at, rate: s.value })))
        .sort((a, b) => a.at - b.at);
      return {
        segs,
        source: w?.source ?? null,
        sink: w?.sink ?? null,
        goal: w?.goal?.value ?? null,
        factor: w?.factor?.value ?? null,
      };
    });
  const rateAt = (segs: { at: number; rate: number }[], t: number): number => {
    let r = 0;
    for (const s of segs) {
      if (s.at > t) break;
      r = s.rate;
    }
    return r;
  };

  const series: StockSeries[] = stocks.map(s => ({ id: s.id, label: s.label, levels: [level.get(s.id) ?? 0] }));
  const steps = Math.round(T_END / DT);
  for (let i = 0; i < steps; i++) {
    // Two-pass synchronous step: total demand each source stock faces, then
    // a ration factor prorating its outflows down to what it holds — the
    // multi-outflow generalization of min(rate, level/dt), order-independent
    // and conserving. Rates are sampled at the step's start time.
    const rates = faucets.map(f => {
      // Reinforcing: the constant multiplies the faucet's own stock level —
      // compound interest filling, exponential decay draining (the outflow
      // ration below still guards overdraw, so a hot factor empties the
      // stock and stops rather than going negative).
      if (f.factor != null) return f.factor * (level.get((f.source ?? f.sink)!) ?? 0);
      const gain = rateAt(f.segs, i * DT);
      if (f.goal == null) return gain;
      // Goal-seeking: the schedule value acts as a gain on the discrepancy,
      // signed by flow direction — an outflow drains only above the goal, an
      // inflow fills only below it. min(gain, 1/DT) caps one Euler step at
      // the whole remaining discrepancy, so a hot gain lands exactly on the
      // goal instead of overshooting and oscillating around it.
      const lvl = level.get((f.source ?? f.sink)!) ?? 0;
      const disc = f.source != null ? lvl - f.goal : f.goal - lvl;
      return Math.min(gain, 1 / DT) * Math.max(0, disc);
    });
    const demand = new Map<string, number>();
    faucets.forEach((f, j) => {
      if (f.source) demand.set(f.source, (demand.get(f.source) ?? 0) + (rates[j] ?? 0) * DT);
    });
    const ration = (id: string): number => {
      const d = demand.get(id) ?? 0;
      const l = level.get(id) ?? 0;
      return d > l ? l / d : 1; // d > l ≥ 0 implies d > 0
    };
    const delta = new Map<string, number>();
    faucets.forEach((f, j) => {
      const q = (rates[j] ?? 0) * DT * (f.source ? ration(f.source) : 1);
      if (f.source) delta.set(f.source, (delta.get(f.source) ?? 0) - q);
      if (f.sink) delta.set(f.sink, (delta.get(f.sink) ?? 0) + q);
    });
    for (const s of stocks) {
      // max(0, ·) guards float dust only — rationing already prevents overdraw.
      level.set(s.id, Math.max(0, (level.get(s.id) ?? 0) + (delta.get(s.id) ?? 0)));
    }
    series.forEach(sr => sr.levels.push(level.get(sr.id) ?? 0));
  }
  return series;
}
