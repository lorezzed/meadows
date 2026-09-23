# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Meadows compiles a small text DSL into a system-dynamics-style graph (nodes + links)
and renders it as an interactive force-directed diagram. It is split across two languages:

- **PureScript** (`src/`) is the compiler: it turns DSL source text into a `Graph`
  (`{ nodes, links }`) serialized as JSON.
- **TypeScript + d3** (`ui/`) is the frontend: it calls the compiled PureScript,
  parses the JSON, and drives a d3 force simulation.

The two halves meet at one seam: `ui/app.ts` imports `../output/Main/index` (the
spago-compiled JS) and calls `interpreter.go(input)`. So **the frontend consumes the
build output of the backend, not its source** — see the build coupling note below.

## Environment & build tooling

Toolchain is pinned via a Nix flake (`flake.nix`): `purescript`, `spago`, `nodejs_22`,
and `esbuild`. Nearly every command is meant to run inside `nix develop`, which the
`Makefile` wraps. Entering the shell runs `npm install` automatically (shellHook).

The bundler is **esbuild** (`make dev` to serve, `make dist` to build the static
site), pulled from the flake. `package.json` carries only the runtime/dev deps the
UI actually uses — `d3` plus `@types/d3` and `typescript` for the `tsc` typecheck;
the old Parcel toolchain and its `events`/`process` polyfills have been removed.

Careful: `make dev`'s esbuild flags (`--outdir=./ui` + `--servedir`) are safe only
because serve mode builds in memory and writes nothing. Never run the same command
as a one-shot **without** `--servedir` — it writes the bundle to `ui/index.js`,
clobbering the checked-in one-line entrypoint. For a throwaway bundle, point
`--outdir` somewhere disposable (e.g. a tmp dir).

## Common commands

```bash
make init         # install Nix itself (nixos.org's installer) — the one thing
                  #   not pinned by the flake; everything else needs it first
make shell        # enter the nix dev shell (purs, spago, node, esbuild)
make dev          # esbuild dev server: bundles ui/index.js, watches, serves ./ui
                  #   (loads .svg as dataurl); open the served ui/index.html
make run          # CLI entrypoint (src/CLI.purs) with no input: prints usage
make run-with "a->b"     # compile a DSL string, print its graph JSON
make run-with in="a=>j"  # in= form REQUIRED when the input contains '='
                  #   (make parses a bare "a=>j" goal as a variable override)
make test         # spago test (PureScript unit suite) + golden battery
                  #   (test/golden.mjs: byte-exact graph JSON + positioned errors)
                  #   + headless frontend checks (test/simulate.mjs and
                  #   test/highlight.mjs run ui/simulate.ts / ui/highlight.ts
                  #   directly via node's TS type stripping) + the formatter
                  #   contract (test/format.mjs).
                  #   Refresh goldens after an INTENDED change: node test/golden.mjs --capture

# Inside `nix develop` (or `make shell`) you also have the raw tools:
spago build       # compile src/ -> output/  (REQUIRED before the UI sees backend changes)
spago test        # PureScript unit suite: tokens & positions, Tree shapes, evaluator rules
spago repl        # PureScript REPL
npx tsc           # typecheck ui/ (tsconfig has noEmit; type-check only)
```

Tests live in three layers, all run by `make test`: `test/Main.purs` unit-tests the
compiler internals (token streams & positions, exact `Tree` shapes including minted
ids, evaluator identity/link/group/value rules), `test/golden.mjs` pins the
end-to-end JSON seam byte-exactly, and `test/simulate.mjs` / `test/highlight.mjs` /
`test/format.mjs` check the frontend simulator, the editor's highlight tokenizer,
and the formatter (reference style, graph preservation, idempotence) against the
real compiled backend.

### Build coupling (important)

`ui/app.ts` imports the **compiled** backend from `output/Main/index`. That directory is
produced by `spago build`. If you change anything in `src/*.purs`, you must run
`spago build` to regenerate `output/` before `make dev` will pick up the new behavior.
Editing `.purs` alone and refreshing the browser will silently run stale code.

## Backend architecture (`src/`)

A classic three-stage pipeline, orchestrated by `go` in `Main.purs`
(`tokenize >=> parse >=> evaluate`, each stage short-circuiting on `Either` error into a
JSON error string). Two small modules sit beside it rather than in it:
**`Expr.purs`** (the value-formula shape, below) and **`Formatter.purs`**
(the pretty-printer, further down):

