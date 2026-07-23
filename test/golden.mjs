// Golden compiler tests: DSL input -> exact go() output, plus positioned-error
// patterns. Run with:                        node test/golden.mjs
// After an INTENDED output change, refresh the goldens from the current build:
//                                            node test/golden.mjs --capture
import * as M from '../output/Main/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goldensPath = join(dirname(fileURLToPath(import.meta.url)), 'goldens.json');

const EX_BIG = `|=>investment[capital]=depreciation|
capital->profit->investment
[resource]=>extraction|
resource->yield per unit capital->extraction
yield per unit capital->price->profit
capital->depreciation`;

// The full Meadows reference model, with R(...)/B(...) loop annotations.
// figures 10 & 11: goal-seeking balancing loops — dot constants (`room
// temperature: 18`) wired through discrepancy dots into the faucets.
const EX_COFFEE = `[hot coffee: 100]=>cooling: 0.26|
B(cooling <- discrepancy <- hot coffee)
room temperature: 18 -> discrepancy
|=>heating: 0.26[iced coffee: 0]
B(heating <- warming discrepancy <- iced coffee)
room temperature -> warming discrepancy`;

// figures 12 & 13: the reinforcing interest loop, five accounts wide — bare
// faucets, valued rate dots, and the drawn level→faucet feedback arrows.
const EX_INTEREST = `|=>interest at two[two percent interest: 100]
R(interest at two <- two percent interest)
rate at two: 0.02 -> interest at two
|=>interest at four[four percent interest: 100]
R(interest at four <- four percent interest)
rate at four: 0.04 -> interest at four
|=>interest at six[six percent interest: 100]
R(interest at six <- six percent interest)
rate at six: 0.06 -> interest at six
|=>interest at eight[eight percent interest: 100]
R(interest at eight <- eight percent interest)
rate at eight: 0.08 -> interest at eight
|=>interest at ten[ten percent interest: 100]
R(interest at ten <- ten percent interest)
rate at ten: 0.1 -> interest at ten`;

// figure 14: the capital reinforcing loop, with the book's real equations —
// output is a computed auxiliary (capital / 3), investment's rate law
// multiplies it by the invested fraction. The formulas re-imply the R(...)
// arrows (deduplicated) and draw fraction→investment themselves.
const EX_CAPITAL = `|=>investment[capital: 100]
R(capital -> output -> investment)
output: (capital / 3)
investment: (output * fraction of output invested)
fraction of output invested: 0.2`;

// figure 15: the two-loop thermostat — one band, two goal-seeking B loops
// through floating discrepancy dots, each fed by an outside constant.
const EX_THERMOSTAT = `|=>heat from furnace[room temperature]=>heat to outside|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`;

// figures 15 & 16: the same structure valued — the furnace gain, the room's
// initial level, and the thermostat setting (the outside loop stays inert:
// bare faucet, valueless constant).
const EX_THERMO16 = `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`;

// figures 15 & 19: both loops live and the outside temperature SCHEDULED —
// the cold-day driving variable, dipping to -5 (dot schedules + negative
// literals end-to-end).
const EX_THERMO19 = `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: 0.13|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 ~1: 7 ~2: 4 ~3: 0 ~4: -3 ~4.5: -5 ~5.5: -3 ~6: 0 ~7: 4 ~8: 7 ~9: 10 -> discrepancy between inside and outside temperatures`;

// figures 21 & 22: the population system — one stock, a reinforcing births
// loop and a balancing deaths loop, fertility and mortality as the valued
// factor dots (one time unit = a decade, so 2007's crude rates 21 and 9 per
// 1000 per year read 0.21 and 0.09).
const EX_POP22 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.09 -> deaths`;

// figures 21 & 23: the same structure, mortality now dominant — decline.
const EX_POP23 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.3 -> deaths`;

