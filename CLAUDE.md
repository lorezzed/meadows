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
make run          # spago run — compiles src/ and runs Main entrypoint
make run-with "a->b"   # spago run passing the quoted DSL string as an arg

# Inside `nix develop` (or `make shell`) you also have the raw tools:
spago build       # compile src/ -> output/  (REQUIRED before the UI sees backend changes)
spago test        # run test/Main.purs (currently a stub — no real tests yet)
spago repl        # PureScript REPL
npx tsc           # typecheck ui/ (tsconfig has noEmit; type-check only)
```

There is no single test-runner story yet; `test/Main.purs` is a placeholder.

### Build coupling (important)

`ui/app.ts` imports the **compiled** backend from `output/Main/index`. That directory is
produced by `spago build`. If you change anything in `src/*.purs`, you must run
`spago build` to regenerate `output/` before `make dev` will pick up the new behavior.
Editing `.purs` alone and refreshing the browser will silently run stale code.

## Backend architecture (`src/`)

A classic three-stage pipeline, orchestrated by `go` in `Main.purs`
(`tokenize >=> parse >=> evaluate`, each stage short-circuiting on `Either` error into a
JSON error string):

1. **`Lexer.purs`** — `tokenize :: String -> Either String (List Token)`, built on the
   `purescript-parsing` combinator library. Recognizes the DSL operators. The lexeme →
   token mapping is the DSL's surface syntax:
   - identifiers → `TokIdent` (become **dot** nodes)
   - `->` / `<-` → arrows (`ArrowR` / `ArrowL`)
   - `[` `]` → stock brackets (a `[name]` is a **stock** node)
   - `=>` / `<=` → faucets (`FaucetR` / `FaucetL`)
   - `|` → cloud (`TokCloud`)

2. **`Parser.purs`** — `parse :: List Token -> Either String Tree`. A hand-written
   recursive-descent parser (`expression`/`term`/`factor`) running in a
   `State Id` monad. **Every AST node gets a unique integer `Id`** minted by the `fresh`
   counter — this identity is what later lets repeated mentions of the same name collapse
   to one graph node. The `Tree` ADT is the AST.

3. **`Evaluator.purs`** — `evaluate :: Tree -> Graph`. Walks the `Tree` in a `State`
   monad (`EvalState`), emitting nodes and links as side effects. Key identity rule:
   - **Named nodes** (dots, stocks, faucets) go through `resolveNamed`, which uses a
     `registry :: Map name -> id`. The *first* occurrence of a name mints an id; later
     occurrences reuse it. This is why writing a name twice references the same node.
   - **Clouds** go through `freshAnon` — always a fresh id, never registered, so they
     never coalesce.
   - Ids are opaque (`"dot#3"`, `"stock#5"`, …) built from the node type prefix + parser
     `Id`, never from source text. Links reference these ids, i.e. identity not spelling.

   Output types: `Node = { type, id, label }`, `Link = { type, source, target }`,
   `Graph = { nodes, links }`. `NodeType` (`Dot`/`Stock`/`Faucet`/`Cloud`) has a
   `WriteForeign` instance so the whole graph serializes to the JSON the UI expects.

## Frontend architecture (`ui/`)

`ui/index.js` is a one-line entrypoint that imports `app.ts`; `index.html` loads
`index.js`. Almost everything lives in **`app.ts`**:

- Builds the DOM (a `<pre>` output panel, example buttons, an `<svg>`, and a
  `<textarea>`) entirely via d3 `.append`, using flexbox `order` for layout.
- On textarea `input`: calls `interpreter.go(input)`, `JSON.parse`s the result into a
  `System`, pretty-prints it into the `<pre>`, and calls `update(system)`.
- `update()` does the d3 data-join per node type (dots→`circle`, stocks→`rect`,
  faucets/clouds→`image` with inlined SVGs from `ui/shape/`), rebinds the link/charge/
  center forces, and restarts the simulation.
- `ticked()` positions everything each frame; links are drawn as curved SVG arc paths.
- Clicking empty svg space adds a dot node linked from the previous node (a manual
  editing affordance separate from the DSL path).

`ui/type.ts` defines the d3-flavored `Node`/`Link`/`System` types (extending
`d3.SimulationNodeDatum` / `SimulationLinkDatum`). `ui/declarations.d.ts` lets `*.svg`
imports resolve to a URL string.

Node ids are **strings** everywhere (`"dot#3"` from the backend; the click handler's
manually-added nodes stringify their counter). The d3 force link uses `.id(d => d.id)` to
match links to nodes, so keep node ids and link `source`/`target` endpoints as consistent
strings when touching either side.
