// Headless checks of the frontend simulator: compile DSL through the real
// backend (output/Main), feed the graph to ui/simulate.ts, assert the series.
// ui/simulate.ts is dependency-free with type-only imports precisely so node
// can run it directly (erasable-syntax type stripping, node >= 22.18).
// Run with:   node test/simulate.mjs
import * as M from '../output/Main/index.js';
import { simulate, flowSeries, hasDelays, hasNumbers, goalRefs, scheduleFn, T_END, DT } from '../ui/simulate.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };
const sys = (input) => {
  const out = JSON.parse(M.go(input));
  if (typeof out === 'string') throw new Error(`compile error for ${JSON.stringify(input)}: ${out}`);
  return out;
};
const last = (s) => s.levels[s.levels.length - 1];

// figures 5 & 6: 50 gallons draining at 5/min hits exactly 0 at t = 10.
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

// figures 5 & 7: drain from 50, then at t=5 the inflow steps up to match the
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

// figures 10 & 11: goal-seeking rates. The faucet's annotation acts as a
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

// figures 12 & 13: reinforcing interest. A bare faucet fed one constant AND
// its own stock's level (the drawn R-loop arrow) compounds: rate = factor ×
// level, so each Euler step multiplies the level by (1 + factor·DT) —
// exponential growth. The factor constant is NOT a goal: no dashed rule.
{
  const F12 = `|=>interest added[money in bank account: 100]
R(interest added <- money in bank account)
interest rate: 0.1 -> interest added`;
  const system = sys(F12);
  const money = simulate(system).find(s => s.label === 'money in bank account');
  let want = 100;
  for (let n = 0; n < Math.round(T_END / DT); n++) want = want + (0.1 * want) * DT;
  if (Math.abs(last(money) - want) > 1e-9)
    fail('figure 13', `ends at ${last(money)}, want ${want}`);
  if (!money.levels.every((v, i) => i === 0 || v > money.levels[i - 1]))
    fail('figure 13', 'compound interest must grow strictly');
  if (goalRefs(system).length !== 0)
    fail('figure 13', 'a factor constant is not a goal — no dashed rule should register');
}

// The same wiring on an outflow decays exponentially toward 0, never below.
{
  const series = simulate(sys('[charge: 100]=>leak|\nR(leak <- charge)\nleak rate: 0.3 -> leak'));
  const charge = series[0];
  let want = 100;
  for (let n = 0; n < Math.round(T_END / DT); n++) want = want - (0.3 * want) * DT;
  if (Math.abs(last(charge) - want) > 1e-9)
    fail('decay', `ends at ${last(charge)}, want ${want}`);
  if (!charge.levels.every((v, i) => v >= 0 && (i === 0 || v < charge.levels[i - 1])))
    fail('decay', 'levels must decay strictly and stay nonnegative');
}

// figures 15 & 16: the thermostat. The furnace goal-seeks the thermostat
// setting through its discrepancy relay (room warms 10 → 18, Euler closed
// form), while the heat-to-outside loop stays closed — its faucet is bare
// and `outside temperature` carries no value, so there is neither a goal
// nor a factor to arm it. Only the setting registers as a dashed rule.
{
  const F16 = `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`;
  const system = sys(F16);
  const room = simulate(system).find(s => s.label === 'room temperature');
  const decay = Math.pow(1 - 1.2 * DT, Math.round(T_END / DT));
  const want = 18 + (10 - 18) * decay;
  if (Math.abs(last(room) - want) > 1e-9)
    fail('figure 16', `room ends at ${last(room)}, want ${want}`);
  if (!room.levels.every((v, i) => i === 0 || (v >= room.levels[i - 1] && v <= 18)))
    fail('figure 16', 'room must warm monotonically toward the setting, never past it');
  const goals = goalRefs(system);
  if (!(goals.length === 1 && goals[0].label === 'thermostat setting' && goals[0].value === 18))
    fail('figure 16', `goalRefs should be the setting alone, got ${JSON.stringify(goals)}`);
}

// figures 15 & 17: furnace off (bare faucet, valueless setting) — the leak
// goal-seeks the outside temperature, so the warm room decays toward 10 and
// only the outside temperature registers as a reference rule.
{
  const F17 = `|=>heat from furnace[room temperature: 18]=>heat to outside: 0.13|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures`;
  const system = sys(F17);
  const room = simulate(system).find(s => s.label === 'room temperature');
  const want = 10 + (18 - 10) * Math.pow(1 - 0.13 * DT, Math.round(T_END / DT));
  if (Math.abs(last(room) - want) > 1e-9)
    fail('figure 17', `room ends at ${last(room)}, want ${want}`);
  if (!room.levels.every((v, i) => v >= 10 && (i === 0 || v <= room.levels[i - 1])))
    fail('figure 17', 'room must cool monotonically toward the outside, never below it');
  const goals = goalRefs(system);
  if (!(goals.length === 1 && goals[0].label === 'outside temperature' && goals[0].value === 10))
    fail('figure 17', `goalRefs should be the outside temperature alone, got ${JSON.stringify(goals)}`);
}

// figures 15 & 18: both loops live. The room warms from 10 but settles just
// BELOW the setting — the leak steals heat, so equilibrium sits where
// furnace gain × (18 − T) = leak gain × (T − 10), ≈ 17.2. Mirror the
// simulator's per-step float ops exactly.
{
  const F18 = `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: 0.13|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures`;
  const system = sys(F18);
  const room = simulate(system).find(s => s.label === 'room temperature');
  let want = 10;
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const qf = (Math.min(1.2, 1 / DT) * Math.max(0, 18 - want)) * DT * 1;
    const ql = (Math.min(0.13, 1 / DT) * Math.max(0, want - 10)) * DT * 1;
    want = Math.max(0, want + (qf - ql));
  }
  if (Math.abs(last(room) - want) > 1e-9)
    fail('figure 18', `room ends at ${last(room)}, want ${want}`);
  if (!(last(room) > 17 && last(room) < 18))
    fail('figure 18', `equilibrium should sit just below the setting, got ${last(room)}`);
  if (!room.levels.every((v, i) => i === 0 || v >= room.levels[i - 1]))
    fail('figure 18', 'room must warm monotonically to the two-loop equilibrium');
  const goals = goalRefs(system);
  if (!(goals.length === 2 && goals[0].label === 'thermostat setting' && goals[1].label === 'outside temperature'))
    fail('figure 18', `both constants should register, setting first: ${JSON.stringify(goals)}`);
}

// A schedule holds each value until the next step (there is exactly one
// reading — a curve is written as a denser staircase), exact at every
// point, flat outside the first/last, later-written duplicates winning.
{
  const WAVE = [[1, 7], [2, 4], [3, 0], [4, -3], [4.5, -5], [5.5, -3], [6, 0], [7, 4], [8, 7], [9, 10]]
    .map(([at, value]) => ({ at, value }));
  const stepped = scheduleFn({ value: 10, steps: WAVE });
  if (stepped(0.99) !== 10 || stepped(1) !== 7 || stepped(4.6) !== -5)
    fail('stepped schedule', 'must hold each value until the next step');
  if (stepped(9.7) !== 10 || stepped(1000) !== 10) fail('stepped schedule', 'flat after the last point');
  if (stepped(-3) !== 10) fail('stepped schedule', 'flat before the first point');
  const dup = scheduleFn({ value: 1, steps: [{ at: 0, value: 4 }, { at: 2, value: 5 }] });
  if (dup(0) !== 4 || dup(1.9) !== 4 || dup(2) !== 5)
    fail('stepped schedule', 'a step at 0 overrides the initial value');
}

// figures 15 & 19 (well insulated, leak 0.13) & 20 (poorly insulated, 0.4):
// the outside temperature is an equation of time — a period-10 cosine cold
// day dipping to -5 at t=5 and back to 10 — so the leak chases a moving
// target. The room sags mid-run and recovers; the deeper the leak gain,
// the deeper the sag. Mirrored step-for-step: JS's left-associative float
// ops are exactly the engine's fold order, so the mirror is float-exact.
{
  const OUTSIDE = '(2.5 + 7.5 * cos(2 * pi * t / 10))';
  const thermo = (leak) => `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: ${leak}|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: ${OUTSIDE} -> discrepancy between inside and outside temperatures`;
  const outsideFn = (t) => 2.5 + 7.5 * Math.cos(2 * Math.PI * t / 10);
  const mirror = (leak) => {
    let L = 10;
    const levels = [L];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const qf = (Math.min(1.2, 1 / DT) * Math.max(0, 18 - L)) * DT * 1;
      const ql = (Math.min(leak, 1 / DT) * Math.max(0, L - outsideFn(n * DT))) * DT * 1;
      L = Math.max(0, L + (qf - ql));
      levels.push(L);
    }
    return levels;
  };
  for (const [fig, leak, dipLo, dipHi] of [['figure 19', 0.13, 15.6, 16.0], ['figure 20', 0.4, 12.1, 12.6]]) {
    const system = sys(thermo(leak));
    const room = simulate(system).find(s => s.label === 'room temperature');
    const wantLevels = mirror(leak);
    if (!room.levels.every((v, i) => Math.abs(v - wantLevels[i]) < 1e-9))
      fail(fig, 'series must match the mirrored recurrence sample-for-sample');
    // The sag is measured after the initial warm-up (the run starts at 10).
    const dip = Math.min(...room.levels.slice(Math.round(3 / DT)));
    if (!(dip >= dipLo && dip <= dipHi))
      fail(fig, `mid-run sag should bottom out in [${dipLo}, ${dipHi}], got ${dip}`);
    if (!(last(room) > dip + 0.5))
      fail(fig, 'room must recover as the cold day ends');
    // The formula goal carries its sampler, not steps — the chart draws
    // the smooth dashed curve from it. cos(0) and cos(pi) are exact in
    // doubles, so the endpoints pin bit-exactly.
    const outside = goalRefs(system).find(g => g.label === 'outside temperature');
    if (!(outside && outside.value === 10 && outside.steps === undefined
          && typeof outside.fn === 'function' && outside.fn(0) === 10 && outside.fn(5) === -5))
      fail(fig, `the formula goal should carry its curve sampler (10 at 0, -5 at 5), got ${JSON.stringify(outside)}`);
  }
}

// The R loop must actually be drawn: a bare faucet fed only a constant stays
// a closed tap. Feedback through a value-less relay dot still counts.
{
  const flat = simulate(sys('|=>f[a: 100]\nc: 0.5 -> f'))[0];
  if (!flat.levels.every(v => v === 100))
    fail('no loop', 'a bare faucet without the drawn feedback must stay closed');
  const relayed = simulate(sys('|=>f[a: 100]\nR(f <- statement <- a)\nc: 0.1 -> f'))[0];
  if (!(last(relayed) > 100))
    fail('relayed loop', 'feedback through a relay dot must still compound');
}

