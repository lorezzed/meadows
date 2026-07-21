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
// Figures 10 & 11: goal-seeking balancing loops — dot constants (`room
// temperature: 18`) wired through discrepancy dots into the faucets.
const EX_COFFEE = `[hot coffee: 100]=>cooling: 0.26|
B(cooling <- discrepancy <- hot coffee)
room temperature: 18 -> discrepancy
|=>heating: 0.26[iced coffee: 0]
B(heating <- warming discrepancy <- iced coffee)
room temperature -> warming discrepancy`;

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
  // Dot constants: a bare name takes a single `: N` (an auxiliary constant,
  // e.g. a goal for the simulator's goal-seeking faucets).
  'a: 5',
  'room temperature: 18 -> discrepancy',
  'a: 5\na: 9',   // the first dot constant wins
  EX_COFFEE,      // figures 10 & 11
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
  ['a->R(b)',   /^Parsing error: line 1, column 4: /],  // loops are statements, not terms
  ['R(a)->b',   /^Parsing error: line 1, column 5: /],  // nothing may follow a loop
  ['r(a)',      /^Parsing error: line 1, column 2: /],  // lowercase r is just a name
  // Value annotations belong to stocks, faucets, and dots (a single constant)
  ['a: 1 @2: 3', /^Parsing error: line 1, column 6: /], // dots never take schedules
  ['[a:]',      /^Parsing error: line 1, column 4: /],  // a colon needs a number
  ['[a: b]',    /^Parsing error: line 1, column 5: /],  // a name is not a value
  ['[a]: 5',    /^Parsing error: line 1, column 4: /],  // the value goes inside the brackets
  ['5',         /^Parsing error: line 1, column 1: /],  // a bare number is not a term
  ['-5',        /^Tokenization error: line 1, column 1: /],  // no negative literals
  ['[a: 5.]',   /^Tokenization error: line 1, column 6: /],  // no trailing bare dot
  // Rate schedules commit at each '@'/':' — malformed segments are positioned
  ['a=>f: 0 @',    /^Parsing error: line 1, column 9: /],   // step needs a time
  ['a=>f: 0 @5 3', /^Parsing error: line 1, column 12: /],  // step time needs ':'
  ['a=>f: 0 @5:',  /^Parsing error: line 1, column 11: /],  // step needs a rate
  ['[a: 1 @2: 3]', /^Parsing error: line 1, column 7: /],   // stocks: single value only
  ['a @ b',        /^Parsing error: line 1, column 3: /],   // '@' lives inside annotations
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
if (big.nodes.length !== 11) fail('big model', `11 nodes expected, got ${big.nodes.length}`);
if (new Set(big.nodes.map(n => n.group).filter(g => g != null)).size !== 2)
  fail('big model', '2 groups expected');
const loops = JSON.parse(M.go(EX_LOOPS));
const loopOf = label => loops.nodes.find(n => n.label === label)?.loop;
if (loops.nodes.length !== 16) fail('loops model', `16 nodes expected, got ${loops.nodes.length}`);
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

console.log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
