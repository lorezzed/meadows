// Pure stock-flow simulation (no d3, no DOM — importable headlessly).
// Derives each stock's level over time from the compiled graph: stock
// `value` = initial level; a faucet's rate is its schedule — piecewise-
// constant for `@` steps (`value` from t=0, overridden by each entry from
// its `at` time onward; both default to 0: an unannotated faucet is a
// closed tap), or a smooth monotone curve through the same points for `~`
// steps (see scheduleFn). Flow-link
// direction decides which stock a faucet drains (stock→faucet) and fills
// (faucet→stock); clouds, dots, and chained faucets are infinite sources/
// sinks. Forward Euler in DT steps over a horizon defaulting to T_END (the
// chart's t= field passes a custom one); each step rations a stock's
// outflows by what it holds (min(1, level/demand)), so levels never go
// negative and chained stocks conserve — an empty tub stops draining.
//
// A faucet can instead be GOAL-SEEKING (the balancing-loop archetype of
// figures 10 & 11): when the info arrows into it lead back — through
// value-less relay dots like `discrepancy` — to exactly one valued dot,
// that constant is its goal and its annotation becomes a gain:
// rate = gain × (level − goal) draining an outflow, gain × (goal − level)
// filling an inflow, clamped at 0 — exponential approach to the goal from
// either side, flattening as the discrepancy shrinks. The goal dot may
// itself carry a schedule (figure 19's cold-day `outside temperature`):
// like every rate it is sampled piecewise-constant at each step's start,
// so the faucet chases a moving target.
//
// A faucet with NO annotation of its own reads the same web as REINFORCING
// (the compound-interest loop of figures 12 & 13) — provided the walk also
// reaches back to the faucet's own stock, i.e. the level→faucet info arrow
// that closes the R loop is actually drawn. Then the constant multiplies
// the level: rate = factor × level — exponential growth filling, exponential
// decay draining. Without the drawn feedback a bare faucet stays a closed
// tap, exactly as before.
//
// DELAYS (figures 31–35, the oscillating car lot): a formula may read a
// signal at a shifted time — `x(t ~ T)`, the value about T ago, is a
// first-order exponential lag stepping toward x by min(1, DT/T) each step
// (T ≤ 0 snaps, like the goal-seek gain cap); `x(t - T)` is a pipeline:
// the value x had exactly T ago (T rounds to a whole number of DT steps,
// minimum one), served from a ring buffer. Only as a shift's input may a
// reference land on a FAUCET, reading the flow's rate as actually applied
// this step (post-rationing) — how `sales(t ~ perception delay)` perceives
// a flow. Both shifts read their own state at evaluation time (last step's
// lag level, the buffer), so a feedback loop closed through one is legal
// and cycle-free. At t=0 each shift primes to its input's value right
// then — a smoothing starts equal to its input, a pipeline starts full of
// it — with faucet inputs read at their raw clamped rate (nothing has
// flowed yet) and circular primings reading 0.
import type { Expr, Link, Node, System } from "./type";

export const T_END = 10; // default simulated horizon (simulate() takes an override)
export const DT = 0.05;  // Euler step

// levels[i] is the stock's level at t = i * DT (horizon/DT + 1 samples).
export type StockSeries = { id: string; label: string; levels: number[] };