// figures 21–25: the population system — a reinforcing births loop and a
// balancing deaths loop on one stock, both read through the factor rule
// (bare faucets, drawn level→faucet arrows, valued fertility and mortality
// dots — a closed formula counts as valued exactly like a constant). One
// time unit is a decade, so 2007's crude rates (21 births, 9 deaths per
// 1000 per year) read 0.21 and 0.09 — and the same structure grows (22),
// declines (23), or stabilizes (24, fertility riding the book's straight
// ramp down onto mortality) purely by the numbers. Mirrored step-for-step
// in the simulator's float-op order.
{
  const pop = (fertility, mortality) => `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: ${fertility} -> births
mortality: ${mortality} -> deaths`;
  const mirror = (fertFn, mortFn) => {
    let P = 6.6;
    const levels = [P];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const qb = (fertFn(n * DT) * P) * DT * 1;
      const qd = (mortFn(n * DT) * P) * DT * 1;
      P = Math.max(0, P + (qb - qd));
      levels.push(P);
    }
    return levels;
  };
  const constant = (v) => () => v;
  const FERT24 = '(max(0.09, 0.21 - 0.06 * t))';
  const fertFall = (t) => Math.max(0.09, 0.21 - 0.06 * t);
  const runs = [
    ['figure 22', pop('0.21', '0.09'), mirror(constant(0.21), constant(0.09)), 21.5, 22.2],
    ['figure 23', pop('0.21', '0.3'), mirror(constant(0.21), constant(0.3)), 2.5, 2.9],
    ['figure 24', pop(FERT24, '0.09'), mirror(fertFall, constant(0.09)), 7.3, 7.6],
  ];
  const lasts = new Map();
  for (const [fig, input, wantLevels, lo, hi] of runs) {
    const system = sys(input);
    const popn = simulate(system).find(s => s.label === 'population');
    if (!popn.levels.every((v, i) => Math.abs(v - wantLevels[i]) < 1e-12))
      fail(fig, 'series must match the mirrored recurrence sample-for-sample');
    if (!(last(popn) > lo && last(popn) < hi))
      fail(fig, `should end near the book's curve in (${lo}, ${hi}), got ${last(popn)}`);
    if (goalRefs(system).length !== 0)
      fail(fig, 'fertility and mortality are factors, not goals — no dashed rules');
    lasts.set(fig, last(popn));
  }
  const growth = simulate(sys(pop('0.21', '0.09')))[0];
  if (!growth.levels.every((v, i) => i === 0 || v > growth.levels[i - 1]))
    fail('figure 22', 'births dominant: population must grow strictly');
  const decline = simulate(sys(pop('0.21', '0.3')))[0];
  if (!decline.levels.every((v, i) => v > 0 && (i === 0 || v < decline.levels[i - 1])))
    fail('figure 23', 'deaths dominant: population must fall strictly, staying positive');
  // Stabilization: growth until fertility meets mortality at t=2, then the
  // two rates cancel exactly — the level holds to the bit. (At the exact
  // t=2 sample the ramp reads a float hair ABOVE 0.09 — 0.21 - 0.06*2 in
  // doubles — so the hold is bit-exact from one sample later.)
  const stab = simulate(sys(pop(FERT24, '0.09')))[0];
  const flatFrom = Math.round(2 / DT) + 1;
  if (!stab.levels.every((v, i) => i === 0 || v >= stab.levels[i - 1]))
    fail('figure 24', 'population must never fall in the stabilization run');
  if (!stab.levels.every((v, i) => i < flatFrom || v === stab.levels[flatFrom]))
    fail('figure 24', 'level must hold exactly once fertility equals mortality');

  // figure 25: the three scenarios side by side — three copies of the same
  // structure in one model, each reproducing its standalone run exactly.
  const F25 = `|=>births a[growth: 6.6]=>deaths a|
R(births a <- growth)
B(deaths a <- growth)
fertility a: 0.21 -> births a
mortality a: 0.09 -> deaths a
|=>births b[decline: 6.6]=>deaths b|
R(births b <- decline)
B(deaths b <- decline)
fertility b: 0.21 -> births b
mortality b: 0.3 -> deaths b
|=>births c[stabilization: 6.6]=>deaths c|
R(births c <- stabilization)
B(deaths c <- stabilization)
fertility c: ${FERT24} -> births c
mortality c: 0.09 -> deaths c`;
  const system25 = sys(F25);
  const series25 = simulate(system25);
  if (series25.map(s => s.label).join() !== 'growth,decline,stabilization')
    fail('figure 25', `three scenario stocks expected, got ${series25.map(s => s.label)}`);
  for (const [label, fig] of [['growth', 'figure 22'], ['decline', 'figure 23'], ['stabilization', 'figure 24']]) {
    const got = last(series25.find(s => s.label === label));
    if (Math.abs(got - lasts.get(fig)) > 1e-12)
      fail('figure 25', `${label} must match its standalone run, got ${got} vs ${lasts.get(fig)}`);
  }
  if (goalRefs(system25).length !== 0)
    fail('figure 25', 'no goal rules in the composite either');

  // figures 21 & 26: shifting dominance — one run, three phases. Fertility
  // starts above mortality, rides the max ramp down onto it (holding 0.09
  // exactly through the plateau — the ramp clamps and the sin term is
  // still 0), then the quarter-wave sin climb carries it past again: grow,
  // hold, grow faster — ending near the book's ≈18 billion.
  const F26 = '(max(0.09, 0.21 - 0.048 * t) + max(0, 0.27 * sin(pi * (t - 5) / 10)))';
  const fertShift = (t) =>
    Math.max(0.09, 0.21 - 0.048 * t) + Math.max(0, 0.27 * Math.sin(Math.PI * (t - 5) / 10));
  const system26 = sys(pop(F26, '0.09'));
  const shift = simulate(system26).find(s => s.label === 'population');
  const want26 = mirror(fertShift, constant(0.09));
  if (!shift.levels.every((v, i) => Math.abs(v - want26[i]) < 1e-12))
    fail('figure 26', 'series must match the mirrored recurrence sample-for-sample');
  if (!shift.levels.every((v, i) => i === 0 || v >= shift.levels[i - 1]))
    fail('figure 26', 'fertility never drops below mortality: population never falls');
  const idx = (t) => Math.round(t / DT);
  if (!shift.levels.slice(1, idx(2.5) + 1).every((v, i) => v > shift.levels[i]))
    fail('figure 26', 'phase one: births dominant, strict growth until the ramp meets mortality');
  // The step taken AT t=5 still reads sin(0) = 0, so the plateau includes
  // the t=5.05 sample; strict growth starts with the next step.
  const plateau = shift.levels.slice(idx(2.5), idx(5) + 2);
  if (Math.max(...plateau) - Math.min(...plateau) > 0)
    fail('figure 26', `phase two: fertility = mortality must hold the level to the bit, drifted ${Math.max(...plateau) - Math.min(...plateau)}`);
  if (!shift.levels.slice(idx(5) + 2).every((v, i) => v > shift.levels[idx(5) + 1 + i]))
    fail('figure 26', 'phase three: the sin climb must grow strictly once past t=5');
  if (!(last(shift) > 2 * shift.levels[idx(4.5)]))
    fail('figure 26', 'phase three: renewed dominance must more than double the plateau');
  if (!(last(shift) > 17.5 && last(shift) < 18.4))
    fail('figure 26', `should end near the book's ≈18, got ${last(shift)}`);
  if (goalRefs(system26).length !== 0)
    fail('figure 26', 'the shifting fertility is a factor, not a goal');
}

// Equations of time: `t`, `pi`, cos/sin, min/max in formulas. A CLOSED
// formula (no references) is a driving variable — it counts as a valued
// dot in the goal/factor walk exactly like a constant or a schedule —
// while a formula WITH references stays a walk-through relay. Faucet rate
// laws read t directly; a closed shift is analytic in the sampler.
{
  // A `(t)` rate law: the tub fills along the integral of t — mirrored
  // exactly (the rate sampled at each step's start).
  const ramp = simulate(sys('|=>fill: (t)[tub: 0]'))[0];
  let L = 0;
  const want = [L];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    L = Math.max(0, L + (Math.max(0, n * DT) * DT * 1));
    want.push(L);
  }
  if (!ramp.levels.every((v, i) => Math.abs(v - want[i]) < 1e-12))
    fail('t rate law', 'a faucet rate of (t) must integrate the ramp exactly');
  const pie = simulate(sys('|=>fill: (pi)[tub: 0]'))[0];
  if (Math.abs(last(pie) - Math.PI * T_END) > 1e-9)
    fail('pi rate law', `a (pi) rate must fill pi per unit time, got ${last(pie)}`);

  // A closed-formula GOAL: the stock chases the moving target the same way
  // a scheduled goal moves — and goalRefs carries the curve's sampler
  // (no steps key), anchored at its t=0 reading.
  const chase = `[room: 100]=>cool: 1|
B(cool <- gap <- room)
target: (max(20, 40 - 4 * t)) -> gap`;
  const sysChase = sys(chase);
  const goals = goalRefs(sysChase);
  if (!(goals.length === 1 && goals[0].label === 'target' && goals[0].value === 40
        && goals[0].steps === undefined && typeof goals[0].fn === 'function'
        && goals[0].fn(10) === 20))
    fail('formula goal', `goalRefs must carry the closed formula's sampler, got ${JSON.stringify(goals)}`);
  const chased = simulate(sysChase)[0];
  const goalFn = (t) => Math.max(20, 40 - 4 * t);
  let R = 100;
  const wantChase = [R];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const q = (Math.min(1, 1 / DT) * Math.max(0, R - goalFn(n * DT))) * DT * 1;
    R = Math.max(0, R - q);
    wantChase.push(R);
  }
  if (!chased.levels.every((v, i) => Math.abs(v - wantChase[i]) < 1e-9))
    fail('formula goal', 'draining toward a formula goal must mirror gain × discrepancy');

  // A closed-formula FACTOR: min(0.1, 0.2) reads exactly 0.1 — compound
  // growth identical to the constant-factor run.
  const compound = sys('|=>f[a: 100]\nR(f <- a)\nc: (min(0.1, 0.2)) -> f');
  const grown = simulate(compound)[0];
  let A = 100;
  const wantGrown = [A];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    A = Math.max(0, A + (0.1 * A) * DT * 1);
    wantGrown.push(A);
  }
  if (!grown.levels.every((v, i) => Math.abs(v - wantGrown[i]) < 1e-12))
    fail('formula factor', 'a closed-formula factor must compound like its constant value');
  if (goalRefs(compound).length !== 0)
    fail('formula factor', 'factors draw no goal rules');

  // Relay protection: a formula WITH refs is not "valued" — the walk goes
  // straight through it to the constant behind, exactly as before.
  const relayed = sys('[a: 100]=>f: 5|\nB(f <- relay <- a)\nk: 10\nrelay: (k)');
  const rGoals = goalRefs(relayed);
  if (!(rGoals.length === 1 && rGoals[0].label === 'k' && rGoals[0].value === 10))
    fail('relay protection', `a ref-bearing formula dot must stay a walk-through relay, got ${JSON.stringify(rGoals)}`);

  // A delay nested under a function argument is still a delay: the flows
  // toggle sees it (and its ring primes/advances through collectCalls).
  if (!hasDelays(sys('x: 5\na: (cos(x(t - 1)))')))
    fail('delay under cos', 'hasDelays must see through function arguments');

  // A closed shift is analytic in the sampler: (t)(t - 1) is the ramp read
  // one unit late, clamped at the t=0 priming read.
  const lag = sys(`[s: 100]=>drain: 1|
B(drain <- gap <- s)
lagged: ((t)(t - 1)) -> gap`);
  const lagGoal = goalRefs(lag)[0];
  if (!(lagGoal && typeof lagGoal.fn === 'function' && lagGoal.fn(0) === 0
        && lagGoal.fn(0.5) === 0 && Math.abs(lagGoal.fn(5) - 4) < 1e-12))
    fail('closed shift goal', `(t)(t - 1) must sample as max(0, t - 1), got ${lagGoal && JSON.stringify([lagGoal.fn(0), lagGoal.fn(0.5), lagGoal.fn(5)])}`);
}

