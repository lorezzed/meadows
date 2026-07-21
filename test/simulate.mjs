// Headless checks of the frontend simulator: compile DSL through the real
// backend (output/Main), feed the graph to ui/simulate.ts, assert the series.
// ui/simulate.ts is dependency-free with type-only imports precisely so node
// can run it directly (erasable-syntax type stripping, node >= 22.18).
// Run with:   node test/simulate.mjs
import * as M from '../output/Main/index.js';
import { simulate, hasNumbers, goalRefs, T_END, DT } from '../ui/simulate.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };
const sys = (input) => {
  const out = JSON.parse(M.go(input));
  if (typeof out === 'string') throw new Error(`compile error for ${JSON.stringify(input)}: ${out}`);
  return out;
};
const last = (s) => s.levels[s.levels.length - 1];

// Figures 5 & 6: 50 gallons draining at 5/min hits exactly 0 at t = 10.
{
  const series = simulate(sys('|=>inflow[water in tub: 50]=>outflow: 5|'));
  if (series.length !== 1) fail('figure 5', `1 series expected, got ${series.length}`);
  const tub = series[0];
  if (tub.label !== 'water in tub') fail('figure 5', `label: ${tub.label}`);
  if (tub.levels.length !== Math.round(T_END / DT) + 1)
    fail('figure 5', `sample count ${tub.levels.length}`);
  if (tub.levels[0] !== 50) fail('figure 5', `starts at ${tub.levels[0]}, want 50`);
  if (last(tub) !== 0) fail('figure 5', `ends at ${last(tub)}, want exactly 0`);
  if (!tub.levels.every((v, i) => v >= 0 && (i === 0 || v <= tub.levels[i - 1])))
    fail('figure 5', 'levels must be nonnegative and nonincreasing');
}

// Chained stocks conserve: a's loss = b's gain + the boundary outflow. The
// downstream faucet reads b's start-of-step level (synchronous two-pass
// step), so on the first step b is still empty and `out` pours nothing —
// the boundary flow runs exactly one step (rate·DT) behind full rate.
{
  const series = simulate(sys('[a: 100]=>drain: 5[b]=>out: 2.5|'));
  const a = series.find(s => s.label === 'a');
  const b = series.find(s => s.label === 'b');
  const dA = last(a) - a.levels[0];        // -50
  const dB = last(b) - b.levels[0];        // +25 + one lagged step
  const boundary = 2.5 * (T_END - DT);     // what actually reached the cloud
  if (Math.abs(dA + dB + boundary) > 1e-9)
    fail('chained', `not conserving: dA=${dA} dB=${dB} boundary=${boundary}`);
  if (Math.abs(last(a) - 50) > 1e-9) fail('chained', `a ends at ${last(a)}, want 50`);
  if (Math.abs(last(b) - (25 + 2.5 * DT)) > 1e-9)
    fail('chained', `b ends at ${last(b)}, want ${25 + 2.5 * DT}`);
}

// Figures 5 & 7: drain from 50, then at t=5 the inflow steps up to match the
// outflow — dynamic equilibrium at 25 for the rest of the run.
{
  const series = simulate(sys('|=>inflow: 0 @5: 5[water in tub: 50]=>outflow: 5|'));
  const tub = series[0];
  const at = (t) => tub.levels[Math.round(t / DT)];
  if (tub.levels[0] !== 50) fail('figure 7', `starts at ${tub.levels[0]}, want 50`);
  if (at(2.5) !== 37.5) fail('figure 7', `at t=2.5: ${at(2.5)}, want 37.5`);
  if (at(5) !== 25) fail('figure 7', `at t=5: ${at(5)}, want exactly 25`);
  if (at(7.5) !== 25 || last(tub) !== 25)
    fail('figure 7', `equilibrium broken: t=7.5 ${at(7.5)}, end ${last(tub)}, want 25`);
  if (!tub.levels.every((v, i) => i === 0 || v <= tub.levels[i - 1]))
    fail('figure 7', 'levels must never rise in this scenario');
}

// An empty tub stops draining: the ration zeroes the outflow, never negative.
{
  const series = simulate(sys('[a: 1]=>drain: 5|'));
  const a = series[0];
  if (last(a) !== 0) fail('empty tub', `ends at ${last(a)}, want exactly 0`);
  if (a.levels.some(v => v < 0)) fail('empty tub', 'level went negative');
}

