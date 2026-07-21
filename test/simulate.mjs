// Headless checks of the frontend simulator: compile DSL through the real
// backend (output/Main), feed the graph to ui/simulate.ts, assert the series.
// ui/simulate.ts is dependency-free with type-only imports precisely so node
// can run it directly (erasable-syntax type stripping, node >= 22.18).
// Run with:   node test/simulate.mjs
import * as M from '../output/Main/index.js';
import { simulate, hasNumbers, T_END, DT } from '../ui/simulate.ts';

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
}

console.log(failures ? `${failures} FAILURE(S)` : 'SIMULATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