// figures 21 & 24: fertility falls smoothly to meet mortality by t=2 — the
// scheduled FACTOR dot (goal dots had schedules already; this pins one on a
// reinforcing loop's constant).
const EX_POP24 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 ~2: 0.09 -> births
mortality: 0.09 -> deaths`;

// figures 21 & 26: shifting dominance — fertility above mortality, then
// equal (the two-point 0.09 plateau interpolates exactly constant), then
// above again and climbing: grow, hold, grow faster.
const EX_POP26 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 ~2.5: 0.09 ~4.5: 0.09 ~7: 0.27 ~10: 0.36 -> births
mortality: 0.09 -> deaths`;

// figure 25: the three scenarios side by side — the same two-loop structure
// three times over, three futures decided purely by the numbers.
const EX_POP25 = `|=>births a[growth: 6.6]=>deaths a|
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

// figure 27: the capital archetype as pure structure — the population
// system's R+B pair on an industrial stock: investment reinforces through
// annual output, depreciation balances through capital lifetime.
const EX_CAP27 = `|=>investment[capital stock]=>depreciation|
R(capital stock -> annual output -> investment)
B(capital stock -> depreciation)
investment fraction -> investment
output per unit capital -> annual output
capital lifetime -> depreciation`;

// figures 27 & 28: the same structure three times over with the book's real
// equations, three futures decided by the capital lifetime alone. One time
// unit = 5 years (the book's 50-year axis on T_END = 10), so output per
// unit capital reads 5/3 per unit (1/3 per year) and the 10/15/20-year
// lifetimes read 2, 3, and 4.
const cap28 = (suffix, lifetime) => `|=>investment at ${suffix}[capital at ${suffix}: 100]=>depreciation at ${suffix}|
R(capital at ${suffix} -> annual output at ${suffix} -> investment at ${suffix})
B(capital at ${suffix} -> depreciation at ${suffix})
annual output at ${suffix}: (capital at ${suffix} * output per unit capital at ${suffix})
investment at ${suffix}: (annual output at ${suffix} * investment fraction at ${suffix})
depreciation at ${suffix}: (capital at ${suffix} / capital lifetime at ${suffix})
investment fraction at ${suffix}: 0.2
output per unit capital at ${suffix}: (5 / 3)
capital lifetime at ${suffix}: ${lifetime}`;
const EX_CAP28 = [cap28('twenty', 4), cap28('fifteen', 3), cap28('ten', 2)].join('\n');

// figure 29: the car dealership as pure structure — deliveries fill the
// inventory, sales drain it, and two balancing loops (the ordering machinery
// on the left, the sales/inventory coupling on the right) close through the
// aux web. The info arrow `sales -> perceived sales` runs off a faucet, and
// the stock sprouts two ports (one to discrepancy, one to sales).
const EX_CAR29 = `| =>deliveries [inventory of cars on the lot] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
B(inventory of cars on the lot -> sales)
desired inventory -> discrepancy
perceived sales -> orders to factory
perceived sales -> desired inventory
sales -> perceived sales
customer demand -> sales`;

// figures 29 & 30: the same dealership valued for the behavior chart. The
// no-delay idealization figure 30 depicts — perceived sales tracks customer
// demand directly, so the net flow reduces to adjustment × (desired −
// inventory) and inventory goal-seeks its target. One time unit = 10 days
// (T_END = 10 spans the book's 100-day axis); a 10% demand step at day 25
// lands at t = 2.5 and inventory eases 200 → 220.
const EX_CAR2930 = `| =>deliveries [inventory of cars on the lot: 200] =>sales |
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

const EX_LOOPS = `|=>investment[capital]=>depreciation|
|=>regeneration[resource]=>harvest|
capital->growth goal->investment
R(investment<-profit<-capital)
B(depreciation<-capital)
capital lifetime->depreciation
B(profit <- capital -> harvest)
profit<-price<-yield per unit capital->harvest
resource->yield per unit capital
regeneration<-regeneration rate<-resource->regeneration`;