// Formulas: `: (expr)` is a rate law (faucets) or a computed auxiliary
// (dots). figure 14's book equations — output = capital / 3, investment =
// output × fraction invested — give capital compound growth at
// (1/3 × 0.2) per unit time. Mirrored step-for-step in the simulator's
// float-op order.
{
  const F14 = `|=>investment[capital: 100]
R(capital -> output -> investment)
output: (capital / 3)
investment: (output * fraction of output invested)
fraction of output invested: 0.2`;
  const system = sys(F14);
  const capital = simulate(system).find(s => s.label === 'capital');
  let want = 100;
  for (let n = 0; n < Math.round(T_END / DT); n++)
    want = Math.max(0, want + Math.max(0, (want / 3) * 0.2) * DT * 1);
  if (Math.abs(last(capital) - want) > 1e-9)
    fail('figure 14 formulas', `capital ends at ${last(capital)}, want ${want}`);
  if (!capital.levels.every((v, i) => i === 0 || v > capital.levels[i - 1]))
    fail('figure 14 formulas', 'capital must compound strictly');
  // The formulas imply the arrows: fraction→investment exists without being
  // hand-drawn, and the R(...) arrows are not duplicated.
  const arrows = system.links.filter(l => l.type === 'arrow');
  if (arrows.length !== 3)
    fail('figure 14 formulas', `3 info arrows expected (capital→output, output→investment, fraction→investment), got ${arrows.length}`);
  if (goalRefs(system).length !== 0)
    fail('figure 14 formulas', 'formula faucets register no goal rules');
}

// Formula guard rails: a tap never runs backward (negative formula clamps
// to 0), non-finite arithmetic (division by zero) reads as 0, and a
// formula-only model still shows the chart.
{
  const flat = simulate(sys('[a: 10]=>drain: (0 - a)|'))[0];
  if (!flat.levels.every(v => v === 10))
    fail('formula clamp', 'a negative rate law must clamp to a closed tap');
  const div0 = simulate(sys('|=>f: (1 / z)[s: 0]\nz: 0')).find(s => s.label === 's');
  if (!div0.levels.every(v => v === 0))
    fail('formula div0', 'division by zero must read as rate 0');
  if (!hasNumbers(sys('|=>f: (x)[s]')))
    fail('formula hasNumbers', 'a formula counts as numbers for the chart gate');
}

// figures 27 & 28: the capital archetype — the population system's R+B pair
// with the book's real equations as formulas: annual output = capital ×
// output per unit capital, investment = annual output × investment fraction
// (the reinforcing inflow), depreciation = capital / capital lifetime (the
// balancing outflow). One time unit = 5 years (the 50-year axis on
// T_END = 10): output per unit capital reads 5/3 per unit, lifetimes 10/15/
// 20 years read 2/3/4 — three futures from one number. At 15 years the
// inflow (100 × 5/3 × 0.2) and outflow (100 / 3) are the same double, so
// the equilibrium holds to the bit. Mirrored in the simulator's float-op
// order: formulas clamp at 0, and the ration multiplies by exactly 1.
{
  const cap = (suffix, lifetime) => `|=>investment at ${suffix}[capital at ${suffix}: 100]=>depreciation at ${suffix}|
R(capital at ${suffix} -> annual output at ${suffix} -> investment at ${suffix})
B(capital at ${suffix} -> depreciation at ${suffix})
annual output at ${suffix}: (capital at ${suffix} * output per unit capital at ${suffix})
investment at ${suffix}: (annual output at ${suffix} * investment fraction at ${suffix})
depreciation at ${suffix}: (capital at ${suffix} / capital lifetime at ${suffix})
investment fraction at ${suffix}: 0.2
output per unit capital at ${suffix}: (5 / 3)
capital lifetime at ${suffix}: ${lifetime}`;
  const F28 = [cap('twenty', 4), cap('fifteen', 3), cap('ten', 2)].join('\n');
  const system = sys(F28);
  const series = simulate(system);
  if (series.map(s => s.label).join() !== 'capital at twenty,capital at fifteen,capital at ten')
    fail('figure 28', `three lifetime stocks expected, got ${series.map(s => s.label)}`);
  const mirror = (lifetime) => {
    let K = 100;
    const levels = [K];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const inv = Math.max(0, (K * (5 / 3)) * 0.2);
      const dep = Math.max(0, K / lifetime);
      K = Math.max(0, K + ((inv * DT * 1) - (dep * DT * 1)));
      levels.push(K);
    }
    return levels;
  };
  for (const [label, lifetime] of [['capital at twenty', 4], ['capital at fifteen', 3], ['capital at ten', 2]]) {
    const s = series.find(x => x.label === label);
    const want = mirror(lifetime);
    if (!s.levels.every((v, i) => v === want[i]))
      fail('figure 28', `${label} must match the mirrored recurrence sample-for-sample`);
  }
  const twenty = series.find(s => s.label === 'capital at twenty');
  if (!twenty.levels.every((v, i) => i === 0 || v > twenty.levels[i - 1]))
    fail('figure 28', 'a 20-year lifetime out-invests depreciation: capital must grow strictly');
  if (!(last(twenty) > 228 && last(twenty) < 231.5))
    fail('figure 28', `20-year lifetime should end near the book's ≈230, got ${last(twenty)}`);
  const fifteen = series.find(s => s.label === 'capital at fifteen');
  if (!fifteen.levels.every(v => v === 100))
    fail('figure 28', 'a 15-year lifetime balances investment exactly: the level holds to the bit');
  const ten = series.find(s => s.label === 'capital at ten');
  if (!ten.levels.every((v, i) => v > 0 && (i === 0 || v < ten.levels[i - 1])))
    fail('figure 28', 'a 10-year lifetime out-depreciates investment: capital must fall strictly, staying positive');
  if (!(last(ten) > 18.3 && last(ten) < 19.2))
    fail('figure 28', `10-year lifetime should end near the book's ≈19, got ${last(ten)}`);
  if (goalRefs(system).length !== 0)
    fail('figure 28', 'formula faucets register no goal rules — figure 28 draws no dashed lines');
  const arrows = system.links.filter(l => l.type === 'arrow');
  if (arrows.length !== 18)
    fail('figure 28', `6 info arrows per copy expected (formulas dedup against R/B), got ${arrows.length}`);
}

// figures 29 & 30: the car dealership. deliveries fill the inventory, sales
// drain it, and the ordering machinery — perceived sales → desired inventory
// → discrepancy → orders to factory → deliveries — closes the balancing loop.
// figure 30 is the no-delay idealization: perceived sales = customer demand,
// so the two faucet formulas cancel the sales rate and the net flow is exactly
// adjustment × (desired − inventory) — inventory goal-seeks its target with no
// oscillation. One time unit = 10 days (T_END = 10 over the book's 100-day
// axis); a 10% demand step at day 25 (t = 2.5) eases the level 200 → 220.
// Mirrored step-for-step in the simulator's float-op order: the deliveries and
// sales formulas clamp at 0, and the outflow ration is exactly 1 throughout.
{
  const CAR = `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + adjustment * discrepancy)
deliveries: (orders to factory)
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (coverage * perceived sales)
perceived sales: (customer demand)
sales: (customer demand)
customer demand: 20 @2.5: 22
coverage: 10
adjustment: 10`;
  const system = sys(CAR);
  const inv = simulate(system).find(s => s.label === 'inventory of cars on the lot');
  const demandFn = scheduleFn({ value: 20, steps: [{ at: 2.5, value: 22 }] });
  let I = 200;
  const want = [I];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const d = demandFn(n * DT);
    const desired = 10 * d;                 // coverage × perceived sales
    const discrepancy = desired - I;
    const orders = d + 10 * discrepancy;    // perceived sales + adjustment × discrepancy
    const deliveries = Math.max(0, orders);
    const sales = Math.max(0, d);
    let delta = 0;
    delta += deliveries * DT * 1;           // deliveries fills (no source stock, ration 1)
    delta -= sales * DT * 1;                // sales drains, inventory ample so ration 1
    I = Math.max(0, I + delta);
    want.push(I);
  }
  if (!inv.levels.every((v, i) => v === want[i]))
    fail('figure 30', 'inventory must match the mirrored goal-seeking recurrence sample-for-sample');
  if (!inv.levels.slice(0, Math.round(2.5 / DT) + 1).every(v => v === 200))
    fail('figure 30', 'inventory holds exactly at 200 until the demand step at t=2.5 (day 25)');
  if (!(last(inv) > 219.99 && last(inv) <= 220))
    fail('figure 30', `inventory should ease up to the new 220 target, got ${last(inv)}`);
  if (!inv.levels.every((v, i) => i === 0 || v >= inv.levels[i - 1]))
    fail('figure 30', 'the ideal (no-delay) adjustment is monotone — no overshoot, no oscillation');
  if (goalRefs(system).length !== 0)
    fail('figure 30', 'the formula faucets register no goal rules — figure 30 draws no dashed line');
}

// Time shifts x(t - T) (the figures 31–35 machinery), pinned float-exactly
// against hand-rolled state recurrences in the engine's op order: a
// shift's value is its START-of-step state (the delay ring serves before
// it overwrites), states advance on start-of-step inputs after the rates
// and rations are known, and each primes to its input's value at t=0.
{
  // x(t - T): a pure pipeline. x steps 0→10 at t=1; the delayed faucet
  // echoes it exactly 0.5 (ten samples) later, so the sink stock first
  // moves on the step after t=1.5.
  const system = sys('x: 0 @1: 10\n|=>f: (x(t - 0.5))[s: 0]');
  const s = simulate(system)[0];
  const xFn = scheduleFn({ value: 0, steps: [{ at: 1, value: 10 }] });
  const buf = new Array(10).fill(0);
  let ptr = 0, L = 0;
  const want = [L];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const rate = Math.max(0, buf[ptr]);
    buf[ptr] = xFn(n * DT);
    ptr = (ptr + 1) % 10;
    L = Math.max(0, L + rate * DT * 1);
    want.push(L);
  }
  if (!s.levels.every((v, i) => v === want[i]))
    fail('delay pipeline', 'levels must match the ring-buffer mirror sample-for-sample');
  const first = s.levels.findIndex(v => v > 0);
  if (first !== Math.round(1.5 / DT) + 1)
    fail('delay pipeline', `stock must first move the step after t=1.5, moved at sample ${first}`);
  if (!hasDelays(system)) fail('delay pipeline', 'hasDelays must see the shift');
  if (hasDelays(sys('a: (x + 1)'))) fail('delay pipeline', 'a plain formula has no delays');
}

