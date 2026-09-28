// The whole page state in the URL hash — the permalink app.ts keeps current
// (see the permalink section at the end of app.ts): the model's source text,
// verbatim, plus the view settings and hand placements that can't be derived
// from it. Pure and dependency-free (no imports at all), so node runs it
// headlessly like simulate.ts (test/permalink.mjs) — CompressionStream,
// DecompressionStream, TextEncoder and btoa/atob are node globals too.
//
// Format: `#` + VERSION + base64url(deflate-raw(UTF-8(JSON))). The JSON is
// the canonical wire object (see `canonical`): short keys, only the fields
// that differ from DEFAULTS, numbers snapped to a fixed grid, pin and port
// ids sorted — so one state always spells one JSON, and a fresh page spells
// none at all (a bare URL). The version character leads the token, so a
// future format can change everything after it while old links still open.
// A field a link leaves out means the default of the version that wrote it,
// so changing a default is changing the wire: version 2 turned the animate
// toggle on for a fresh page, and a version-1 link that says nothing of it
// still opens with it off (see READS).
//
// A hash is untrusted input (anyone can send a link): `decode` caps the
// token's length before inflating and the inflated size while inflating,
// then reads each field on its own — a malformed field falls back to its
// default without costing the rest — clamped to what the controls
// themselves allow. It never throws: an unreadable token decodes to null.

export type PageState = {
  // The editor text, verbatim — a draft that doesn't compile included.
  source: string;
  // The chart's simulated horizon (the t = field). (The chart's flows
  // checkbox is deliberately NOT page state: nothing but a click sets it.)
  horizon: number;
  // The diagram's names-only labels.
  namesOnly: boolean;
  // The animate setting (on for a fresh page; a restored run plays from
  // t = 0). A viewer who asks for reduced motion sees a run held still
  // until their own press, but that hold is theirs, not page state.
  animate: boolean;
  // The zoom cluster's factor on the auto-fit view, and the pan offset
  // (viewBox user units) on its center.
  zoom: number;
  pan: [number, number];
  // Hand-pinned nodes' fixed points (fx/fy) by node id, and hand-set port
  // bearings (radians from the stock's center) by port id. The ids are the
  // compiler's, minted from the source — which the link carries verbatim,
  // so they come back identical.
  pins: Record<string, [number, number]>;
  ports: Record<string, number>;
  // The two example sections' <details> open state.
  examplesOpen: boolean;
  figuresOpen: boolean;
};

// The state a fresh page opens in — what a bare URL means. app.ts builds its
// controls from these (its animate setting starts on, the run held for a
// viewer who asks for reduced motion), and test/permalink.mjs pins
// `horizon` to simulate.ts's T_END.
export const DEFAULTS: Readonly<PageState> = Object.freeze<PageState>({
  source: '',
  horizon: 10,
  namesOnly: true,
  animate: true,
  zoom: 1,
  pan: [0, 0],
  pins: {},
  ports: {},
  examplesOpen: true,
  figuresOpen: false,
});

export const VERSION = '2';

// Every version `decode` reads, by the fresh page its links were written
// against — a field the wire omits takes that version's default. Version 1
// (the first links) had the animate toggle off, so its links omit `play`
// exactly when they meant it off.
const READS = new Map<string, Readonly<PageState>>([
  ['1', Object.freeze<PageState>({ ...DEFAULTS, animate: false })],
  [VERSION, DEFAULTS],
]);

// The ranges the controls allow. The t = field and the zoom buttons clamp
// through these too, so a link can't open a view the controls couldn't reach.
export const clampHorizon = (t: number): number => Math.min(1000, Math.max(1, t));
export const clampZoom = (z: number): number => Math.min(8, Math.max(0.2, z));

// Far past any real model (the largest example's token is under 800
// characters, its JSON about 3 KB), near enough that a hostile link can't
// stall the page: characters of token, then bytes once inflated.
const MAX_TOKEN = 1 << 18;
const MAX_JSON_BYTES = 1 << 18;

// The wire grid. Positions (pins, pan) in viewBox user units to a tenth —
// sub-pixel even at the 8× zoom limit — kept to a sane magnitude. Bearings
// wrap into atan2's range (ticked()'s port spread assumes it) at 0.01 rad;
// 3.14 < π, so the rounding never leaves the range. Zoom to 4 places, which
// sheds the float dust of repeated 1.25× steps. Every snap is idempotent, and
// `|| 0` folds -0 into 0.
const round = (v: number, places: number): number => {
  const k = 10 ** places;
  return Math.round(v * k) / k || 0;
};
const coord = (v: number): number => round(Math.min(1e6, Math.max(-1e6, v)), 1);
const bearing = (a: number): number => round(Math.atan2(Math.sin(a), Math.cos(a)), 2);
const zoomStep = (z: number): number => round(clampZoom(z), 4);

// Which ids may carry a pin or a bearing: the compiler's named-node and
// cloud ids, and its port ids.
const PIN_ID = /^(dot|stock|faucet|cloud)#\d+$/;
const PORT_ID = /^port#\d+$/;

const fresh = (base: Readonly<PageState> = DEFAULTS): PageState =>
  ({ ...base, pan: [base.pan[0], base.pan[1]], pins: {}, ports: {} });

