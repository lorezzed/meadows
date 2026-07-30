# Follow-ups — behavior over time (figures 5 & 6)

Open items deferred from the value-annotation + behavior-chart feature
(`[stock: N]` / `=>faucet: N` → `ui/simulate.ts` → `ui/chart.ts`). Each entry
notes today's behavior and where a fix would land.

## Simulation semantics

- [x] **Stock-dependent rates (feedback math).** Done in three layers:
  the structural readings in `ui/simulate.ts` (goal-seeking
  `gain × discrepancy`, figures 10 & 11; reinforcing `factor × level`,
  figures 12 & 13) and, subsuming both when written explicitly, **formula
  annotations** — `name: (expr)` with `+ - * / ^`, references to stocks and
  dots, implicit multiplication, auto-drawn info arrows, cycle/type
  errors at compile time. Since extended (figures 31–35) with the
  **time shift** `x(t - T)` (pipeline delay), which may also read a
  FAUCET's rate as its input (reading a flow). [2026-07-29] The smoothing
  shift `x(t ~ T)` and `~` schedules were REMOVED ("use maths instead"):
  perception reads now use the pipeline shift itself (zero extra nodes —
  diagrams keep the book figures' censuses) and curves are denser `@`
  staircases. Remaining ideas (fresh followups): letting the
  reserved time variable `t` appear in plain arithmetic (`x: (2t)` — it
  currently lives only inside shifts), functions (`min`/`max`/`sin`),
  referencing a faucet's rate *outside* a shift input, and conditionals.

- [ ] **Multi-stock-per-faucet-side rule.** A faucet uses only the FIRST stock
  on each side (first `stock→faucet` flow link = its source, first
  `faucet→stock` = its sink); extra stock attachments are silently ignored.
  Decide whether that should warn, split proportionally, or stay. See the
  faucet wiring loop in `ui/simulate.ts`.

- [ ] **Faucet-to-faucet chains read as infinite.** In `a=>f=>g` a faucet whose
  neighbour is another faucet (or dot/cloud) treats that side as an infinite
  reservoir. Harmless today; revisit together with rate expressions.

- [ ] **UI-configurable horizon.** `T_END = 10` and `DT = 0.05` are exported
  constants in `ui/simulate.ts`; models slower than 10 time units clip. Add a
  UI control (or a DSL directive) and thread the values into `chart.ts`'s x
  scale.

## Language & compiler

- [ ] **Units syntax and axis labels.** The book's figure 6 says "gallons" and
  "minutes"; our axes are unitless. Would need DSL syntax (e.g.
  `[tub: 50 gallons]` or a per-model directive), a carry-through field on the
  graph JSON, and axis titles in `ui/chart.ts`. Watch the lexer: multi-word
  identifiers make `50 gallons` lex as number-then-name already.

- [ ] **Warn on conflicting values.** `[a: 5] … [a: 9]` silently keeps 5
  (first explicit value wins, `setValue` in `src/Evaluator.purs`). The graph
  JSON has no warning channel — either add one or make the second value a
  positioned error.

## Chart polish

- [x] **Line-end label collision avoidance.** Done as part of the goal-rule
  work: `dodgeLabels` in `ui/chart.ts` spreads ALL right-margin labels —
  series ends and goal rules together — to a 12px rhythm (verified on the
  five-curve figure 13 fan).

- [x] **Hover crosshair + tooltip.** Done — a crosshair snaps to the nearest
  sample with a ringed marker per line and one tooltip reading out every
  stock's level (value leads in strong ink, label follows, rows keyed by a
  short stroke of the series color; flips near the right edge). Keyboard has
  parity: the panel is focusable, ←/→ step a sample (Shift ×10), Escape
  dismisses. Render-once held — the layer reads the already-rendered series
  (`cur` closure state in `ui/chart.ts`).