1. **`Lexer.purs`** — `tokenize :: String -> Either String (List PosToken)`, built on the
   `purescript-parsing` combinator library. Each token carries the source position where
   it starts (`PosToken = { pos, tok }`, stamped via `Parsing.position`); lex/parse
   errors both format through `formatParseError` as `line L, column C: msg`. The
   lexeme → token mapping is the DSL's surface syntax:
   - identifiers → `TokIdent` (become **dot** nodes)
   - `->` / `<-` → arrows (`ArrowR` / `ArrowL`)
   - `[` `]` → stock brackets (a `[name]` is a **stock** node)
   - `=>` / `<=` → faucets (`FaucetR` / `FaucetL`)
   - `|` → cloud (`TokCloud`)
   - `R(` / `B(` → loop-open (`TokLoop`, exact uppercase two-char lexeme, tried
     before identifiers with backtracking — a bare `R`, `R->b`, or `Rx(` still
     lex as identifiers); `)` (`TokRParen`) closes the annotation
   - `:` → `TokColon`, `@` → `TokAt`, `,` → `TokComma` (legal only between
     a 2-arg call's arguments — see the parser),
     `+` `-` `*` `/` `^` → formula operators
     (`TokPlus`/`TokMinus`/`TokStar`/`TokSlash`/`TokCaret`; a `-`
     directly followed by digits is a signed literal instead), and number
     literals → `TokNumber`
     (digits with an optional `.digits` fraction and an optional leading `-`
     sign; no exponent — together they form value annotations like
     `[tub: 50]` and schedules like `=>inflow: 0 @5: 5`). Operators lex
     before
     numbers, so `->` is never mistaken for a sign; a digit *inside* a
     word stays part of the identifier (`a2` is one name); `5.` is a
     tokenization error, and `~` is not part of the language at
     all (it once marked smooth schedules and smoothing shifts — both
     were removed in favor of plain maths, first denser `@` staircases,
     now closed formulas of `t` for curves — and explicit lag-stock
     structure). `t`, `pi`, `cos`, `sin`, `min`, `max` are ordinary
     identifiers to the lexer; the parser reserves them inside formulas

2. **`Parser.purs`** — `parse :: List PosToken -> Either String (List Tree)`, one `Tree`
   per newline-separated statement. A combinator parser over the token stream:
   `ParserT (List PosToken) (State Id)` with productions `program`/`statement`/
   `expression`/`exprTail`/`term`. A statement is a loop annotation (`R(expr)` /
   `B(expr)` → `LoopExpr`, minting before its body like `ParenExpr`) or a bare
   expression; a loop may open a statement and be continued by operators
   (`B(...) <- thermostat setting` — the tail links against whatever the
   loop's inner expression resolves to, and the tail's nodes are not loop
   members), but is never an *interior* term (`a->R(b)` is a positioned
   error). Stocks accept an optional `: N` initial
   value (`'[' NAME (':' NUMBER)? ']'`, `Maybe Number` on `StockExpr`);
   faucet and bare (dot) names accept an optional **schedule**
   (`NAME (':' NUMBER ('@' NUMBER ':' NUMBER)*)?`; e.g. `inflow: 0 @5: 5`
   = closed until t=5 then 5, or a single `: N`
   constant like `room temperature: 18`) **or a parenthesized formula**
   (`: (expr)` — `+ - * / ^` with the usual precedence (`^` tightest and
   right-associative: `x^2y` is `(x^2) * y`, `2x^2` is 2·(x²)), implicit
   multiplication by juxtaposition with a name or group (`2x`, `2(a + b)`;
   note multi-word joining makes `output fraction` ONE name — write
   `output * fraction` to multiply, and `pi t` is likewise one NAME —
   write `pi * t`), references to other nodes by name (a `Formula` AST
   — `Expr Ref`, see `Expr.purs` — with per-reference minted ids), the
   reserved **time variable `t`** and
   **constant `pi`** as complete terms (`a: (t)` is the time itself — a
   ramp; both mint nothing and take no shift tail, so `t(t - 1)` is
   juxtaposed multiplication; nodes named `t`/`pi` are unreachable from
   formulas), **function calls** `cos`/`sin` (one argument) and
   `min`/`max` (two, comma-separated: `max(0.09, 0.21 - 0.06 * t)` — the
   comma is legal nowhere else) — a reserved name opens a call exactly
   when its next token is `(` (`peekLParen`, decided in `fAtom` BEFORE the
   shift peek, so `cos(t / 24)` is a call and never a shift of a node
   named `cos`; a bare `cos` stays an ordinary reference, the
   `smooth`/`delay` precedent; calls mint no id, only the references
   inside their arguments do) — and the one **time
   shift** `x(t - T)` (the value x had exactly T ago — a pipeline delay) —
   `EShift`, minting NO id of its own. A
   shift opens on the exact token pair `(t` after a name, a paren group,
   or a call
   (`peekShift`, a pure two-token peek — so `x(a + b)` stays juxtaposed
   multiplication). The shift time is ONE
   multiplicative term — `x(t - 3 - d)` is a positioned error, write
   `x(t - (3 + d))` — a signed literal folds (`x(t -3)` ≡ `x(t - 3)`),
   `x(t)` is just x, and shifts chain left to right:
   `x(t - 2)(t - 3)` delays the delayed signal), carried as
   `Maybe Annot = Maybe (SchedAnnot Sched | FormulaAnnot Formula)` with
   `Sched = { initial, steps :: Array { at, value } }`
   on `FaucetExpr` and `NodeExpr` — a scheduled or closed-formula dot is
   a *driving variable*
   (figure 19's cold-day `outside temperature`). Steps hold
   piecewise-constant and model GENUINE discrete events (a valve opening,
   a dose); a smooth curve is written as an equation of time
   (`(2.5 + 7.5 * cos(2 * pi * t / 10))`).
   (Exponential smoothing is not a language feature — perception-style
   reads use the pipeline shift itself, `sales(t - perception delay)`,
   which mints no nodes, so a model's diagram keeps the book figure's
   exact census.) A value anywhere else
   (`[a]: 5`, a bare `5`, a schedule on a stock) is a positioned parse
   error, and
   `valueTail`/`annotTail` consume nothing when no `:` follows, so id-minting
   order for value-less input is untouched. Its one custom primitive, `satisfyMap`, keeps the parser position
   on the *next unconsumed* token so `<?>` labels and `eof` report exact locations —
   the library's own `Parsing.Token` primitives leave the position on the consumed
   token, so don't swap them back in. The grammar uses no `try`: alternatives dispatch
   on disjoint first tokens, plus `peekShift`'s and `peekLParen`'s pure
   peeks for the `(t` and call forms. **Every AST node gets a unique integer `Id`** minted by
   the `fresh` counter (ParserT's `MonadState` passes through to the base `State Id`) —
   this identity is what later lets repeated mentions of the same name collapse to one
   graph node, and the minting *order* is pinned byte-exactly by `test/golden.mjs`.
   The order follows ONE rule, stated at `fresh` and obeyed by every
   production: an id is taken the moment the node's own lexemes are consumed
   and BEFORE any sub-expression is parsed (leaves mint after their own
   tokens, `(`/`R(` before their body, an operator after the operator and
   before the right operand) — so source order is a consequence of the
   grammar's shape, not of call ordering.
   Failures are positioned errors; the parser never fabricates nodes. The `Tree` ADT
   is the AST — `->`/`<-` share one `ArrowExpr` and `=>`/`<=` one
   `FaucetExpr`, each carrying a `Dir` (`Rightward`/`Leftward`) as DATA, so
   every rule that depends on direction is written once downstream instead
   of twice.

3. **`Evaluator.purs`** — `evaluate :: List Tree -> Graph`. Walks each `Tree` in a `State`
   monad (`EvalState`), emitting nodes and links as side effects.
   `evaluateNode` returns `{ id, members }` — the id the subtree RESOLVES to
   plus, in source order, every node it mentions, so a loop annotation reads
   its membership straight off its body instead of re-walking it. Every write
   to the node table goes through `putNode`/`updateNode` (and `blank` for a
   fresh record), and every directional emission through `directed`. Key
   identity rule:
   - **Named nodes** (dots, stocks, faucets) go through `resolveNamed`, which uses a
     `registry :: Map name -> id`. The *first* occurrence of a name mints an id; later
     occurrences reuse it. This is why writing a name twice references the same node.
   - **Clouds** go through `freshAnon` — always a fresh id, never registered, so they
     never coalesce.
   - **Ports**: an info arrow never touches a stock directly. Every arrow
     emission goes through `drawArrow`, which first dedups on *logical*
     endpoints (`logicalEnd` resolves a port to its `parent` stock — so a
     formula's re-implied arrow reuses the hand-drawn one and a repeated
     statement redraws nothing; the dedup runs before minting, so a duplicate
     never mints a second port), then routes each stock endpoint through
     `portFor`: a fresh anonymous `port#N` node (evaluator-side `portCount`,
     numbered in draw order the way `loopCount` numbers loops — the one id
     family NOT minted from a parser `Id`) with `parent` = the stock's id and
     an empty label. `[a]->[b]` gets a port at each end; dot→dot arrows mint
     none. Ports join no band group and never carry loop tags.
   - Ids are opaque (`"dot#3"`, `"stock#5"`, …) built from the node type prefix + parser
     `Id`, never from source text. Links reference these ids, i.e. identity not spelling.
   - **Loop annotations** are transparent to evaluation: `LoopExpr`'s inner
     expression emits its nodes/links as if unwrapped, then every node it mentions
     (its `members`, accumulated by the same walk that evaluated it — a formula's
     references are NOT members, since only the structural leaves contribute) is
     tagged in `loopTags` with a generated name — the kind's letter
     plus one source-order counter (`"R0"`, `"B1"`, …, like group numbering).
   - `<-` links each hop from the *nearest* term of its right subtree
     (`leftmostId`, same as the faucets), so `a<-b->c` fans out from `b`.
     `leftmostId` runs BEFORE the right subtree is evaluated and that is
     load-bearing: it puts the arrow between the two flows of
     `([s]=>f)->([t]=>g)` and fixes port numbering, both golden-pinned. An
     arrow chain then resolves to its information SINK (`->` the far end,
     `<-` the head — so `B(a<-b) <- c` hangs its tail off the chain's head).
   - **Value annotations** land in `Node.value`/`Node.steps` via `setValue`
     (stocks) and `setAnnot` (faucets and dots — schedules through
     `setSched`, formulas through `setFormula`): the *first explicit*
     annotation for a
     name wins — value-less mentions never erase, later annotations never
     overwrite, and a schedule wins *as a unit* (value + steps together; a
     formula
     counts as the annotation too — value vs formula, whichever came first).
     That rule is the `annotate` guard, in ONE place — every setter goes
     through it, `setValue` included, so no name can end up carrying two
     contradictory readings (`b: (a)` then `[b: 5]` keeps the formula);
     `setFormula` consults the same `annotated` predicate one step earlier,
     before resolving its references, so a losing formula mints nothing.
     **Formulas** resolve their references through the registry (minting
     dots for unseen names), must land on stocks or dots (a faucet
     reference is a model error — EXCEPT as a time shift's INPUT, where
     reading a faucet means reading the flow's rate:
     `deliveries: (orders to factory(t - delivery delay))`; the shift's
     time keeps the error, and the `inShift` flag rides through function
     arguments unchanged), serialize as a resolved `expr` tree
     (`{kind: "num"|"ref"|"+"|"-"|"*"|"/"|"^"}` with ids, plus
     `{kind: "delay", input, time}` for time shifts, `{kind: "t"}`,
     `{kind: "pi"}`, `{kind: "cos"|"sin", arg}`, and
     `{kind: "min"|"max", left, right}` — `RFormula`, which IS the parser's
     `Formula` with node ids in its reference slots: one `Expr r` declared in
     `Expr.purs`, resolved by `traverseRefs` and serialized there), and
     auto-draw the info arrow each reference implies, shift inputs, shift
     times, and function arguments included (deduplicated against
     identical arrows already drawn — so `R(...)` annotations and formulas
     compose without doubled arcs). Formula-through-formula cycles
     (`a: (b)` + `b: (a)`) are rejected after evaluation; `evaluate` is now
     `Either String Graph` and `Main.go` prefixes those as "Model error:".
     The cycle walk uses `eagerRefIds`, which skips shift bodies — a
     shift's value is last step's state, never its input's current value,
     so a feedback loop closed through `orders(t - …)` is legal — but
     recurses into function arguments (a `min` reads both sides right
     now). `refIds` and `eagerRefIds` are the SAME fold (`Expr`'s
     `refsWhere`) under two policies, and refusing to descend into a shift
     is the whole difference between them. Semantically a stock's value is its initial level; a dot's is
     an auxiliary constant or, with steps or a closed formula (one
     referencing no nodes — pure maths of `t`), a driving variable
     (a goal-seeking faucet's goal, fixed or moving); a faucet's
     value is its initial rate, overridden from each step's `at` time onward.
     The compiler just carries the numbers (and the curves).

   Output types: `Node = { type, id, label, value :: Maybe Number, steps :: Maybe (Array { at, value }), expr :: Maybe RFormula, parent :: Maybe String, group :: Maybe Int, loop :: Maybe (Array String) }`
   (`Maybe` fields omit their JSON key on `Nothing` — goldens rely on that;
   `parent` appears only on ports), `Link = { type, source, target }`,
   `Graph = { nodes, links }`. `NodeType`
   (`Dot`/`Stock`/`Faucet`/`Cloud`/`Port`) has a `WriteForeign` instance so the
   whole graph serializes to the JSON the UI expects.

**`Expr.purs`** owns the value-formula shape, shared by the two stages that
speak it. A formula exists in two forms — the parser's, whose references are
*mentions* (`Ref id name`), and the evaluator's, whose references are node ids
— and they are the same tree, so it is declared once as `Expr r`
(`Formula = Expr Ref`, `RFormula = Expr String`). Everything structural lives
with it: `children` (the shape), `refsWhere` (fold it — `refIds`/`eagerRefIds`
are two policies over this one walk), `traverseRefs` (rebuild it, carrying the
in-a-shift flag down so the evaluator only has to say what a single reference
MEANS), and the `WriteForeign` instance that writes the `{kind: …}` JSON the
simulator evaluates. Adding a formula form (the `t`/`pi`/`cos`/`sin`/`min`/`max`
and shift additions each did this) means one case per concern here, not one per
concern in each of two copies.

Alongside the pipeline sits **`Formatter.purs`** — `format :: String -> String`,
the canonical pretty-printer behind the UI's format button. It re-lexes with the
real lexer and reprints the token stream (so it can never disagree with the
syntax): one statement per line (blank lines collapse), tokens space-separated
except where a lexeme glues to its neighbor — brackets hug their stock, a colon
hugs the name before it, faucet ops take their name (`| =>tree growth [wood in
living trees]`), schedule markers take their time
(`@5: 5`), loop-opens and parens hug inward, a comma hugs its left and
breathes right (`min(0.09, 0.21 - 0.06t)`), `^` is
tight on both sides (`2x^2`), and juxtaposed multiplication stays
tight inside formula groups only (`2x`, `2(a + b)`, `x(a + b)` — which also
glues time shifts and function calls: `orders(t - delivery delay)`,
`cos(2 * pi * t / 10)`; `5 [stock]` at statement
level keeps its space).
Arrows, formula operators, and a shift's `-` breathe on both sides. Token-preserving (a name
followed by a number keeps its space — `x2` would re-lex as one identifier;
numbers reprint from their value, integral ones without `.0`) and total: input
that doesn't lex comes back untouched. `test/format.mjs` pins the reference
style, graph-JSON preservation, and idempotence over every example.

`Main` exports `go` and re-exports Formatter's `format`. The terminal runner is
`src/CLI.purs` (argv → `go` → stdout), kept out of `Main` so the browser bundle
never pulls in node-process.

## Frontend architecture (`ui/`)

`ui/index.js` is a one-line entrypoint that imports `app.ts`; `index.html` is a
bare shell that loads it. Page chrome (panels, buttons, textarea, error state)
is a stylesheet **injected by `app.ts` via d3**, keyed on the class names it
assigns — inline styles in TS are layout logic only (flex `order`, display
toggles). The page is two full-width columns pinned to the window (the app
itself never scrolls): the example buttons, editor, compile-error `<pre>`
(shown only while the model fails to compile) and chart stacked in a `side`
div on the left, which scrolls internally when its stack overflows (a
narrow-window media query reverts to one ordinary scrolling column); the
diagram svg on the right at the full fixed window height, so oversized
models zoom out inside it — with a `+`/`1×`/`−` zoom cluster overlaying its
top-right corner (a user factor scaled onto the auto-fit viewBox target in
`easeView()`, animated by a self-stopping frame timer even while the
simulation is idle). Almost everything lives in **`app.ts`**:

- Builds the DOM (example buttons, a `<textarea>` editor, a `<pre>` error
  panel hidden while the model compiles, and the two `<svg>` panels) entirely
  via d3 `.append`, using flexbox `order` for layout. The example pills sit in
  two collapsible `<details>` sections (`addExampleSection`) — "figures from
  the book" (every `figure N` entry) and "examples" (the rest) — each a
  wrapping `.example-group` row; the nesting is transparent to
  `updateActiveExamples`, which still selects every `button` under
  `.examples`.
- On textarea `input`: calls `interpreter.go(input)` and `JSON.parse`s the result. A
  *string* result is a compile error: the editor's border flags red, the `<pre>`
  appears with the message in red, and `update()` is skipped (the last good
  graph stays). Otherwise the `<pre>` hides again and the `System` is passed
  to `update(system)`.
- The editor color-codes node names: the `<textarea>` sits on a `.highlight`
  backdrop `<div>` that renders the same text with every recognized name in
  its accent (weight 600), the textarea's own glyphs transparent above it
  (caret/selection native; the shared CSS rule pins every glyph-positioning
  property, plus `scrollbar-gutter: stable` so classic scrollbars can't skew
  the wrap; scrollTop syncs on scroll/input; a `\u200b` sentinel keeps a
  trailing newline's height). **`ui/highlight.ts`** (pure, dependency-free,
  headlessly tested like simulate.ts) scans the source into spans, mirroring
  the lexer's naming: multi-word joining with whitespace normalization
  (`water   in   tub` IS `water in tub`), `R(`/`B(` loop-opens excluded, the
  greedy join (`foo R(` is one name "foo R"), and formula-context tracking
  for the reserved words — a paren group opened right after a `:` (nested
  parens counted, reset per line) is a formula, inside which `t`/`pi` are
  always plain and `cos`/`sin`/`min`/`max` are plain exactly when a `(`
  follows (the parser's call dispatch); outside formulas all six are
  ordinary names (`t -> b` names a node t — a loop-open never opens a
  formula). Colors key on the NAME — the
  compiler's identity rule — via `nameColor`, one half of the single
  per-node accent assignment `update()` rebuilds from the compiled graph
  (see the coordination note on the `update()` bullet below); unknown names
  (mid-edit) stay ink until the model compiles. The `finally` in the input
  handler re-renders the backdrop on every path — after `update()` on
  success (a just-typed name colors on its own keystroke), with the stale
  map on a compile error.
- A "format" button in a `.tools` row tucked under the editor's right corner
  (order 2 after the editor wrap; pill styling shared with the example
  buttons) reprints the model via the backend's `format` (see
  `src/Formatter.purs`) through the same value-set + input-dispatch path as
  `loadExample` — compile, diagram recycle (token-preserving, so node ids
  and positions survive), and highlight all refresh. Unlexable input returns
  unchanged, so the button no-ops on broken models.
- `update()` does the d3 data-join per node type (dots→`circle`, stocks→`rect`,
  faucets/clouds→`image` with inlined SVGs from `ui/shape/`, ports→small open
  circles), rebinds the link force, and restarts the simulation. (There is deliberately no `forceCenter`:
  it would translate the whole graph to keep the node MEAN centered, fighting
  the band pins and forbidding the aux web from hanging below a lone band —
  floaters instead rest at `floatY`, one row below a single band.) It also groups nodes by their `loop`
  names into one floating letter (`<text>`) per annotation — a pure overlay that
  never enters `simulation.nodes()`. Node text renders via `displayLabel`: the
  name plus `: value` when the node carries one (`water in tub: 50`) — display
  only, also used by the slot-width and viewBox-pad estimates; ids, the name
  registry, the JSON `label`, and the chart's labels all stay the bare name.
  `update()` also builds the ONE per-node accent assignment every view
  shares (`accentById` by id, `nameColor` by name): stocks take
  `STOCK_PALETTE` slots in parser-id order, every other named node draws
  from the remaining entries in first-appearance order, and each entry is
  clamped to text-safe lightness (`textAccent`, LAB L ≤ 55) so the editor,
  diagram, and chart show the SAME hex. Past the palette accents are
  MINTED, never cycled (`mintAccent`: a golden-angle HCL hue walk, darker
  than the palette band, deterministic in assignment order), so every
  named node keeps a color even in figure-25-sized models — minted hues
  lack the palette's validated pair separation, so the direct label stays
  each mark's identity. The diagram wears the accent on stock rect
  strokes (always — numbers gate the chart's plot, never the accents), dot
  circles and dot/faucet labels (the tap icon stays the black Meadows
  glyph; stock labels stay ink, their rect carries the accent). Clouds,
  ports, pipes, and arcs stay black-and-gray notation.
- `ticked()` positions everything each frame; links are drawn as curved SVG arc
  paths. The faucet icon (solid black tap, `ui/shape/faucet.svg`) draws LIFTED
  by `faucetLift`: in the artwork the tap's base sits at 79% of the icon's
  height, and the lift puts that base — not the image centre — on the node
  point, so the tap straddles its pipe as in the reference figures. Every
  info-arc computation (trim, bulge, sweep scoring, letter parking, viewBox
  union) reads faucet endpoints through `aimY`, which applies the same lift so
  arrows meet the visible tap body; flow pipes keep the TRUE node point — that
  is the pipe line through the base. An info arc between two members of the
  SAME band (a stock arrowing
  into its own faucet — the figure 12 / figure 42 feedback loops) draws as the
  MAJOR arc (`arcLarge`; `trimArc`/`arcBulge` take the large flag), ballooning
  away from the pipe instead of hugging it; the auto-fit viewBox unions those
  bulge apexes so an outer band's balloon never clips. Each loop letter parks
  at the mean of its loop's drawn boundary — member-to-member pipe midpoints
  plus info-arc bulge apexes — which sits inside the enclosed region even
  when a wide stock rect would pull the plain member centroid onto its own
  body; a loop with no member-to-member links falls back to the centroid.
- Ports render as the Meadows open tail circle promoted to a node. Info arcs
  carry NO tail marker at all — every arrow tail already meets a drawn circle
  (a dot's, a port's), so the old `info-tail` marker was removed and the arc
  trims to `edgeOf(source)` bare. Ports are force-inert satellites — zero
  charge/collision, `fx`/`fy`-pinned every tick just inside the parent
  stock's rect (10px inset) on the side facing the arrow's far endpoint,
  near-coincident bearings spread apart cyclically so a stock's several arcs
  stay individually anchored, and side-edge ports dodge the label band
  (±12px) across the rect's middle. A port is draggable — but only ALONG the
  boundary: `portDrag` records the pointer's bearing from the stock's center
  as `portAngle`, which sticks (auto ports yield to hand-placed ones in the
  spread) — while an invisible r+6 disc makes the tiny circle grabbable
  without stealing the rest of the stock's surface from the stock's own drag.
  `update()` stamps `portParent`/`portFar` object refs on each port datum (a
  far-side port resolves onward to ITS parent, breaking the mutual dependence
  of `[a]->[b]`); `arcLarge` reads a port's band group from `portParent` and
  the loop-letter edge matching resolves port endpoints to the parent stock —
  the figure-12 balloons and letter parking survive the indirection.
- Dragging a node pins it: `fx`/`fy` keep the drop point, so hand placement
  holds exactly while the forces lay out everything else; clicking a node
  releases the pin (and clicking a port clears its hand-set `portAngle`). The
  two gestures share d3-drag start/end and are told apart by whether any drag
  movement landed between them.
- A node's name label is **editable in place**: the label `<text>` is
  `pointer-events auto` and tagged `node-label`, so pressing it starts the
  node's own drag (a bigger grab target than a tiny dot), and a no-move click
  on it with NO tool armed opens an inline rename box (`startRename`) — an
  HTML `<input>` floated over the label, seeded with the bare name. Enter
  commits (keeping the box open with a red flag if the name is invalid),
  Escape discards, blur commits a valid change else discards. `renameNode`
  rewrites the source by running the highlighter's `nameSpans` scanner (which
  mirrors the lexer) and replacing every identifier run whose normalized name
  matches — multi-word- and substring-safe, leaving operators, formula
  reserved words, and unrelated text untouched — then dispatches through the
  editor's input path; the token count is unchanged, so parser ids (hence
  node ids and positions) survive. `isValidName` gates the new name: it must
  compile alone to exactly one node with that label and no links (rejecting
  brackets, operators, a bare number) and must not be a formula reserved word
  (`t`/`pi`/`cos`/`sin`/`min`/`max`, which would change meaning inside a
  `: (…)`). With a tool armed the label click routes to the tool instead
  (delete the node, pick a loop member, …), never renaming.
- Dragging empty svg space (not a shape) pans the diagram: the whole canvas
  follows the cursor. The pan is an offset (`panX`/`panY`, viewBox user units)
  on `easeView()`'s auto-fit target center, so it composes with the button
  zoom and rides along as the layout settles; the `1×` reset clears it (and the
  zoom) back to the auto-fit framing. Node/port drags `stopPropagation` on
  pointerdown, so grabbing a shape starts that gesture, never a pan. Pixel
  deltas convert to user units through the live CTM scale, so a grabbed point
  tracks the cursor 1:1 at any zoom; like the buttons it eases toward the new
  target via `ensureViewEase()` rather than writing the viewBox itself, keeping
  `easeView()` the sole viewBox owner. The cursor distinguishes the two
  gestures: the canvas is `grab` (`grabbing` mid-pan, via a `panning` class),
  a shape is `move`.
- A build **palette** overlays the svg's top-left corner (the zoom cluster's
  mirror): one picker per node kind — dot, stock, faucet (placed as the
  minimal single-source-cloud flow `| =>flowN`, a tap fed from a cloud with
  an open output, since a bare `=>f` doesn't parse; wire the output to a
  stock with the flow tool), cloud — and per link kind (info arrow, flow
  pipe), with a hint card narrating the armed tool's next click. Escape,
  re-clicking the picker, or an example load disarms; arming flips the
  canvas cursor to a crosshair (`placing` class). Every placement is a TEXT
  edit: the tool appends its DSL statement (names minted
  `dot1`/`stock1`/`flow1` — digit
  glued, since `stock 1` would lex as name-then-number; checked against both
  graph labels and the raw draft) through the editor's own input-dispatch
  path, then pins the new node at the drop point with the drag gesture's
  own `fx`/`fy` pin (so a later click releases it; fresh anonymous clouds
  are matched to their canvas clicks in parser-id = statement order). Link
  tools run a two-click source→target pick riding `drag()`'s no-move click
  path — picking never unpins (the press-pin is undone unless the node was
  already hand-pinned) — writing bare-name arrow statements (`a -> b`; the
  registry's identity rule resolves any named kind, stocks included) and
  flow spellings that mint a fresh faucet between stocks/canvas clouds
  (`[a] =>flow1 [b]`, `|` for a canvas end) or re-mention an existing
  faucet endpoint (`[a] =>f` adds a source, `[b] <=f` a target;
  faucet↔faucet is rejected — hints double as the error surface). The
  canvas click handler fires only when `event.target` is the svg itself, so
  shape clicks stay with their own gestures; `canvasPan` carries
  `clickDistance(4)` so a jittery click still places.
  Two **loop tools** beside the link tools (circular-arrow icons carrying the
  diagram's R/B letter) mark a feedback loop: each click appends a named node
  to an ordered `loopChain` (only dots/stocks/faucets — clouds/ports are
  rejected), drawn with a distinct violet glow (`loop-glow`, `.loop-pick`),
  and the hint shows the chain building. Closing it — clicking a
  already-picked node, empty canvas, or Enter — writes an
  `R(a -> b -> c)` / `B(...)` annotation in click order (needs ≥2 nodes; the
  implied info arrows dedup against any already drawn, so tracing an existing
  formula/flow path just adds the loop tag). The chain resolves ids→labels
  through `labelById`, survives recompiles (`update()` prunes vanished ids),
  and clears on disarm.
  Two **edit tools** past a second separator act on existing nodes rather
  than adding one, riding the same `drag()` no-move click path. **Select**
  (a dashed-marquee icon) is sticky: each node click toggles the node's id
  in a `selected` set drawn with a glow (a zero-offset blue drop-shadow
  filter, `sel-glow`, applied by `renderSelection` as a `.selected` class on
  the node `<g>`); a canvas click clears the set, and the hint tracks the
  count. The set persists across edits (`update()` prunes vanished ids and
  repaints) and across arming other tools, so you select, then arm delete.
  **Delete** (a trash-can icon) is one-shot: clicking a node removes it, or —
  if the click lands on a member of the standing selection — the whole
  selection, then disarms (deletion is destructive, so no accidental
  repeats; batch-delete is select-then-delete). Removal is **line-based**
  (`deleteNodes`): every source LINE that names a target is dropped, never
  token-surgical (which could leave a half-statement that fails to parse). A
  named node's lines are found by compiling each line ALONE and matching its
  label — multi-word-safe and substring-proof, since the lexer tokenizes
  (`warming discrepancy` survives deleting `discrepancy`); an anonymous cloud
  maps to the `|` at its ordinal (cloud ids run in `|`-token order, so the
  k-th cloud is the k-th `|` across the source); ports carry no text and are
  skipped (they vanish with their stock or arrow). Ports are never
  selectable. The delete tool also removes **links**: a transparent
  wide-stroke twin of every link (`linkHit`, `d` mirrored from the visible
  path in `ticked()`) sits just above the flow pipes but below the nodes, so
  a node click still wins; it is inert (`pointer-events: none`) until the
  delete tool arms (`.delete-armed` CSS), then clickable. The click is
  handled in the svg's own click handler — reading the hit path's datum —
  because a per-path listener gets eaten by the canvas pan drag while the
  bubble-phase svg handler fires reliably. `deleteLink` is the same
  line-based removal keyed on the link's **logical endpoints** (a stock
  resolved through its port) + direction + kind: a flow pipe takes its
  faucet's whole statement (a flow is a unit — a lone pipe can't be spelled),
  an arrow a formula/loop draws takes that statement, and re-mentions delete
  surgically (clicking `[b] =>f`'s pipe drops only that line, not `| =>f
  [a]`). Both tools clear the selection appropriately — delete on success,
  an example load alongside `disarmTool`.

Two sibling modules add the **behavior-over-time chart** (the book's figure 6 to
the diagram's figure 5):

- **`ui/simulate.ts`** — pure, dependency-free (type-only imports, so node can
  run it headlessly; `test/simulate.mjs` does). Forward-Euler in `DT` steps
  over a horizon `simulate` takes as a parameter defaulting to `T_END`
  (the chart's `t =` field passes a custom one): stock `value` = initial level; a `: (expr)` formula is a rate
  law (faucets — clamped at 0, a tap never runs backward) or a computed
  auxiliary (dots), evaluated per step over current levels, dot values,
  and wall-clock time — `t` evaluates to the step's start time, `pi` to
  Math.PI, cos/sin/min/max to their Math counterparts —
  (memoized per step; non-finite arithmetic like division by zero reads as
  0); a formula faucet overrides the goal/factor heuristics. Every
  annotated quantity
  is read through the exported `annotFn` — a schedule's steps hold
  piecewise-constant
  (`value` from t=0, overridden by each entry from its `at` time on; both
  default 0; genuine discrete events), sampled at each step's start, while
  a CLOSED formula (referencing no nodes) evaluates as the curve it
  writes, via `evalClosed` — whose analytic shift (input read at
  `t − max(1, round(T/DT))·DT`, clamped at the t=0 priming read) matches
  the engine's ring buffer exactly, so goals, factors, and the chart's
  goal paths can never disagree with the run. Faucet
  source/sink stocks come from flow-link direction, clouds/dots infinite.
  Info-arrow endpoints resolve through ports to their parent stock before any
  walk (`faucetWiring`), so the compiler's port indirection is invisible to
  the semantics — the level→faucet arrow closing an R loop still reaches the
  stock.
  Each synchronous step rations a stock's outflows by what it holds
  (`min(1, level/demand)`), so levels never go negative and chained stocks
  conserve — an empty tub stops draining. A faucet turns **goal-seeking**
  (figures 10 & 11) when the info arrows into it, walked back through
  relay dots (`discrepancy` — value-less, or carrying a REF-BEARING
  formula: computed auxiliaries pass the walk through), reach exactly one
  VALUED dot — one carrying a constant, a schedule, or a closed formula
  (`closedExpr`): that
  reading is its goal — fixed, scheduled, or a curve (figure 19's cosine
  cold-day `outside temperature`), sampled at each step's start like every
  rate — and the faucet's own value becomes a *gain* —
  `rate = gain × (level − goal)` draining / `× (goal − level)` filling,
  clamped at 0 and capped at `1/DT` so a hot gain lands on the goal instead
  of oscillating; exponential approach from either side. A *bare* faucet (no
  annotation of its own) in the same one-valued-dot web instead turns
  **reinforcing** (figures 12 & 13) when the walk also reaches the faucet's
  own attached stock — the drawn level→faucet arrow closing the R loop: the
  dot's reading is a *factor* on the level, `rate = factor × level` —
  compound
  interest filling, exponential decay draining (figures 21 & 24/26: the
  fertility ramps are closed-formula factors); without the drawn feedback a
  bare faucet stays a closed tap. Ambiguous webs (two
  constants) or stocks on both sides fall back to the constant-rate reading.
  `goalRefs` exports the dots serving as goals for the chart's dashed
  reference rules — a schedule goal carries its `steps`, a formula goal its
  curve sampler `fn` (factor constants are not goals and draw no rule).
  **Time shifts** (figures 31–35) carry per-run state keyed by owner node +
  tree position: `x(t - T)` is a ring-buffer pipeline of
  `max(1, round(T/DT))` samples (T rounds to whole steps). A shift's value
  at evaluation time is its START-of-step state
  (never a recursion into its input — that's what makes loops through
  shifts legal); states advance once per step, after rates and rations are
  known but before levels move, gathering every input first so chained
  shifts see pre-update upstream state. A faucet reference in a shift's
  input reads the flow's APPLIED (post-ration) rate; at t=0 every shift
  primes to its input's value right then (faucets at their raw clamped
  rate, circular primings reading 0) — so an equilibrium model holds
  exactly. Exponential smoothing is deliberately NOT an engine feature:
  perception reads use the pipeline delay itself (the dealership's
  `perceived sales: (sales(t - perception delay))`, the fishery's
  `harvest(t - 0.1)`), keeping every diagram at the book figure's exact
  node census.
  `flowSeries` re-runs the engine and returns the figure-33 view
  (each shift's input, solid, and owner, dashed, sampled per step plus one
  closing sample — aligned with the stock series); `hasDelays` is the
  cheap static gate the chart's flows toggle keys on.
- **`ui/chart.ts`** — the panel at the bottom of the left-hand column (its
  `order` 9 sorts after the buttons/editor's 2 and the error panel's 3). One 2px line per stock, its end label in the
  line's own accent, recessive axes, rendered once per `update()` (never per tick).
  Goal constants draw as dashed horizontal rules under the series lines
  (the book's "room temperature = 18°C") in their goal DOT's accent — the
  same color the dot wears in the editor and diagram — labeled in the right
  margin in that accent too; a
  SCHEDULED goal draws as a dashed stepped path instead, and a FORMULA
  goal as a smooth dashed curve sampled once per DT from its `GoalRef.fn`
  (figure 19's cosine cold day) — in both cases exactly the reading the
  run
  integrated; its label anchors at its final value/sample, and the
  y-domain follows
  goal values below zero, sampled curves included (stock levels themselves
  never go negative); all
  right-margin labels dodge vertically to a 12px rhythm so figure 11's
  curves converging on one goal stay individually named. A
  hover layer snaps a crosshair to the nearest sample and shows one tooltip
  reading out every stock's level (keyboard parity: the svg is focusable,
  ←/→ steps a sample, Shift ×10, Escape dismisses); it reads the last
  render's scales/rows from closure state, so the render-once rule holds.
  A **flows toggle** (a checkbox beside the `t =` field, shown only when
  `hasDelays`) overlays the figure-33 view: `flowSeries`' thin 1.25px
  lines — each delay call's input solid, its output dashed ("5 3", shorter
  than the goals' dash) — in the nodes' own accents, joining the y-domain
  (an order backlog may dip below zero), the label dodge, and the hover
  rows. Off by default so figures 32/34/35/36 plot the bare stock line; an
  example entry may carry `flows: true` (`loadExample` resets the toggle
  to each button's declared flag, so every button lands on its figure's
  view — "figure 31 & 33" is "figure 31 & 32"'s model preset to the flow
  view; the `t =` horizon, by contrast, survives loads).
  `STOCK_PALETTE` is the base palette for the per-node accent assignment
  described on the `update()` bullet (fixed-order, assigned by slot, never
  cycled, clamped by `textAccent` before any view uses it). The
  chart panel is always visible: whenever the model carries no `value`s it
  clears to an empty frame — the time axis, a unit-less y (tick marks, no
  numbers), nothing plotted (the accents stay on in the editor and diagram;
  numbers gate only the plot). A `t =` number
  field footers the panel (`.horizon`, flex order 10, built in `app.ts`): it
  sets the simulated horizon — default `T_END` (10), clamped to 1–1000, live
  per keystroke, snapped to the effective value on blur — and re-runs the
  chart alone through `refreshChart()`/`lastChart` (the diagram never updates
  on a horizon change; loading an example keeps the chosen horizon). `render`
  and `empty` take the horizon as a trailing parameter defaulting to `T_END`.

`update()` clears `group`/`loop`/`value`/`steps` on recycled nodes before
merging new data (the JSON omits absent `Maybe` keys, so stale values would
otherwise survive edits). `displayLabel` renders a schedule in full
(`inflow: 0 @5: 5`) and formulas in the source spelling
(`orders to factory(t - delivery delay)`, `2x^2`,
`outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10))` — `t`, `pi`,
and calls print as written).

`ui/type.ts` defines the d3-flavored `Node`/`Link`/`System` types (extending
`d3.SimulationNodeDatum` / `SimulationLinkDatum`). `ui/declarations.d.ts` lets `*.svg`
imports resolve to a URL string.

Node ids are **strings** everywhere (`"dot#3"` from the backend). The d3 force link uses
`.id(d => d.id)` to match links to nodes, so keep node ids and link `source`/`target`
endpoints as consistent strings when touching either side.