// Happy-path inputs pinned byte-exactly.
const goldenInputs = [
  'a->b',
  'a->b=>c d',
  '[a]',
  '|',
  'a->b->[c]',
  'a->b=>c [d]',
  'a=>j',
  'a<=j',
  '[a]=>fill',
  '(a=>f)->b',
  'a=>j[b]',
  '|->a->b=>c [d]=>e|',   // example button 6
  'a->b\na->c',
  'a->b\n\nc->d',
  '\na->b\n',
  '  a  ->  b',
  '',
  EX_BIG,
  // Combined multi-statement graphs: bands + arrows, band merging,
  // source-order numbering, name identity across kinds, paren-linked bands,
  // feedback loops, reversed flows.
  '[a]=>f[b]\nb->c\nc->[a]',
  '[a]=>f[b]\n[b]=>g[c]',
  'x->y\n[c]=>g\n[a]=>f',
  'a=>f|\nb=>g|',
  'a->b\n[a]=>f',
  'f->x\na=>f',
  '([s]=>f)->([t]=>g)',
  '[a]<=f[b]<=g[c]',
  'a->b<-c',
  'a<-b<-c',
  '|=>inflow[pop]=>outflow|\npop->growth->inflow',
  // Operators after a dangling faucet apply to the faucet itself
  'a=>b->c',
  'a<=b->c',
  'a=>f=>g',
  'a=>b[x]->c',   // with a target present, the arrow belongs to the target
  // `<-` links each hop from its nearest right term: a<-b->c fans out from b
  'a<-b->c',
  // Loop annotations: R(...)/B(...) tag members' `loop` arrays with generated
  // names ("R0", "B1", ... by source order); nodes/links stay as unwrapped
  'R(a->b)',
  'B(a<-b)',
  'R(a)',
  '[a]=>f\nB(f<-a)',
  'R(a->b)\nB(b->c)',
  // A loop may open a statement and be continued by operators; the tail
  // links against the loop's resolution and stays outside the membership.
  'R(a)->b',
  'B(a<-b) <- c',
  'B(a->b) <- c',
  EX_LOOPS,
  // Value annotations: `[stock: N]` initial level, `=>faucet: N` rate.
  // Serialized as an optional `value` key (absent when unannotated).
  '|=>inflow[water in tub: 50]=>outflow: 5|',   // figures 5 & 6
  '[a: 100]=>drain: 5[b]=>out: 2.5|',           // chained stocks, decimal rate
  '[a: 2.5]',
  'a=>f: 5',
  '[a]\n[a: 5]',    // a later mention fills a blank value
  '[a: 5]\n[a: 9]', // the first explicit value wins
  // Faucet rate schedules: `: initial (@time: rate)*` — piecewise-constant.
  '|=>inflow: 0 @5: 5[water in tub: 50]=>outflow: 5|',   // figures 5 & 7
  'a=>f: 0 @2.5: 1 @7: 4',
  'a=>f: 9\na=>f: 0 @2: 1',   // first annotation wins as a unit
  // Dot annotations: a bare name takes a constant (`: N` -- e.g. a goal for
  // the simulator's goal-seeking faucets) or a full piecewise schedule (a
  // driving variable, figure 19's cold day); values may be negative.
  'a: 5',
  'room temperature: 18 -> discrepancy',
  'a: 5\na: 9',   // the first dot constant wins
  'out: 10 @2: -5',
  '[a: -5]',
  // Smooth (`~`) schedules: same shape, `smooth: true` in the JSON — the
  // simulator interpolates a curve through the points instead of stepping.
  'a=>f: 0 ~5: 5',
  'out: 10 ~2: -5 ~4: 10',
  // Formulas: `: (expr)` — refs resolve to ids, serialized as a nested
  // `expr` tree, and each reference draws its implied info arrow (dedup'd
  // against hand-drawn ones).
  'a: (2x * y + 3)',
  '[capital: 100]\noutput: (capital / 3)',
  'a -> b\nb: (a)',
  'a=>f: (a)|',
  EX_COFFEE,      // figures 10 & 11
  EX_INTEREST,    // figures 12 & 13
  EX_CAPITAL,     // figure 14
  EX_THERMOSTAT,  // figure 15
  EX_THERMO16,    // figures 15 & 16
  EX_THERMO19,    // figures 15 & 19
  EX_POP22,       // figures 21 & 22
  EX_POP23,       // figures 21 & 23
  EX_POP24,       // figures 21 & 24
  EX_POP25,       // figure 25
  EX_POP26,       // figures 21 & 26
  EX_CAP27,       // figure 27
  EX_CAP28,       // figures 27 & 28
  EX_CAR29,       // figure 29
  EX_CAR2930,     // figures 29 & 30
];

