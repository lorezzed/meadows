# Meadows

**[Try it in your browser →](https://lorezzed.github.io/meadows/)**

A tiny text language for **stock-and-flow diagrams** — the system-dynamics notation
of Donella Meadows' *Thinking in Systems* — with an interactive playground that
draws the model as a live force-directed diagram and simulates its behavior over
time.

You type a model:

```text
| =>inflow [water in tub: 50] =>outflow: 5 |
```

Meadows compiles it into a graph (stocks as boxes, flows as faucets on pipes,
clouds for whatever lies outside the model boundary, thin curved arcs for
information links), lays it out with d3 forces, and — when the model carries
numbers — integrates it and plots each stock's trajectory in a chart, complete
with dashed goal lines. The built-in example buttons reproduce the book's
figures, from the first bathtub through the thermostat, population, dealership,
and fishery models of chapters 1–5.

Under the hood it is two halves: a **PureScript compiler** (`src/`) that turns
source text into graph JSON, and a **TypeScript + d3 frontend** (`ui/`) that
renders and simulates the compiled graph.

## Quick start

The toolchain (purs, spago, node 22, esbuild) is pinned by a Nix flake; every
`make` target wraps `nix develop`, so you only need Nix with flakes enabled.

```bash
make dev          # bundle, watch, and serve the playground (open http://localhost:8000)
make test         # full test battery: unit suite, goldens, headless frontend checks
make run-with "a->b"          # CLI: compile a DSL string, print its graph JSON
make run-with in="[a]=>f[b]"  # in= form REQUIRED when the input contains '='
make shell        # drop into the dev shell (purs, spago, node, esbuild)
```

If you edit the compiler (`src/*.purs`), run `make build` (i.e. `spago build`) —
the frontend imports the *compiled* backend from `output/`, so a browser refresh
alone will silently run stale code.

## The language

A model is a sequence of statements, one per line (blank lines are ignored).
Each statement is a chain of nodes joined by arrows.

| You write | You get |
|---|---|
| `name` | a **dot** — an auxiliary variable |
| `[name]` | a **stock** — an accumulation, drawn as a box |
| `[name: 50]` | a stock with initial level 50 |
| `\|` | a **cloud** — a boundless source/sink outside the model boundary |
| `=>name`, `<=name` | a **flow** through a valve (**faucet**), in the arrow's direction |
| `->`, `<-` | an **information arrow** (who reads whom) |
| `R(...)`, `B(...)` | a reinforcing / balancing **loop label** over everything inside |
| `name: 5` | a value — initial rate for a faucet, constant for a dot |
| `name: 0 @5: 3` | a **schedule** — 0 until t=5, then 3 |
| `name: (expr)` | a **formula** — a rate law or computed auxiliary |

### Names and identity

Names are plain words, and adjacent words join: `water in tub` is one name
(whitespace is normalized, so `water   in   tub` is the same name). A word
starts with a letter and may continue with letters, digits, or underscores
(`a2` is one name); a *leading* digit starts a number instead, and no other
punctuation — apostrophes included — belongs to a name.

**Identity is by name.** The first mention of a name creates its node; every
later mention — anywhere in the model — refers to that same node. This is the
whole mechanism for building webs: draw a stock on one line, then arrow into it
from three other lines. Clouds are the exception: every `|` is its own
anonymous cloud, and they never merge.

### Stocks, flows, clouds

Flows read in the direction of their arrow. The canonical bathtub:

```text
| =>inflow [water in tub] =>outflow |
```

water flows from a cloud through the `inflow` faucet into the stock, and out
through `outflow` to another cloud. `<=` is the mirrored form (flow runs right
to left). A stock can take any number of flows across statements:

```text
| =>rain [water in reservoir] =>evaporation |
| =>river inflow [water in reservoir] =>discharge |
```

Both lines name the same stock, so the reservoir ends up with two inflows and
two outflows.

### Information arrows

`->` and `<-` draw the thin curved arcs that carry *information* — what a
decision point can see. Chains hop node to node, and `a <- b -> c` fans both
arrows out of `b`:

```text
[stock2] =>outflow |
stock2 -> outflow
desired inventory -> discrepancy
profit <- price <- yield per unit capital -> extraction
```

The first two lines are the book's figure 8: a stock whose drain reads its own
level. Note that the arrow says `stock2`, not `[stock2]` — brackets *declare*
the stock, and every later mention is just its name.

In the drawn diagram an information arrow never touches a stock's body
directly: it lands on a small **port** circle pinned to the stock's edge (you
can drag a port along the boundary to taste).

### Loop labels

`R(...)` and `B(...)` mark reinforcing and balancing feedback loops. Every node
mentioned inside the parentheses is tagged as a member, and the diagram floats
a single `R` or `B` letter at the loop's center. Labels are purely
descriptive — evaluation and simulation are unchanged by them.

