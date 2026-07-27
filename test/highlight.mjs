// Headless checks of the editor's highlight tokenizer: ui/highlight.ts must
// split DSL source into spans losslessly and tag identifier runs with the
// same NAMES the real lexer/evaluator resolve — the editor colors by name,
// so agreement with the compiled graph is the whole contract.
// ui/highlight.ts is dependency-free with erasable types precisely so node
// can run it directly (type stripping, node >= 22.18), like simulate.ts.
// Run with:   node test/highlight.mjs
import * as M from '../output/Main/index.js';
import { nameSpans } from '../ui/highlight.ts';
import { exampleList } from '../ui/example.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };

const roundTrip = (label, input) => {
  const joined = nameSpans(input).map(s => s.text).join('');
  if (joined !== input)
    fail(label, `spans do not reproduce the input: ${JSON.stringify(joined)}`);
};

// Every example round-trips, and its span names agree exactly with the
// compiled graph's named nodes (dots, stocks, faucets — clouds and ports are
// nameless): every mention the editor would color is a real node, and every
// named node is found in the text.
for (const { label, content } of exampleList) {
  roundTrip(label, content);
  const out = JSON.parse(M.go(content));
  if (typeof out === 'string') { fail(label, `example no longer compiles: ${out}`); continue; }
  const want = new Set(out.nodes
    .filter(n => n.type === 'dot' || n.type === 'stock' || n.type === 'faucet')
    .map(n => n.label));
  const got = new Set(nameSpans(content).filter(s => s.name != null).map(s => s.name));
  for (const n of want) if (!got.has(n)) fail(label, `missing name: ${JSON.stringify(n)}`);
  for (const n of got) if (!want.has(n)) fail(label, `phantom name: ${JSON.stringify(n)}`);
}

// Surface edges, pinned against Lexer.purs's rules.
const names = (input) => nameSpans(input).filter(s => s.name != null).map(s => s.name);
const expect = (label, input, want) => {
  roundTrip(label, input);
  const got = names(input);
  if (JSON.stringify(got) !== JSON.stringify(want))
    fail(label, `names ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

expect('loop-open', 'R(sales)', ['sales']);
expect('loop-open B', 'B(x <- y)', ['x', 'y']);
expect('not a loop-open', 'Rx(', ['Rx']);
expect('spaced R is a name', 'R (x)', ['R', 'x']);
expect('greedy join beats loop-open', 'foo R(', ['foo R']);
expect('multi-space name normalizes', 'water   in   tub', ['water in tub']);
expect('digit joins only after a letter', 'a2->2x', ['a2', 'x']);
expect('underscore joins', 'a_b', ['a_b']);
expect('newline separates', 'a\nb', ['a', 'b']);
expect('stock annotation', '[tub: 50]', ['tub']);
expect('trailing space stays plain', 'sales |', ['sales']);
expect('schedule keeps only the name', 'inflow: 0 @5: 5', ['inflow']);
expect('a smooth schedule stays plain too', 'out: 10 ~2: -5', ['out']);
expect('formula refs are names', 'output: (capital / 3)', ['output', 'capital']);
expect('the time variable stays plain', 'a: (x(t ~ 1))', ['a', 'x']);
expect('a shift time name still colors', 'a: (x(t - response delay))', ['a', 'x', 'response delay']);
expect('t away from a paren is a name', 't -> b', ['t', 'b']);
expect('the shift reading tolerates a space before t', 'a: (x( t ~ 1))', ['a', 'x']);
expect('smooth and delay are ordinary names', 'a: (smooth * delay)', ['a', 'smooth', 'delay']);

// The raw slice is preserved even though the NAME normalizes its spaces.
{
  const spans = nameSpans('water   in   tub');
  if (spans.length !== 1 || spans[0].text !== 'water   in   tub')
    fail('raw preserved', JSON.stringify(spans));
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('highlight ok');
