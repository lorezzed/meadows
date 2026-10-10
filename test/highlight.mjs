// Headless checks of the editor's highlight tokenizer: ui/highlight.ts must
// split DSL source into spans losslessly and tag identifier runs with the
// same NAMES the real lexer/evaluator resolve — the editor colors by name,
// so agreement with the compiled graph is the whole contract — and deal the
// same spans out line by line, numbered as the compiler numbers lines (the
// editor's line numbers are where a compile error's `line L` is found).
// ui/highlight.ts is dependency-free with erasable types precisely so node
// can run it directly (type stripping, node >= 22.18), like simulate.ts.
// Run with:   node test/highlight.mjs
import * as M from '../output/Main/index.js';
import { nameSpans, lineSpans } from '../ui/highlight.ts';
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

// lineSpans is the same scan dealt out by source line — what the editor's
// backdrop renders, one numbered block per line. One array per line (always
// one more than there are newlines), each joining back to exactly its line,
// no span empty or holding a newline, and the names and comments those of
// the flat scan, in order.
const marks = (spans) => JSON.stringify(spans.filter(s => s.name != null || s.comment)
  .map(s => [s.text, s.name ?? null, s.comment === true]));
const checkLines = (label, src) => {
  const lines = lineSpans(src), want = src.split('\n');
  if (lines.length !== want.length) return fail(label, `${lines.length} lines, want ${want.length}`);
  lines.forEach((spans, i) => {
    const text = spans.map(s => s.text).join('');
    if (text !== want[i]) fail(label, `line ${i + 1} reads ${JSON.stringify(text)}, want ${JSON.stringify(want[i])}`);
    if (spans.some(s => s.text === '' || s.text.includes('\n')))
      fail(label, `line ${i + 1} holds an empty span or a newline`);
  });
  if (marks(lines.flat()) !== marks(nameSpans(src))) fail(label, 'the lines lost or changed a name or a comment');
};
for (const { label, content } of exampleList) {
  checkLines(`${label} lines`, content);
  checkLines(`${label} lines, commented`, content.split('\n').map(line => `// ${line}\n${line} // ${line}`).join('\n'));
  checkLines(`${label} lines, spaced out`, `\n${content.split('\n').join('\n\n')}\n\n`);
}
{
  const shape = (src) => JSON.stringify(lineSpans(src).map(spans => spans.map(s => s.text)));
  const want = [
    ['', [[]]],                                   // an empty editor is one line
    ['a', [['a']]],
    ['a\n', [['a'], []]],                         // a trailing newline opens a last line
    ['\n\n', [[], [], []]],
    ['a\n\nb', [['a'], [], ['b']]],
    ['a |\n| b', [['a', ' |'], ['| ', 'b']]],     // a plain run is cut at the newline
    ['a // b\nc', [['a', ' ', '// b'], ['c']]],   // a comment ends with its line
    ['water   in   tub\n[tub]', [['water   in   tub'], ['[', 'tub', ']']]],
  ];
  for (const [src, lines] of want)
    if (shape(src) !== JSON.stringify(lines)) fail('line shape', `${JSON.stringify(src)}: ${shape(src)}`);
  // Each piece keeps what it is: a cut run stays plain, a name its name, a comment its flag.
  const cut = lineSpans('a // b\nc |\n| d');
  const wantCut = [[{ text: 'a', name: 'a' }, { text: ' ' }, { text: '// b', comment: true }],
    [{ text: 'c', name: 'c' }, { text: ' |' }], [{ text: '| ' }, { text: 'd', name: 'd' }]];
  if (JSON.stringify(cut) !== JSON.stringify(wantCut)) fail('line spans', JSON.stringify(cut));
}

// The numbers are the compiler's own: an error's `line L` is the L-th line
// here, with comment lines and blank lines counted like any other. Plant an
// unclosed bracket as a line of its own at the top, the middle, and the end
// of every example — after all its notes — and the error names that line.
for (const { label, content } of exampleList) {
  const src = content.split('\n');
  for (const at of [0, Math.floor(src.length / 2), src.length]) {
    const bad = [...src.slice(0, at), '[oops', ...src.slice(at)].join('\n');
    const out = JSON.parse(M.go(bad));
    const m = typeof out === 'string' ? /line (\d+), column \d+/.exec(out) : null;
    if (!m) { fail(`${label}, a bad line ${at + 1}`, `no positioned error: ${JSON.stringify(out).slice(0, 80)}`); continue; }
    const line = lineSpans(bad)[Number(m[1]) - 1];
    if (Number(m[1]) !== at + 1 || !line || line.map(s => s.text).join('') !== '[oops')
      fail(`${label}, a bad line ${at + 1}`, `the error names line ${m[1]}`);
  }
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('highlight ok');