// Errors: the "kind: line L, column C:" prefix is contractual; wording may be tuned.
const errorCases = [
  ['a->',       /^Parsing error: line 1, column 2: /],
  ['a=>',       /^Parsing error: line 1, column 2: /],
  ['|a',        /^Parsing error: line 1, column 2: /],  // cloud never swallows an ident
  ['|a->b',     /^Parsing error: line 1, column 2: /],
  ['[a',        /^Parsing error: line 1, column 2: /],
  ['[]',        /^Parsing error: line 1, column 2: /],
  ['a=>f->',    /^Parsing error: line 1, column 5: /],  // arrow off a faucet still needs a target
  ['(a->b',     /^Parsing error: line 1, column 5: /],
  ['a->b\nc->', /^Parsing error: line 2, column 2: /],
  ['a > b',     /^Tokenization error: line 1, column 3: /],
  // Errors buried in otherwise-valid multi-statement programs
  ['[a]=>f[b]\nb->c\nc->[',  /^Parsing error: line 3, column 4: /],
  ['[a]=>f[b]\nb->\nc',      /^Parsing error: line 2, column 4: /],
  ['([s]=>f)->([t]=>g',      /^Parsing error: line 1, column 17: /],
  ['a->b\nc->d\ne=>',        /^Parsing error: line 3, column 2: /],
  // Loop annotations
  ['R(a',       /^Parsing error: line 1, column 3: /],  // unclosed loop
  ['R()',       /^Parsing error: line 1, column 3: /],  // empty loop
  ['a->R(b)',   /^Parsing error: line 1, column 4: /],  // loops are never interior terms
  ['R(a)->',    /^Parsing error: line 1, column 5: /],  // a loop's tail still needs an operand
  ['r(a)',      /^Parsing error: line 1, column 2: /],  // lowercase r is just a name
  // Value annotations belong to stocks, faucets, and dots (dots and faucets
  // take full schedules; stocks a single value)
  ['[a:]',      /^Parsing error: line 1, column 4: /],  // a colon needs a number
  ['[a: b]',    /^Parsing error: line 1, column 5: /],  // a name is not a value
  ['[a]: 5',    /^Parsing error: line 1, column 4: /],  // the value goes inside the brackets
  ['5',         /^Parsing error: line 1, column 1: /],  // a bare number is not a term
  ['-5',        /^Parsing error: line 1, column 1: /],  // a signed number is still not a term
  ['a -x',      /^Parsing error: line 1, column 3: /],  // a lone '-' only subtracts inside formulas
  ['[a: 5.]',   /^Tokenization error: line 1, column 6: /],  // no trailing bare dot
  // Rate schedules commit at each '@'/':' — malformed segments are positioned
  ['a=>f: 0 @',    /^Parsing error: line 1, column 9: /],   // step needs a time
  ['a=>f: 0 @5 3', /^Parsing error: line 1, column 12: /],  // step time needs ':'
  ['a=>f: 0 @5:',  /^Parsing error: line 1, column 11: /],  // step needs a rate
  ['[a: 1 @2: 3]', /^Parsing error: line 1, column 7: /],   // stocks: single value only
  ['a @ b',        /^Parsing error: line 1, column 3: /],   // '@' lives inside annotations
  ['a: 5 ~',       /^Parsing error: line 1, column 6: /],   // '~' step needs a time
  ['a=>f: 0 @2: 1 ~3: 2', /^Parsing error: line 1, column 15: /],  // one schedule, one marker
  ['a=>f: 0 ~2: 1 @3: 2', /^Parsing error: line 1, column 15: /],  // (either way round)
  // Formulas
  ['a: ()',        /^Parsing error: line 1, column 5: /],   // an empty formula
  ['a: (x',        /^Parsing error: line 1, column 5: /],   // unclosed formula
  ['a: (x 5)',     /^Parsing error: line 1, column 7: /],   // no positive-number juxtaposition
  ['[a: (x)]',     /^Parsing error: line 1, column 5: /],   // stocks take numbers, not formulas
  ['x=>f\na: (f)', /^Model error: /],                       // a formula cannot read a faucet
  ['a: (b)\nb: (a)', /^Model error: /],                     // formula cycles have no order
];

