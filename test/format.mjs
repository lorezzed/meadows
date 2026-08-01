// The formatter's contract, checked against the real compiler: formatting
// pins the reference style the button promises, never changes the compiled
// graph (byte-identical JSON through M.go), and is idempotent. Broken input
// comes back untouched (the button no-ops).
// Run with:   node test/format.mjs
import * as M from '../output/Main/index.js';
import { exampleList } from '../ui/example.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };

// The reference standard (figure 4, exactly as specified).
{
  const input = `|=>tree growth[wood in living trees]=>logging[lumber inventory]=>lumber sales|
[wood in living trees]=>tree deaths|`;
  const want = `| =>tree growth [wood in living trees] =>logging [lumber inventory] =>lumber sales |
[wood in living trees] =>tree deaths |`;
  const got = M.format(input);
  if (got !== want) fail('figure 4 standard', `got:\n${got}`);
}

// Rule pins: one exact expectation per spacing rule.
const expect = (label, input, want) => {
  const got = M.format(input);
  if (got !== want) fail(label, `${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
expect('schedule + stock value', '|=>inflow: 0 @5: 5[water in tub: 50]=>outflow: 5|',
  '| =>inflow: 0 @5: 5 [water in tub: 50] =>outflow: 5 |');
expect('schedule negatives; the marker hugs its time', 'outside temperature: 10 @ 4.5: -5 -> discrepancy',
  'outside temperature: 10 @4.5: -5 -> discrepancy');
expect('loop arrows breathe', 'R(investment<-profit<-capital)',
  'R(investment <- profit <- capital)');
expect('loop tail', 'B(heating <- discrepancy)<-thermostat setting',
  'B(heating <- discrepancy) <- thermostat setting');
expect('formula ops breathe, juxtaposition stays tight', 'y: (capital/3 + 2x + 2(x + 1))',
  'y: (capital / 3 + 2x + 2(x + 1))');
expect('shifts glue their paren, the shift minus breathes', 'deliveries: (orders(t-delivery delay))',
  'deliveries: (orders(t - delivery delay))');
expect('^ is tight on both sides', 'y: (2 x ^ 2 + 3)', 'y: (2x^2 + 3)');
expect('name-group juxtaposition tightens in formulas', 'y: (x (a + 1))', 'y: (x(a + 1))');
expect('function calls glue, commas hug left and breathe right',
  'y: (min( 0.09 ,0.21 - 0.06 t ))', 'y: (min(0.09, 0.21 - 0.06t))');
expect('the cosine driver reprints in source spelling',
  'outside temperature: (2.5+7.5*cos(2*pi*t/10))',
  'outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10))');
expect('a lone = no longer lexes, so format returns it untouched', 'a=j', 'a=j');
expect('multi-space name normalizes', 'water   in   tub', 'water in tub');
expect('blank lines collapse', 'a->b\n\n\nc->d', 'a->b\nc->d'.replace(/->/g, ' -> '));
expect('integral numbers reprint bare', '[a: 50.0]=>out: 2.50|', '[a: 50] =>out: 2.5 |');
expect('unlexable input untouched', '5.', '5.');

// Every example: formatting preserves the compiled graph byte-exactly and
// is a fixed point of itself.
for (const { label, content } of exampleList) {
  const formatted = M.format(content);
  if (M.go(formatted) !== M.go(content))
    fail(label, 'formatting changed the compiled graph');
  if (M.format(formatted) !== formatted)
    fail(label, `not idempotent:\n${M.format(formatted)}`);
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('format ok');