{
  // A delay may read a FLOW: its input is the faucet's rate as APPLIED —
  // rationed down as the source stock empties — while the t=0 priming
  // reads the raw clamped rate (nothing has flowed yet): here the drain
  // asks 5 but holds only 0.1, so the pipeline starts full of 5 and then
  // carries the rationed trickle, one lag behind.
  const system = sys('[a: 0.1]=>drain: 5|\n|=>inflow: (drain(t - 1))[b: 0]');
  const b = simulate(system).find(x => x.label === 'b');
  let A = 0.1, B = 0;
  const buf = new Array(20).fill(5);
  let ptr = 0;
  const wantB = [B];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const drainRate = 5;
    const inflowRate = Math.max(0, buf[ptr]);
    const demandA = drainRate * DT;
    const rationA = demandA > A ? A / demandA : 1;
    const applied = drainRate * rationA;
    buf[ptr] = applied;
    ptr = (ptr + 1) % 20;
    A = Math.max(0, A + -(drainRate * DT * rationA));
    B = Math.max(0, B + inflowRate * DT * 1);
    wantB.push(B);
  }
  if (!b.levels.every((v, i) => v === wantB[i]))
    fail('delayed flow', 'the pipeline must carry the applied (post-ration) rate, primed raw');
}

// figures 31 & 32 (whose inventory chart is the book's figure 34), 35,
// and 36: the delayed car dealership. Sales step up 10%
// at t=2.5 (day 25); perceived sales reads the sales flow as it was five
// days earlier (`sales(t - perception delay)`, 0.5 — a pipeline, so no
// extra nodes), deliveries pipeline the
// orders (`(t - delivery delay)`, 0.5), and orders anchor on perceived
// sales plus the inventory discrepancy made up over the response delay. The delivery
// pipeline vs response-time ratio decides everything: 0.5/0.3 (the book's
// base) oscillates with growing swings, 0.5/0.2 (reacting faster, figure
// 35) blows up harder, 0.5/0.6 (reacting slower, figure 36) damps onto
// the new 220. Mirrored sample-for-sample in the engine's float-op order.
{
  const car = (rd) => `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t - perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: ${rd}
delivery delay: 0.5`;
  const demandFn = scheduleFn({ value: 200, steps: [{ at: 2.5, value: 220 }] });
  const mirror = (rd) => {
    let I = 200;                           // both rings prime on the 200 equilibrium
    const bufD = new Array(10).fill(200);  // the delivery pipeline: orders(0) = P + 0/rd
    const bufP = new Array(10).fill(200);  // the perception pipeline: sales' raw rate at t=0
    let ptrD = 0, ptrP = 0;
    const levels = [I];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const t = n * DT;
      const deliveries = Math.max(0, bufD[ptrD]); // the delay's start-of-step state
      const sales = Math.max(0, demandFn(t));     // inventory stays ample: ration 1
      const P = bufP[ptrP];                       // perceived sales: the flow ten samples ago
      const desired = P;                          // ten days of sales = one unit's worth
      const disc = desired - I;
      const orders = P + disc / rd;               // gathered before any state commits
      bufD[ptrD] = orders;
      ptrD = (ptrD + 1) % 10;
      bufP[ptrP] = sales * 1;                     // the applied rate (ration 1)
      ptrP = (ptrP + 1) % 10;
      I = Math.max(0, I + (deliveries * DT * 1 - sales * DT * 1));
      levels.push(I);
    }
    return levels;
  };
  const at = (arr, t) => arr[Math.round(t / DT)];
  const win = (arr, t0, t1, f) => f(...arr.slice(Math.round(t0 / DT), Math.round(t1 / DT) + 1));
  const measured = new Map();
  for (const [fig, rdStr, rd] of [['figure 32', '0.3', 0.3], ['figure 35', '0.2', 0.2], ['figure 36', '0.6', 0.6]]) {
    const system = sys(car(rdStr));
    const inv = simulate(system).find(s => s.label === 'inventory of cars on the lot');
    const want = mirror(rd);
    if (!inv.levels.every((v, i) => v === want[i]))
      fail(fig, 'inventory must match the delayed-loop mirror sample-for-sample');
    if (!inv.levels.slice(0, Math.round(2.5 / DT) + 1).every(v => v === 200))
      fail(fig, 'inventory holds exactly at 200 until the demand step at t=2.5');
    if (goalRefs(system).length !== 0)
      fail(fig, 'formula faucets register no goal rules');
    measured.set(fig, inv.levels);
  }
  // figure 32 (the book's delays): a dip as sales outrun the pipeline, then
  // GROWING oscillation — peaks climbing the book's ~248/265/290 ladder
  // about 21 days apart, troughs deepening in step.
  const L32 = measured.get('figure 32');
  const dip32 = win(L32, 2.5, 3.8, Math.min);
  if (!(dip32 > 185 && dip32 < 192)) fail('figure 32', `first dip should bottom near 188, got ${dip32}`);
  const p1 = win(L32, 3.8, 5, Math.max), p2 = win(L32, 5.5, 7, Math.max), p3 = win(L32, 7.5, 9, Math.max);
  if (!(p1 > 253 && p1 < 268 && p2 > 268 && p2 < 284 && p3 > 288 && p3 < 304))
    fail('figure 32', `peaks should climb the book's ladder, got ${p1}/${p2}/${p3}`);
  if (!(p1 < p2 && p2 < p3)) fail('figure 32', 'the oscillation must grow — the delays sit past the stability margin');
  const w1 = win(L32, 4.8, 5.8, Math.min), w2 = win(L32, 6.8, 7.8, Math.min), w3 = win(L32, 8.8, 9.8, Math.min);
  if (!(w1 > w2 && w2 > w3)) fail('figure 32', 'troughs must deepen as the oscillation grows');
  // figure 35: shortening the response delay makes it WORSE — the book's
  // counterintuitive peaks past 380 with troughs cut toward 120.
  const L35 = measured.get('figure 35');
  if (!(win(L35, 5, 7, Math.max) > 370 && win(L35, 7.5, 9, Math.max) > 385))
    fail('figure 35', `reacting faster must blow the peaks past 380, got ${win(L35, 5, 7, Math.max)}/${win(L35, 7.5, 9, Math.max)}`);
  if (!(win(L35, 4.5, 5.5, Math.min) < 140)) fail('figure 35', 'and cut the troughs deeper');
  if (win(L35, 0, 10, Math.min) < 0) fail('figure 35', 'levels stay nonnegative throughout');
  // figure 36: lengthening it damps the oscillation onto the new target —
  // the pasted chart's one shallow dip (~188 bottoming near day 32), one
  // overshoot (~227 near day 47), then flat on 220.
  const L36 = measured.get('figure 36');
  const dip36 = win(L36, 2.5, 4.5, Math.min);
  if (!(dip36 > 180 && dip36 < 192)) fail('figure 36', `the single dip bottoms near 184, got ${dip36}`);
  const over = win(L36, 4, 5.5, Math.max);
  if (!(over > 228 && over < 238)) fail('figure 36', `slower response overshoots only to ~233, got ${over}`);
  if (!(win(L36, 7, 10, Math.max) - win(L36, 7, 10, Math.min) < 4))
    fail('figure 36', 'the oscillation must be damped away by the last third');
  const end36 = L36[L36.length - 1];
  if (!(end36 > 219 && end36 < 221)) fail('figure 36', `must settle on the new 220 equilibrium, got ${end36}`);
  // figure 33: the flow view of the base run — each delay's input against
  // its output. Both pipelines are EXACT ten-sample echoes primed at the
  // 200 equilibrium: deliveries echoes orders, perceived sales echoes the
  // applied sales flow.
  const system32 = sys(car('0.3'));
  const flows = flowSeries(system32);
  if (flows.map(f => `${f.label}${f.dashed ? '~' : ''}`).join() !== 'deliveries~,sales,orders to factory,perceived sales~')
    fail('figure 33', `flow series should be the two call pairs in id order, got ${flows.map(f => `${f.label}${f.dashed ? '~' : ''}`)}`);
  const fOf = (label) => flows.find(f => f.label === label);
  const orders = fOf('orders to factory'), deliveries = fOf('deliveries');
  const sales = fOf('sales'), perceived = fOf('perceived sales');
  if (!deliveries.values.every((v, i) => v === (i < 10 ? 200 : Math.max(0, orders.values[i - 10]))))
    fail('figure 33', 'deliveries must be orders shifted exactly ten samples (primed at 200)');
  if (!sales.values.every((v, i) => v === Math.max(0, demandFn(i * DT))))
    fail('figure 33', 'sales must track customer demand sample-for-sample');
  if (!perceived.values.every((v, i) => v === (i < 10 ? 200 : sales.values[i - 10])))
    fail('figure 33', 'perceived sales must be the sales flow shifted exactly ten samples (primed at 200)');
  if (!(at(perceived.values, 2.9) === 200 && at(perceived.values, 3) === 220))
    fail('figure 33', `perception picks up the step exactly one delay late, got ${at(perceived.values, 3)} at t=3`);
  if (sales.values.length !== L32.length)
    fail('figure 33', 'flow series align with the stock series sample count');
  if (!hasDelays(system32))
    fail('figure 33', 'the dealership has delays for the chart toggle to unfold');
}

// The showcase buttons (ui/example.ts, not book figures): pin each one's
// headline behavior — the shape the button exists to show — without a full
// float mirror.
{
  // epidemic: the nonlinear rate law sweeps the population along crossing
  // S-curves; one faucet moves people, so the two stocks conserve exactly.
  const s = simulate(sys(`[susceptible: 990] =>infection [infected: 10]
infection: (0.001 susceptible * infected)`));
  const inf = s.find(x => x.label === 'infected'), sus = s.find(x => x.label === 'susceptible');
  if (!(last(inf) > 990 && last(sus) < 10))
    fail('epidemic', `should sweep the population, got ${last(inf)} infected`);
  if (!inf.levels.every((v, i) => Math.abs(v + sus.levels[i] - 1000) < 1e-9))
    fail('epidemic', 'susceptible + infected must conserve the 1000 throughout');
  if (!inf.levels.every((v, i) => i === 0 || v >= inf.levels[i - 1]))
    fail('epidemic', 'infections only grow');
}
{
  // caffeine: two @ pulses against a proportional decay — nothing before
  // the first shot, a visible sag between shots, and the afternoon shot
  // stacking well above the morning peak.
  const c = simulate(sys(`| =>espresso: 0 @1: 240 @1.5: 0 @6: 240 @6.5: 0 [caffeine in blood: 0] =>metabolism |
metabolism: (0.14 caffeine in blood)`))[0];
  const at = (t) => c.levels[Math.round(t / DT)];
  if (at(1) !== 0) fail('caffeine', 'nothing in the blood before the first shot');
  const peak1 = Math.max(...c.levels.slice(0, Math.round(5 / DT)));
  const peak2 = Math.max(...c.levels);
  if (!(peak1 > 100 && peak1 < 120)) fail('caffeine', `morning peak ~108, got ${peak1}`);
  if (!(peak2 > peak1 + 50)) fail('caffeine', 'the afternoon shot stacks on the morning residue');
  if (!(at(5.9) < peak1 * 0.65)) fail('caffeine', 'decay sags visibly between shots');
}
{
  // boom & bust: breeding on price(t - 2) closes a loop through the
  // pipeline shift, so the level orbits its 400/3 equilibrium instead of
  // settling — repeated crossings are the oscillation.
  const system = sys(`| =>breeding [pigs at market: 90] =>sales |
breeding: (price(t - 2))
price: (200 - pigs at market)
sales: (0.5 pigs at market)`);
  if (!hasDelays(system)) fail('boom & bust', 'the shift must register (the flows toggle appears)');
  const p = simulate(system)[0];
  const eq = 400 / 3;
  let crossings = 0;
  for (let i = 1; i < p.levels.length; i++)
    if ((p.levels[i] - eq) * (p.levels[i - 1] - eq) < 0) crossings++;
  if (crossings < 3)
    fail('boom & bust', `should cross its equilibrium repeatedly, got ${crossings} crossings`);
}
{
  // skydiver: speed^2 drag flattens speed onto the √500 terminal velocity;
  // altitude drains at the other band's speed and the outflow ration parks
  // it at exactly 0 on landing, just before the horizon.
  const s = simulate(sys(`| =>gravity [speed: 0] =>air drag |
gravity: 10
air drag: (0.02 speed^2)
[altitude: 180] =>falling |
falling: (speed)`));
  const v = s.find(x => x.label === 'speed'), alt = s.find(x => x.label === 'altitude');
  if (!(Math.abs(last(v) - Math.sqrt(500)) < 0.1))
    fail('skydiver', `terminal velocity should be √500, got ${last(v)}`);
  if (!v.levels.every((x, i) => i === 0 || x >= v.levels[i - 1]))
    fail('skydiver', 'speed only rises toward terminal');
  if (last(alt) !== 0) fail('skydiver', `must land at exactly 0, got ${last(alt)}`);
  if (!(alt.levels[Math.round(9.5 / DT)] > 0)) fail('skydiver', 'still airborne at t=9.5');
  if (!alt.levels.every(x => x >= 0)) fail('skydiver', 'altitude never goes underground');
}