// A record's entries whose ids match, sorted by id and mapped — or null
// when none survive.
function sortedRecord<V, W>(m: Record<string, V>, id: RegExp, f: (v: V) => W): Record<string, W> | null {
  const keys = Object.keys(m).filter(k => id.test(k)).sort();
  if (keys.length === 0) return null;
  const out: Record<string, W> = {};
  for (const k of keys) out[k] = f(m[k]!);
  return out;
}

// The canonical wire JSON of a state: short keys in a fixed order, for only
// the fields that differ from DEFAULTS — '' for the default state itself.
// Numbers snap to the grid and ids sort, so equal states spell equal JSON
// (app.ts compares these to skip URL writes that would change nothing).
export function canonical(s: PageState): string {
  const w: Record<string, unknown> = {};
  if (s.source !== DEFAULTS.source) w.src = s.source;
  const t = clampHorizon(s.horizon);
  if (t !== DEFAULTS.horizon) w.t = t;
  if (s.namesOnly !== DEFAULTS.namesOnly) w.names = s.namesOnly;
  if (s.animate !== DEFAULTS.animate) w.play = s.animate;
  const zoom = zoomStep(s.zoom);
  if (zoom !== DEFAULTS.zoom) w.zoom = zoom;
  const pan = [coord(s.pan[0]), coord(s.pan[1])];
  if (pan[0] !== DEFAULTS.pan[0] || pan[1] !== DEFAULTS.pan[1]) w.pan = pan;
  const pins = sortedRecord(s.pins, PIN_ID, ([x, y]) => [coord(x), coord(y)]);
  if (pins) w.pins = pins;
  const ports = sortedRecord(s.ports, PORT_ID, bearing);
  if (ports) w.ports = ports;
  if (s.examplesOpen !== DEFAULTS.examplesOpen) w.examples = s.examplesOpen;
  if (s.figuresOpen !== DEFAULTS.figuresOpen) w.figures = s.figuresOpen;
  return Object.keys(w).length ? JSON.stringify(w) : '';
}

// The hash token for a state ('' for the default state: a bare URL).
export async function encode(s: PageState): Promise<string> {
  const json = canonical(s);
  if (json === '') return '';
  const deflated = new Blob([new TextEncoder().encode(json)]).stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return VERSION + toBase64url(new Uint8Array(await new Response(deflated).arrayBuffer()));
}

// The state a hash carries (with or without its leading '#'): the defaults
// for an empty one, null for any token that can't be read — a version it
// doesn't read, not base64url, not deflate, cut short, oversized, not
// UTF-8, not a JSON object. Never throws.
export async function decode(hash: string): Promise<PageState | null> {
  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  if (token === '') return fresh();
  const base = READS.get(token[0]!);
  if (token.length > MAX_TOKEN || !base) return null;
  const bytes = fromBase64url(token.slice(1));
  if (!bytes) return null;
  const json = await inflate(bytes);
  if (json == null) return null;
  let wire: unknown;
  try {
    wire = JSON.parse(json);
  } catch {
    return null;
  }
  return isRecord(wire) ? fromWire(wire, base) : null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// A wire object back to a full state: each field read on its own, falling
// back to the writing version's default (`base`) when absent or malformed,
// and snapped to the same grid and ranges `canonical` writes — so a decoded
// state's canonical JSON is the one it was read from, whenever this version
// wrote the link. A key it doesn't read is ignored: the first
// links carried the chart's flows checkbox (`flows`), since dropped from
// the page state, and still open.
function fromWire(w: Record<string, unknown>, base: Readonly<PageState>): PageState {
  const s = fresh(base);
  if (typeof w.src === 'string') s.source = w.src;
  if (isNum(w.t)) s.horizon = clampHorizon(w.t);
  if (typeof w.names === 'boolean') s.namesOnly = w.names;
  if (typeof w.play === 'boolean') s.animate = w.play;
  if (isNum(w.zoom)) s.zoom = zoomStep(w.zoom);
  if (isPair(w.pan)) s.pan = [coord(w.pan[0]), coord(w.pan[1])];
  if (isRecord(w.pins)) {
    for (const [id, v] of Object.entries(w.pins)) {
      if (PIN_ID.test(id) && isPair(v)) s.pins[id] = [coord(v[0]), coord(v[1])];
    }
  }
  if (isRecord(w.ports)) {
    for (const [id, v] of Object.entries(w.ports)) {
      if (PORT_ID.test(id) && isNum(v)) s.ports[id] = bearing(v);
    }
  }
  if (typeof w.examples === 'boolean') s.examplesOpen = w.examples;
  if (typeof w.figures === 'boolean') s.figuresOpen = w.figures;
  return s;
}

// base64url (RFC 4648 §5, unpadded): the token needs no percent-encoding
// anywhere a URL travels. btoa takes a binary string, built in chunks so a
// large model never overflows fromCharCode's argument list.
function toBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    // atob's forgiving decode accepts the missing padding, and throws on a
    // length no padding could fix.
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// Inflate under the size cap, reading chunk by chunk so an oversized
// payload stops at the cap instead of expanding in full; a stream that is
// corrupt or ends early (a link cut short) errors, and so reads as null.
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
  try {
    const reader = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
      .getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(all);
  } catch {
    return null;
  }
}