if (process.argv.includes('--capture')) {
  const goldens = Object.fromEntries(goldenInputs.map(i => [i, M.go(i)]));
  writeFileSync(goldensPath, JSON.stringify(goldens, null, 2) + '\n');
  console.log(`captured ${goldenInputs.length} goldens to ${goldensPath}`);
  process.exit(0);
}

const goldens = JSON.parse(readFileSync(goldensPath, 'utf8'));
let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${JSON.stringify(label)}: ${msg}`); };

for (const input of goldenInputs) {
  const want = goldens[input];
  if (want === undefined) { fail(input, 'no golden captured — run --capture'); continue; }
  const got = M.go(input);
  if (got !== want) fail(input, `\n  want ${want}\n  got  ${got}`);
}

for (const [input, re] of errorCases) {
  const out = JSON.parse(M.go(input));   // error results are JSON strings
  if (typeof out !== 'string') fail(input, 'expected an error, got a graph');
  else if (!re.test(out)) fail(input, `expected ${re}, got ${JSON.stringify(out)}`);
}

// Structural spot checks (shape-level, independent of exact ids).
const j1 = JSON.parse(M.go('a=>j'));
if (!(j1.nodes.length === 2 && j1.links.length === 1 && j1.links[0].type === 'flow'
      && j1.links[0].source.startsWith('dot#') && j1.links[0].target.startsWith('faucet#')))
  fail('a=>j', 'dangling faucet should be dot --flow--> faucet');
const j2 = JSON.parse(M.go('a<=j'));
if (!(j2.links.length === 1 && j2.links[0].source.startsWith('faucet#') && j2.links[0].target.startsWith('dot#')))
  fail('a<=j', 'reversed flow should be faucet --flow--> dot');
const j3 = JSON.parse(M.go('[a]=>fill'));
if (!j3.nodes.every(n => n.group === 0)) fail('[a]=>fill', 'stock+faucet should share group 0');
const big = JSON.parse(M.go(EX_BIG));
if (big.nodes.length !== 14) fail('big model', `14 nodes expected (11 + 3 stock-arrow ports), got ${big.nodes.length}`);
if (new Set(big.nodes.map(n => n.group).filter(g => g != null)).size !== 2)
  fail('big model', '2 groups expected');
const loops = JSON.parse(M.go(EX_LOOPS));
const loopOf = label => loops.nodes.find(n => n.label === label)?.loop;
if (loops.nodes.length !== 23) fail('loops model', `23 nodes expected (16 + 7 stock-arrow ports), got ${loops.nodes.length}`);
if (JSON.stringify(loopOf('capital')) !== JSON.stringify(['R0', 'B1', 'B2']))
  fail('loops model', `capital should be in R0/B1/B2, got ${JSON.stringify(loopOf('capital'))}`);
if (JSON.stringify(loopOf('harvest')) !== JSON.stringify(['B2']))
  fail('loops model', `harvest should be in B2 only, got ${JSON.stringify(loopOf('harvest'))}`);
if (loopOf('growth goal') !== undefined)
  fail('loops model', 'growth goal is in no loop, its `loop` key should be absent');
const v1 = JSON.parse(M.go('[a: 50]'));
if (v1.nodes[0].value !== 50) fail('[a: 50]', `value 50 expected, got ${v1.nodes[0].value}`);
const v2 = JSON.parse(M.go('[a]'));
if ('value' in v2.nodes[0]) fail('[a]', 'unannotated node should have no `value` key');
const v3 = JSON.parse(M.go('a=>f: 0 @5: 5'));
const fct = v3.nodes.find(n => n.type === 'faucet');
if (!(fct.value === 0 && JSON.stringify(fct.steps) === JSON.stringify([{ value: 5, at: 5 }])))
  fail('a=>f: 0 @5: 5', `schedule expected value 0 + one step, got ${JSON.stringify(fct)}`);
if ('steps' in JSON.parse(M.go('a=>f: 5')).nodes.find(n => n.type === 'faucet'))
  fail('a=>f: 5', 'a step-less rate should have no `steps` key');
const coffee = JSON.parse(M.go(EX_COFFEE));
const room = coffee.nodes.find(n => n.label === 'room temperature');
if (!(room?.type === 'dot' && room.value === 18))
  fail('coffee model', `room temperature should be a dot valued 18, got ${JSON.stringify(room)}`);
if (coffee.nodes.filter(n => n.label === 'room temperature').length !== 1)
  fail('coffee model', 'the shared constant should be one node');
const interest = JSON.parse(M.go(EX_INTEREST));
if (interest.nodes.length !== 25)   // 5 × (cloud, faucet, stock, rate dot, port)
  fail('interest model', `25 nodes expected, got ${interest.nodes.length}`);
if (new Set(interest.nodes.map(n => n.group).filter(g => g != null)).size !== 5)
  fail('interest model', '5 bands expected, one per account');
const iOf = label => interest.nodes.find(n => n.label === label);
if (JSON.stringify(iOf('ten percent interest')?.loop) !== JSON.stringify(['R4']))
  fail('interest model', `ten percent interest should be in R4, got ${JSON.stringify(iOf('ten percent interest')?.loop)}`);
if (!(iOf('rate at ten')?.type === 'dot' && iOf('rate at ten')?.value === 0.1))
  fail('interest model', 'rate at ten should be a dot valued 0.1');
if (iOf('interest at ten')?.value !== undefined)
  fail('interest model', 'the interest faucets carry no rate of their own');
const thermo = JSON.parse(M.go(EX_THERMOSTAT));
const tOf = label => thermo.nodes.find(n => n.label === label);
if (thermo.nodes.length !== 11)   // 2 clouds, 2 faucets, 1 stock, 2 discrepancies, 2 constants, 2 ports
  fail('thermostat model', `11 nodes expected, got ${thermo.nodes.length}`);
if (thermo.links.filter(l => l.type === 'flow').length !== 4 || thermo.links.length !== 10)
  fail('thermostat model', '4 flows + 6 arrows expected');
if (JSON.stringify(tOf('room temperature')?.loop) !== JSON.stringify(['B0', 'B1']))
  fail('thermostat model', `room temperature should be in B0 and B1, got ${JSON.stringify(tOf('room temperature')?.loop)}`);
if (tOf('thermostat setting')?.loop !== undefined || tOf('outside temperature')?.loop !== undefined)
  fail('thermostat model', 'the constants feed the loops without joining them');
const pop = JSON.parse(M.go(EX_POP22));
const pOf = label => pop.nodes.find(n => n.label === label);
if (pop.nodes.length !== 9)   // 2 clouds, 2 faucets, 1 stock, 2 factor dots, 2 ports
  fail('population model', `9 nodes expected, got ${pop.nodes.length}`);
if (pop.links.filter(l => l.type === 'flow').length !== 4 || pop.links.length !== 8)
  fail('population model', '4 flows + 4 arrows expected');
if (JSON.stringify(pOf('population')?.loop) !== JSON.stringify(['R0', 'B1']))
  fail('population model', `population should be in R0 and B1, got ${JSON.stringify(pOf('population')?.loop)}`);
if (pOf('births')?.value !== undefined || pOf('deaths')?.value !== undefined)
  fail('population model', 'births and deaths are bare faucets — the rates live on the dots');
if (!(pOf('fertility')?.type === 'dot' && pOf('fertility')?.value === 0.21 && pOf('fertility')?.loop === undefined))
  fail('population model', 'fertility should be an un-tagged dot valued 0.21');
const pop24 = JSON.parse(M.go(EX_POP24));
const fert24 = pop24.nodes.find(n => n.label === 'fertility');
if (!(fert24?.value === 0.21 && fert24?.smooth === true
      && JSON.stringify(fert24?.steps) === JSON.stringify([{ value: 0.09, at: 2 }])))
  fail('population 24', `fertility should carry the smooth schedule, got ${JSON.stringify(fert24)}`);
const fert26 = JSON.parse(M.go(EX_POP26)).nodes.find(n => n.label === 'fertility');
if (!(fert26?.value === 0.21 && fert26?.smooth === true
      && JSON.stringify(fert26?.steps) === JSON.stringify(
        [{ value: 0.09, at: 2.5 }, { value: 0.09, at: 4.5 }, { value: 0.27, at: 7 }, { value: 0.36, at: 10 }])))
  fail('population 26', `fertility should carry the four-step smooth schedule, got ${JSON.stringify(fert26)}`);
const pop25 = JSON.parse(M.go(EX_POP25));
if (pop25.nodes.length !== 27) fail('population 25', `27 nodes expected (21 + 6 ports), got ${pop25.nodes.length}`);
if (new Set(pop25.nodes.map(n => n.group).filter(g => g != null)).size !== 3)
  fail('population 25', '3 bands expected, one per scenario');
const p25Of = label => pop25.nodes.find(n => n.label === label);
for (const [stock, loops25] of [['growth', ['R0', 'B1']], ['decline', ['R2', 'B3']], ['stabilization', ['R4', 'B5']]])
  if (JSON.stringify(p25Of(stock)?.loop) !== JSON.stringify(loops25))
    fail('population 25', `${stock} should be in ${loops25}, got ${JSON.stringify(p25Of(stock)?.loop)}`);
const cap27 = JSON.parse(M.go(EX_CAP27));
const c27Of = label => cap27.nodes.find(n => n.label === label);
if (cap27.nodes.length !== 11)   // 2 clouds, 2 faucets, 1 stock, 4 constants, 2 ports
  fail('capital 27', `11 nodes expected, got ${cap27.nodes.length}`);
if (cap27.links.filter(l => l.type === 'flow').length !== 4 || cap27.links.length !== 10)
  fail('capital 27', '4 flows + 6 arrows expected');
if (JSON.stringify(c27Of('capital stock')?.loop) !== JSON.stringify(['R0', 'B1']))
  fail('capital 27', `capital stock should be in R0 and B1, got ${JSON.stringify(c27Of('capital stock')?.loop)}`);
if (JSON.stringify(c27Of('annual output')?.loop) !== JSON.stringify(['R0'])
    || JSON.stringify(c27Of('depreciation')?.loop) !== JSON.stringify(['B1']))
  fail('capital 27', 'annual output rides the R loop, depreciation the B loop');
if (c27Of('capital lifetime')?.loop !== undefined || c27Of('investment fraction')?.loop !== undefined)
  fail('capital 27', 'the constants feed the loops without joining them');
if (cap27.nodes.some(n => n.value !== undefined || n.expr !== undefined))
  fail('capital 27', 'the structure figure carries no numbers');
const cap28g = JSON.parse(M.go(EX_CAP28));
const c28Of = label => cap28g.nodes.find(n => n.label === label);
if (cap28g.nodes.length !== 33) fail('capital 28', `33 nodes expected (27 + 6 ports), got ${cap28g.nodes.length}`);
if (new Set(cap28g.nodes.map(n => n.group).filter(g => g != null)).size !== 3)
  fail('capital 28', '3 bands expected, one per lifetime');
if (cap28g.links.filter(l => l.type === 'flow').length !== 12 || cap28g.links.length !== 30)
  fail('capital 28', '12 flows + 18 arrows expected (formula arrows dedup against the R/B ones)');
for (const [stock, loops28] of [['capital at twenty', ['R0', 'B1']], ['capital at fifteen', ['R2', 'B3']], ['capital at ten', ['R4', 'B5']]])
  if (JSON.stringify(c28Of(stock)?.loop) !== JSON.stringify(loops28))
    fail('capital 28', `${stock} should be in ${loops28}, got ${JSON.stringify(c28Of(stock)?.loop)}`);
if (!(c28Of('investment at twenty')?.expr?.kind === '*' && c28Of('investment at twenty')?.value === undefined))
  fail('capital 28', 'the faucets carry rate-law formulas, not plain rates');
if (!(c28Of('output per unit capital at ten')?.expr?.kind === '/' && c28Of('capital lifetime at ten')?.value === 2))
  fail('capital 28', 'output per unit capital is the 5/3 formula, the lifetime a scaled constant');
const car29 = JSON.parse(M.go(EX_CAR29));
const c29Of = label => car29.nodes.find(n => n.label === label);
if (car29.nodes.length !== 12)   // 2 clouds, 2 faucets, 1 stock, 5 dots, 2 ports
  fail('car 29', `12 nodes expected, got ${car29.nodes.length}`);
if (car29.links.filter(l => l.type === 'flow').length !== 4 || car29.links.length !== 13)
  fail('car 29', '4 flows + 9 arrows expected');
const c29Ports = car29.nodes.filter(n => n.type === 'port');
if (c29Ports.length !== 2 || !c29Ports.every(p => p.parent === c29Of('inventory of cars on the lot').id))
  fail('car 29', 'the inventory stock sprouts two info-arrow ports (to discrepancy and to sales)');
if (JSON.stringify(c29Of('inventory of cars on the lot')?.loop) !== JSON.stringify(['B0', 'B1']))
  fail('car 29', `inventory should be in both B loops, got ${JSON.stringify(c29Of('inventory of cars on the lot')?.loop)}`);
if (JSON.stringify(c29Of('sales')?.loop) !== JSON.stringify(['B1']))
  fail('car 29', `sales rides the right B loop, got ${JSON.stringify(c29Of('sales')?.loop)}`);
if (c29Of('customer demand')?.loop !== undefined || c29Of('perceived sales')?.loop !== undefined)
  fail('car 29', 'the aux dots feed the loops without joining them');
if (car29.nodes.some(n => n.value !== undefined || n.expr !== undefined))
  fail('car 29', 'the structure figure carries no numbers');
const car30 = JSON.parse(M.go(EX_CAR2930));
const c30Of = label => car30.nodes.find(n => n.label === label);
if (car30.nodes.length !== 13)   // 2 clouds, 2 faucets, 1 stock, 7 dots, 1 port
  fail('car 30', `13 nodes expected, got ${car30.nodes.length}`);
if (car30.links.filter(l => l.type === 'flow').length !== 4 || car30.links.length !== 14)
  fail('car 30', '4 flows + 10 arrows expected (formula arrows dedup against the B one)');
if (c30Of('inventory of cars on the lot')?.value !== 200)
  fail('car 30', 'inventory starts at 200');
if (!(c30Of('deliveries')?.expr?.kind === 'ref' && c30Of('deliveries')?.value === undefined
      && c30Of('sales')?.expr?.kind === 'ref'))
  fail('car 30', 'both faucets carry formula rate laws, not plain rates');
if (!(c30Of('customer demand')?.value === 20
      && JSON.stringify(c30Of('customer demand')?.steps) === JSON.stringify([{ value: 22, at: 2.5 }])))
  fail('car 30', `customer demand steps 20 -> 22 at t=2.5, got ${JSON.stringify(c30Of('customer demand'))}`);
if (!(c30Of('coverage')?.value === 10 && c30Of('adjustment')?.value === 10))
  fail('car 30', 'coverage and adjustment are the model constants');

console.log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
