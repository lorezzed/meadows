// Headless checks of the permalink codec (ui/permalink.ts) — the whole page
// state in the URL hash: the fresh page is the default state and a bare
// URL; only non-defaults reach the wire; every example round-trips with a
// non-default view, its text byte for byte; equal states spell equal
// tokens, URL-safe and small; a cut-short token never opens a DIFFERENT
// model; unreadable tokens decode to null without throwing; each field is
// checked and clamped on its own; and a link captured when each version
// shipped still opens, read against that version's defaults. The module
// has no imports, so node runs it directly (type stripping);
// CompressionStream and friends are node globals.
// Run with:   node test/permalink.mjs
import assert from 'node:assert/strict';
import { DEFAULTS, VERSION, canonical, clampHorizon, clampZoom, decode, encode } from '../ui/permalink.ts';
import { T_END } from '../ui/simulate.ts';
import { exampleList } from '../ui/example.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };
const same = (label, got, want) => {
  try {
    assert.deepStrictEqual(got, want);
  } catch {
    fail(label, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};
const state = (over) => ({ ...DEFAULTS, pan: [0, 0], pins: {}, ports: {}, ...over });
const example = (label) => {
  const ex = exampleList.find(x => x.label === label);
  if (!ex) throw new Error(`no example ${label}`);
  return ex.content;
};
const URL_SAFE = /^[A-Za-z0-9_-]+$/;
// The wire format spelled independently (node's own base64url), for
// hand-made payloads the encoder would never write — under any version.
const tokenOf = async (payload, version = VERSION) => {
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const deflated = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return '#' + version + Buffer.from(await new Response(deflated).arrayBuffer()).toString('base64url');
};

// The fresh page: the default state, a bare URL.
same('the default horizon is the engine default', DEFAULTS.horizon, T_END);
same('the default state spells no JSON', canonical(state({})), '');
same('the default state encodes to no hash', await encode(state({})), '');
same('an empty hash decodes to the defaults', await decode(''), state({}));
same('a lone # decodes to the defaults', await decode('#'), state({}));

// Only what differs from the defaults reaches the wire, in one fixed order.
same('a source alone', canonical(state({ source: 'a -> b' })), '{"src":"a -> b"}');
same('every field', canonical(state({
  source: 'a', horizon: 25, namesOnly: false, animate: false, zoom: 1.25,
  pan: [3, -4], pins: { 'stock#2': [1, 2] }, ports: { 'port#0': 1.5 },
  examplesOpen: false, figuresOpen: true,
})), '{"src":"a","t":25,"names":false,"play":false,"zoom":1.25,"pan":[3,-4],'
  + '"pins":{"stock#2":[1,2]},"ports":{"port#0":1.5},"examples":false,"figures":true}');
same('the flows checkbox is not page state', 'flows' in DEFAULTS, false);
same('a fresh page animates', DEFAULTS.animate, true);

// Every example round-trips — source byte for byte, every view field back —
// as a URL-safe token under the size budget (compression stays on: the
// largest example measured 763 characters when the format shipped).
const view = {
  horizon: 25, namesOnly: false, animate: false, zoom: 1.5625, pan: [12.5, -40],
  pins: { 'stock#2': [100.5, -20], 'dot#7': [0, 0], 'cloud#0': [-80, 300] },
  ports: { 'port#0': 1.57, 'port#3': -3.14 },
  examplesOpen: false, figuresOpen: true,
};
let largest = { label: '', length: 0 };
for (const { label, content } of exampleList) {
  const s = state({ source: content, ...view });
  const token = await encode(s);
  if (!token.startsWith(VERSION) || !URL_SAFE.test(token)) fail(label, `token not URL-safe: ${token}`);
  same(`${label} round-trips`, await decode(`#${token}`), s);
  const bare = await encode(state({ source: content }));
  same(`${label} alone round-trips`, await decode(bare), state({ source: content }));
  if (bare.length > largest.length) largest = { label, length: bare.length };
}
if (largest.length > 1000) fail('size budget', `${largest.label}: ${largest.length} characters`);

// Text survives exactly as typed: whitespace, line endings, any script.
for (const [label, source] of [
  ['tabs and CRLF', 'a\t->\tb\r\nc -> d\r\n'],
  ['a trailing newline', '[stock]\n'],
  ['blank lines and edge spaces', '\n\n  a -> b  \n\n'],
  ['non-ASCII', 'café → 😀 — 温度 -> b'],
  ['a draft that does not compile', '[water in tub: 50 =>'],
]) {
  same(label, (await decode(await encode(state({ source }))))?.source, source);
}

// One state, one spelling: pin order never shows, so neither does the
// token; numbers snap to the grid (tenths, 0.01 rad bearings wrapped into
// atan2's range, 4-place zoom, -0 folded), and snapping is idempotent.
{
  const a = state({ source: 'x', pins: { 'stock#2': [1, 2], 'dot#10': [3, 4], 'dot#9': [5, 6] } });
  const b = state({ source: 'x', pins: { 'dot#9': [5, 6], 'stock#2': [1, 2], 'dot#10': [3, 4] } });
  same('pin order never changes the JSON', canonical(a), canonical(b));
  same('equal states spell equal tokens', await encode(a), await encode(b));
  const grid = state({
    zoom: 1.25 * 1.25 * 1.25 / 1.25 / 1.25, pan: [0.04, -0.04],
    pins: { 'dot#1': [1.26, -3.34] }, ports: { 'port#0': Math.PI, 'port#1': 3 * Math.PI / 2 },
  });
  same('the grid', canonical(grid),
    '{"zoom":1.25,"pins":{"dot#1":[1.3,-3.3]},"ports":{"port#0":3.14,"port#1":-1.57}}');
  same('the grid is idempotent', canonical(await decode(await encode(grid))), canonical(grid));
}

// The controls' ranges, shared with the t = field and the zoom buttons.
same('the horizon clamp', [clampHorizon(0), clampHorizon(5000), clampHorizon(12.5)], [1, 1000, 12.5]);
same('the zoom clamp', [clampZoom(0.01), clampZoom(100), clampZoom(1.5)], [0.2, 8, 1.5]);

// A malformed field falls back to its default (clamped where it's a
// number out of range) without costing the rest.
same('each field is checked on its own', await decode(await tokenOf(JSON.stringify({
  src: 5, t: 5000, names: false, play: 1, zoom: 100, pan: [1, 'x'],
  pins: { 'dot#1': [1, 2], evil: [0, 0], 'stock#2': [1], 'port#0': [3, 4], 'cloud#3': [1e9, -1e9] },
  ports: { 'port#0': 10, 'dot#1': 1, 'port#1': 'x' },
  examples: false, figures: 'no',
}))), state({
  horizon: 1000, namesOnly: false, zoom: 8,
  pins: { 'dot#1': [1, 2], 'cloud#3': [1e6, -1e6] },
  ports: { 'port#0': -2.57 }, // 10 rad wrapped: 10 − 4π
  examplesOpen: false,
}));
same('a non-finite number falls back', await decode(await tokenOf('{"src":"a","t":1e999}')), state({ source: 'a' }));
// A key the decoder doesn't read is ignored — the first links carried the
// flows checkbox, since dropped from the page state — and the rest opens.
same('the retired flows key is ignored', await decode(await tokenOf('{"src":"a","flows":true,"names":false}', '1')),
  state({ source: 'a', namesOnly: false, animate: false }));
// A field a link leaves out means the default of the version that wrote
// it: version 1's fresh page had the animate toggle off, version 2's on.
same('a version-1 link without play opens still', (await decode(await tokenOf('{"src":"a"}', '1')))?.animate, false);
same('a version-1 link with play opens animating',
  (await decode(await tokenOf('{"src":"a","play":true}', '1')))?.animate, true);
same('a version-2 link without play opens animating', (await decode(await tokenOf('{"src":"a"}', '2')))?.animate, true);
same('turning animate off is spelled out', canonical(state({ source: 'a', animate: false })), '{"src":"a","play":false}');

// Unreadable tokens decode to null — never a throw.
for (const [label, hash] of [
  ['not base64url', '#1!!!'],
  ['an unknown version', '#3' + (await encode(state({ source: 'a' }))).slice(1)],
  ['a length no padding fixes', '#1abcde'],
  ['not deflate', '#1' + Buffer.from('hello world').toString('base64url')],
  ['not JSON', await tokenOf('not json')],
  ['a JSON array', await tokenOf('[1,2]')],
  ['a JSON string', await tokenOf('"a -> b"')],
  ['JSON null', await tokenOf('null')],
  ['not UTF-8', await tokenOf(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]))],
  ['an oversized token', '#1' + 'A'.repeat(1 << 18)],
  ['a payload that inflates past the cap', await encode(state({ source: 'a'.repeat(300_000) }))],
]) {
  try {
    const got = await decode(hash);
    if (got !== null) fail(label, `decoded to ${JSON.stringify(got)}`);
  } catch (e) {
    fail(label, `threw ${e}`);
  }
}

