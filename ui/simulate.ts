// Pure constant-rate stock-flow simulation (no d3, no DOM — importable
// headlessly). Derives each stock's level over time from the compiled graph:
// stock `value` = initial level, faucet `value` = flow rate, both defaulting
// to 0 (an unannotated faucet is a closed tap). Flow-link direction decides
// which stock a faucet drains (stock→faucet) and fills (faucet→stock);
// clouds, dots, and chained faucets are infinite sources/sinks. Forward
// Euler over T_END/DT steps; each step rations a stock's outflows by what it
// holds (min(1, level/demand)), so levels never go negative and chained
// stocks conserve — an empty tub stops draining.
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

export function simulate(system: System): StockSeries[] {
  const stocks = system.nodes
    .filter(n => n.type === "stock")
    .sort((a, b) => parserId(a.id) - parserId(b.id));
  const stockIds = new Set(stocks.map(s => s.id));
  const level = new Map<string, number>(stocks.map(s => [s.id, s.value ?? 0]));

  // Each faucet moves rate·DT per step from its source stock (the first
  // stock→faucet flow link) to its sink stock (the first faucet→stock one);
  // a side with no stock is an infinite reservoir. Stock attachments beyond
  // the first on either side are ignored (v1 rule).
  const flows = system.links.filter(l => l.type === "flow");
  const faucets = system.nodes
    .filter(n => n.type === "faucet")
    .map(f => {
      const src = flows.find(l => endId(l.target) === f.id && stockIds.has(endId(l.source)));
      const snk = flows.find(l => endId(l.source) === f.id && stockIds.has(endId(l.target)));
      return {
        rate: f.value ?? 0,
        source: src ? endId(src.source) : null,
        sink: snk ? endId(snk.target) : null,
      };
    });

  const series: StockSeries[] = stocks.map(s => ({ id: s.id, label: s.label, levels: [level.get(s.id) ?? 0] }));
  const steps = Math.round(T_END / DT);
  for (let i = 0; i < steps; i++) {
    // Two-pass synchronous step: total demand each source stock faces, then
    // a ration factor prorating its outflows down to what it holds — the
    // multi-outflow generalization of min(rate, level/dt), order-independent
    // and conserving.
    const demand = new Map<string, number>();
    for (const f of faucets) {
      if (f.source) demand.set(f.source, (demand.get(f.source) ?? 0) + f.rate * DT);
    }
    const ration = (id: string): number => {
      const d = demand.get(id) ?? 0;
      const l = level.get(id) ?? 0;
      return d > l ? l / d : 1; // d > l ≥ 0 implies d > 0
    };
    const delta = new Map<string, number>();
    for (const f of faucets) {
      const q = f.rate * DT * (f.source ? ration(f.source) : 1);
      if (f.source) delta.set(f.source, (delta.get(f.source) ?? 0) - q);
      if (f.sink) delta.set(f.sink, (delta.get(f.sink) ?? 0) + q);
    }
    for (const s of stocks) {
      // max(0, ·) guards float dust only — rationing already prevents overdraw.
      level.set(s.id, Math.max(0, (level.get(s.id) ?? 0) + (delta.get(s.id) ?? 0)));
    }
    series.forEach(sr => sr.levels.push(level.get(sr.id) ?? 0));
  }
  return series;
}