// The keyword showcase buttons (ui/example.ts): one per reserved formula
// word, each pinned on the shape its keyword creates.
{
  // rush hour (t): arrivals 2t vs departures 8 — the road stays essentially
  // empty until the rates cross at t=4, then the jam compounds toward
  // ∫(2t - 8) = 36.
  const system = sys('| =>cars arriving: (2t) [cars on the road: 0] =>cars leaving: 8 |');
  const road = simulate(system)[0];
  const at = (t) => road.levels[Math.round(t / DT)];
  if (!(at(3) < 1 && at(4) < 1.5))
    fail('rush hour', `the road stays near-empty before the rates cross, got ${at(3)} at t=3`);
  if (!road.levels.slice(Math.round(4.5 / DT)).every((v, i, a) => i === 0 || v > a[i - 1]))
    fail('rush hour', 'the jam grows strictly once arrivals outpace departures');
  if (!(last(road) > 35 && last(road) < 37))
    fail('rush hour', `should end near the closed-form 36, got ${last(road)}`);
  if (goalRefs(system).length !== 0) fail('rush hour', 'no goals here');
}
{
  // odometer (pi): distance accrues at the constant 2π·0.35·3 — a dead
  // straight line to ≈66 (pi in an honest circumference).
  const dist = simulate(sys(`| =>rolling [distance: 0]
wheel radius: 0.35
cadence: 3
rolling: (2 * pi * wheel radius * cadence)`))[0];
  const rate = 2 * Math.PI * 0.35 * 3;
  if (!dist.levels.every((v, i) => Math.abs(v - rate * i * DT) < 1e-9))
    fail('odometer', 'distance must run dead straight at 2πr × cadence');
  if (!(Math.abs(last(dist) - rate * T_END) < 1e-9))
    fail('odometer', `should end at 2π·0.35·3·10 ≈ 65.97, got ${last(dist)}`);
}
{
  // tides (cos): the basin chases a two-cycle cosine sea level through a
  // fill/drain faucet pair — attenuated swings around 3 with a visible
  // lag, under the smooth dashed goal curve.
  const system = sys(`| =>flood tide: 1.5 [harbor basin: 3] =>ebb tide: 1.5 |
B(flood tide <- gap <- harbor basin)
B(ebb tide <- gap)
sea level: (3 + 1.5 * cos(2 * pi * t / 5)) -> gap`);
  const goals = goalRefs(system);
  if (!(goals.length === 1 && goals[0].label === 'sea level'
        && typeof goals[0].fn === 'function'
        && goals[0].fn(0) === 4.5 && goals[0].fn(2.5) === 1.5))
    fail('tides', `sea level should be the one formula goal (4.5 at t=0, 1.5 at t=2.5), got ${JSON.stringify(goals)}`);
  const basin = simulate(system)[0];
  let maxima = 0, minima = 0;
  for (let i = 1; i < basin.levels.length - 1; i++) {
    if (basin.levels[i] > basin.levels[i - 1] && basin.levels[i] >= basin.levels[i + 1] && basin.levels[i] > 3.3) maxima++;
    if (basin.levels[i] < basin.levels[i - 1] && basin.levels[i] <= basin.levels[i + 1] && basin.levels[i] < 2.7) minima++;
  }
  if (!(maxima >= 2 && minima >= 2))
    fail('tides', `two tide cycles should show two crests and two troughs, got ${maxima}/${minima}`);
  if (!basin.levels.every(v => v > 1.5 && v < 4.6))
    fail('tides', 'the basin tracks attenuated inside the sea level swing');
}
{
  // monsoon (sin): one seasonal half-wave of rain against a steady river —
  // dip while the river still wins, crest as the rains fall back under it,
  // recede after.
  const res = simulate(sys(`| =>rainfall [reservoir: 20] =>river outflow: 12 |
rainfall: (38 * sin(pi * t / 10))`))[0];
  const min = Math.min(...res.levels), max = Math.max(...res.levels);
  const minT = res.levels.indexOf(min) * DT, maxT = res.levels.indexOf(max) * DT;
  if (!(min > 13 && min < 15 && minT > 0.8 && minT < 1.4))
    fail('monsoon', `early dip ≈14 near t≈1, got ${min} at ${minT}`);
  if (!(max > 145 && max < 150 && maxT > 8.5 && maxT < 9.5))
    fail('monsoon', `crest ≈148 near t=9, got ${max} at ${maxT}`);
  if (!(last(res) < max && last(res) > 138))
    fail('monsoon', 'the reservoir recedes after the crest');
}
{
  // phone charger (min): constant-current at exactly 25 while the cap
  // binds, then the constant-voltage taper onto full — the first Euler
  // step moves exactly 25·DT.
  const bat = simulate(sys(`| =>charging [battery: 10]
full charge: 100
charging: (min(25, 1.2 * (full charge - battery)))`))[0];
  if (bat.levels[1] !== 11.25)
    fail('charger', `the capped phase moves exactly 25·DT per step, got ${bat.levels[1]}`);
  if (!bat.levels.every((v, i) => i === 0 || v >= bat.levels[i - 1]))
    fail('charger', 'charge only rises');
  if (!(last(bat) > 99.99 && last(bat) <= 100))
    fail('charger', `should taper onto full, got ${last(bat)}`);
  const lateDelta = last(bat) - bat.levels[bat.levels.length - 2];
  if (!(lateDelta < 0.01))
    fail('charger', 'the taper crawls at the end');
}
{
  // drought (max): proportional use coasts exponentially until the
  // essential floor takes over below level 24 — the floor breaks the
  // balancing loop and crashes the reservoir to exactly 0 just before
  // the horizon.
  const town = simulate(sys(`[town reservoir: 100] =>consumption |
consumption: (max(6, 0.25 * town reservoir))`))[0];
  if (last(town) !== 0) fail('drought', `must run dry at exactly 0, got ${last(town)}`);
  const firstZero = town.levels.findIndex(v => v === 0) * DT;
  if (!(firstZero > 9.3 && firstZero < 10))
    fail('drought', `should run dry just before the horizon, got t=${firstZero}`);
  if (!town.levels.every((v, i) => i === 0 || v < town.levels[i - 1] || v === 0))
    fail('drought', 'the reservoir only falls until it is dry');
}

