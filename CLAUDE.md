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
                  #   (test/golden.mjs: byte-exact graph JSON + positioned errors).
                  #   Refresh goldens after an INTENDED change: node test/golden.mjs --capture

# Inside `nix develop` (or `make shell`) you also have the raw tools:
spago build       # compile src/ -> output/  (REQUIRED before the UI sees backend changes)
spago test        # PureScript unit suite: tokens & positions, Tree shapes, evaluator rules
spago repl        # PureScript REPL
npx tsc           # typecheck ui/ (tsconfig has noEmit; type-check only)
```

Tests live in two layers, both run by `make test`: `test/Main.purs` unit-tests the
compiler internals (token streams & positions, exact `Tree` shapes including minted
ids, evaluator identity/link/group rules), and `test/golden.mjs` pins the end-to-end
JSON seam byte-exactly.

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

2. **`Parser.purs`** — `parse :: List PosToken -> Either String (List Tree)`, one `Tree`
   per newline-separated statement. A combinator parser over the token stream:
   `ParserT (List PosToken) (State Id)` with productions `program`/`statement`/
   `expression`/`exprTail`/`term`. A statement is a loop annotation (`R(expr)` /
   `B(expr)` → `LoopExpr`, minting before its body like `ParenExpr`) or a bare
   expression; loops are whole statements only, never terms (`a->R(b)` and
   `R(a)->b` are positioned errors). Its one custom primitive, `satisfyMap`, keeps the parser position
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

   Output types: `Node = { type, id, label, group :: Maybe Int, loop :: Maybe (Array String) }`
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
  faucets/clouds→`image` with inlined SVGs from `ui/shape/`), rebinds the link/charge/
  center forces, and restarts the simulation. It also groups nodes by their `loop`
  names into one floating letter (`<text>`) per annotation — a pure overlay that
  never enters `simulation.nodes()`.
- `ticked()` positions everything each frame; links are drawn as curved SVG arc
  paths, and each loop letter parks at the centroid of its member nodes.
- Clicking empty svg space adds a dot node linked from the previous node (a manual
  editing affordance separate from the DSL path).

`ui/type.ts` defines the d3-flavored `Node`/`Link`/`System` types (extending
`d3.SimulationNodeDatum` / `SimulationLinkDatum`). `ui/declarations.d.ts` lets `*.svg`
imports resolve to a URL string.

Node ids are **strings** everywhere (`"dot#3"` from the backend; the click handler's
manually-added nodes stringify their counter). The d3 force link uses `.id(d => d.id)` to
match links to nodes, so keep node ids and link `source`/`target` endpoints as consistent
strings when touching either side.
