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
// named node is found in the text. The same holds with every line echoed in
// a comment above it and trailing it: names in comments color nothing.
for (const { label, content } of exampleList) {
  const commented = content.split('\n').map(line => `// ${line}\n${line} // ${line}`).join('\n');
  const out = JSON.parse(M.go(content));
  if (typeof out === 'string') { fail(label, `example no longer compiles: ${out}`); continue; }
  const want = new Set(out.nodes
    .filter(n => n.type === 'dot' || n.type === 'stock' || n.type === 'faucet')
    .map(n => n.label));
  for (const [what, src] of [[label, content], [`${label}, commented`, commented]]) {
    roundTrip(what, src);
    const got = new Set(nameSpans(src).filter(s => s.name != null).map(s => s.name));
    for (const n of want) if (!got.has(n)) fail(what, `missing name: ${JSON.stringify(n)}`);
    for (const n of got) if (!want.has(n)) fail(what, `phantom name: ${JSON.stringify(n)}`);
  }
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
expect('t is plain anywhere inside a formula', 'a: (2 * t + t / 3)', ['a']);
expect('pi and a called cos are plain in a formula', 'a: (2.5 + 7.5 * cos(2 * pi * t / 10))', ['a']);
expect('min/max args still color their refs', 'a: (min(x, y))', ['a', 'x', 'y']);
expect('a bare cos in a formula is a name', 'a: (cos * x)', ['a', 'cos', 'x']);
expect('a spaced cos ( still calls', 'a: (cos (x))', ['a', 'x']);
expect('cos outside a formula is a name', 'cos -> b', ['cos', 'b']);
expect('nested parens keep the formula context',
  'f: (max(0.09, 0.21 - 0.048 * t) + max(0, 0.27 * sin(pi * (t - 5) / 10)))', ['f']);
expect('a loop-open never opens a formula', 'R(t -> b)', ['t', 'b']);
expect('a comment line names nothing', '// chickens -> eggs [coop] | R(', []);
expect('a trailing comment names nothing', 'a -> b // c -> [d]', ['a', 'b']);
expect('a comment ends at its newline', '// x\ny', ['y']);
expect('a comment glues to nothing', 'a//b', ['a']);
expect('a comment ends a formula line', 'a: (x // y', ['a', 'x']);
expect('a lone slash is plain division', 'a: (x / y)', ['a', 'x', 'y']);
expect('the formula context still resets after a comment', 'a: (x // (\nt -> b', ['a', 'x', 't', 'b']);

// A comment is one span, flagged for the editor's gray, the newline outside it.
{
  const spans = nameSpans('a // b\nc');
  const want = [{ text: 'a', name: 'a' }, { text: ' ' }, { text: '// b', comment: true },
    { text: '\n' }, { text: 'c', name: 'c' }];
  if (JSON.stringify(spans) !== JSON.stringify(want)) fail('comment span', JSON.stringify(spans));
}

// The raw slice is preserved even though the NAME normalizes its spaces.
{
  const spans = nameSpans('water   in   tub');
  if (spans.length !== 1 || spans[0].text !== 'water   in   tub')
    fail('raw preserved', JSON.stringify(spans));
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('highlight ok');