// A link cut short (a chat app's truncation) never opens a DIFFERENT
// model: every proper prefix of a real token decodes to null or, at worst,
// to the very state it came from.
{
  const s = state({ source: example('figure 10 & 11'), ...view });
  const token = await encode(s);
  for (let n = 1; n < token.length; n++) {
    try {
      const got = await decode(token.slice(0, n));
      if (got !== null && canonical(got) !== canonical(s)) fail(`cut to ${n}`, 'decoded to a different state');
    } catch (e) {
      fail(`cut to ${n}`, `threw ${e}`);
    }
  }
}

// A link captured when the format shipped: figure 10 & 11 with its hot
// coffee and room temperature dragged into place and hot coffee's port slid
// to the stock's top. It must open field for field in every later version —
// before changing the wire, bump VERSION and keep reading this one. (It was
// captured with the flows checkbox ticked; that key is ignored since the
// checkbox left the page state. And it was captured under version 1, whose
// fresh page had the animate toggle off: the link says nothing of it, so
// it opens still, though version 2 animates a fresh page.)
const GOLDEN = '#1bY5NboMwEEavYk02qTQgA3WaWA2LXgNYWMYkqOBBtlHUJty9coWaqMpu_t687wreaZBQnSkwTV1njGQZ5w07lppo6O1JMp7mO3ar7cd2HbH3hLW9185Myuqv2N75l9o6opEFM07GqTC7-HLPkvKRqe2NHcuzUeGuqHpt2r8UvInG9SIqLsqNsfxnfoCeqKP2CQgIAWTBEbqBLh5kcLNBsGo0HmSnBm8QvolGkFkqdrlAmJQFWSWFSAVmeYMw9daDvEJLYXMAWRWCY8F5g-AD6c8NB1nlrxyzPU9FsyBM5MIvEYu4TrJUvC0IXX-anVlTLD8';
same('the shipped link still opens', await decode(GOLDEN), state({
  source: example('figure 10 & 11'), horizon: 30, namesOnly: false, animate: false,
  zoom: 1.5625, pan: [-35.5, 12],
  pins: { 'stock#0': [240, 180.5], 'dot#9': [350, 300] }, ports: { 'port#0': -1.57 },
  figuresOpen: true,
}));
// The same page captured when version 2 shipped, animating: the wire
// leaves `play` out, and the link must open animating in every later
// version, exactly as the version-1 link opens still.
const GOLDEN_V2 = '#2bY5NboMwEEavYk02rTSgAeoktRoWvQawsByToAYPso2qNuHulauoiarsvvl58-YMwRtQ0Bw5CsN9b60SBVEndrVhPg3uoATl5VpcWvf-dG2Jt0zsh2C8nbQzX6m88c-t88yjiHacrNdx9unkVmT1PdO6i9jVR6vjTdEMxu7_vqAuGa8bSfGp_ZjiP_Md9ECdtA9AQIigKkJwerQBVK9PwSJ8M4-gilyuS4kwaQeqySqZSyzKDmEaXAB1hj3H1SuoppKEFVGHECKbjxWBasoXwmJLuewWhIl9_CVSSOOsyOVmQeiHw-yTOPrZLj8';
same('the version-2 link still opens', await decode(GOLDEN_V2), state({
  source: example('figure 10 & 11'), horizon: 30, namesOnly: false, animate: true,
  zoom: 1.5625, pan: [-35.5, 12],
  pins: { 'stock#0': [240, 180.5], 'dot#9': [350, 300] }, ports: { 'port#0': -1.57 },
  figuresOpen: true,
}));

console.log(failures ? `${failures} FAILURE(S)` : 'PERMALINK CHECKS PASSED');
process.exit(failures ? 1 : 0);