// The chart's optional flow view (figure 33): each time shift plots its
// input against its output — a series per distinct node, values sampled
// at every step's start plus one closing sample at the horizon (aligned
// with the stock series). `dashed` marks a shift's OWNER (the delayed
// copy); a bare-reference input plots solid. A faucet's sample is its
// applied (post-ration) rate, a dot's its computed value.
export type FlowSeries = { id: string; label: string; dashed: boolean; values: number[] };

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
  return system.nodes.some(n => n.value != null || n.expr != null);
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
  // Ports are the boundary dots the compiler mints where an info arrow meets
  // a stock; for wiring, an arrow touching a port is an arrow touching its
  // parent stock, so resolve them away before walking the web (otherwise the
  // level→faucet arrow closing an R loop would never reach the stock).
  const parentOf = new Map(system.nodes
    .filter(n => n.type === "port" && n.parent != null)
    .map(n => [n.id, n.parent as string] as [string, string]));
  const resolve = (id: string): string => parentOf.get(id) ?? id;
  const arrowsInto = new Map<string, string[]>();
  for (const l of system.links) {
    if (l.type === "flow") continue;
    const t = resolve(endId(l.target));
    arrowsInto.set(t, [...(arrowsInto.get(t) ?? []), resolve(endId(l.source))]);
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
// goal-seeking faucet's goal, once, in parser-id order. A scheduled goal
// carries its steps (and smooth flag) too, so the chart can draw the moving
// target exactly as the simulator reads it.
export type GoalRef = { id: string; label: string; value: number; steps?: { at: number; value: number }[]; smooth?: boolean };

export function goalRefs(system: System): GoalRef[] {
  const seen = new Map<string, GoalRef>();
  for (const w of faucetWiring(system)) {
    if (w.goal && w.goal.value != null && !seen.has(w.goal.id))
      seen.set(w.goal.id, {
        id: w.goal.id,
        label: w.goal.label,
        value: w.goal.value,
        ...(w.goal.steps ? { steps: w.goal.steps } : {}),
        ...(w.goal.smooth ? { smooth: true } : {}),
      });
  }
  return [...seen.values()].sort((a, b) => parserId(a.id) - parserId(b.id));
}

// A schedule's value over time, as a reusable function (the chart samples
// the very same interpolant the simulator integrates). Points are the
// initial `value` at t=0 plus the steps, sorted by time; at duplicate times
// the later-written point wins (a step at 0 overrides the initial). Stepped
// (`@`) schedules hold each value until the next step — the tap-turning
// semantics of figure 7. Smooth (`~`) schedules pass a monotone cubic
// (Fritsch–Carlson, no overshoot between points) through the same points —
// the book's continuously varying driving curves, figure 19's outside
// temperature — holding flat before the first and after the last point.
export type SchedLike = { value?: number | null; steps?: { at: number; value: number }[] | null; smooth?: boolean | null };

export function scheduleFn(n: SchedLike): (t: number) => number {
  const sorted = [{ at: 0, value: n.value ?? 0 }]
    .concat((n.steps ?? []).map(s => ({ at: s.at, value: s.value })))
    .sort((a, b) => a.at - b.at);
  const pts: { at: number; value: number }[] = [];
  for (const p of sorted) {
    const prev = pts[pts.length - 1];
    if (prev && prev.at === p.at) prev.value = p.value;
    else pts.push({ ...p });
  }
  if (!n.smooth || pts.length < 2) {
    return t => {
      let v = pts[0]?.value ?? 0;
      for (const p of pts) {
        if (p.at > t) break;
        v = p.value;
      }
      return v;
    };
  }
  // Fritsch–Carlson tangents: secant-mean at interior points with the sign
  // guard that keeps each segment monotone, one-sided at the ends.
  const xs = pts.map(p => p.at), ys = pts.map(p => p.value);
  const last = xs.length - 1;
  const dx: number[] = [], secant: number[] = [];
  for (let i = 0; i < last; i++) {
    dx.push(xs[i + 1]! - xs[i]!);
    secant.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  }
  const m: number[] = [secant[0]!];
  for (let i = 1; i < last; i++) {
    const a = secant[i - 1]!, b = secant[i]!;
    m.push(a * b <= 0 ? 0 : 3 * (dx[i - 1]! + dx[i]!) / ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b));
  }
  m.push(secant[last - 1]!);
  return t => {
    if (t <= xs[0]!) return ys[0]!;
    if (t >= xs[last]!) return ys[last]!;
    let i = 0;
    while (xs[i + 1]! < t) i++;
    const h = xs[i + 1]! - xs[i]!, s = (t - xs[i]!) / h;
    const h00 = (1 + 2 * s) * (1 - s) * (1 - s), h10 = s * (1 - s) * (1 - s);
    const h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
    return h00 * ys[i]! + h10 * h * m[i]! + h01 * ys[i + 1]! + h11 * h * m[i + 1]!;
  };
}

// A time-shift site inside some node's expr, keyed by that owner and the
// shift's position in the tree ("L"/"R" through operators, "I"/"T" into a
// shift's input and time) — the stable identity its state lives under.
type CallSite = { key: string; kind: "smooth" | "delay"; input: Expr; time: Expr };