// hasNumbers gates the chart: false without annotations, true with one.
{
  if (hasNumbers(sys('[a]'))) fail('hasNumbers', '[a] should have no numbers');
  if (!hasNumbers(sys('[a: 1]'))) fail('hasNumbers', '[a: 1] should have numbers');
  if (!hasNumbers(sys('a=>f: 5'))) fail('hasNumbers', 'a faucet rate counts');
  if (!hasNumbers(sys('a: 5'))) fail('hasNumbers', 'a dot constant counts');
}

// Figures 10 & 11: goal-seeking rates. The faucet's annotation acts as a
// gain on the discrepancy to the goal constant (found through the info-arrow
// web), so hot coffee cools exponentially onto room temperature and iced
// coffee warms up to it — Euler closed form:
//   level_{n+1} = goal + (level_n − goal)·(1 − gain·DT)
{
  const F10 = `[hot coffee: 100]=>cooling: 0.26|
B(cooling <- discrepancy <- hot coffee)
room temperature: 18 -> discrepancy
|=>heating: 0.26[iced coffee: 0]
B(heating <- warming discrepancy <- iced coffee)
room temperature -> warming discrepancy`;
  const system = sys(F10);
  const series = simulate(system);
  const hot = series.find(s => s.label === 'hot coffee');
  const iced = series.find(s => s.label === 'iced coffee');
  const decay = Math.pow(1 - 0.26 * DT, Math.round(T_END / DT));
  const wantHot = 18 + (100 - 18) * decay;
  const wantIced = 18 + (0 - 18) * decay;
  if (Math.abs(last(hot) - wantHot) > 1e-9)
    fail('figure 11', `hot coffee ends at ${last(hot)}, want ${wantHot}`);
  if (Math.abs(last(iced) - wantIced) > 1e-9)
    fail('figure 11', `iced coffee ends at ${last(iced)}, want ${wantIced}`);
  if (!hot.levels.every((v, i) => i === 0 || (v <= hot.levels[i - 1] && v >= 18)))
    fail('figure 11', 'hot coffee must fall monotonically, never below the goal');
  if (!iced.levels.every((v, i) => i === 0 || (v >= iced.levels[i - 1] && v <= 18)))
    fail('figure 11', 'iced coffee must rise monotonically, never above the goal');
  // The shared constant registers once as the chart's dashed reference rule.
  const goals = goalRefs(system);
  if (!(goals.length === 1 && goals[0].label === 'room temperature' && goals[0].value === 18))
    fail('figure 11', `goalRefs: ${JSON.stringify(goals)}`);
}

// A gain hotter than 1/DT is capped at the remaining discrepancy: one step
// lands exactly ON the goal — no overshoot, no oscillation.
{
  const series = simulate(sys('[a: 100]=>cool: 50|\nB(cool <- gap <- a)\ntarget: 20 -> gap'));
  const a = series[0];
  if (Math.abs(a.levels[1] - 20) > 1e-9) fail('gain cap', `first step to ${a.levels[1]}, want 20`);
  if (a.levels.some(v => v < 20 - 1e-9)) fail('gain cap', 'level crossed below the goal');
}

// Fallbacks keep the plain constant-rate reading: an ambiguous web (two
// constants reaching the faucet) and a stock-to-stock pipe (no single
// "actual" to compare) both drain at the annotated rate — 5 × 10 = 50 gone.
{
  const amb = simulate(sys('[a: 100]=>f: 5|\ng1: 10 -> f\ng2: 20 -> f'))[0];
  if (Math.abs(last(amb) - 50) > 1e-9)
    fail('ambiguous goals', `ends at ${last(amb)}, want 50 (plain rate)`);
  const s2s = simulate(sys('[a: 100]=>f: 5[b]\ngoal: 10 -> f')).find(s => s.label === 'a');
  if (Math.abs(last(s2s) - 50) > 1e-9)
    fail('stock-to-stock', `ends at ${last(s2s)}, want 50 (plain rate)`);
  if (goalRefs(sys('[a: 100]=>f: 5|\ng1: 10 -> f\ng2: 20 -> f')).length !== 0)
    fail('ambiguous goals', 'no goal should register for the chart');
}

console.log(failures ? `${failures} FAILURE(S)` : 'SIMULATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
