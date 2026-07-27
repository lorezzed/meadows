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

// A smooth (`~`) schedule interpolates a monotone curve through its points:
// exact at every point, flat outside the first/last, monotone between
// consecutive points, and never overshooting the point range.
{
  const WAVE = [[1, 7], [2, 4], [3, 0], [4, -3], [4.5, -5], [5.5, -3], [6, 0], [7, 4], [8, 7], [9, 10]]
    .map(([at, value]) => ({ at, value }));
  const fn = scheduleFn({ value: 10, steps: WAVE, smooth: true });
  for (const p of [{ at: 0, value: 10 }, ...WAVE])
    if (Math.abs(fn(p.at) - p.value) > 1e-12)
      fail('smooth schedule', `must pass through (${p.at}, ${p.value}), got ${fn(p.at)}`);
  if (fn(9.7) !== 10 || fn(1000) !== 10) fail('smooth schedule', 'flat after the last point');
  if (fn(-3) !== 10) fail('smooth schedule', 'flat before the first point');
  let prev = fn(4.5);
  for (let t = 4.5; t <= 5.5 + 1e-9; t += DT / 4) {
    const v = fn(t);
    if (v < prev - 1e-12) fail('smooth schedule', `must rise monotonically on 4.5..5.5, fell at t=${t}`);
    prev = v;
  }
  for (let t = 0; t <= T_END; t += DT)
    if (fn(t) < -5 - 1e-12 || fn(t) > 10 + 1e-12)
      fail('smooth schedule', `must never overshoot the point range, got ${fn(t)} at t=${t}`);
  // The stepped reading of the same points is unchanged: holds, then jumps.
  const stepped = scheduleFn({ value: 10, steps: WAVE, smooth: false });
  if (stepped(0.99) !== 10 || stepped(1) !== 7 || stepped(4.6) !== -5)
    fail('stepped schedule', 'must hold each value until the next step');
}

