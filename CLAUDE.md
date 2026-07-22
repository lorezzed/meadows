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

Note: `package.json` mentions `parcel` and the ambient `ui/declarations.d.ts` comment
references Parcel, but the actual bundler in use is **esbuild** (via `make dev`).

Careful: `make dev`'s esbuild flags (`--outdir=./ui` + `--servedir`) are safe only
because serve mode builds in memory and writes nothing. Never run the same command
as a one-shot **without** `--servedir` — it writes the bundle to `ui/index.js`,
clobbering the checked-in one-line entrypoint. For a throwaway bundle, point
`--outdir` somewhere disposable (e.g. a tmp dir).

## Common commands

```bash
make shell        # enter the nix dev shell (purs, spago, node, esbuild)
make dev          # esbuild dev server: bundles ui/index.js, watches, serves ./ui
                  #   (loads .svg as dataurl); open the served ui/index.html
make run          # CLI entrypoint (src/CLI.purs) with no input: prints usage
make run-with "a->b"     # compile a DSL string, print its graph JSON
make run-with in="a=>j"  # in= form REQUIRED when the input contains '='
                  #   (make parses a bare "a=>j" goal as a variable override)
make test         # spago test (PureScript unit suite) + golden battery
                  #   (test/golden.mjs: byte-exact graph JSON + positioned errors)
                  #   + headless simulator checks (test/simulate.mjs runs
                  #   ui/simulate.ts directly via node's TS type stripping).
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
end-to-end JSON seam byte-exactly, and `test/simulate.mjs` checks the frontend
simulator against the real compiled backend.

### Build coupling (important)

`ui/app.ts` imports the **compiled** backend from `output/Main/index`. That directory is
produced by `spago build`. If you change anything in `src/*.purs`, you must run
`spago build` to regenerate `output/` before `make dev` will pick up the new behavior.
Editing `.purs` alone and refreshing the browser will silently run stale code.

## Backend architecture (`src/`)

A classic three-stage pipeline, orchestrated by `go` in `Main.purs`
(`tokenize >=> parse >=> evaluate`, each stage short-circuiting on `Either` error into a
JSON error string):

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
   - `:` → `TokColon`, `@` → `TokAt`, `~` → `TokTilde`, `+` `-` `*` `/` →
     formula operators (`TokPlus`/`TokMinus`/`TokStar`/`TokSlash`; a `-`
     directly followed by digits is a signed literal instead), and number
     literals → `TokNumber`
     (digits with an optional `.digits` fraction and an optional leading `-`
     sign; no exponent — together they form value annotations like
     `[tub: 50]` and schedules like `=>inflow: 0 @5: 5` or figure 19's
     `outside temperature: 10 @4.5: -5 ...`). Operators lex before numbers,
     so `->` is never mistaken for a sign; a digit *inside* a word stays
     part of the identifier (`a2` is one name); `5.` is a tokenization
     error

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
   (`NAME (':' NUMBER (MARKER NUMBER ':' NUMBER)*)?` where MARKER is `@` or
   `~`; e.g. `inflow: 0 @5: 5` = closed until t=5 then 5, or a single `: N`
   constant like `room temperature: 18`) **or a parenthesized formula**
   (`: (expr)` — `+ - * /` with the usual precedence, implicit
   multiplication by juxtaposition with a name or group (`2x`, `2(a + b)`;
   note multi-word joining makes `output fraction` ONE name — write
   `output * fraction` to multiply), references to other nodes by name, a
   `Formula` AST with per-reference minted ids), carried as
   `Maybe Annot = Maybe (SchedAnnot Sched | FormulaAnnot Formula)` with
   `Sched = { initial, steps :: Array { at, value }, smooth :: Boolean }`
   on `Faucet*Expr` and `NodeExpr` — a scheduled dot is a *driving variable*
   (figure 19's cold-day `outside temperature`). `@` steps hold
   piecewise-constant; `~` steps mark the schedule smooth (interpolated).
   One schedule uses one marker — the first step decides, and a step with
   the other marker is a positioned error. A value anywhere else
   (`[a]: 5`, a bare `5`, a schedule on a stock) is a positioned parse
   error, and
   `valueTail`/`schedTail` consume nothing when no `:` follows, so id-minting
   order for value-less input is untouched. Its one custom primitive, `satisfyMap`, keeps the parser position
   on the *next unconsumed* token so `<?>` labels and `eof` report exact locations —
   the library's own `Parsing.Token` primitives leave the position on the consumed
   token, so don't swap them back in. The grammar uses no `try`: alternatives dispatch
   on disjoint first tokens. **Every AST node gets a unique integer `Id`** minted by
   the `fresh` counter (ParserT's `MonadState` passes through to the base `State Id`) —
   this identity is what later lets repeated mentions of the same name collapse to one
   graph node, and the minting *order* is pinned byte-exactly by `test/golden.mjs`.
   Failures are positioned errors; the parser never fabricates nodes. The `Tree` ADT
   is the AST.

3. **`Evaluator.purs`** — `evaluate :: List Tree -> Graph`. Walks each `Tree` in a `State`
   monad (`EvalState`), emitting nodes and links as side effects. Key identity rule:
   - **Named nodes** (dots, stocks, faucets) go through `resolveNamed`, which uses a
     `registry :: Map name -> id`. The *first* occurrence of a name mints an id; later
     occurrences reuse it. This is why writing a name twice references the same node.
   - **Clouds** go through `freshAnon` — always a fresh id, never registered, so they
     never coalesce.
   - Ids are opaque (`"dot#3"`, `"stock#5"`, …) built from the node type prefix + parser
     `Id`, never from source text. Links reference these ids, i.e. identity not spelling.
   - **Loop annotations** are transparent to evaluation: `LoopExpr`'s inner
     expression emits its nodes/links as if unwrapped, then every node it mentions
     (collected by the `memberIds` walk, run *after* evaluation so lookups are
     idempotent) is tagged in `loopTags` with a generated name — the kind's letter
     plus one source-order counter (`"R0"`, `"B1"`, …, like group numbering).
   - `<-` links each hop from the *nearest* term of its right subtree
     (`leftmostId`, same as the faucets), so `a<-b->c` fans out from `b`.
   - **Value annotations** land in `Node.value`/`Node.steps` via `setValue`
     (stocks) and `setAnnot` (faucets and dots — schedules through
     `setSched`, formulas through `setFormula`): the *first explicit*
     annotation for a
     name wins — value-less mentions never erase, later annotations never
     overwrite, and a schedule wins *as a unit* (value + steps + smooth flag
     together; `smooth: true` serializes only for `~` schedules; a formula
     counts as the annotation too — value vs formula, whichever came first).
     **Formulas** resolve their references through the registry (minting
     dots for unseen names), must land on stocks or dots (a faucet
     reference is a model error), serialize as a resolved `expr` tree
     (`{kind: "num"|"ref"|"+"|"-"|"*"|"/"}` with ids, `RFormula`), and
     auto-draw the info arrow each reference implies (deduplicated against
     identical arrows already drawn — so `R(...)` annotations and formulas
     compose without doubled arcs). Formula-through-formula cycles
     (`a: (b)` + `b: (a)`) are rejected after evaluation; `evaluate` is now
     `Either String Graph` and `Main.go` prefixes those as "Model error:". Semantically a stock's value is its initial level; a dot's is
     an auxiliary constant or, with steps, a piecewise driving variable
     (a goal-seeking faucet's goal, fixed or moving); a faucet's
     value is its initial rate, overridden from each step's `at` time onward.
     The compiler just carries the numbers.

   Output types: `Node = { type, id, label, value :: Maybe Number, steps :: Maybe (Array { at, value }), smooth :: Maybe Boolean, expr :: Maybe RFormula, group :: Maybe Int, loop :: Maybe (Array String) }`
   (`Maybe` fields omit their JSON key on `Nothing` — goldens rely on that),
   `Link = { type, source, target }`, `Graph = { nodes, links }`. `NodeType`
   (`Dot`/`Stock`/`Faucet`/`Cloud`) has a `WriteForeign` instance so the whole
   graph serializes to the JSON the UI expects.

`Main` exports only `go`. The terminal runner is `src/CLI.purs` (argv → `go` → stdout),
kept out of `Main` so the browser bundle never pulls in node-process.

## Frontend architecture (`ui/`)

`ui/index.js` is a one-line entrypoint that imports `app.ts`; `index.html` loads
`index.js`. Almost everything lives in **`app.ts`**:

- Builds the DOM (a `<pre>` output panel, example buttons, an `<svg>`, and a
  `<textarea>`) entirely via d3 `.append`, using flexbox `order` for layout.
- On textarea `input`: calls `interpreter.go(input)` and `JSON.parse`s the result. A
  *string* result is a compile error: it renders red in the `<pre>` and `update()` is
  skipped (the last good graph stays). Otherwise the `System` is pretty-printed into
  the `<pre>` and passed to `update(system)`.
- `update()` does the d3 data-join per node type (dots→`circle`, stocks→`rect`,
  faucets/clouds→`image` with inlined SVGs from `ui/shape/`), rebinds the link
  force, and restarts the simulation. (There is deliberately no `forceCenter`:
  it would translate the whole graph to keep the node MEAN centered, fighting
  the band pins and forbidding the aux web from hanging below a lone band —
  floaters instead rest at `floatY`, one row below a single band.) It also groups nodes by their `loop`
  names into one floating letter (`<text>`) per annotation — a pure overlay that
  never enters `simulation.nodes()`. Node text renders via `displayLabel`: the
  name plus `: value` when the node carries one (`water in tub: 50`) — display
  only, also used by the slot-width and viewBox-pad estimates; ids, the name
  registry, the JSON `label`, and the chart's labels all stay the bare name.
- `ticked()` positions everything each frame; links are drawn as curved SVG arc
  paths. An info arc between two members of the SAME band (a stock arrowing
  into its own faucet — the figure 12 / figure 42 feedback loops) draws as the
  MAJOR arc (`arcLarge`; `trimArc`/`arcBulge` take the large flag), ballooning
  away from the pipe instead of hugging it; the auto-fit viewBox unions those
  bulge apexes so an outer band's balloon never clips. Each loop letter parks
  at the mean of its loop's drawn boundary — member-to-member pipe midpoints
  plus info-arc bulge apexes — which sits inside the enclosed region even
  when a wide stock rect would pull the plain member centroid onto its own
  body; a loop with no member-to-member links falls back to the centroid.
- Clicking empty svg space adds a dot node linked from the previous node (a manual
  editing affordance separate from the DSL path).

Two sibling modules add the **behavior-over-time chart** (the book's figure 6 to
the diagram's figure 5):

- **`ui/simulate.ts`** — pure, dependency-free (type-only imports, so node can
  run it headlessly; `test/simulate.mjs` does). Forward-Euler over `T_END`/`DT`
  constants: stock `value` = initial level; a `: (expr)` formula is a rate
  law (faucets — clamped at 0, a tap never runs backward) or a computed
  auxiliary (dots), evaluated per step over current levels and dot values
  (memoized per step; non-finite arithmetic like division by zero reads as
  0); a formula faucet overrides the goal/factor heuristics. Every schedule
  is read through the exported `scheduleFn` — `@` steps hold piecewise-constant (`value`
  from t=0, overridden by each entry from its `at` time on; both default
  0), `~` steps interpolate a monotone cubic (Fritsch–Carlson, exact at the
  points, no overshoot, flat outside them) — sampled at each step's start. Faucet
  source/sink stocks come from flow-link direction, clouds/dots infinite.
  Each synchronous step rations a stock's outflows by what it holds
  (`min(1, level/demand)`), so levels never go negative and chained stocks
  conserve — an empty tub stops draining. A faucet turns **goal-seeking**
  (figures 10 & 11) when the info arrows into it, walked back through
  value-less relay dots (`discrepancy`), reach exactly one valued dot: that
  constant is its goal — itself possibly scheduled (figure 19's cold-day
  `outside temperature`), sampled piecewise at each step's start like every
  rate — and the schedule value becomes a *gain* —
  `rate = gain × (level − goal)` draining / `× (goal − level)` filling,
  clamped at 0 and capped at `1/DT` so a hot gain lands on the goal instead
  of oscillating; exponential approach from either side. A *bare* faucet (no
  annotation of its own) in the same one-valued-dot web instead turns
  **reinforcing** (figures 12 & 13) when the walk also reaches the faucet's
  own attached stock — the drawn level→faucet arrow closing the R loop: the
  constant is a *factor* on the level, `rate = factor × level` — compound
  interest filling, exponential decay draining; without the drawn feedback a
  bare faucet stays a closed tap. Ambiguous webs (two
  constants) or stocks on both sides fall back to the constant-rate reading.
  `goalRefs` exports the constants serving as goals for the chart's dashed
  reference rules (factor constants are not goals and draw no rule).
- **`ui/chart.ts`** — the panel below the diagram (equal flex `order` 1;
  DOM-insertion order places it). One 2px line per stock with an ink label at
  its end, recessive axes, rendered once per `update()` (never per tick).
  Goal constants draw as dashed horizontal rules under the series lines
  (the book's "room temperature = 18°C"), labeled in the right margin — a
  SCHEDULED goal draws as a dashed path instead (figure 19's cold day):
  stepped for `@`, and for `~` a per-DT sampling of the simulator's own
  `scheduleFn` interpolant, so the chart shows exactly the curve the run
  integrated; its label anchors at its final value, and the y-domain follows
  goal values below zero (stock levels themselves never go negative); all
  right-margin labels dodge vertically to a 12px rhythm so figure 11's
  curves converging on one goal stay individually named. A
  hover layer snaps a crosshair to the nearest sample and shows one tooltip
  reading out every stock's level (keyboard parity: the svg is focusable,
  ←/→ steps a sample, Shift ×10, Escape dismisses); it reads the last
  render's scales/series from closure state, so the render-once rule holds.
  `STOCK_PALETTE` is a fixed-order categorical palette assigned by stock
  parser-id slot (never cycled); `update()` paints the same accent on each
  stock's rect stroke, which is the visible link between the two views. The
  chart is hidden (and rect strokes stay black) whenever the model carries no
  `value`s — value-less inputs look exactly as they did before the feature.

`update()` clears `group`/`loop`/`value`/`steps` on recycled nodes before
merging new data (the JSON omits absent `Maybe` keys, so stale values would
otherwise survive edits). `displayLabel` renders a schedule in full
(`inflow: 0 @5: 5`).

`ui/type.ts` defines the d3-flavored `Node`/`Link`/`System` types (extending
`d3.SimulationNodeDatum` / `SimulationLinkDatum`). `ui/declarations.d.ts` lets `*.svg`
imports resolve to a URL string.

Node ids are **strings** everywhere (`"dot#3"` from the backend; the click handler's
manually-added nodes stringify their counter). The d3 force link uses `.id(d => d.id)` to
match links to nodes, so keep node ids and link `source`/`target` endpoints as consistent
strings when touching either side.