```text
[coffee temperature] =>cooling |
B(coffee temperature -> discrepancy -> cooling)
room temperature -> discrepancy
```

A loop may open a statement and be continued by arrows (`B(...) <- thermostat
setting` — the tail's nodes are *not* loop members), but a loop is never an
interior term: `a->R(b)` is a parse error. The lexeme is exactly uppercase
`R(` / `B(` — a bare `R`, or `Rx(`, is just an ordinary name.

### Values

Numbers attach in exactly three places — a stock's brackets, a faucet's name,
a dot's name:

```text
[water in tub: 50]        stock: initial level
=>outflow: 5              faucet: rate (per time unit)
room temperature: 18      dot: a constant
```

A number anywhere else (`[a]: 5`, a bare `5` in a chain) is a positioned parse
error. Literals are plain decimals with an optional sign — `3`, `0.25`, `-2`;
`5.` and exponent notation don't lex.

The **first** explicit annotation for a name wins: later annotations are
ignored, and value-less mentions never erase an earlier value. (A schedule or
formula counts as the annotation, as a unit.)

### Schedules

A faucet or dot value may step at fixed times: `initial`, then `@time: value`
pairs, each holding until the next — piecewise-constant.

```text
| =>inflow: 0 @5: 5 [water in tub: 50] =>outflow: 5 |
| =>espresso: 0 @1: 240 @1.5: 0 @6: 240 @6.5: 0 [caffeine in blood: 0] =>metabolism |
metabolism: (0.14 caffeine in blood)
```

The first is the book's figure 7 (the tap opens at t=5); the second is two
espresso shots as pulses, draining against a proportional decay (a formula —
see below), so the afternoon shot stacks on the morning's residue. Without
that drain line `metabolism` would be a *bare* faucet — a closed tap — and the
caffeine would only ever climb.

Schedules model *genuine discrete events* — a valve opening, a dose. A
smoothly changing quantity should be written as a formula of `t` instead.

### Formulas

`name: (expr)` attaches an expression. On a **faucet** it is a rate law; on a
**dot** it makes a computed auxiliary (or, if it references no other nodes, a
driving curve). Since names are identity, you can annotate on a separate line
from where the node first appeared:

```text
[susceptible: 990] =>infection [infected: 10]
infection: (0.001 susceptible * infected)
```

Inside the parentheses:

- **Operators** `+ - * / ^` with the usual precedence; `^` binds tightest and
  is right-associative (`x^2y` is `(x²)·y`, `2x^2` is `2·(x²)`).
- **Juxtaposition multiplies**: `2x`, `14 capital`, `2(a + b)`. But two *names*
  side by side join into one name — `output fraction` is a single name, and so
  is `pi t`; write `output * fraction` and `pi * t` to multiply.
- **References** to other nodes by name read their current value. Each
  reference automatically draws the information arrow it implies (deduplicated
  against arrows you drew by hand, so formulas and `R(...)` annotations compose
  without doubled arcs). References must be stocks or dots — reading a faucet
  is a model error, *except* through a time shift (below).
- **Reserved words**, reserved only inside formulas: the time variable `t`,
  the constant `pi`, and the functions `cos(x)`, `sin(x)`, `min(a, b)`,
  `max(a, b)` (the comma is legal nowhere else). A reserved function name
  opens a call exactly when a `(` follows; a bare `cos` is an ordinary node
  reference. Outside formulas all six are ordinary names — `t -> b` names a
  node called `t`.
- A formula that references no nodes is **closed** — pure mathematics of `t` —
  and acts as a driving variable, like the book's cold-day outside temperature:

```text
outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10))
fertility: (max(0.09, 0.21 - 0.06 * t))
```

Formulas may read each other (computed auxiliaries chain), but a cycle of
formulas (`a: (b)` with `b: (a)`) is rejected as a model error. To close a
feedback loop through equations, route it through a time shift — that's what
delays are for.

### Time shifts (delays)

`x(t - T)` is the value `x` had exactly `T` ago — a pipeline delay:

```text
perceived sales: (sales(t - perception delay))
deliveries: (orders to factory(t - delivery delay))
breeding: (price(t - 2))
```

Rules of the form:

- The shift opens on the exact token pair `(t` after a name, group, or call —
  so `x(a + b)` stays juxtaposed multiplication.
- The shift time is **one multiplicative term**: `x(t - 3 - d)` is an error;
  write `x(t - (3 + d))`.
- `x(t)` is just `x`; shifts chain left to right (`x(t - 2)(t - 3)` delays the
  delayed signal).
- A shift's *input* may be a faucet — reading a flow's rate through a delay is
  legal (the dealership's `orders to factory(t - delivery delay)`), though the
  shift's *time* still can't be.
- Shifts mint no nodes, so a delayed model's diagram keeps the book figure's
  exact node census. And because a shift's value is last step's state — never
  a recursive read of its input — a formula may close a loop through one:
  `a: (a + 1)` is a cycle error, while `a: (a(t - 1) + 1)` is legal.

A delay is also what makes a loop *oscillate*. The hog cycle — farmers who
breed on the price they saw two units ago:

```text
| =>breeding [pigs at market: 90] =>sales |
breeding: (price(t - 2))
price: (200 - pigs at market)
sales: (0.5 pigs at market)
B(breeding <- price <- pigs at market)
```

Every farmer is acting on information that is already out of date, so supply
keeps overshooting demand: the herd swings between 90 and 177 and never
settles (the **boom & bust** button — raise `t =` to 40 to watch several more
cycles). Drop the shift, writing `breeding: (price)`, and the model still
compiles — this loop runs through a *stock*, not formula-to-formula, so there
was never a cycle to reject — but the herd slides straight to 133 and sits
there. The oscillation is the delay, and nothing else.

There is deliberately no smoothing primitive: perception-style reads *are* the
pipeline shift, and exponential approach falls out of goal-seeking faucets.

### Errors

Lex and parse errors are positioned — `Tokenization error: line 1, column 3: …`,
`Parsing error: line 2, column 4: …` — and semantic ones (formula cycles, a
formula reading a faucet outside a shift) come back as `Model error: …`. In
the playground a failing model flags the editor red and shows the message; the
last good diagram stays on screen while you fix it.

## How models run

The chart integrates the model with forward Euler at `DT = 0.05` over a horizon
of 10 time units by default (the `t =` field below the chart sets 1–1000).
Semantics, per node:

- A **stock** starts at its value and changes only by its flows. Levels never
  go negative: each step, a stock's outflows are rationed by what it actually
  holds, so an empty tub stops draining and chained stocks conserve material.
- A **faucet with a number** runs at that constant rate; a schedule steps the
  rate at its `@` times.
- A **faucet with a formula** evaluates its rate law every step over current
  levels and values, clamped at 0 — a tap never runs backward. (Non-finite
  arithmetic, e.g. division by zero, reads as 0.)
- A **bare faucet** is a closed tap — unless the information arrows into it
  give it behavior. Walking those arrows back through relay dots (value-less
  ones, or computed auxiliaries like a `discrepancy`):
  - **Goal-seeking** (the book's balancing loops, figures 10–11): if the walk
    reaches exactly one *valued* dot, that dot's reading is the **goal** and
    the faucet's own number is the **gain** — `rate = gain × discrepancy`,
    draining above the goal or filling below it, an exponential approach. The
    goal may be a constant, a schedule, or a closed curve; the chart draws it
    as a dashed line in the goal dot's color.
  - **Reinforcing** (figures 12–13): if the faucet has *no* number and the
    walk also reaches the faucet's own stock through a drawn arrow — the
    level→faucet arc that closes an R loop — the valued dot becomes a
    **factor** on the level: `rate = factor × level`, compound interest
    filling or exponential decay draining.
  - Ambiguous webs (two valued dots, stocks on both sides) fall back to the
    plain constant-rate reading.
- A **time shift** is a ring buffer of `T/DT` samples (rounded to whole steps,
  minimum one), advanced once per step. At t=0 every shift primes to its
  input's value at that moment, so a model written in equilibrium holds
  exactly. A faucet read through a shift reports its *applied* (post-ration)
  rate.

Only stocks plot as chart series. The chart has a hover crosshair with a
tooltip reading out every line (keyboard: `←`/`→` to step, Shift for ×10, Esc
to dismiss).

The engine lives in `ui/simulate.ts`, pure and dependency-free, and is pinned
by headless tests against the real compiled backend.

### The flows checkbox

Stocks plot; flows don't — a rate is not an accumulation, and the book's
charts are level charts. But a model with a **delay** hides its whole story in
the flows: the gap between what is happening and what the decision-maker
*sees* is invisible on the stock line. So when a model contains a time shift,
a **flows** checkbox appears beside the `t =` field and overlays that gap.
It's the book's figure 33, the panel behind the dealership's oscillation.

Checked, the chart adds one thin line per node touched by a shift:

- the shift's **owner** — the node whose formula contains it, i.e. the
  delayed copy — **dashed**;
- the shift's **input**, when that input is a plain reference, **solid**.

A stock never joins: it already has a level line. A node in both roles plots
once, dashed. Each line wears its node's own accent — the same hue it has in
the editor and the diagram — and the dash is shorter than the goal rules' so
the two dashed families stay apart. A faucet's sample is its *applied*
(post-ration) rate; a dot's is its computed value. Samples align one-for-one
with the stock series, and the flow lines join the y-domain, which is why an
order backlog swinging negative can pull the axis below zero.

Load **figure 31 & 33** and read the four lines against each other (1 unit =
10 days). Customer demand steps up on day 25:

| line | style | moves |
|---|---|---|
| `sales` | solid | day 25 — demand steps |
| `orders to factory` | solid | day 25.5 — the dealer reacts |
| `perceived sales` | dashed | day 30 — *5 days* after sales |
| `deliveries` | dashed | day 30.5 — *5 days* after the order |

Each dashed line trails its solid partner by exactly its delay — a perception
delay of 0.5 and a delivery delay of 0.5, both 5 days on this axis. Those two
gaps are what makes the inventory swing: cut both delays to a single step and
the oscillation vanishes outright — the lot dips to 198, settles on the new
220, and never moves again, against the 127-to-400 swing it has at 0.5. The
stock line alone never shows you why.

The box is off by default, so figures 32 and 34–36 plot the bare stock line
the book prints. An example may declare `flows: true` to open on this view
(figure 31 & 33 and the fishery figures 43–45 do), and each button resets the
box to its own setting — unlike `t =`, which survives a load.

## The playground

- **Example buttons** load the book's figures (and a few showcase models —
  epidemic, caffeine, boom & bust, skydiver — plus one per formula keyword).
- The **editor** color-codes every recognized name with its node's accent —
  the same hue that node wears in the diagram and the chart, so a line in the
  chart, a box in the diagram, and a word in the source visually connect.
- The **format** button reprints the model in the canonical style (one
  statement per line, spacing normalized — see `src/Formatter.purs`). It is
  token-preserving, so node identities and diagram positions survive; input
  that doesn't lex is left untouched.
- In the **diagram**: drag a node to pin it where you drop it; click a pinned
  node to release it back to the forces. Ports drag along their stock's
  boundary. Clicking a node's label renames it everywhere. Dragging empty
  space pans; a `+` / `1×` / `−` cluster in the corner zooms (`1×` resets
  both), and oversized models auto-fit.
- A **palette** in the diagram's other corner edits the model by drawing:
  pickers for a dot, stock, faucet or cloud place one at the next click; the
  arrow and flow pickers run a source→target pick; the `R` / `B` pickers mark
  a loop by clicking its nodes in order; and select / delete act on what's
  already there. Every one of them is a *text* edit — the statement is
  appended to (or removed from) the editor, so the source stays the model.

## The CLI

`make run-with` compiles a model and prints the graph JSON the frontend
consumes:

```bash
$ make run-with "a->b"
{"nodes":[{"type":"dot","label":"a","id":"dot#0"},{"type":"dot","label":"b","id":"dot#2"}],"links":[{"type":"arrow","target":"dot#2","source":"dot#0"}]}
```

Nodes carry `type` (`dot` / `stock` / `faucet` / `cloud` / `port`), an opaque
`id`, a `label`, and optionally `value`, `steps`, `expr` (a resolved formula
tree), `parent` (ports), `group`, and `loop` tags. Links are `flow` or `arrow`
with `source`/`target` ids. Use the `in=` form whenever the input contains
`=`, because make would otherwise parse the argument as a variable override:
`make run-with in="[a]=>fill[b]"`.

## Development

```text
src/                  the compiler (PureScript)
  Lexer.purs            source text -> positioned tokens
  Parser.purs           tokens -> Tree AST (every node minted a unique id)
  Evaluator.purs        Trees -> graph: identity, ports, loops, annotations
  Formatter.purs        canonical pretty-printer behind the format button
  Main.purs             go = tokenize >=> parse >=> evaluate; re-exports format
  CLI.purs              terminal runner (kept out of the browser bundle)
ui/                   the frontend (TypeScript + d3)
  app.ts                DOM, editor + highlighting, diagram, palette, gestures
  layout.ts             band/slot geometry and the force simulation
  simulate.ts           the forward-Euler engine (pure; runs headless)
  chart.ts              behavior-over-time panel
  highlight.ts          editor tokenizer mirroring the lexer's naming
  example.ts            the example buttons
test/                 unit suite (test/Main.purs), byte-exact goldens
                      (golden.mjs + goldens.json), headless frontend checks
                      (simulate/highlight/format/layout .mjs)
```

`make test` runs every layer. The goldens pin the compiler's JSON output
byte-for-byte; after an *intended* output change, refresh them with
`node test/golden.mjs --capture`. The formatter, simulator, highlighter, and
layout tests run `ui/*.ts` directly under node's type stripping against the
real compiled backend — another reason `spago build` must precede them (the
`make test` target does this for you).

The name honors Donella H. Meadows (1941–2001), whose *Thinking in Systems: A
Primer* supplies the notation, the figures, and the reason to draw them.