// figures 15 & 19 (well insulated, leak 0.13) & 20 (poorly insulated, 0.4):
// the outside temperature is a smooth `~` schedule — a cold day dipping to
// -5 — so the leak chases a moving target. The room sags mid-run and
// recovers; the deeper the leak gain, the deeper the sag. Mirrored
// step-for-step through the same scheduleFn the simulator uses.
{
  const wave = '10 ~1: 7 ~2: 4 ~3: 0 ~4: -3 ~4.5: -5 ~5.5: -3 ~6: 0 ~7: 4 ~8: 7 ~9: 10';
  const thermo = (leak) => `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: ${leak}|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: ${wave} -> discrepancy between inside and outside temperatures`;
  const outsideFn = scheduleFn({
    value: 10,
    steps: [[1, 7], [2, 4], [3, 0], [4, -3], [4.5, -5], [5.5, -3], [6, 0], [7, 4], [8, 7], [9, 10]]
      .map(([at, value]) => ({ at, value })),
    smooth: true,
  });
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
  for (const [fig, leak, dipLo, dipHi] of [['figure 19', 0.13, 15.5, 16.2], ['figure 20', 0.4, 12.0, 13.2]]) {
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
    const outside = goalRefs(system).find(g => g.label === 'outside temperature');
    if (!(outside && outside.value === 10 && outside.steps?.length === 10 && outside.smooth === true))
      fail(fig, `the scheduled goal should carry its 10 steps and smooth flag, got ${JSON.stringify(outside)}`);
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
// dots). One time unit is a decade, so 2007's crude rates (21 births, 9
// deaths per 1000 per year) read 0.21 and 0.09 — and the same structure
// grows (22), declines (23), or stabilizes (24, fertility falling smoothly
// onto mortality) purely by the numbers. Mirrored step-for-step in the
// simulator's float-op order, factor schedules through scheduleFn itself.
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
  const fertFall = scheduleFn({ value: 0.21, steps: [{ at: 2, value: 0.09 }], smooth: true });
  const runs = [
    ['figure 22', pop('0.21', '0.09'), mirror(constant(0.21), constant(0.09)), 21.5, 22.2],
    ['figure 23', pop('0.21', '0.3'), mirror(constant(0.21), constant(0.3)), 2.5, 2.9],
    ['figure 24', pop('0.21 ~2: 0.09', '0.09'), mirror(fertFall, constant(0.09)), 7.3, 7.6],
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
  // two rates cancel exactly — the level holds to the bit from there on.
  const stab = simulate(sys(pop('0.21 ~2: 0.09', '0.09')))[0];
  const flatFrom = Math.round(2 / DT);
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
fertility c: 0.21 ~2: 0.09 -> births c
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
  // starts above mortality, falls onto it (the two equal schedule points
  // interpolate exactly constant, so the plateau holds), then climbs past it
  // again: grow, hold, grow faster — ending near the book's ≈18.3 billion.
  const F26 = '0.21 ~2.5: 0.09 ~4.5: 0.09 ~7: 0.27 ~10: 0.36';
  const fertShift = scheduleFn({
    value: 0.21,
    steps: [{ at: 2.5, value: 0.09 }, { at: 4.5, value: 0.09 }, { at: 7, value: 0.27 }, { at: 10, value: 0.36 }],
    smooth: true,
  });
  const system26 = sys(pop(F26, '0.09'));
  const shift = simulate(system26).find(s => s.label === 'population');
  const want26 = mirror(fertShift, constant(0.09));
  if (!shift.levels.every((v, i) => Math.abs(v - want26[i]) < 1e-12))
    fail('figure 26', 'series must match the mirrored recurrence sample-for-sample');
  if (!shift.levels.every((v, i) => i === 0 || v >= shift.levels[i - 1]))
    fail('figure 26', 'fertility never drops below mortality: population never falls');
  const idx = (t) => Math.round(t / DT);
  if (!shift.levels.slice(1, idx(2.5) + 1).every((v, i) => v > shift.levels[i]))
    fail('figure 26', 'phase one: births dominant, strict growth until the schedules meet');
  const plateau = shift.levels.slice(idx(2.5), idx(4.5) + 2);
  if (Math.max(...plateau) - Math.min(...plateau) > 1e-6)
    fail('figure 26', `phase two: fertility = mortality must hold the level, drifted ${Math.max(...plateau) - Math.min(...plateau)}`);
  if (!(last(shift) > 2 * shift.levels[idx(4.5)]))
    fail('figure 26', 'phase three: renewed dominance must more than double the plateau');
  if (!(last(shift) > 17.5 && last(shift) < 18.7))
    fail('figure 26', `should end near the book's ≈18.3, got ${last(shift)}`);
  if (goalRefs(system26).length !== 0)
    fail('figure 26', 'the shifting fertility is a factor, not a goal');
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

// Time shifts x(t ~ T) and x(t - T) (the figures 31–35 machinery), pinned
// float-exactly against hand-rolled state recurrences in the engine's op
// order: a shift's value is its START-of-step state (the delay ring serves
// before it overwrites, the smoothing reads before it steps), states
// advance on start-of-step inputs after the rates and rations are known,
// and both prime to their input's value at t=0.
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
  // x(t ~ T): a first-order lag. The faucet's rate IS the lag's
  // start-of-step state; the state then steps toward x by min(1, DT/T).
  // Priming makes S(0) = x(0).
  const system = sys('x: 0 @1: 10\n|=>f: (x(t ~ 1))[s: 0]');
  const s = simulate(system)[0];
  const xFn = scheduleFn({ value: 0, steps: [{ at: 1, value: 10 }] });
  let S = 0, L = 0;
  const want = [L];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const rate = Math.max(0, S);
    S = S + Math.min(1, DT / 1) * (xFn(n * DT) - S);
    L = Math.max(0, L + rate * DT * 1);
    want.push(L);
  }
  if (!s.levels.every((v, i) => v === want[i]))
    fail('smooth lag', 'levels must match the lag mirror sample-for-sample');
  // T = 0 degenerates to tracking the input exactly (the snap guard, the
  // same min(1, ·) cap the goal-seek gain uses).
  const snap = simulate(sys('x: 3\n|=>f: (x(t ~ 0))[s: 0]'))[0];
  if (!snap.levels.every((v, i) => Math.abs(v - 3 * i * DT) < 1e-9))
    fail('smooth snap', 'T=0 must track the input exactly');
}

{
  // A smoothing may perceive a FLOW: its input is the faucet's rate as
  // APPLIED — rationed down as the source stock empties — while the t=0
  // priming reads the raw clamped rate (nothing has flowed yet): here the
  // drain asks 5 but holds only 0.1, so the lag starts at 5 and chases the
  // rationed trickle down from its first step.
  const system = sys('[a: 0.1]=>drain: 5|\n|=>inflow: (drain(t ~ 1))[b: 0]');
  const b = simulate(system).find(x => x.label === 'b');
  let A = 0.1, B = 0, S = 5;
  const wantB = [B];
  for (let n = 0; n < Math.round(T_END / DT); n++) {
    const drainRate = 5;
    const inflowRate = Math.max(0, S);
    const demandA = drainRate * DT;
    const rationA = demandA > A ? A / demandA : 1;
    const applied = drainRate * rationA;
    S = S + Math.min(1, DT / 1) * (applied - S);
    A = Math.max(0, A + -(drainRate * DT * rationA));
    B = Math.max(0, B + inflowRate * DT * 1);
    wantB.push(B);
  }
  if (!b.levels.every((v, i) => v === wantB[i]))
    fail('smoothed flow', 'the lag must chase the applied (post-ration) rate, primed raw');
}

// figures 31 & 32 (whose inventory chart is the book's figure 34), 35,
// and 36: the delayed car dealership. Sales step up 10%
// at t=2.5 (day 25); perceived sales smooths the sales flow
// (`sales(t ~ perception delay)`, 0.5 = 5 days), deliveries pipeline the
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
perceived sales: (sales(t ~ perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: ${rd}
delivery delay: 0.5`;
  const demandFn = scheduleFn({ value: 200, steps: [{ at: 2.5, value: 220 }] });
  const mirror = (rd) => {
    let I = 200, S = 200;                 // the smooth primes to sales' raw rate at t=0
    const buf = new Array(10).fill(200);  // the pipeline primes to orders(0) = S + 0/rd
    let ptr = 0;
    const levels = [I];
    for (let n = 0; n < Math.round(T_END / DT); n++) {
      const t = n * DT;
      const deliveries = Math.max(0, buf[ptr]);   // the delay's start-of-step state
      const sales = Math.max(0, demandFn(t));     // inventory stays ample: ration 1
      const desired = S;                          // ten days of sales = one unit's worth
      const disc = desired - I;
      const orders = S + disc / rd;               // gathered before any state commits
      buf[ptr] = orders;
      ptr = (ptr + 1) % 10;
      S = S + Math.min(1, DT / 0.5) * (sales * 1 - S);
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
  if (!(p1 > 240 && p1 < 252 && p2 > 250 && p2 < 262 && p3 > 262 && p3 < 275))
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
  if (!(dip36 > 184 && dip36 < 192)) fail('figure 36', `the single dip bottoms near 188, got ${dip36}`);
  const over = win(L36, 4, 5.5, Math.max);
  if (!(over > 224 && over < 230)) fail('figure 36', `slower response overshoots only to ~227, got ${over}`);
  if (!(win(L36, 7, 10, Math.max) - win(L36, 7, 10, Math.min) < 2))
    fail('figure 36', 'the oscillation must be damped away by the last third');
  const end36 = L36[L36.length - 1];
  if (!(end36 > 219 && end36 < 221)) fail('figure 36', `must settle on the new 220 equilibrium, got ${end36}`);
  // figure 33: the flow view of the base run — each delay's input against
  // its output. The pipeline is EXACT (deliveries echoes orders ten samples
  // later, clamped at the tap, primed at the 200 equilibrium); perceived
  // sales lags the sales step exponentially (~63% closed in one delay).
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
  if (!(at(perceived.values, 2.5) === 200
        && at(perceived.values, 3) > 210 && at(perceived.values, 3) < 216
        && at(perceived.values, 4) > 218 && at(perceived.values, 4) < 220))
    fail('figure 33', `perceived sales must lag the step exponentially, got ${at(perceived.values, 3)} at t=3`);
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

console.log(failures ? `${failures} FAILURE(S)` : 'SIMULATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