// figures 37 & 38: the oil economy (1 unit = 10 years). Capital compounds
// while the cube-norm soft-min lets investment track its 10%/yr growth
// goal, peaks as falling yield pinches profit, then decays at the
// depreciation rate; the resource S-curves from 1000 toward 0 (its
// outflow ration guards the very end). Mirrored float-exactly in the
// engine's op order, then the book's landmarks pinned as windows.
{
  const OIL = `| =>investment [capital: 5] =>depreciation |
[resource: 1000] =>extraction |
R(investment <- profit <- capital)
B(depreciation <- capital)
B(profit <- capital -> extraction)
investment: (profit * growth goal / ((profit^3 + growth goal^3)^(1 / 3)))
growth goal: (capital)
depreciation: (capital / capital lifetime)
capital lifetime: 2
extraction: (14 capital * yield per unit capital)
profit: (4 price * capital * yield per unit capital)
price: 1
yield per unit capital: (resource / 1000)`;
  const system = sys(OIL);
  const series = simulate(system);
  const Ks = series.find(s => s.label === 'capital');
  const Rs = series.find(s => s.label === 'resource');
  let K = 5, R = 1000;
  const wantK = [K], wantR = [R];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const y = R / 1000;
    const G = K;
    const P = ((4 * 1) * K) * y;
    const inv = Math.max(0, (P * G) / ((P ** 3 + G ** 3) ** (1 / 3)));
    const dep = Math.max(0, K / 2);
    const ext = Math.max(0, (14 * K) * y);
    const demandK = dep * DT, rationK = demandK > K ? K / demandK : 1;
    const demandR = ext * DT, rationR = demandR > R ? R / demandR : 1;
    let dK = 0;
    dK += inv * DT * 1;
    dK -= dep * DT * rationK;
    K = Math.max(0, K + dK);
    R = Math.max(0, R + -(ext * DT * rationR));
    wantK.push(K); wantR.push(R);
  }
  if (!Ks.levels.every((v, i) => v === wantK[i]))
    fail('figure 38', 'capital must match the soft-min mirror sample-for-sample');
  if (!Rs.levels.every((v, i) => v === wantR[i]))
    fail('figure 38', 'the resource must match the mirror sample-for-sample');
  const peakK = Math.max(...Ks.levels), tPeak = Ks.levels.indexOf(peakK) * DT;
  if (!(peakK > 52 && peakK < 58)) fail('figure 38', `capital peaks near the book's ~55-60, got ${peakK}`);
  if (!(tPeak > 5.5 && tPeak < 6.1)) fail('figure 38', `the peak lands near year 58, got year ${tPeak * 10}`);
  const atR = (t) => Rs.levels[Math.round(t / DT)];
  if (!(atR(5.2) > 195 && atR(5.2) < 215))
    fail('figure 38', `the resource passes ~205 at year 52 (the book's ~200), got ${atR(5.2)}`);
  if (!Rs.levels.every((v, i) => i === 0 || v <= Rs.levels[i - 1]))
    fail('figure 38', 'the resource only depletes — no inflow exists');
  if (!(atR(10) < 40)) fail('figure 38', `the resource is nearly gone by year 100, got ${atR(10)}`);
  const endK = Ks.levels[Ks.levels.length - 1];
  if (!(endK > 10 && endK < 18 && endK < peakK / 3))
    fail('figure 38', `capital decays well below its peak by year 100, got ${endK}`);
  if (goalRefs(system).length !== 0)
    fail('figure 38', 'formula faucets register no goal rules — no dashed lines');
  if (hasDelays(system)) fail('figure 38', 'no time shifts here — no flows toggle');

  // figures 37 & 39: three endowments side by side (resource 1000 / 2000 /
  // 4000, each copy's yield reading its own R0, every constant per-copy so
  // the three subsystems stay disconnected). Mirrored float-exactly per
  // copy; the base copy must reproduce the standalone 37 & 38 run
  // bit-for-bit (the figure-25 composite-equals-standalone rule), and the
  // book's lesson pins as windows: each doubling delays the peak only
  // ~14 years and roughly doubles it.
  const oil39 = (s, r0) => `| =>investment ${s} [capital ${s}: 5] =>depreciation ${s} |
[resource ${s}: ${r0}] =>extraction ${s} |
R(investment ${s} <- profit ${s} <- capital ${s})
B(depreciation ${s} <- capital ${s})
B(profit ${s} <- capital ${s} -> extraction ${s})
investment ${s}: (profit ${s} * growth goal ${s} / ((profit ${s}^3 + growth goal ${s}^3)^(1 / 3)))
growth goal ${s}: (capital ${s})
depreciation ${s}: (capital ${s} / capital lifetime ${s})
capital lifetime ${s}: 2
extraction ${s}: (14 capital ${s} * yield per unit capital ${s})
profit ${s}: (4 price ${s} * capital ${s} * yield per unit capital ${s})
price ${s}: 1
yield per unit capital ${s}: (resource ${s} / ${r0})`;
  const series39 = simulate(sys([oil39('base', 1000), oil39('doubled', 2000), oil39('quadrupled', 4000)].join('\n')));
  const peaks = new Map();
  for (const [s, r0] of [['base', 1000], ['doubled', 2000], ['quadrupled', 4000]]) {
    const Kv = series39.find(x => x.label === `capital ${s}`);
    const Rv = series39.find(x => x.label === `resource ${s}`);
    let K = 5, R = r0;
    const wantK = [K], wantR = [R];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const y = R / r0;
      const G = K;
      const P = ((4 * 1) * K) * y;
      const inv = Math.max(0, (P * G) / ((P ** 3 + G ** 3) ** (1 / 3)));
      const dep = Math.max(0, K / 2);
      const ext = Math.max(0, (14 * K) * y);
      const demandK = dep * DT, rationK = demandK > K ? K / demandK : 1;
      const demandR = ext * DT, rationR = demandR > R ? R / demandR : 1;
      let dK = 0;
      dK += inv * DT * 1;
      dK -= dep * DT * rationK;
      K = Math.max(0, K + dK);
      R = Math.max(0, R + -(ext * DT * rationR));
      wantK.push(K); wantR.push(R);
    }
    if (!Kv.levels.every((v, i) => v === wantK[i]) || !Rv.levels.every((v, i) => v === wantR[i]))
      fail('figure 39', `${s}: must match its mirror sample-for-sample`);
    const peakK = Math.max(...Kv.levels);
    peaks.set(s, { peak: peakK, t: Kv.levels.indexOf(peakK) * DT });
  }
  const K38 = Ks.levels, K39base = series39.find(x => x.label === 'capital base').levels;
  if (!K39base.every((v, i) => v === K38[i]))
    fail('figure 39', 'the base copy must reproduce the standalone 37 & 38 run bit-for-bit');
  const dT1 = peaks.get('doubled').t - peaks.get('base').t;
  const dT2 = peaks.get('quadrupled').t - peaks.get('doubled').t;
  if (!(dT1 > 1.2 && dT1 < 1.6 && dT2 > 1.2 && dT2 < 1.6))
    fail('figure 39', `each doubling buys only ~14 years, got +${dT1 * 10}/+${dT2 * 10}`);
  const q1 = peaks.get('doubled').peak / peaks.get('base').peak;
  const q2 = peaks.get('quadrupled').peak / peaks.get('doubled').peak;
  if (!(q1 > 1.7 && q1 < 2.2 && q2 > 1.7 && q2 < 2.2))
    fail('figure 39', `each doubling roughly doubles the peak, got x${q1.toFixed(2)}/x${q2.toFixed(2)}`);
  const at2 = (s) => series39.find(x => x.label === `capital ${s}`).levels[Math.round(2 / DT)];
  if (!(Math.abs(at2('doubled') - at2('base')) < 0.5 && Math.abs(at2('quadrupled') - at2('base')) < 0.5))
    fail('figure 39', 'the three runs overlap through the early years, as the book draws');

  // figures 37 & 40: the growth-goal comparison — four copies differing
  // only in the goal coefficient (gross 1.2/1/0.8/0.6 = net 7/5/3/1 %/yr).
  // Mirrored float-exactly per copy (the five copy's goal is the bare
  // capital reference — no multiply — and must reproduce the standalone
  // 37 & 38 run bit-for-bit). The book's lesson pins as orderings: the
  // faster the growth, the earlier and taller the peak and the harder the
  // crash; at 1% the economy outlives the chart.
  const oil40 = (s, goal) => `| =>investment ${s} [capital ${s}: 5] =>depreciation ${s} |
[resource ${s}: 1000] =>extraction ${s} |
R(investment ${s} <- profit ${s} <- capital ${s})
B(depreciation ${s} <- capital ${s})
B(profit ${s} <- capital ${s} -> extraction ${s})
investment ${s}: (profit ${s} * growth goal ${s} / ((profit ${s}^3 + growth goal ${s}^3)^(1 / 3)))
growth goal ${s}: (${goal})
depreciation ${s}: (capital ${s} / capital lifetime ${s})
capital lifetime ${s}: 2
extraction ${s}: (14 capital ${s} * yield per unit capital ${s})
profit ${s}: (4 price ${s} * capital ${s} * yield per unit capital ${s})
price ${s}: 1
yield per unit capital ${s}: (resource ${s} / 1000)`;
  const series40 = simulate(sys([
    oil40('at seven', '1.2 capital at seven'),
    oil40('at five', 'capital at five'),
    oil40('at three', '0.8 capital at three'),
    oil40('at one', '0.6 capital at one'),
  ].join('\n')));
  const marks40 = new Map();
  for (const [s, c] of [['at seven', 1.2], ['at five', 1], ['at three', 0.8], ['at one', 0.6]]) {
    const Kv = series40.find(x => x.label === `capital ${s}`);
    const Rv = series40.find(x => x.label === `resource ${s}`);
    let K = 5, R = 1000;
    const wantK = [K], wantR = [R];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const y = R / 1000;
      const G = c === 1 ? K : c * K;
      const P = ((4 * 1) * K) * y;
      const inv = Math.max(0, (P * G) / ((P ** 3 + G ** 3) ** (1 / 3)));
      const dep = Math.max(0, K / 2);
      const ext = Math.max(0, (14 * K) * y);
      const demandK = dep * DT, rationK = demandK > K ? K / demandK : 1;
      const demandR = ext * DT, rationR = demandR > R ? R / demandR : 1;
      let dK = 0;
      dK += inv * DT * 1;
      dK -= dep * DT * rationK;
      K = Math.max(0, K + dK);
      R = Math.max(0, R + -(ext * DT * rationR));
      wantK.push(K); wantR.push(R);
    }
    if (!Kv.levels.every((v, i) => v === wantK[i]) || !Rv.levels.every((v, i) => v === wantR[i]))
      fail('figure 40', `${s}: must match its mirror sample-for-sample`);
    const peakK = Math.max(...Kv.levels);
    marks40.set(s, { peak: peakK, t: Kv.levels.indexOf(peakK) * DT, endR: Rv.levels[Rv.levels.length - 1] });
  }
  const K40five = series40.find(x => x.label === 'capital at five').levels;
  if (!K40five.every((v, i) => v === K38[i]))
    fail('figure 40', 'the 5% copy must reproduce the standalone 37 & 38 run bit-for-bit');
  const m7 = marks40.get('at seven'), m5 = marks40.get('at five'), m3 = marks40.get('at three'), m1 = marks40.get('at one');
  if (!(m7.peak > m5.peak && m5.peak > m3.peak && m3.peak > m1.peak))
    fail('figure 40', `faster growth peaks taller: ${m7.peak}/${m5.peak}/${m3.peak}/${m1.peak}`);
  if (!(m7.t < m5.t && m5.t < m3.t && m3.t < m1.t))
    fail('figure 40', `faster growth peaks sooner: years ${m7.t * 10}/${m5.t * 10}/${m3.t * 10}/${m1.t * 10}`);
  if (!(m7.endR < m5.endR && m5.endR < m3.endR && m3.endR < m1.endR))
    fail('figure 40', 'faster growth leaves less resource behind');
  if (!(m1.endR > 250 && m1.t > 9.5))
    fail('figure 40', `the 1% economy outlives the chart with resource to spare, got R ${m1.endR} peak year ${m1.t * 10}`);

  // figures 37 & 41: scarcity pricing — price saturates from 1 toward 6 as
  // yield falls (the yield -> price arrow live) and profit nets a 0.5
  // capital operating cost, crossing ZERO after the peak: the cube-norm's
  // negative-base root goes NaN and the per-op guard plus the faucet clamp
  // hold investment at exactly 0, so capital decays at full depreciation.
  // Mirrored float-exactly including those guards; the book's landmarks:
  // the same extraction curve as 38, but capital peaking ~2x higher a
  // decade later.
  const OIL41 = `| =>investment [capital: 5] =>depreciation |
[resource: 1000] =>extraction |
R(investment <- profit <- capital)
B(depreciation <- capital)
B(profit <- capital -> extraction)
investment: (profit * growth goal / ((profit^3 + growth goal^3)^(1 / 3)))
growth goal: (capital)
depreciation: (capital / capital lifetime)
capital lifetime: 2
extraction: (14 capital * yield per unit capital)
profit: (4 price * capital * yield per unit capital - 0.5 capital)
price: (6 / (1 + 5 yield per unit capital^2))
yield per unit capital: (resource / 1000)`;
  const system41 = sys(OIL41);
  const series41 = simulate(system41);
  const K41 = series41.find(s => s.label === 'capital');
  const R41 = series41.find(s => s.label === 'resource');
  {
    let K = 5, R = 1000;
    const wantK = [K], wantR = [R];
    const guard = (v) => Number.isFinite(v) ? v : 0;
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const y = R / 1000;
      const price = guard(6 / (1 + 5 * y ** 2));
      const G = K;
      const P = ((4 * price) * K) * y - 0.5 * K;
      const root = guard((P ** 3 + G ** 3) ** (1 / 3));
      const inv = Math.max(0, guard((P * G) / root));
      const dep = Math.max(0, K / 2);
      const ext = Math.max(0, (14 * K) * y);
      const demandK = dep * DT, rationK = demandK > K ? K / demandK : 1;
      const demandR = ext * DT, rationR = demandR > R ? R / demandR : 1;
      let dK = 0;
      dK += inv * DT * 1;
      dK -= dep * DT * rationK;
      K = Math.max(0, K + dK);
      R = Math.max(0, R + -(ext * DT * rationR));
      wantK.push(K); wantR.push(R);
    }
    if (!K41.levels.every((v, i) => v === wantK[i]))
      fail('figure 41', 'capital must match the scarcity-pricing mirror sample-for-sample');
    if (!R41.levels.every((v, i) => v === wantR[i]))
      fail('figure 41', 'the resource must match the mirror sample-for-sample');
  }
  const peakK41 = Math.max(...K41.levels), tPeak41 = K41.levels.indexOf(peakK41) * DT;
  if (!(peakK41 > 95 && peakK41 < 108)) fail('figure 41', `capital peaks near the book's ~110, got ${peakK41}`);
  if (!(tPeak41 > 6.2 && tPeak41 < 6.8)) fail('figure 41', `the peak lands near year 65, got year ${tPeak41 * 10}`);
  if (!(peakK41 > 1.7 * peakK)) fail('figure 41', 'scarcity pricing roughly doubles the base peak');
  const endK41 = K41.levels[K41.levels.length - 1];
  if (!(endK41 > 15 && endK41 < 23)) fail('figure 41', `capital decays to the book's ~20 by year 100, got ${endK41}`);
  let peakE41 = 0, tE41 = 0, peakE38 = 0;
  for (let i = 0; i < K41.levels.length; i++) {
    const e41 = 14 * K41.levels[i] * (R41.levels[i] / 1000);
    if (e41 > peakE41) { peakE41 = e41; tE41 = i * DT; }
    const e38 = 14 * Ks.levels[i] * (Rs.levels[i] / 1000);
    if (e38 > peakE38) peakE38 = e38;
  }
  if (!(Math.abs(peakE41 - peakE38) / peakE38 < 0.15 && tE41 > 3.7 && tE41 < 4.4))
    fail('figure 41', `the extraction curve barely moves — the oil is what it is (got ${peakE41 / 10}/yr @ year ${tE41 * 10} vs base ${peakE38 / 10}/yr)`);
  if (!(R41.levels[Math.round(7 / DT)] < 25))
    fail('figure 41', 'the resource is spent by year ~70');
  if (goalRefs(system41).length !== 0 || hasDelays(system41))
    fail('figure 41', 'no goal rules, no flows toggle');
}

