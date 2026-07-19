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

// Happy-path inputs pinned byte-exactly (captured pre-rewrite, 2026-07-19).
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
  '|->a->b=>c [d]=>e|',   // example button 6 (post cloud-quirk removal)
  'a->b\na->c',
  'a->b\n\nc->d',
  '\na->b\n',
  '  a  ->  b',
  '',
  EX_BIG,
  // Combined multi-statement graphs (captured 2026-07-19): bands + arrows,
  // band merging, source-order numbering, name identity across kinds,
  // paren-linked bands, feedback loops, reversed flows.
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
  // (grammar extension, 2026-07-19: faucet tail re-enters exprTail)
  'a=>b->c',
  'a<=b->c',
  'a=>f=>g',
  'a=>b[x]->c',   // with a target present, the arrow belongs to the target
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

console.log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