const collectCalls = (e: Expr, key: string, out: CallSite[]): void => {
  switch (e.kind) {
    case "num": case "ref": return;
    case "smooth": case "delay":
      collectCalls(e.input, key + "I", out);
      collectCalls(e.time, key + "T", out);
      out.push({ key, kind: e.kind, input: e.input, time: e.time });
      return;
    default:
      collectCalls(e.left, key + "L", out);
      collectCalls(e.right, key + "R", out);
  }
};

// Whether the model contains any time shift — the chart shows its flows
// toggle only when there is a delay to unfold (figure 33's view).
export function hasDelays(system: System): boolean {
  const calls: CallSite[] = [];
  for (const n of system.nodes) if (n.expr != null) collectCalls(n.expr, n.id + ":", calls);
  return calls.length > 0;
}

export function simulate(system: System, tEnd: number = T_END): StockSeries[] {
  return run(system, tEnd).stocks;
}

// The flow view of the same run (figure 33): re-runs the engine and returns
// each call's input/output series. Kept separate so simulate()'s shape (and
// every existing caller) is untouched.
export function flowSeries(system: System, tEnd: number = T_END): FlowSeries[] {
  return run(system, tEnd).flows;
}

function run(system: System, tEnd: number): { stocks: StockSeries[]; flows: FlowSeries[] } {
  const stocks = system.nodes
    .filter(n => n.type === "stock")
    .sort((a, b) => parserId(a.id) - parserId(b.id));
  const level = new Map<string, number>(stocks.map(s => [s.id, s.value ?? 0]));

  // Each faucet moves rate(t)·DT per step from its source stock to its sink
  // stock (see faucetWiring); a side with no stock is an infinite reservoir.
  // Every annotated quantity is a schedule read through scheduleFn — stepped
  // or smooth. A faucet reads its own schedule as a rate (or as a gain when
  // goal-seeking); a goal or factor dot's schedule is the value compared
  // against or multiplied by, so a scheduled goal (figure 19's outside
  // temperature) is a moving target.
  const wireById = new Map(faucetWiring(system).map(w => [w.id, w] as [string, Wiring]));
  const faucets = system.nodes
    .filter(n => n.type === "faucet")
    .map(f => {
      const w = wireById.get(f.id);
      return {
        id: f.id,
        rateFn: scheduleFn(f),
        expr: f.expr ?? null,
        source: w?.source ?? null,
        sink: w?.sink ?? null,
        goalFn: w?.goal ? scheduleFn(w.goal) : null,
        factorFn: w?.factor ? scheduleFn(w.factor) : null,
      };
    });
  type FaucetEntry = (typeof faucets)[number];
  const faucetById = new Map(faucets.map(f => [f.id, f] as [string, FaucetEntry]));

  // Formula evaluation: a ref reads the current state — a stock's level, or
  // a dot's value (its own formula, recursively, memoized per step; or its
  // schedule sampled at t). The compiler guarantees plain refs land on
  // stocks and dots and that eager formula chains are acyclic; non-finite
  // arithmetic (division by zero) reads as 0 so a mid-edit model never
  // poisons the run. A FAUCET ref (legal only inside a call's input) reads
  // the applied rate while one is posted (the update phase), and otherwise
  // computes the raw clamped rate — the t=0 priming path.
  const nodeById = new Map(system.nodes.map(n => [n.id, n] as [string, Node]));
  const dotSched = new Map(system.nodes
    .filter(n => n.type === "dot" && n.expr == null)
    .map(n => [n.id, scheduleFn(n)] as [string, (t: number) => number]));
  let curFlowRate: Map<string, number> | null = null;
  const valueOf = (id: string, t: number, memo: Map<string, number>): number => {
    const lvl = level.get(id);
    if (lvl != null) return lvl;
    const f = faucetById.get(id);
    if (f) return curFlowRate?.get(id) ?? rateFor(f, t, memo);
    const hit = memo.get(id);
    if (hit != null) return hit;
    const n = nodeById.get(id);
    const v = n?.expr != null ? evalExpr(n.expr, t, memo, id + ":") : dotSched.get(id)?.(t) ?? 0;
    memo.set(id, v);
    return v;
  };
  const evalExpr = (e: Expr, t: number, memo: Map<string, number>, key: string): number => {
    switch (e.kind) {
      case "num": return e.value;
      case "ref": return valueOf(e.id, t, memo);
      // A shift's value is its STATE — last step's lag level, the ring
      // buffer's oldest sample — never a recursion into its input;
      // primeCall fills a missing state (the t=0 path only).
      case "smooth": return smoothState.get(key) ?? primeCall(key, e, t, memo);
      case "delay": {
        const st = delayState.get(key);
        return st ? st.buf[st.ptr]! : primeCall(key, e, t, memo);
      }
      default: {
        const l = evalExpr(e.left, t, memo, key + "L"), r = evalExpr(e.right, t, memo, key + "R");
        const v = e.kind === "+" ? l + r : e.kind === "-" ? l - r : e.kind === "*" ? l * r : e.kind === "/" ? l / r : l ** r;
        return Number.isFinite(v) ? v : 0;
      }
    }
  };

  // A faucet's rate at t against current levels — the rate pass' body,
  // shared with faucet references (raw path) and the closing flow sample.
  const rateFor = (f: FaucetEntry, t: number, memo: Map<string, number>): number => {
    // An explicit `: (expr)` formula is the faucet's rate law — it
    // overrides every structural reading. A tap never runs backward, so
    // the rate clamps at 0.
    if (f.expr) return Math.max(0, evalExpr(f.expr, t, memo, f.id + ":"));
    // Reinforcing: the factor multiplies the faucet's own stock level —
    // compound interest filling, exponential decay draining (the outflow
    // ration below still guards overdraw, so a hot factor empties the
    // stock and stops rather than going negative).
    if (f.factorFn) return f.factorFn(t) * (level.get((f.source ?? f.sink)!) ?? 0);
    const gain = f.rateFn(t);
    if (!f.goalFn) return gain;
    // Goal-seeking: the schedule value acts as a gain on the discrepancy,
    // signed by flow direction — an outflow drains only above the goal, an
    // inflow fills only below it. min(gain, 1/DT) caps one Euler step at
    // the whole remaining discrepancy, so a hot gain lands exactly on the
    // goal instead of overshooting and oscillating around it. The goal is
    // sampled at the step's start, so a scheduled goal moves mid-run.
    const goal = f.goalFn(t);
    const lvl = level.get((f.source ?? f.sink)!) ?? 0;
    const disc = f.source != null ? lvl - goal : goal - lvl;
    return Math.min(gain, 1 / DT) * Math.max(0, disc);
  };

  // Call state. Priming is lazy and recursive: a call's initial state is
  // its input's value at t=0 (a smooth starts equal to its input, a delay's
  // pipeline starts full of it — the standard SMOOTH/DELAY init), which may
  // chain through other yet-unprimed calls; a circular priming reads 0.
  const calls: CallSite[] = [];
  for (const n of [...system.nodes].sort((a, b) => parserId(a.id) - parserId(b.id)))
    if (n.expr != null) collectCalls(n.expr, n.id + ":", calls);
  const smoothState = new Map<string, number>();
  const delayState = new Map<string, { buf: number[]; ptr: number }>();
  const priming = new Set<string>();
  const primeCall = (key: string, e: Expr & { kind: "smooth" | "delay" }, t: number, memo: Map<string, number>): number => {
    if (priming.has(key)) return 0;
    priming.add(key);
    const v0 = evalExpr(e.input, t, memo, key + "I");
    if (e.kind === "smooth") smoothState.set(key, v0);
    else {
      const T = evalExpr(e.time, t, memo, key + "T");
      const n = Math.max(1, Math.round((Number.isFinite(T) ? Math.max(0, T) : 0) / DT));
      delayState.set(key, { buf: new Array(n).fill(v0), ptr: 0 });
    }
    priming.delete(key);
    return v0;
  };
  {
    // Prime every call up front (order-independent: primeCall recurses).
    const memo = new Map<string, number>();
    for (const c of calls) {
      if (c.kind === "smooth" ? !smoothState.has(c.key) : !delayState.has(c.key))
        primeCall(c.key, { kind: c.kind, input: c.input, time: c.time }, 0, memo);
    }
  }

  // The flow view's series: per call, its owner (dashed) and — when the
  // input is a bare reference to a dot or faucet — that source node (solid;
  // stocks already have level lines). A node in both roles keeps the dashed
  // owner reading.
  const flowNodes = new Map<string, { node: Node; dashed: boolean }>();
  for (const c of calls) {
    const owner = nodeById.get(c.key.slice(0, c.key.indexOf(":")));
    if (owner) flowNodes.set(owner.id, { node: owner, dashed: true });
    if (c.input.kind === "ref") {
      const src = nodeById.get(c.input.id);
      if (src && (src.type === "dot" || src.type === "faucet") && !flowNodes.has(src.id))
        flowNodes.set(src.id, { node: src, dashed: false });
    }
  }
  const flows: FlowSeries[] = [...flowNodes.values()]
    .sort((a, b) => parserId(a.node.id) - parserId(b.node.id))
    .map(f => ({ id: f.node.id, label: f.node.label, dashed: f.dashed, values: [] }));
  const sampleFlows = (t: number, memo: Map<string, number>): void => {
    for (const fs of flows) fs.values.push(valueOf(fs.id, t, memo));
  };

  const series: StockSeries[] = stocks.map(s => ({ id: s.id, label: s.label, levels: [level.get(s.id) ?? 0] }));
  const steps = Math.round(tEnd / DT);
  for (let i = 0; i < steps; i++) {
    // Two-pass synchronous step: total demand each source stock faces, then
    // a ration factor prorating its outflows down to what it holds — the
    // multi-outflow generalization of min(rate, level/dt), order-independent
    // and conserving. Rates are sampled at the step's start time.
    const memo = new Map<string, number>();
    const rates = faucets.map(f => rateFor(f, i * DT, memo));
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
    // Applied rates — what actually flows this step (rate × its source's
    // ration): what a faucet reference inside a call input reads, and the
    // flow view's faucet samples.
    curFlowRate = new Map(faucets.map((f, j) => [f.id, (rates[j] ?? 0) * (f.source ? ration(f.source) : 1)] as [string, number]));
    sampleFlows(i * DT, memo);
    // Advance the call states on start-of-step values: gather every input
    // first (a chained call must see its upstream's pre-update state), then
    // commit — the smooth steps toward its input by min(1, DT/T), the delay
    // ring overwrites the sample it just served and moves on. Runs before
    // the levels update so inputs read this step's stocks.
    const inputs = calls.map(c => evalExpr(c.input, i * DT, memo, c.key + "I"));
    const times = calls.map(c => c.kind === "smooth" ? evalExpr(c.time, i * DT, memo, c.key + "T") : 0);
    calls.forEach((c, k) => {
      const x = inputs[k] ?? 0;
      if (c.kind === "smooth") {
        const T = times[k] ?? 0;
        const toward = T > 0 ? Math.min(1, DT / T) : 1;
        const s = smoothState.get(c.key) ?? x;
        smoothState.set(c.key, s + toward * (x - s));
      } else {
        const st = delayState.get(c.key);
        if (st) {
          st.buf[st.ptr] = x;
          st.ptr = (st.ptr + 1) % st.buf.length;
        }
      }
    });
    curFlowRate = null;
    for (const s of stocks) {
      // max(0, ·) guards float dust only — rationing already prevents overdraw.
      level.set(s.id, Math.max(0, (level.get(s.id) ?? 0) + (delta.get(s.id) ?? 0)));
    }
    series.forEach(sr => sr.levels.push(level.get(sr.id) ?? 0));
  }
  // One closing flow sample at t = tEnd — a rate/ration pass against the
  // final levels, nothing committed — so the flow lines span the full axis
  // like the stock series (steps + 1 samples each).
  if (flows.length > 0) {
    const memo = new Map<string, number>();
    const rates = faucets.map(f => rateFor(f, steps * DT, memo));
    const demand = new Map<string, number>();
    faucets.forEach((f, j) => {
      if (f.source) demand.set(f.source, (demand.get(f.source) ?? 0) + (rates[j] ?? 0) * DT);
    });
    const ration = (id: string): number => {
      const d = demand.get(id) ?? 0;
      const l = level.get(id) ?? 0;
      return d > l ? l / d : 1;
    };
    curFlowRate = new Map(faucets.map((f, j) => [f.id, (rates[j] ?? 0) * (f.source ? ration(f.source) : 1)] as [string, number]));
    sampleFlows(steps * DT, memo);
    curFlowRate = null;
  }
  return { stocks: series, flows };
}