// figures 42 & 43 (panels A, B, C): the sustainable fishery
// (1 unit = 15 years), overshooting once and settling the way the book's
// three panels do. The goal is the book's 5%/yr desired growth
// (1.5 capital against the 0.75/unit depreciation drain), profit is
// income read off the catch a season late (price * harvest(t - 0.1) minus
// a 1.75/unit operating cost — a FAUCET read through the pipeline shift,
// so the ring carries the APPLIED harvest rate and no extra nodes exist),
// and per-fish regeneration is the depensation hump 112 (x(1 - x))^2,
// peaking at R = 600 ABOVE the settle point — its +7/unit equilibrium
// slope barely damps the loop, and the delayed profit carries capital
// past the turn. Mirrored float-exactly (soft-min, the two-sample profit
// ring committing the applied rate before levels move, both rations),
// then the book's shapes pinned as windows.
{
  const FISH = `| =>investment [capital: 5] =>depreciation |
| =>regeneration [resource: 1000] =>harvest |
R(investment <- profit <- capital)
B(depreciation <- capital)
B(profit <- capital -> harvest)
investment: (profit * growth goal / ((profit^6 + growth goal^6)^(1 / 6)))
growth goal: (1.5 capital)
depreciation: (capital / capital lifetime)
capital lifetime: (4 / 3)
harvest: (10 capital * yield per unit capital)
profit: (price * harvest(t - 0.1) - 1.75 capital)
price: 1
yield per unit capital: ((resource / 1000)^2)
regeneration: (resource * regeneration rate)
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)`;
  const system = sys(FISH);
  const series = simulate(system);
  const Kf = series.find(s => s.label === 'capital');
  const Rf = series.find(s => s.label === 'resource');
  let K = 5, R = 1000;
  const buf = new Array(2).fill(Math.max(0, (10 * K) * ((R / 1000) ** 2))); // primed: raw clamped rate at t=0
  let ptr = 0;
  const wantK = [K], wantR = [R];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const y = (R / 1000) ** 2;
    const rate = 112 * ((R / 1000 * (1 - R / 1000)) ** 2);
    const regen = Math.max(0, R * rate);
    const G = 1.5 * K;
    const P = (1 * buf[ptr]) - (1.75 * K);
    const inv = Math.max(0, (P * G) / ((P ** 6 + G ** 6) ** (1 / 6)));
    const dep = Math.max(0, K / (4 / 3));
    const harv = Math.max(0, (10 * K) * y);
    const demandK = dep * DT, rationK = demandK > K ? K / demandK : 1;
    const demandR = harv * DT, rationR = demandR > R ? R / demandR : 1;
    buf[ptr] = harv * rationR;
    ptr = (ptr + 1) % 2;
    let dK = 0;
    dK += inv * DT * 1;
    dK -= dep * DT * rationK;
    K = Math.max(0, K + dK);
    let dR = 0;
    dR += regen * DT * 1;
    dR -= harv * DT * rationR;
    R = Math.max(0, R + dR);
    wantK.push(K); wantR.push(R);
  }
  if (!Kf.levels.every((v, i) => v === wantK[i]))
    fail('figure 43', 'capital must match the fishery mirror sample-for-sample');
  if (!Rf.levels.every((v, i) => v === wantR[i]))
    fail('figure 43', 'the resource must match the mirror sample-for-sample');
  const at = (L, t) => L[Math.round(t / DT)];
  const endK = at(Kf.levels, 10), endR = at(Rf.levels, 10);
  // Panel B: capital's S-curve crests ~1450 near year 120, eases to ~1398.
  const peakK = Math.max(...Kf.levels), tPeakK = Kf.levels.indexOf(peakK) * DT;
  if (!(endK > 1385 && endK < 1410)) fail('figure 43', `capital settles near the book's ~1400, got ${endK}`);
  if (!(peakK > 1435 && peakK < 1470 && tPeakK > 7.6 && tPeakK < 8.5))
    fail('figure 43', `capital crests ~1450 near year 120, got ${peakK} @ year ${tPeakK * 15}`);
  if (!(peakK - endK > 35 && peakK - endK < 70))
    fail('figure 43', 'the book\'s small overshoot bump — visible, not a collapse');
  if (!(Math.abs(endK - at(Kf.levels, 9.5)) < 10 && Math.abs(endR - at(Rf.levels, 9.5)) < 3))
    fail('figure 43', 'the tail is flat by the horizon — the sustainable state holds');
  // Panel C: the resource glides down monotonically, undershoots to ~485,
  // recovers onto 500.
  const minR = Math.min(...Rf.levels);
  if (!(endR > 495 && endR < 510)) fail('figure 43', `the resource settles at ~500, got ${endR}`);
  if (!(minR > 475 && minR < 495 && endR - minR > 8))
    fail('figure 43', `the slight undershoot below 500, got min ${minR}`);
  if (!(at(Rf.levels, 3) > at(Rf.levels, 5) && at(Rf.levels, 5) > at(Rf.levels, 7) && at(Rf.levels, 7) > minR))
    fail('figure 43', 'the resource glides DOWN onto its equilibrium');
  if (!(at(Rf.levels, 5) > 840 && at(Rf.levels, 5) < 880))
    fail('figure 43', `the gentle first-half glide (book ~800s at year 75), got ${at(Rf.levels, 5)}`);
  // Panel A: the flows view the perception lag unlocks — no watcher dot.
  // Applied harvest (solid) rises from ~3.3/yr, crests ~272/yr near year
  // 110, dips BELOW the settle to ~224/yr, then holds ~233/yr; profit
  // (dashed, the shift's owner) closes on depreciation at equilibrium.
  if (!hasDelays(system) || goalRefs(system).length !== 0)
    fail('figure 43', 'the profit lag unlocks the flows toggle; no goal rules');
  const flows = flowSeries(system);
  if (flows.map(f => `${f.label}${f.dashed ? '~' : ''}`).join() !== 'harvest,profit~')
    fail('figure 43', `the flow view is harvest (solid) + profit (dashed), got ${flows.map(f => f.label)}`);
  const hv = flows.find(f => !f.dashed).values;
  if (hv.length !== Kf.levels.length) fail('figure 43', 'flow samples align with the stock series');
  if (hv[0] !== 50) fail('figure 43', `harvest opens at 50/unit (~3.3/yr), got ${hv[0]}`);
  const hvEnd = hv[hv.length - 1];
  if (!(hvEnd / 15 > 225 && hvEnd / 15 < 245))
    fail('figure 43', `harvest settles near the book's ~240/yr, got ${hvEnd / 15}`);
  let peakH = -Infinity, iPeakH = 0;
  hv.forEach((v, i) => { if (v > peakH) { peakH = v; iPeakH = i; } });
  const troughH = Math.min(...hv.slice(iPeakH));
  if (!(peakH / 15 > 260 && peakH / 15 < 285 && iPeakH * DT > 7 && iPeakH * DT < 7.8))
    fail('figure 43', `harvest crests near the book's ~300/yr around year 105-115, got ${peakH / 15}/yr @ year ${iPeakH * DT * 15}`);
  if (!(troughH < hvEnd && troughH / 15 > 215 && troughH / 15 < 232))
    fail('figure 43', `the dip bottoms below the settle (~224/yr), got ${troughH / 15}`);
  const pv = flows.find(f => f.dashed).values;
  const pvEnd = pv[pv.length - 1];
  if (!(Math.abs(pvEnd - endK / (4 / 3)) / pvEnd < 0.01))
    fail('figure 43', 'at equilibrium perceived profit closes on depreciation');

  // figures 42 & 44 (panels A, B, C): the same fishery with ONE line
  // changed — the squared yield curve becomes the saturating technology
  // curve 1.27 x^2.8 / (x^2.8 + 0.27) (exactly 1 at carrying capacity):
  // near-full catch efficiency down past half density, then a cliff.
  // Efficiency no longer signals depletion, so the bind slides to
  // R ~380 on the regeneration hump's unstable left side, and the
  // season-late profit read overpowers the little damping left — 43's
  // single ring becomes a sustained cycle orbiting a never-reached
  // equilibrium: the book's oscillating fishery. Same float-exact
  // mirror, then the book's panel shapes pinned: a crest standing above
  // the rebound peaks, capital's first peak level with its later ones
  // and nowhere near 43's 1400, the resource never regaining halfway,
  // and no collapse.
  const FISH44 = FISH.replace(
    'yield per unit capital: ((resource / 1000)^2)',
    'yield per unit capital: ((1.27 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.27))');
  const system44 = sys(FISH44);
  const series44 = simulate(system44);
  const K44 = series44.find(s => s.label === 'capital');
  const R44 = series44.find(s => s.label === 'resource');
  {
    let K = 5, R = 1000;
    const yOf = (R_) => {
      const xr = R_ / 1000;
      return (1.27 * xr ** 2.8) / (xr ** 2.8 + 0.27);
    };
    const buf = new Array(2).fill(Math.max(0, (10 * K) * yOf(R)));
    let ptr = 0;
    const wantK = [K], wantR = [R];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const y = yOf(R);
      const rate = 112 * ((R / 1000 * (1 - R / 1000)) ** 2);
      const regen = Math.max(0, R * rate);
      const G = 1.5 * K;
      const P = (1 * buf[ptr]) - (1.75 * K);
      const inv = Math.max(0, (P * G) / ((P ** 6 + G ** 6) ** (1 / 6)));
      const dep = Math.max(0, K / (4 / 3));
      const harv = Math.max(0, (10 * K) * y);
      const demandK = dep * DT, rationK = demandK > K ? K / demandK : 1;
      const demandR = harv * DT, rationR = demandR > R ? R / demandR : 1;
      buf[ptr] = harv * rationR;
      ptr = (ptr + 1) % 2;
      let dK = 0;
      dK += inv * DT * 1;
      dK -= dep * DT * rationK;
      K = Math.max(0, K + dK);
      let dR = 0;
      dR += regen * DT * 1;
      dR -= harv * DT * rationR;
      R = Math.max(0, R + dR);
      wantK.push(K); wantR.push(R);
    }
    if (!K44.levels.every((v, i) => v === wantK[i]))
      fail('figure 44', 'capital must match the technology-curve mirror sample-for-sample');
    if (!R44.levels.every((v, i) => v === wantR[i]))
      fail('figure 44', 'the resource must match the mirror sample-for-sample');
  }
  const win = (a, t0, t1) => a.slice(Math.round(t0 / DT), Math.round(t1 / DT) + 1);
  const flows44 = flowSeries(system44);
  if (flows44.map(f => `${f.label}${f.dashed ? '~' : ''}`).join() !== 'harvest,profit~')
    fail('figure 44', `the flow view is still the harvest/profit pair, got ${flows44.map(f => f.label)}`);
  const hv44 = flows44.find(f => !f.dashed).values;
  if (hv44[0] !== 50) fail('figure 44', `harvest opens at 50/unit like 43 (y(1) = 1 exactly), got ${hv44[0]}`);
  if (!(at(R44.levels, 5) > 830 && at(R44.levels, 5) < 855 && at(R44.levels, 5) < at(Rf.levels, 5)))
    fail('figure 44', 'the resource declines a touch faster than 43 once technology bites');
  // Panel A: the crest ~277/yr near year 100 stands clearly ABOVE the
  // cycle it drops into — troughs ~100-105/yr, rebound peaks ~225-231/yr.
  let crest44 = -Infinity, iCrest44 = 0;
  hv44.forEach((v, i) => { if (v > crest44) { crest44 = v; iCrest44 = i; } });
  if (!(crest44 / 15 > 268 && crest44 / 15 < 286 && iCrest44 * DT > 6.5 && iCrest44 * DT < 7.1))
    fail('figure 44', `harvest crests ~277/yr near year 100, got ${crest44 / 15}/yr @ year ${iCrest44 * DT * 15}`);
  const trough1 = Math.min(...win(hv44, 7.1, 8.1)), rebound1 = Math.max(...win(hv44, 8.1, 8.8)),
    trough2 = Math.min(...win(hv44, 8.8, 9.5)), rebound2 = Math.max(...win(hv44, 9.5, 10));
  if (!(trough1 / 15 > 92 && trough1 / 15 < 112 && trough2 / 15 > 92 && trough2 / 15 < 115))
    fail('figure 44', `both troughs near the book's ~120/yr band, got ${trough1 / 15} and ${trough2 / 15}`);
  if (!(rebound1 / 15 > 218 && rebound1 / 15 < 242 && rebound2 / 15 > 210 && rebound2 / 15 < 238))
    fail('figure 44', `rebound peaks ~225-231/yr, got ${rebound1 / 15} and ${rebound2 / 15}`);
  if (!(crest44 > rebound1 + 400))
    fail('figure 44', 'the crest stands clearly above the cycle, the book\'s panel A morphology');
  // Panel B: capital tops out ~1113 — nowhere near 43's 1400 — and its
  // first peak is level with the later ones: 1113 / 1093, valleys ~765-780.
  const kPeak1 = Math.max(...win(K44.levels, 7.1, 7.8)), kValley1 = Math.min(...win(K44.levels, 7.8, 8.5)),
    kPeak2 = Math.max(...win(K44.levels, 8.5, 9.2)), kValley2 = Math.min(...win(K44.levels, 9.2, 9.9));
  if (!(kPeak1 > 1080 && kPeak1 < 1150 && kPeak2 > 1060 && kPeak2 < 1130 && Math.abs(kPeak1 - kPeak2) < 40))
    fail('figure 44', `capital peaks ~1113 then ~1093, level like the book's, got ${kPeak1} / ${kPeak2}`);
  if (!(kValley1 > 730 && kValley1 < 800 && kValley2 > 740 && kValley2 < 820))
    fail('figure 44', `capital's valleys ~765-780 (book ~800), got ${kValley1} / ${kValley2}`);
  if (Math.max(...K44.levels) > 1150)
    fail('figure 44', 'capital never approaches 43\'s 1400 — the book\'s 0-2000 axis stays half empty');
  if (!(Math.max(...win(K44.levels, 8.5, 10)) - Math.min(...win(K44.levels, 8.5, 10)) > 250))
    fail('figure 44', 'the tail still swings hard where 43 lies flat — no settling');
  // Panel C: the resource bottoms ~310 and cycles ~310-475 without
  // collapsing or ever regaining the halfway line.
  const minR44 = Math.min(...R44.levels), maxRLate = Math.max(...win(R44.levels, 7.5, 10));
  if (!(minR44 > 295 && minR44 < 325))
    fail('figure 44', `the resource bottoms ~310 (book ~320), got ${minR44}`);
  if (!(maxRLate > 450 && maxRLate < 500))
    fail('figure 44', `the resource's rebounds stay below halfway (~475), got ${maxRLate}`);
  if (minR44 < 250) fail('figure 44', 'oscillation, not figure 45\'s collapse');
  if (!hasDelays(system44) || goalRefs(system44).length !== 0)
    fail('figure 44', 'same delay unlock, no goal rules');

  // figure 42 & 45 (panels A, B, C): technology's endgame — figure 44's
  // Hill curve with ONE constant moved, the half-yield point 0.27 ->
  // 0.01, so yield holds above half strength until the fish fall below
  // ~a fifth of carrying capacity. Below the bind harvest falls like
  // x^2.8 while depensation regeneration falls like x^3 — harvest wins
  // the race down, and the collapse is absorbing: the book's
  // overshoot-and-collapse. Same float-exact mirror, then the panels
  // pinned: a single crest cliffing to zero, capital's pointed tent
  // rotting at pure depreciation, the resource stripped and never
  // recovering (checked past the window at t = 20).
  const FISH45 = FISH44.replace(
    'yield per unit capital: ((1.27 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.27))',
    'yield per unit capital: ((1.01 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.01))');
  const system45 = sys(FISH45);
  const series45 = simulate(system45);
  const K45 = series45.find(s => s.label === 'capital');
  const R45 = series45.find(s => s.label === 'resource');
  {
    let K = 5, R = 1000;
    const yOf = (R_) => {
      const xr = R_ / 1000;
      return (1.01 * xr ** 2.8) / (xr ** 2.8 + 0.01);
    };
    const buf = new Array(2).fill(Math.max(0, (10 * K) * yOf(R)));
    let ptr = 0;
    const wantK = [K], wantR = [R];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const y = yOf(R);
      const rate = 112 * ((R / 1000 * (1 - R / 1000)) ** 2);
      const regen = Math.max(0, R * rate);
      const G = 1.5 * K;
      const P = (1 * buf[ptr]) - (1.75 * K);
      const inv = Math.max(0, (P * G) / ((P ** 6 + G ** 6) ** (1 / 6)));
      const dep = Math.max(0, K / (4 / 3));
      const harv = Math.max(0, (10 * K) * y);
      const demandK = dep * DT, rationK = demandK > K ? K / demandK : 1;
      const demandR = harv * DT, rationR = demandR > R ? R / demandR : 1;
      buf[ptr] = harv * rationR;
      ptr = (ptr + 1) % 2;
      let dK = 0;
      dK += inv * DT * 1;
      dK -= dep * DT * rationK;
      K = Math.max(0, K + dK);
      let dR = 0;
      dR += regen * DT * 1;
      dR -= harv * DT * rationR;
      R = Math.max(0, R + dR);
      wantK.push(K); wantR.push(R);
    }
    if (!K45.levels.every((v, i) => v === wantK[i]))
      fail('figure 45', 'capital must match the endgame mirror sample-for-sample');
    if (!R45.levels.every((v, i) => v === wantR[i]))
      fail('figure 45', 'the resource must match the mirror sample-for-sample');
  }
  const flows45 = flowSeries(system45);
  if (flows45.map(f => `${f.label}${f.dashed ? '~' : ''}`).join() !== 'harvest,profit~')
    fail('figure 45', `the flow view is still the harvest/profit pair, got ${flows45.map(f => f.label)}`);
  const hv45 = flows45.find(f => !f.dashed).values;
  if (hv45[0] !== 50) fail('figure 45', `harvest opens at 50/unit (y(1) = 1 exactly), got ${hv45[0]}`);
  // Panel A: one crest ~322/yr near year 95, then the cliff — zero by
  // year ~108 and dead flat after.
  let crest45 = -Infinity, iCrest45 = 0;
  hv45.forEach((v, i) => { if (v > crest45) { crest45 = v; iCrest45 = i; } });
  if (!(crest45 / 15 > 310 && crest45 / 15 < 334 && iCrest45 * DT > 6.1 && iCrest45 * DT < 6.5))
    fail('figure 45', `harvest crests ~322/yr near year 95, got ${crest45 / 15}/yr @ year ${iCrest45 * DT * 15}`);
  if (!(Math.max(...win(hv45, 8, 10)) / 15 < 0.5))
    fail('figure 45', 'the catch is DEAD after year 120 — no oscillation, no recovery');
  // Panel B: the pointed tent ~630 at year ~99, then bare 20-year-lifetime
  // rot — the decay HAS the pure-depreciation e-fold, and capital lands
  // ~47 by year 150 (nothing like 43's 1398 settle or 44's cycling 1113).
  let kPeak45 = -Infinity, iKPeak45 = 0;
  K45.levels.forEach((v, i) => { if (v > kPeak45) { kPeak45 = v; iKPeak45 = i; } });
  if (!(kPeak45 > 610 && kPeak45 < 650 && iKPeak45 * DT > 6.4 && iKPeak45 * DT < 6.8))
    fail('figure 45', `capital tents ~630 near year 99, got ${kPeak45} @ year ${iKPeak45 * DT * 15}`);
  const dep45 = at(K45.levels, 9.5) / at(K45.levels, 10);
  if (!(Math.abs(dep45 - Math.exp(0.375)) < 0.02))
    fail('figure 45', `the downslope is pure depreciation (e^0.375 per half unit), got ${dep45}`);
  if (!(at(K45.levels, 10) > 40 && at(K45.levels, 10) < 55))
    fail('figure 45', `capital rots to ~47 by year 150, got ${at(K45.levels, 10)}`);
  // Panel C: the glide (~830 at year 75), the plunge, the dead-flat tail —
  // and no comeback even past the window.
  if (!(at(R45.levels, 5) > 815 && at(R45.levels, 5) < 840))
    fail('figure 45', `the glide passes ~830 at year 75, got ${at(R45.levels, 5)}`);
  if (!(at(R45.levels, 8) < 25 && at(R45.levels, 10) < 20 && at(R45.levels, 10) > 5))
    fail('figure 45', `the resource is stripped to ~2% and pinned, got ${at(R45.levels, 8)} / ${at(R45.levels, 10)}`);
  if (!(at(R45.levels, 10) <= at(R45.levels, 8)))
    fail('figure 45', 'still no rebound inside the window');
  const R45long = simulate(system45, 20).find(s => s.label === 'resource').levels;
  if (!(at(R45long, 20) < 30))
    fail('figure 45', `the collapse is absorbing — no comeback by t = 20, got ${at(R45long, 20)}`);
  if (!hasDelays(system45) || goalRefs(system45).length !== 0)
    fail('figure 45', 'same delay unlock, no goal rules');
}

console.log(failures ? `${failures} FAILURE(S)` : 'SIMULATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
