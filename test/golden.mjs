// Golden compiler tests: DSL input -> exact go() output, plus positioned-error
// patterns. Run with:                        node test/golden.mjs
// After an INTENDED output change, refresh the goldens from the current build:
//                                            node test/golden.mjs --capture
import * as M from '../output/Main/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goldensPath = join(dirname(fileURLToPath(import.meta.url)), 'goldens.json');

const EX_BIG = `|=>investment[capital]=>depreciation|
capital->profit->investment
[resource]=>extraction|
resource->yield per unit capital->extraction
yield per unit capital->price->profit
capital->depreciation`;

// The full Meadows reference model, with R(...)/B(...) loop annotations.
// figures 10 & 11: goal-seeking balancing loops — dot constants (`room
// temperature: 18`) wired through discrepancy dots into the faucets.
const EX_COFFEE = `[hot coffee: 100]=>cooling: 0.26|
B(cooling <- discrepancy <- hot coffee)
room temperature: 18 -> discrepancy
|=>heating: 0.26[iced coffee: 0]
B(heating <- warming discrepancy <- iced coffee)
room temperature -> warming discrepancy`;

// figures 12 & 13: the reinforcing interest loop, five accounts wide — bare
// faucets, valued rate dots, and the drawn level→faucet feedback arrows.
const EX_INTEREST = `|=>interest at two[two percent interest: 100]
R(interest at two <- two percent interest)
rate at two: 0.02 -> interest at two
|=>interest at four[four percent interest: 100]
R(interest at four <- four percent interest)
rate at four: 0.04 -> interest at four
|=>interest at six[six percent interest: 100]
R(interest at six <- six percent interest)
rate at six: 0.06 -> interest at six
|=>interest at eight[eight percent interest: 100]
R(interest at eight <- eight percent interest)
rate at eight: 0.08 -> interest at eight
|=>interest at ten[ten percent interest: 100]
R(interest at ten <- ten percent interest)
rate at ten: 0.1 -> interest at ten`;

// figure 14: the capital reinforcing loop, with the book's real equations —
// output is a computed auxiliary (capital / 3), investment's rate law
// multiplies it by the invested fraction. The formulas re-imply the R(...)
// arrows (deduplicated) and draw fraction→investment themselves.
const EX_CAPITAL = `|=>investment[capital: 100]
R(capital -> output -> investment)
output: (capital / 3)
investment: (output * fraction of output invested)
fraction of output invested: 0.2`;

// figure 15: the two-loop thermostat — one band, two goal-seeking B loops
// through floating discrepancy dots, each fed by an outside constant.
const EX_THERMOSTAT = `|=>heat from furnace[room temperature]=>heat to outside|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`;

// figures 15 & 16: the same structure valued — the furnace gain, the room's
// initial level, and the thermostat setting (the outside loop stays inert:
// bare faucet, valueless constant).
const EX_THERMO16 = `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`;

// figures 15 & 19: both loops live and the outside temperature a FORMULA of
// time — the cold-day driving curve as a period-10 cosine dipping to -5
// (t/pi/cos end-to-end, a closed formula on a goal dot).
const EX_THERMO19 = `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: 0.13|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10)) -> discrepancy between inside and outside temperatures`;

// figures 21 & 22: the population system — one stock, a reinforcing births
// loop and a balancing deaths loop, fertility and mortality as the valued
// factor dots (one time unit = a decade, so 2007's crude rates 21 and 9 per
// 1000 per year read 0.21 and 0.09).
const EX_POP22 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.09 -> deaths`;

// figures 21 & 23: the same structure, mortality now dominant — decline.
const EX_POP23 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.3 -> deaths`;

// figures 21 & 24: fertility ramps down to meet mortality at t=2 and holds —
// the closed-formula FACTOR dot (a max ramp on a reinforcing loop's
// constant, where goal dots got the cosine).
const EX_POP24 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: (max(0.09, 0.21 - 0.06 * t)) -> births
mortality: 0.09 -> deaths`;

// figures 21 & 26: shifting dominance — fertility above mortality, then
// equal, then above again and climbing (a max ramp down to the 0.09
// plateau by 2.5, flat to 5, then a quarter-wave sin climb to 0.36 at
// 10): grow, hold, grow.
const EX_POP26 = `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: (max(0.09, 0.21 - 0.048 * t) + max(0, 0.27 * sin(pi * (t - 5) / 10))) -> births
mortality: 0.09 -> deaths`;

// figure 25: the three scenarios side by side — the same two-loop structure
// three times over, three futures decided purely by the numbers.
const EX_POP25 = `|=>births a[growth: 6.6]=>deaths a|
R(births a <- growth)
B(deaths a <- growth)
fertility a: 0.21 -> births a
mortality a: 0.09 -> deaths a
|=>births b[decline: 6.6]=>deaths b|
R(births b <- decline)
B(deaths b <- decline)
fertility b: 0.21 -> births b
mortality b: 0.3 -> deaths b
|=>births c[stabilization: 6.6]=>deaths c|
R(births c <- stabilization)
B(deaths c <- stabilization)
fertility c: (max(0.09, 0.21 - 0.06 * t)) -> births c
mortality c: 0.09 -> deaths c`;

// figure 27: the capital archetype as pure structure — the population
// system's R+B pair on an industrial stock: investment reinforces through
// annual output, depreciation balances through capital lifetime.
const EX_CAP27 = `|=>investment[capital stock]=>depreciation|
R(capital stock -> annual output -> investment)
B(capital stock -> depreciation)
investment fraction -> investment
output per unit capital -> annual output
capital lifetime -> depreciation`;

// figures 27 & 28: the same structure three times over with the book's real
// equations, three futures decided by the capital lifetime alone. One time
// unit = 5 years (the book's 50-year axis on T_END = 10), so output per
// unit capital reads 5/3 per unit (1/3 per year) and the 10/15/20-year
// lifetimes read 2, 3, and 4.
const cap28 = (suffix, lifetime) => `|=>investment at ${suffix}[capital at ${suffix}: 100]=>depreciation at ${suffix}|
R(capital at ${suffix} -> annual output at ${suffix} -> investment at ${suffix})
B(capital at ${suffix} -> depreciation at ${suffix})
annual output at ${suffix}: (capital at ${suffix} * output per unit capital at ${suffix})
investment at ${suffix}: (annual output at ${suffix} * investment fraction at ${suffix})
depreciation at ${suffix}: (capital at ${suffix} / capital lifetime at ${suffix})
investment fraction at ${suffix}: 0.2
output per unit capital at ${suffix}: (5 / 3)
capital lifetime at ${suffix}: ${lifetime}`;
const EX_CAP28 = [cap28('twenty', 4), cap28('fifteen', 3), cap28('ten', 2)].join('\n');

// figure 29: the car dealership as pure structure — deliveries fill the
// inventory, sales drain it, and two balancing loops (the ordering machinery
// on the left, the sales/inventory coupling on the right) close through the
// aux web. The info arrow `sales -> perceived sales` runs off a faucet, and
// the stock sprouts two ports (one to discrepancy, one to sales).
const EX_CAR29 = `| =>deliveries [inventory of cars on the lot] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
B(inventory of cars on the lot -> sales)
desired inventory -> discrepancy
perceived sales -> orders to factory
perceived sales -> desired inventory
sales -> perceived sales
customer demand -> sales`;

// figures 29 & 30: the same dealership valued for the behavior chart. The
// no-delay idealization figure 30 depicts — perceived sales tracks customer
// demand directly, so the net flow reduces to adjustment × (desired −
// inventory) and inventory goal-seeks its target. One time unit = 10 days
// (T_END = 10 spans the book's 100-day axis); a 10% demand step at day 25
// lands at t = 2.5 and inventory eases 200 → 220.
const EX_CAR2930 = `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + adjustment * discrepancy)
deliveries: (orders to factory)
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (coverage * perceived sales)
perceived sales: (customer demand)
sales: (customer demand)
customer demand: 20 @2.5: 22
coverage: 10
adjustment: 10`;

// figure 31: the dealership structure WITH its three delays marked — the
// same nine arrows as figure 29 plus a delay dot feeding each machine part
// (delivery delay → deliveries, response delay → orders, perception delay →
// perceived sales).
const EX_CAR31 = `| =>deliveries [inventory of cars on the lot] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
B(inventory of cars on the lot -> sales)
desired inventory -> discrepancy
perceived sales -> orders to factory
perceived sales -> desired inventory
sales -> perceived sales
customer demand -> sales
delivery delay -> deliveries
response delay -> orders to factory
perception delay -> perceived sales`;

// figures 31 & 32 (and 35/36 by the response delay alone): the dealership
// with its delays LIVE — perceived sales reads the sales flow as it was
// half a unit ago (`sales(t - perception delay)`), deliveries the orders
// pipeline-delayed (`(t - delivery delay)`), and the response delay
// divides the discrepancy. Both shifts mint NO nodes, so the census stays
// exactly figure 31's. One time unit = 10 days (the 29 & 30 scaling),
// rates in cars per unit: demand 200 → 220 at t = 2.5, perception/delivery
// delays 0.5 (5 days), response delay 0.3 / 0.2 / 0.6 (3 / 2 / 6 days).
const car32 = (rd) => `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t - perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: ${rd}
delivery delay: 0.5`;
const EX_CAR3132 = car32('0.3');
const EX_CAR35 = car32('0.2');
const EX_CAR36 = car32('0.6');

// The showcase buttons (not book figures) — each flexes a capability: a
// nonlinear rate law, @ pulse schedules, a loop closed through a pipeline
// shift, and ^ in a real physical law (see ui/example.ts).
const EX_EPIDEMIC = `[susceptible: 990] =>infection [infected: 10]
infection: (0.001 susceptible * infected)
R(infection <- infected)
B(infection <- susceptible)`;

const EX_CAFFEINE = `| =>espresso: 0 @1: 240 @1.5: 0 @6: 240 @6.5: 0 [caffeine in blood: 0] =>metabolism |
metabolism: (0.14 caffeine in blood)
B(metabolism <- caffeine in blood)`;

const EX_HOGS = `| =>breeding [pigs at market: 90] =>sales |
breeding: (price(t - 2))
price: (200 - pigs at market)
sales: (0.5 pigs at market)
B(breeding <- price <- pigs at market)`;

const EX_SKYDIVER = `| =>gravity [speed: 0] =>air drag |
gravity: 10
air drag: (0.02 speed^2)
[altitude: 180] =>falling |
falling: (speed)
B(air drag <- speed)`;

// Keyword showcases: one model per reserved formula word — t, pi, cos,
// sin, min, max (see ui/example.ts).
const EX_RUSHHOUR = `| =>cars arriving: (2t) [cars on the road: 0] =>cars leaving: 8 |`;

const EX_ODOMETER = `| =>rolling [distance: 0]
wheel radius: 0.35
cadence: 3
rolling: (2 * pi * wheel radius * cadence)`;

const EX_TIDES = `| =>flood tide: 1.5 [harbor basin: 3] =>ebb tide: 1.5 |
B(flood tide <- gap <- harbor basin)
B(ebb tide <- gap)
sea level: (3 + 1.5 * cos(2 * pi * t / 5)) -> gap`;

const EX_MONSOON = `| =>rainfall [reservoir: 20] =>river outflow: 12 |
rainfall: (38 * sin(pi * t / 10))`;

const EX_CHARGER = `| =>charging [battery: 10]
full charge: 100
charging: (min(25, 1.2 * (full charge - battery)))
B(charging <- battery)`;

const EX_DROUGHT = `[town reservoir: 100] =>consumption |
consumption: (max(6, 0.25 * town reservoir))
B(consumption <- town reservoir)`;

// figure 37: the oil economy — figure 42's capital machinery constrained
// by a NONRENEWABLE resource (no regeneration; extraction drains to a
// cloud). Twelve info arrows including extraction -> profit (an arrow off
// a faucet) and four ports on the capital stock.
const EX_OIL37 = `| =>investment [capital] =>depreciation |
[resource] =>extraction |
capital -> growth goal -> investment
R(investment <- profit <- capital)
B(depreciation <- capital)
capital lifetime -> depreciation
B(profit <- capital -> extraction)
extraction -> profit
profit <- price <- yield per unit capital -> extraction
resource -> yield per unit capital`;

// figures 37 & 38: the oil economy valued (1 unit = 10 years). Investment
// chases a 10%/yr growth goal through a cube-norm soft-min against profit;
// yield falls linearly with the resource; price constant. Profit reads
// yield per unit capital in place of the extraction faucet (formulas
// cannot read faucet rates), and this scenario's constant price drops the
// structure figure's yield -> price arrow.
const EX_OIL38 = `| =>investment [capital: 5] =>depreciation |
[resource: 1000] =>extraction |
R(investment <- profit <- capital)
B(depreciation <- capital)
B(profit <- capital -> extraction)
investment: (profit * growth goal / ((profit^3 + growth goal^3)^(1 / 3)))
growth goal: (capital)
depreciation: (capital / capital lifetime)
capital lifetime: 2
extraction: (14 capital * yield per unit capital)
profit: (4 price * capital * yield per unit capital)
price: 1
yield per unit capital: (resource / 1000)`;

// figures 37 & 39: the endowment comparison — three copies of the 37 & 38
// economy (resource 1000 / 2000 / 4000), each copy's yield reading its own
// endowment so the runs start identically. EVERY constant is per-copy (the
// figures 12 & 13 / 25 / 27 & 28 convention), keeping the three
// subsystems disconnected so they settle as separate clusters.
const oil39 = (s, r0) => `| =>investment ${s} [capital ${s}: 5] =>depreciation ${s} |
[resource ${s}: ${r0}] =>extraction ${s} |
R(investment ${s} <- profit ${s} <- capital ${s})
B(depreciation ${s} <- capital ${s})
B(profit ${s} <- capital ${s} -> extraction ${s})
investment ${s}: (profit ${s} * growth goal ${s} / ((profit ${s}^3 + growth goal ${s}^3)^(1 / 3)))
growth goal ${s}: (capital ${s})
depreciation ${s}: (capital ${s} / capital lifetime ${s})
capital lifetime ${s}: 2
extraction ${s}: (14 capital ${s} * yield per unit capital ${s})
profit ${s}: (4 price ${s} * capital ${s} * yield per unit capital ${s})
price ${s}: 1
yield per unit capital ${s}: (resource ${s} / ${r0})`;
const EX_OIL39 = [oil39('base', 1000), oil39('doubled', 2000), oil39('quadrupled', 4000)].join('\n');

// figures 37 & 40: the growth-goal comparison — four copies of the 37 & 38
// economy differing only in the desired capital growth (net 7/5/3/1 %/yr =
// gross goal coefficients 1.2/1/0.8/0.6 over 5%/yr depreciation), fully
// per-copy so the subsystems stay disconnected.
const oil40 = (s, goal) => `| =>investment ${s} [capital ${s}: 5] =>depreciation ${s} |
[resource ${s}: 1000] =>extraction ${s} |
R(investment ${s} <- profit ${s} <- capital ${s})
B(depreciation ${s} <- capital ${s})
B(profit ${s} <- capital ${s} -> extraction ${s})
investment ${s}: (profit ${s} * growth goal ${s} / ((profit ${s}^3 + growth goal ${s}^3)^(1 / 3)))
growth goal ${s}: (${goal})
depreciation ${s}: (capital ${s} / capital lifetime ${s})
capital lifetime ${s}: 2
extraction ${s}: (14 capital ${s} * yield per unit capital ${s})
profit ${s}: (4 price ${s} * capital ${s} * yield per unit capital ${s})
price ${s}: 1
yield per unit capital ${s}: (resource ${s} / 1000)`;
const EX_OIL40 = [
  oil40('at seven', '1.2 capital at seven'),
  oil40('at five', 'capital at five'),
  oil40('at three', '0.8 capital at three'),
  oil40('at one', '0.6 capital at one'),
].join('\n');

// figures 37 & 41: scarcity pricing — the 37 & 38 economy with price
// rising from 1 toward a ceiling of 6 as yield falls (the structure
// figure's yield -> price arrow made live) and profit netting a 0.5
// capital operating cost so it crosses zero after the peak.
const EX_OIL41 = `| =>investment [capital: 5] =>depreciation |
[resource: 1000] =>extraction |
R(investment <- profit <- capital)
B(depreciation <- capital)
B(profit <- capital -> extraction)
investment: (profit * growth goal / ((profit^3 + growth goal^3)^(1 / 3)))
growth goal: (capital)
depreciation: (capital / capital lifetime)
capital lifetime: 2
extraction: (14 capital * yield per unit capital)
profit: (4 price * capital * yield per unit capital - 0.5 capital)
price: (6 / (1 + 5 yield per unit capital^2))
yield per unit capital: (resource / 1000)`;

// figure 42 (corrected 2026-07-28): the renewable fishery structure — the
// re-supplied book scan shows a harvest -> profit arrow (the tail circle
// on the harvest tap, exactly like figure 37's extraction -> profit),
// which the original button lacked. Fifteen arrows now.
const EX_FISH42 = `| =>investment [capital] =>depreciation |
| =>regeneration [resource] =>harvest |
capital -> growth goal -> investment
R(investment <- profit <- capital)
B(depreciation <- capital)
capital lifetime -> depreciation
B(profit <- capital -> harvest)
harvest -> profit
profit <- price <- yield per unit capital -> harvest
resource -> yield per unit capital
regeneration <- regeneration rate <- resource -> regeneration`;

// figures 42 & 43: the sustainable fishery (1 unit = 15 years), with the
// book's overshoot-and-settle. The 5%/yr growth goal (1.5 capital), profit
// as income read off the catch a season late (price * harvest(t - 0.1) -
// 1.75 capital — a faucet read through the pipeline shift, which mints no
// nodes and restores the book's harvest -> profit arrow), and the
// depensation regeneration hump 112 (x(1 - x))^2 peaking above the settle
// point: harvest crests ~271/yr then settles ~233/yr, capital ~1450 ->
// ~1397, the resource 1000 -> ~484 -> 500. ONE button, opening in the
// flows view — all three panels at once.
const EX_FISH43 = `| =>investment [capital: 5] =>depreciation |
| =>regeneration [resource: 1000] =>harvest |
R(investment <- profit <- capital)
B(depreciation <- capital)
B(profit <- capital -> harvest)
investment: (profit * growth goal / ((profit^6 + growth goal^6)^(1 / 6)))
growth goal: (1.5 capital)
depreciation: (capital / capital lifetime)
capital lifetime: (4 / 3)
harvest: (10 capital * yield per unit capital)
profit: (price * harvest(t - 0.1) - 1.75 capital)
price: 1
yield per unit capital: ((resource / 1000)^2)
regeneration: (resource * regeneration rate)
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)`;

// figures 42 & 44: the same fishery with ONE line changed — the squared
// yield curve becomes the saturating technology curve (Hill form
// 1.27 x^2.8 / (x^2.8 + 0.27), exactly 1 at carrying capacity): boats
// catch near full efficiency down past half density, then the curve
// cliffs. The bind slides to R ~380 and the season-late profit read turns
// 43's single ring into a sustained cycle: harvest cycling under a
// ~277/yr crest, capital topping ~1115, resource bottoming ~308, period
// ~21 years. ONE button, opening in the flows view.
const EX_FISH44 = EX_FISH43.replace(
  'yield per unit capital: ((resource / 1000)^2)',
  'yield per unit capital: ((1.27 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.27))');

// figure 42 & 45: technology's endgame — figure 44's Hill curve with ONE
// constant moved, the half-yield point 0.27 -> 0.01 (yield holds above
// half strength until the fish fall below ~a fifth of carrying
// capacity). Harvest crests ~322/yr then cliffs to zero, capital tents
// at ~634 and rots at pure depreciation, the resource is stripped to ~2%
// and never comes back: the book's overshoot-and-collapse. ONE button,
// opening in the flows view.
const EX_FISH45 = EX_FISH44.replace(
  'yield per unit capital: ((1.27 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.27))',
  'yield per unit capital: ((1.01 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.01))');

// figure 47: the materials economy — one straight cloud-to-cloud chain
// through three stocks (the figure 1/4 shape at full length). No info
// arrows, so no ports; one band; value-less. The book's "consumers' home
// stocks" drops its apostrophe (not an identifier character).
const EX_CHAIN47 = `| =>raw materials processing [raw materials] =>production [inventory] =>sales [consumers home stocks] =>depreciation or discard |`;

// figure 48: the bare population stock — births in, deaths out. Figure
// 21's skeleton with no loops, no values, no fertility/mortality web:
// the one-stock cloud-to-cloud chain (figure 1 with the book's names).
const EX_POP48 = `| =>births [population] =>deaths |`;

// figure 49: three everyday stocks, each its own disconnected band —
// and the third has TWO outflows (hiring rate keeps the band,
// registration lapses is the figure-3 branch onto a row below).
const EX_TRIO49 = `| =>new sentences [criminals in jail] =>sentence completion |
| =>new fuel rods [fuel rods in nuclear power plants] =>fuel rod replacements |
| =>layoff rate [registered unemployed] =>hiring rate |
[registered unemployed] =>registration lapses |`;

const EX_LOOPS = `|=>investment[capital]=>depreciation|
|=>regeneration[resource]=>harvest|
capital->growth goal->investment
R(investment<-profit<-capital)
B(depreciation<-capital)
capital lifetime->depreciation
B(profit <- capital -> harvest)
profit<-price<-yield per unit capital->harvest
resource->yield per unit capital
regeneration<-regeneration rate<-resource->regeneration`;

// Happy-path inputs pinned byte-exactly.
const goldenInputs = [
  'a->b',
  'a->b=>c d',
  '[a]',
  '|',
  'a->b->[c]',
  'a->b=>c [d]',
  'a=>j',
  'a<=j',
  '[a]=>fill',
  '(a=>f)->b',
  'a=>j[b]',
  '|->a->b=>c [d]=>e|',   // example button 6
  'a->b\na->c',
  'a->b\n\nc->d',
  '\na->b\n',
  '  a  ->  b',
  '',
  EX_BIG,
  // Combined multi-statement graphs: bands + arrows, band merging,
  // source-order numbering, name identity across kinds, paren-linked bands,
  // feedback loops, reversed flows.
  '[a]=>f[b]\nb->c\nc->[a]',
  '[a]=>f[b]\n[b]=>g[c]',
  'x->y\n[c]=>g\n[a]=>f',
  'a=>f|\nb=>g|',
  'a->b\n[a]=>f',
  'f->x\na=>f',
  '([s]=>f)->([t]=>g)',
  '[a]<=f[b]<=g[c]',
  'a->b<-c',
  'a<-b<-c',
  '|=>inflow[pop]=>outflow|\npop->growth->inflow',
  // Operators after a dangling faucet apply to the faucet itself
  'a=>b->c',
  'a<=b->c',
  'a=>f=>g',
  'a=>b[x]->c',   // with a target present, the arrow belongs to the target
  // `<-` links each hop from its nearest right term: a<-b->c fans out from b
  'a<-b->c',
  // Loop annotations: R(...)/B(...) tag members' `loop` arrays with generated
  // names ("R0", "B1", ... by source order); nodes/links stay as unwrapped
  'R(a->b)',
  'B(a<-b)',
  'R(a)',
  '[a]=>f\nB(f<-a)',
  'R(a->b)\nB(b->c)',
  // A loop may open a statement and be continued by operators; the tail
  // links against the loop's resolution and stays outside the membership.
  'R(a)->b',
  'B(a<-b) <- c',
  'B(a->b) <- c',
  EX_LOOPS,
  // Value annotations: `[stock: N]` initial level, `=>faucet: N` rate.
  // Serialized as an optional `value` key (absent when unannotated).
  '|=>inflow[water in tub: 50]=>outflow: 5|',   // figures 5 & 6
  '[a: 100]=>drain: 5[b]=>out: 2.5|',           // chained stocks, decimal rate
  '[a: 2.5]',
  'a=>f: 5',
  '[a]\n[a: 5]',    // a later mention fills a blank value
  '[a: 5]\n[a: 9]', // the first explicit value wins
  // Faucet rate schedules: `: initial (@time: rate)*` — piecewise-constant.
  '|=>inflow: 0 @5: 5[water in tub: 50]=>outflow: 5|',   // figures 5 & 7
  'a=>f: 0 @2.5: 1 @7: 4',
  'a=>f: 9\na=>f: 0 @2: 1',   // first annotation wins as a unit
  // Dot annotations: a bare name takes a constant (`: N` -- e.g. a goal for
  // the simulator's goal-seeking faucets) or a full piecewise schedule (a
  // driving variable, figure 19's cold day); values may be negative.
  'a: 5',
  'room temperature: 18 -> discrepancy',
  'a: 5\na: 9',   // the first dot constant wins
  'out: 10 @2: -5',
  '[a: -5]',
  // Formulas: `: (expr)` — refs resolve to ids, serialized as a nested
  // `expr` tree, and each reference draws its implied info arrow (dedup'd
  // against hand-drawn ones).
  'a: (2x * y + 3)',
  '[capital: 100]\noutput: (capital / 3)',
  'a -> b\nb: (a)',
  'a=>f: (a)|',
  // Time shifts: {kind: "delay", input, time} in the expr tree —
  // x(t - T) pipelines — arrows from both the input and the time, faucets
  // readable as the input, and state-through-the-shift self-reference
  // legal.
  'd: 2\na: (x(t - d))',
  'a: (a(t - 1))',
  's=>f\na: (f(t - 1))',
  'a: (x(t - 1)(t - 2))',   // shifts chain left to right
  'a: (x(t))',              // the identity shift is just x
  'a: (x(t -3))',           // a signed literal folds into the delay
  'a: ((x + y)(t - 1))',    // a paren group takes a shift
  // Exponents: ^ binds tightest, right-associative.
  'y: ((2x^2) + 3)',
  'y: (x^2^3)',
  // The time vocabulary: bare `t`, `pi`, cos/sin calls, min/max with the
  // comma. A closed formula (no refs) is a driving curve; none of the new
  // forms mints an id.
  'a: (t)',
  'a: (2t + 1)',
  'a: (2 * pi)',
  'a: (cos(t / 24))',   // a call, never a shift of a node named cos
  'a: (cos * x)',       // a bare reserved name is an ordinary reference
  'a: (min(x, y))',
  'a: (max(0, x -5))',  // a signed literal as a call argument
  'a: (cos(x)(t - 1))', // a call takes a shift tail
  'c: (min(a, b)(t - 1))',
  't: 5',               // statement-level t is still a plain node
  'outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10))',
  EX_COFFEE,      // figures 10 & 11
  EX_INTEREST,    // figures 12 & 13
  EX_CAPITAL,     // figure 14
  EX_THERMOSTAT,  // figure 15
  EX_THERMO16,    // figures 15 & 16
  EX_THERMO19,    // figures 15 & 19
  EX_POP22,       // figures 21 & 22
  EX_POP23,       // figures 21 & 23
  EX_POP24,       // figures 21 & 24
  EX_POP25,       // figure 25
  EX_POP26,       // figures 21 & 26
  EX_CAP27,       // figure 27
  EX_CAP28,       // figures 27 & 28
  EX_CAR29,       // figure 29
  EX_CAR2930,     // figures 29 & 30
  EX_CAR31,       // figure 31
  EX_CAR3132,     // figures 31 & 32 (also the 33 flow view and figure 34's
                  // inventory chart — one model, three book figures)
  EX_CAR35,       // figure 35 — react faster, oscillate harder
  EX_CAR36,       // figure 36 — react slower, damp out
  EX_OIL37,       // figure 37 — the nonrenewable oil economy, structure only
  EX_OIL38,       // figures 37 & 38 — the oil economy valued: grow, peak, collapse
  EX_OIL39,       // figures 37 & 39 — the endowment comparison, three copies
  EX_OIL40,       // figures 37 & 40 — the growth-goal comparison, four copies
  EX_OIL41,       // figures 37 & 41 — scarcity pricing: same oil, twice the capital
  EX_FISH42,      // figure 42 — the renewable fishery structure (harvest -> profit restored)
  EX_FISH43,      // figures 42 & 43 — the fishery's overshoot-and-settle, one flows-preset button
  EX_FISH44,      // figures 42 & 44 — the technology yield curve's limit cycle, one flows-preset button
  EX_FISH45,      // figure 42 & 45 — the half-yield point at 0.01: overshoot and collapse
  EX_CHAIN47,     // figure 47 — the materials-economy chain, structure only
  EX_POP48,       // figure 48 — the bare population stock, structure only
  EX_TRIO49,      // figure 49 — three everyday stocks, one with a branch outflow
  EX_EPIDEMIC,    // showcase: nonlinear rate law over two stocks
  EX_CAFFEINE,    // showcase: @ pulse schedule + proportional decay
  EX_HOGS,        // showcase: loop closed through price(t - 2)
  EX_SKYDIVER,    // showcase: speed^2 drag, cross-band rate, the 0-floor
  EX_RUSHHOUR,    // showcase: bare t as a rate law
  EX_ODOMETER,    // showcase: pi in a circumference formula
  EX_TIDES,       // showcase: cos as a two-cycle moving goal
  EX_MONSOON,     // showcase: sin as a seasonal half-wave
  EX_CHARGER,     // showcase: min as a constant-current/voltage clamp
  EX_DROUGHT,     // showcase: max as an essential-use floor
];

// Errors: the "kind: line L, column C:" prefix is contractual; wording may be tuned.
const errorCases = [
  ['a->',       /^Parsing error: line 1, column 2: /],
  ['a=>',       /^Parsing error: line 1, column 2: /],
  ['|a',        /^Parsing error: line 1, column 2: /],  // cloud never swallows an ident
  ['|a->b',     /^Parsing error: line 1, column 2: /],
  ['[a',        /^Parsing error: line 1, column 2: /],
  ['[]',        /^Parsing error: line 1, column 2: /],
  ['a=>f->',    /^Parsing error: line 1, column 5: /],  // arrow off a faucet still needs a target
  ['(a->b',     /^Parsing error: line 1, column 5: /],
  ['a->b\nc->', /^Parsing error: line 2, column 2: /],
  ['a > b',     /^Tokenization error: line 1, column 3: /],
  ['a=b',       /^Tokenization error: line 1, column 2: /],  // a bare = is no longer a => alias
  // Errors buried in otherwise-valid multi-statement programs
  ['[a]=>f[b]\nb->c\nc->[',  /^Parsing error: line 3, column 4: /],
  ['[a]=>f[b]\nb->\nc',      /^Parsing error: line 2, column 4: /],
  ['([s]=>f)->([t]=>g',      /^Parsing error: line 1, column 17: /],
  ['a->b\nc->d\ne=>',        /^Parsing error: line 3, column 2: /],
  // Loop annotations
  ['R(a',       /^Parsing error: line 1, column 3: /],  // unclosed loop
  ['R()',       /^Parsing error: line 1, column 3: /],  // empty loop
  ['a->R(b)',   /^Parsing error: line 1, column 4: /],  // loops are never interior terms
  ['R(a)->',    /^Parsing error: line 1, column 5: /],  // a loop's tail still needs an operand
  ['r(a)',      /^Parsing error: line 1, column 2: /],  // lowercase r is just a name
  // Value annotations belong to stocks, faucets, and dots (dots and faucets
  // take full schedules; stocks a single value)
  ['[a:]',      /^Parsing error: line 1, column 4: /],  // a colon needs a number
  ['[a: b]',    /^Parsing error: line 1, column 5: /],  // a name is not a value
  ['[a]: 5',    /^Parsing error: line 1, column 4: /],  // the value goes inside the brackets
  ['5',         /^Parsing error: line 1, column 1: /],  // a bare number is not a term
  ['-5',        /^Parsing error: line 1, column 1: /],  // a signed number is still not a term
  ['a -x',      /^Parsing error: line 1, column 3: /],  // a lone '-' only subtracts inside formulas
  ['[a: 5.]',   /^Tokenization error: line 1, column 6: /],  // no trailing bare dot
  // Rate schedules commit at each '@'/':' — malformed segments are positioned
  ['a=>f: 0 @',    /^Parsing error: line 1, column 9: /],   // step needs a time
  ['a=>f: 0 @5 3', /^Parsing error: line 1, column 12: /],  // step time needs ':'
  ['a=>f: 0 @5:',  /^Parsing error: line 1, column 11: /],  // step needs a rate
  ['[a: 1 @2: 3]', /^Parsing error: line 1, column 7: /],   // stocks: single value only
  ['a @ b',        /^Parsing error: line 1, column 3: /],   // '@' lives inside annotations
  ['a, b',         /^Parsing error: line 1, column 2: /],   // ',' lives between call arguments
  ['a: 5 ~',       /^Tokenization error: line 1, column 6: /],   // '~' left the language
  ['a=>f: 0 @2: 1 ~3: 2', /^Tokenization error: line 1, column 15: /],  // (no smooth schedules)
  // Formulas
  ['a: ()',        /^Parsing error: line 1, column 5: /],   // an empty formula
  ['a: (x',        /^Parsing error: line 1, column 5: /],   // unclosed formula
  ['a: (x 5)',     /^Parsing error: line 1, column 7: /],   // no positive-number juxtaposition
  ['[a: (x)]',     /^Parsing error: line 1, column 5: /],   // stocks take numbers, not formulas
  ['x=>f\na: (f)', /^Model error: /],                       // a formula cannot read a faucet
  ['a: (b)\nb: (a)', /^Model error: /],                     // formula cycles have no order
  // Function calls: a reserved name opens a call only on '('; arity is exact
  ['a: (cos(x, y))',    /^Parsing error: line 1, column 10: /],  // cos takes one argument
  ['a: (min(x))',       /^Parsing error: line 1, column 10: /],  // min demands a second
  ['a: (min(x, y, z))', /^Parsing error: line 1, column 13: /],  // and stops at two
  // Time shifts: `(t` after a name or group, `-` the only shift operator,
  // one term of time, and the time still may not read a faucet
  ['a: (x(t + 1))',     /^Parsing error: line 1, column 9: /],   // only - shifts time
  ['a: (x(t ~ 1))',     /^Tokenization error: line 1, column 9: /],  // the smooth shift is gone
  ['a: (x(t - 3 - d))', /^Parsing error: line 1, column 13: /],  // a compound time needs parens
  ['s=>f\na: (x(t - f))', /^Model error: /],                     // a shift time is a value, not a flow
];

if (process.argv.includes('--capture')) {
  const goldens = Object.fromEntries(goldenInputs.map(i => [i, M.go(i)]));
  writeFileSync(goldensPath, JSON.stringify(goldens, null, 2) + '\n');
  console.log(`captured ${goldenInputs.length} goldens to ${goldensPath}`);
  process.exit(0);
}

const goldens = JSON.parse(readFileSync(goldensPath, 'utf8'));
let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${JSON.stringify(label)}: ${msg}`); };

for (const input of goldenInputs) {
  const want = goldens[input];
  if (want === undefined) { fail(input, 'no golden captured — run --capture'); continue; }
  const got = M.go(input);
  if (got !== want) fail(input, `\n  want ${want}\n  got  ${got}`);
}

for (const [input, re] of errorCases) {
  const out = JSON.parse(M.go(input));   // error results are JSON strings
  if (typeof out !== 'string') fail(input, 'expected an error, got a graph');
  else if (!re.test(out)) fail(input, `expected ${re}, got ${JSON.stringify(out)}`);
}

// Structural spot checks (shape-level, independent of exact ids).
const j1 = JSON.parse(M.go('a=>j'));
if (!(j1.nodes.length === 2 && j1.links.length === 1 && j1.links[0].type === 'flow'
      && j1.links[0].source.startsWith('dot#') && j1.links[0].target.startsWith('faucet#')))
  fail('a=>j', 'dangling faucet should be dot --flow--> faucet');
const j2 = JSON.parse(M.go('a<=j'));
if (!(j2.links.length === 1 && j2.links[0].source.startsWith('faucet#') && j2.links[0].target.startsWith('dot#')))
  fail('a<=j', 'reversed flow should be faucet --flow--> dot');
const j3 = JSON.parse(M.go('[a]=>fill'));
if (!j3.nodes.every(n => n.group === 0)) fail('[a]=>fill', 'stock+faucet should share group 0');
const big = JSON.parse(M.go(EX_BIG));
if (big.nodes.length !== 14) fail('big model', `14 nodes expected (11 + 3 stock-arrow ports), got ${big.nodes.length}`);
if (new Set(big.nodes.map(n => n.group).filter(g => g != null)).size !== 2)
  fail('big model', '2 groups expected');
const loops = JSON.parse(M.go(EX_LOOPS));
const loopOf = label => loops.nodes.find(n => n.label === label)?.loop;
if (loops.nodes.length !== 23) fail('loops model', `23 nodes expected (16 + 7 stock-arrow ports), got ${loops.nodes.length}`);
if (JSON.stringify(loopOf('capital')) !== JSON.stringify(['R0', 'B1', 'B2']))
  fail('loops model', `capital should be in R0/B1/B2, got ${JSON.stringify(loopOf('capital'))}`);
if (JSON.stringify(loopOf('harvest')) !== JSON.stringify(['B2']))
  fail('loops model', `harvest should be in B2 only, got ${JSON.stringify(loopOf('harvest'))}`);
if (loopOf('growth goal') !== undefined)
  fail('loops model', 'growth goal is in no loop, its `loop` key should be absent');
const v1 = JSON.parse(M.go('[a: 50]'));
if (v1.nodes[0].value !== 50) fail('[a: 50]', `value 50 expected, got ${v1.nodes[0].value}`);
const v2 = JSON.parse(M.go('[a]'));
if ('value' in v2.nodes[0]) fail('[a]', 'unannotated node should have no `value` key');
const v3 = JSON.parse(M.go('a=>f: 0 @5: 5'));
const fct = v3.nodes.find(n => n.type === 'faucet');
if (!(fct.value === 0 && JSON.stringify(fct.steps) === JSON.stringify([{ value: 5, at: 5 }])))
  fail('a=>f: 0 @5: 5', `schedule expected value 0 + one step, got ${JSON.stringify(fct)}`);
if ('steps' in JSON.parse(M.go('a=>f: 5')).nodes.find(n => n.type === 'faucet'))
  fail('a=>f: 5', 'a step-less rate should have no `steps` key');
const coffee = JSON.parse(M.go(EX_COFFEE));
const room = coffee.nodes.find(n => n.label === 'room temperature');
if (!(room?.type === 'dot' && room.value === 18))
  fail('coffee model', `room temperature should be a dot valued 18, got ${JSON.stringify(room)}`);
if (coffee.nodes.filter(n => n.label === 'room temperature').length !== 1)
  fail('coffee model', 'the shared constant should be one node');
const interest = JSON.parse(M.go(EX_INTEREST));
if (interest.nodes.length !== 25)   // 5 × (cloud, faucet, stock, rate dot, port)
  fail('interest model', `25 nodes expected, got ${interest.nodes.length}`);
if (new Set(interest.nodes.map(n => n.group).filter(g => g != null)).size !== 5)
  fail('interest model', '5 bands expected, one per account');
const iOf = label => interest.nodes.find(n => n.label === label);
if (JSON.stringify(iOf('ten percent interest')?.loop) !== JSON.stringify(['R4']))
  fail('interest model', `ten percent interest should be in R4, got ${JSON.stringify(iOf('ten percent interest')?.loop)}`);
if (!(iOf('rate at ten')?.type === 'dot' && iOf('rate at ten')?.value === 0.1))
  fail('interest model', 'rate at ten should be a dot valued 0.1');
if (iOf('interest at ten')?.value !== undefined)
  fail('interest model', 'the interest faucets carry no rate of their own');
const thermo = JSON.parse(M.go(EX_THERMOSTAT));
const tOf = label => thermo.nodes.find(n => n.label === label);
if (thermo.nodes.length !== 11)   // 2 clouds, 2 faucets, 1 stock, 2 discrepancies, 2 constants, 2 ports
  fail('thermostat model', `11 nodes expected, got ${thermo.nodes.length}`);
if (thermo.links.filter(l => l.type === 'flow').length !== 4 || thermo.links.length !== 10)
  fail('thermostat model', '4 flows + 6 arrows expected');
if (JSON.stringify(tOf('room temperature')?.loop) !== JSON.stringify(['B0', 'B1']))
  fail('thermostat model', `room temperature should be in B0 and B1, got ${JSON.stringify(tOf('room temperature')?.loop)}`);
if (tOf('thermostat setting')?.loop !== undefined || tOf('outside temperature')?.loop !== undefined)
  fail('thermostat model', 'the constants feed the loops without joining them');
const thermo19 = JSON.parse(M.go(EX_THERMO19));
if (thermo19.nodes.length !== 11)   // annotations change no census: same 11 as figure 15
  fail('thermostat 19', `11 nodes expected, got ${thermo19.nodes.length}`);
const t19Outside = thermo19.nodes.find(n => n.label === 'outside temperature');
if (!(t19Outside?.value === undefined && t19Outside?.steps === undefined
      && t19Outside?.expr?.kind === '+'
      && t19Outside?.expr?.right?.kind === '*'
      && t19Outside?.expr?.right?.right?.kind === 'cos'))
  fail('thermostat 19', `outside temperature should be the cosine cold day, got ${JSON.stringify(t19Outside)}`);
const pop = JSON.parse(M.go(EX_POP22));
const pOf = label => pop.nodes.find(n => n.label === label);
if (pop.nodes.length !== 9)   // 2 clouds, 2 faucets, 1 stock, 2 factor dots, 2 ports
  fail('population model', `9 nodes expected, got ${pop.nodes.length}`);
if (pop.links.filter(l => l.type === 'flow').length !== 4 || pop.links.length !== 8)
  fail('population model', '4 flows + 4 arrows expected');
if (JSON.stringify(pOf('population')?.loop) !== JSON.stringify(['R0', 'B1']))
  fail('population model', `population should be in R0 and B1, got ${JSON.stringify(pOf('population')?.loop)}`);
if (pOf('births')?.value !== undefined || pOf('deaths')?.value !== undefined)
  fail('population model', 'births and deaths are bare faucets — the rates live on the dots');
if (!(pOf('fertility')?.type === 'dot' && pOf('fertility')?.value === 0.21 && pOf('fertility')?.loop === undefined))
  fail('population model', 'fertility should be an un-tagged dot valued 0.21');
const pop24 = JSON.parse(M.go(EX_POP24));
const fert24 = pop24.nodes.find(n => n.label === 'fertility');
if (!(fert24?.value === undefined && fert24?.steps === undefined
      && fert24?.expr?.kind === 'max'
      && fert24?.expr?.left?.kind === 'num' && fert24?.expr?.left?.value === 0.09
      && fert24?.expr?.right?.kind === '-'))
  fail('population 24', `fertility should be the max ramp down to replacement, got ${JSON.stringify(fert24)}`);
const fert26 = JSON.parse(M.go(EX_POP26)).nodes.find(n => n.label === 'fertility');
if (!(fert26?.value === undefined && fert26?.steps === undefined
      && fert26?.expr?.kind === '+'
      && fert26?.expr?.left?.kind === 'max' && fert26?.expr?.right?.kind === 'max'))
  fail('population 26', `fertility should be the sum of two max ramps, got ${JSON.stringify(fert26)}`);
const pop25 = JSON.parse(M.go(EX_POP25));
if (pop25.nodes.length !== 27) fail('population 25', `27 nodes expected (21 + 6 ports), got ${pop25.nodes.length}`);
if (new Set(pop25.nodes.map(n => n.group).filter(g => g != null)).size !== 3)
  fail('population 25', '3 bands expected, one per scenario');
const p25Of = label => pop25.nodes.find(n => n.label === label);
for (const [stock, loops25] of [['growth', ['R0', 'B1']], ['decline', ['R2', 'B3']], ['stabilization', ['R4', 'B5']]])
  if (JSON.stringify(p25Of(stock)?.loop) !== JSON.stringify(loops25))
    fail('population 25', `${stock} should be in ${loops25}, got ${JSON.stringify(p25Of(stock)?.loop)}`);
const cap27 = JSON.parse(M.go(EX_CAP27));
const c27Of = label => cap27.nodes.find(n => n.label === label);
if (cap27.nodes.length !== 11)   // 2 clouds, 2 faucets, 1 stock, 4 constants, 2 ports
  fail('capital 27', `11 nodes expected, got ${cap27.nodes.length}`);
if (cap27.links.filter(l => l.type === 'flow').length !== 4 || cap27.links.length !== 10)
  fail('capital 27', '4 flows + 6 arrows expected');
if (JSON.stringify(c27Of('capital stock')?.loop) !== JSON.stringify(['R0', 'B1']))
  fail('capital 27', `capital stock should be in R0 and B1, got ${JSON.stringify(c27Of('capital stock')?.loop)}`);
if (JSON.stringify(c27Of('annual output')?.loop) !== JSON.stringify(['R0'])
    || JSON.stringify(c27Of('depreciation')?.loop) !== JSON.stringify(['B1']))
  fail('capital 27', 'annual output rides the R loop, depreciation the B loop');
if (c27Of('capital lifetime')?.loop !== undefined || c27Of('investment fraction')?.loop !== undefined)
  fail('capital 27', 'the constants feed the loops without joining them');
if (cap27.nodes.some(n => n.value !== undefined || n.expr !== undefined))
  fail('capital 27', 'the structure figure carries no numbers');
const cap28g = JSON.parse(M.go(EX_CAP28));
const c28Of = label => cap28g.nodes.find(n => n.label === label);
if (cap28g.nodes.length !== 33) fail('capital 28', `33 nodes expected (27 + 6 ports), got ${cap28g.nodes.length}`);
if (new Set(cap28g.nodes.map(n => n.group).filter(g => g != null)).size !== 3)
  fail('capital 28', '3 bands expected, one per lifetime');
if (cap28g.links.filter(l => l.type === 'flow').length !== 12 || cap28g.links.length !== 30)
  fail('capital 28', '12 flows + 18 arrows expected (formula arrows dedup against the R/B ones)');
for (const [stock, loops28] of [['capital at twenty', ['R0', 'B1']], ['capital at fifteen', ['R2', 'B3']], ['capital at ten', ['R4', 'B5']]])
  if (JSON.stringify(c28Of(stock)?.loop) !== JSON.stringify(loops28))
    fail('capital 28', `${stock} should be in ${loops28}, got ${JSON.stringify(c28Of(stock)?.loop)}`);
if (!(c28Of('investment at twenty')?.expr?.kind === '*' && c28Of('investment at twenty')?.value === undefined))
  fail('capital 28', 'the faucets carry rate-law formulas, not plain rates');
if (!(c28Of('output per unit capital at ten')?.expr?.kind === '/' && c28Of('capital lifetime at ten')?.value === 2))
  fail('capital 28', 'output per unit capital is the 5/3 formula, the lifetime a scaled constant');
const car29 = JSON.parse(M.go(EX_CAR29));
const c29Of = label => car29.nodes.find(n => n.label === label);
if (car29.nodes.length !== 12)   // 2 clouds, 2 faucets, 1 stock, 5 dots, 2 ports
  fail('car 29', `12 nodes expected, got ${car29.nodes.length}`);
if (car29.links.filter(l => l.type === 'flow').length !== 4 || car29.links.length !== 13)
  fail('car 29', '4 flows + 9 arrows expected');
const c29Ports = car29.nodes.filter(n => n.type === 'port');
if (c29Ports.length !== 2 || !c29Ports.every(p => p.parent === c29Of('inventory of cars on the lot').id))
  fail('car 29', 'the inventory stock sprouts two info-arrow ports (to discrepancy and to sales)');
if (JSON.stringify(c29Of('inventory of cars on the lot')?.loop) !== JSON.stringify(['B0', 'B1']))
  fail('car 29', `inventory should be in both B loops, got ${JSON.stringify(c29Of('inventory of cars on the lot')?.loop)}`);
if (JSON.stringify(c29Of('sales')?.loop) !== JSON.stringify(['B1']))
  fail('car 29', `sales rides the right B loop, got ${JSON.stringify(c29Of('sales')?.loop)}`);
if (c29Of('customer demand')?.loop !== undefined || c29Of('perceived sales')?.loop !== undefined)
  fail('car 29', 'the aux dots feed the loops without joining them');
if (car29.nodes.some(n => n.value !== undefined || n.expr !== undefined))
  fail('car 29', 'the structure figure carries no numbers');
const car30 = JSON.parse(M.go(EX_CAR2930));
const c30Of = label => car30.nodes.find(n => n.label === label);
if (car30.nodes.length !== 13)   // 2 clouds, 2 faucets, 1 stock, 7 dots, 1 port
  fail('car 30', `13 nodes expected, got ${car30.nodes.length}`);
if (car30.links.filter(l => l.type === 'flow').length !== 4 || car30.links.length !== 14)
  fail('car 30', '4 flows + 10 arrows expected (formula arrows dedup against the B one)');
if (c30Of('inventory of cars on the lot')?.value !== 200)
  fail('car 30', 'inventory starts at 200');
if (!(c30Of('deliveries')?.expr?.kind === 'ref' && c30Of('deliveries')?.value === undefined
      && c30Of('sales')?.expr?.kind === 'ref'))
  fail('car 30', 'both faucets carry formula rate laws, not plain rates');
if (!(c30Of('customer demand')?.value === 20
      && JSON.stringify(c30Of('customer demand')?.steps) === JSON.stringify([{ value: 22, at: 2.5 }])))
  fail('car 30', `customer demand steps 20 -> 22 at t=2.5, got ${JSON.stringify(c30Of('customer demand'))}`);
if (!(c30Of('coverage')?.value === 10 && c30Of('adjustment')?.value === 10))
  fail('car 30', 'coverage and adjustment are the model constants');
const car31 = JSON.parse(M.go(EX_CAR31));
const c31Of = label => car31.nodes.find(n => n.label === label);
if (car31.nodes.length !== 15)   // 2 clouds, 2 faucets, 1 stock, 8 dots, 2 ports
  fail('car 31', `15 nodes expected, got ${car31.nodes.length}`);
if (car31.links.filter(l => l.type === 'flow').length !== 4 || car31.links.length !== 16)
  fail('car 31', '4 flows + 12 arrows expected (figure 29 plus the three delay arrows)');
for (const d of ['delivery delay', 'response delay', 'perception delay'])
  if (!(c31Of(d)?.type === 'dot' && c31Of(d)?.value === undefined && c31Of(d)?.loop === undefined))
    fail('car 31', `${d} should be a bare dot outside the loops`);
if (JSON.stringify(c31Of('inventory of cars on the lot')?.loop) !== JSON.stringify(['B0', 'B1']))
  fail('car 31', 'inventory should still be in both B loops');
if (car31.nodes.some(n => n.value !== undefined || n.expr !== undefined))
  fail('car 31', 'the structure figure carries no numbers');
const car32g = JSON.parse(M.go(EX_CAR3132));
const c32Of = label => car32g.nodes.find(n => n.label === label);
if (car32g.nodes.length !== 14)   // 2 clouds, 2 faucets, 1 stock, 8 dots, 1 port
  fail('car 32', `14 nodes expected — the shifts mint nothing, figure 31's census — got ${car32g.nodes.length}`);
if (car32g.links.filter(l => l.type === 'flow').length !== 4 || car32g.links.length !== 15)
  fail('car 32', '4 flows + 11 arrows expected (formula arrows dedup against the B chain)');
if (!(c32Of('deliveries')?.expr?.kind === 'delay'
      && c32Of('deliveries')?.expr?.input?.kind === 'ref'
      && c32Of('deliveries')?.expr?.input?.id === c32Of('orders to factory')?.id
      && c32Of('deliveries')?.expr?.time?.id === c32Of('delivery delay')?.id))
  fail('car 32', `deliveries should be delay(orders, delivery delay), got ${JSON.stringify(c32Of('deliveries')?.expr)}`);
if (!(c32Of('perceived sales')?.expr?.kind === 'delay'
      && c32Of('perceived sales')?.expr?.input?.id === c32Of('sales')?.id
      && c32Of('perceived sales')?.expr?.time?.id === c32Of('perception delay')?.id))
  fail('car 32', `perceived sales should be delay(sales, perception delay), got ${JSON.stringify(c32Of('perceived sales')?.expr)}`);
if (c32Of('sales')?.type !== 'faucet')
  fail('car 32', 'the delayed input is the sales FAUCET — a perceived flow');
if (!(c32Of('customer demand')?.value === 200
      && JSON.stringify(c32Of('customer demand')?.steps) === JSON.stringify([{ value: 220, at: 2.5 }])))
  fail('car 32', `customer demand steps 200 -> 220 at t=2.5, got ${JSON.stringify(c32Of('customer demand'))}`);
if (!(c32Of('perception delay')?.value === 0.5
      && c32Of('response delay')?.value === 0.3 && c32Of('delivery delay')?.value === 0.5))
  fail('car 32', 'the three delay constants scale the book: 0.5/0.3/0.5');
if (c32Of('coverage') !== undefined)
  fail('car 32', 'no coverage node — ten days of sales is one unit\'s worth, so desired inventory reads perceived sales directly (the figure 31 diagram has no such element)');
if (JSON.parse(M.go(EX_CAR35)).nodes.find(n => n.label === 'response delay')?.value !== 0.2
    || JSON.parse(M.go(EX_CAR36)).nodes.find(n => n.label === 'response delay')?.value !== 0.6)
  fail('car 35/36', 'the variants differ from 31 & 32 only in the response delay (0.2 / 0.6)');
const oil37 = JSON.parse(M.go(EX_OIL37));
const o37Of = label => oil37.nodes.find(n => n.label === label);
if (oil37.nodes.length !== 18)   // 3 clouds, 3 faucets, 2 stocks, 5 dots, 5 ports
  fail('oil 37', `18 nodes expected, got ${oil37.nodes.length}`);
if (oil37.links.filter(l => l.type === 'flow').length !== 6 || oil37.links.length !== 18)
  fail('oil 37', '6 flows + 12 arrows expected (the B2 capital->profit dedups against the R0 one)');
if (new Set(oil37.nodes.map(n => n.group).filter(g => g != null)).size !== 2)
  fail('oil 37', '2 bands expected — capital above, the nonrenewable resource below');
if (JSON.stringify(o37Of('capital')?.loop) !== JSON.stringify(['R0', 'B1', 'B2'])
    || JSON.stringify(o37Of('profit')?.loop) !== JSON.stringify(['R0', 'B2'])
    || JSON.stringify(o37Of('extraction')?.loop) !== JSON.stringify(['B2']))
  fail('oil 37', `capital R0/B1/B2, profit R0/B2, extraction B2 — got ${JSON.stringify([o37Of('capital')?.loop, o37Of('profit')?.loop, o37Of('extraction')?.loop])}`);
for (const d of ['growth goal', 'capital lifetime', 'price', 'yield per unit capital'])
  if (o37Of(d)?.loop !== undefined) fail('oil 37', `${d} feeds the loops without joining them`);
const o37Ports = oil37.nodes.filter(n => n.type === 'port');
if (o37Ports.filter(p => p.parent === o37Of('capital').id).length !== 4
    || o37Ports.filter(p => p.parent === o37Of('resource').id).length !== 1)
  fail('oil 37', 'capital sprouts four ports (growth goal, profit, extraction, depreciation), resource one');
if (oil37.nodes.some(n => n.value !== undefined || n.expr !== undefined))
  fail('oil 37', 'the structure figure carries no numbers');
const oil38 = JSON.parse(M.go(EX_OIL38));
const o38Of = label => oil38.nodes.find(n => n.label === label);
if (oil38.nodes.length !== 18)   // same census as figure 37
  fail('oil 38', `18 nodes expected, got ${oil38.nodes.length}`);
if (oil38.links.filter(l => l.type === 'flow').length !== 6 || oil38.links.length !== 17)
  fail('oil 38', '6 flows + 11 arrows expected (constant price drops yield->price; profit reads yield, not extraction)');
if (!(o38Of('investment')?.expr?.kind === '/' && o38Of('extraction')?.expr?.kind === '*'
      && o38Of('depreciation')?.expr?.kind === '/' && o38Of('growth goal')?.expr?.kind === 'ref'))
  fail('oil 38', 'the three faucets and the goal carry their rate laws');
if (!(o38Of('capital')?.value === 5 && o38Of('resource')?.value === 1000
      && o38Of('price')?.value === 1 && o38Of('capital lifetime')?.value === 2))
  fail('oil 38', 'initial levels and constants: capital 5, resource 1000, price 1, lifetime 2');
if (JSON.stringify(o38Of('capital')?.loop) !== JSON.stringify(['R0', 'B1', 'B2']))
  fail('oil 38', 'capital keeps its three loop tags');
const oil39g = JSON.parse(M.go(EX_OIL39));
const o39Of = label => oil39g.nodes.find(n => n.label === label);
if (oil39g.nodes.length !== 54)   // 3 copies x 18 (the figure 37 & 38 census)
  fail('oil 39', `54 nodes expected, got ${oil39g.nodes.length}`);
if (oil39g.links.filter(l => l.type === 'flow').length !== 18 || oil39g.links.length !== 51)
  fail('oil 39', '18 flows + 33 arrows expected (11 per copy, fully per-copy wiring)');
if (new Set(oil39g.nodes.map(n => n.group).filter(g => g != null)).size !== 6)
  fail('oil 39', '6 bands expected — a capital and a resource band per copy');
for (const [stock, tags] of [['capital base', ['R0', 'B1', 'B2']], ['capital doubled', ['R3', 'B4', 'B5']], ['capital quadrupled', ['R6', 'B7', 'B8']]])
  if (JSON.stringify(o39Of(stock)?.loop) !== JSON.stringify(tags))
    fail('oil 39', `${stock} should be in ${tags}, got ${JSON.stringify(o39Of(stock)?.loop)}`);
if (!(o39Of('resource base')?.value === 1000 && o39Of('resource doubled')?.value === 2000
      && o39Of('resource quadrupled')?.value === 4000))
  fail('oil 39', 'the three endowments read 1000 / 2000 / 4000');
for (const s of ['base', 'doubled', 'quadrupled'])
  if (!(o39Of(`price ${s}`)?.value === 1 && o39Of(`capital lifetime ${s}`)?.value === 2))
    fail('oil 39', `${s}: per-copy price 1 and lifetime 2 — no cross-copy dots`);
if (oil39g.nodes.some(n => n.label === 'price' || n.label === 'capital lifetime'))
  fail('oil 39', 'no shared constants remain — the copies stay disconnected');
const oil40g = JSON.parse(M.go(EX_OIL40));
const o40Of = label => oil40g.nodes.find(n => n.label === label);
if (oil40g.nodes.length !== 72)   // 4 copies x 18, the 37 & 38 census
  fail('oil 40', `72 nodes expected, got ${oil40g.nodes.length}`);
if (oil40g.links.filter(l => l.type === 'flow').length !== 24 || oil40g.links.length !== 68)
  fail('oil 40', '24 flows + 44 arrows expected (11 per copy, fully per-copy wiring)');
if (new Set(oil40g.nodes.map(n => n.group).filter(g => g != null)).size !== 8)
  fail('oil 40', '8 bands expected — a capital and a resource band per copy');
for (const [stock, tags] of [['capital at seven', ['R0', 'B1', 'B2']], ['capital at five', ['R3', 'B4', 'B5']],
                             ['capital at three', ['R6', 'B7', 'B8']], ['capital at one', ['R9', 'B10', 'B11']]])
  if (JSON.stringify(o40Of(stock)?.loop) !== JSON.stringify(tags))
    fail('oil 40', `${stock} should be in ${tags}, got ${JSON.stringify(o40Of(stock)?.loop)}`);
if (!(o40Of('growth goal at seven')?.expr?.kind === '*' && o40Of('growth goal at five')?.expr?.kind === 'ref'
      && o40Of('growth goal at three')?.expr?.kind === '*' && o40Of('growth goal at one')?.expr?.kind === '*'))
  fail('oil 40', 'the goals differ only in their coefficient (the five copy reads capital bare)');
const oil41g = JSON.parse(M.go(EX_OIL41));
const o41Of = label => oil41g.nodes.find(n => n.label === label);
if (oil41g.nodes.length !== 18)   // the 37 & 38 census
  fail('oil 41', `18 nodes expected, got ${oil41g.nodes.length}`);
if (oil41g.links.filter(l => l.type === 'flow').length !== 6 || oil41g.links.length !== 18)
  fail('oil 41', '6 flows + 12 arrows expected — scarcity pricing restores the yield -> price arrow');
if (!(o41Of('price')?.expr?.kind === '/' && o41Of('price')?.value === undefined))
  fail('oil 41', 'price is the saturating scarcity formula, not a constant');
if (o41Of('profit')?.expr?.kind !== '-')
  fail('oil 41', 'profit nets the operating cost (a subtraction at the top)');
if (JSON.stringify(o41Of('capital')?.loop) !== JSON.stringify(['R0', 'B1', 'B2']))
  fail('oil 41', 'capital keeps its three loop tags');
const fish42 = JSON.parse(M.go(EX_FISH42));
const f42Of = label => fish42.nodes.find(n => n.label === label);
if (fish42.nodes.length !== 23)   // 4 clouds, 4 faucets, 2 stocks, 6 dots, 7 ports
  fail('fish 42', `23 nodes expected, got ${fish42.nodes.length}`);
if (fish42.links.filter(l => l.type === 'flow').length !== 8 || fish42.links.length !== 23)
  fail('fish 42', '8 flows + 15 arrows expected (harvest -> profit restored)');
if (!fish42.links.some(l => l.source === f42Of('harvest')?.id && l.target === f42Of('profit')?.id))
  fail('fish 42', 'the harvest -> profit arrow is drawn (the tail circle on the tap)');
if (fish42.nodes.some(n => n.value !== undefined || n.expr !== undefined))
  fail('fish 42', 'the structure figure carries no numbers');
const fish43 = JSON.parse(M.go(EX_FISH43));
const f43Of = label => fish43.nodes.find(n => n.label === label);
if (fish43.nodes.length !== 23)   // same census as fish 42, formulas instead of hand arrows
  fail('fish 43', `23 nodes expected — the shift mints nothing, figure 42's census — got ${fish43.nodes.length}`);
if (fish43.links.filter(l => l.type === 'flow').length !== 8 || fish43.links.length !== 22)
  fail('fish 43', '8 flows + 14 arrows expected (constant price drops yield -> price; the profit shift redraws harvest -> profit, its old yield -> profit ref gone)');
if (!fish43.links.some(l => l.source === f43Of('harvest')?.id && l.target === f43Of('profit')?.id))
  fail('fish 43', 'the shift input implies the book\'s harvest -> profit arrow');
if (fish43.links.some(l => l.source === f43Of('yield per unit capital')?.id && l.target === f43Of('profit')?.id))
  fail('fish 43', 'profit no longer reads the yield curve directly');
const shift43 = f43Of('profit')?.expr?.left?.right;
if (!(f43Of('profit')?.expr?.kind === '-' && shift43?.kind === 'delay'
      && shift43?.input?.id === f43Of('harvest')?.id && shift43?.time?.value === 0.1))
  fail('fish 43', 'profit reads the harvest faucet through the 0.1 pipeline delay');
if (!(f43Of('yield per unit capital')?.expr?.kind === '^'))
  fail('fish 43', 'the yield curve is the squared law — a ^-kind expr');
if (!(f43Of('capital lifetime')?.expr?.kind === '/' && f43Of('regeneration rate')?.expr?.kind === '*'))
  fail('fish 43', 'lifetime is the (4 / 3) formula and the rate the depensation hump');
if (!(f43Of('capital')?.value === 5 && f43Of('resource')?.value === 1000 && f43Of('price')?.value === 1))
  fail('fish 43', 'initial levels and the constant price');
if (JSON.stringify(f43Of('capital')?.loop) !== JSON.stringify(['R0', 'B1', 'B2']))
  fail('fish 43', 'capital keeps its three loop tags');
const fish44 = JSON.parse(M.go(EX_FISH44));
const f44Of = label => fish44.nodes.find(n => n.label === label);
if (fish44.nodes.length !== 23 || fish44.links.length !== 22)
  fail('fish 44', `the one-line diff keeps the 43 census, got ${fish44.nodes.length} nodes / ${fish44.links.length} links`);
const yield44 = f44Of('yield per unit capital')?.expr;
if (!(yield44?.kind === '/' && yield44?.left?.left?.value === 1.27
      && yield44?.right?.right?.value === 0.27 && yield44?.left?.right?.right?.value === 2.8))
  fail('fish 44', 'the saturating technology curve — 1.27 x^2.8 over x^2.8 + 0.27');
const shift44 = f44Of('profit')?.expr?.left?.right;
if (!(shift44?.kind === 'delay' && shift44?.input?.id === f44Of('harvest')?.id))
  fail('fish 44', 'the same season-late profit read as 43');
const fish45 = JSON.parse(M.go(EX_FISH45));
const f45Of = label => fish45.nodes.find(n => n.label === label);
if (fish45.nodes.length !== 23 || fish45.links.length !== 22)
  fail('fish 45', `the one-constant diff keeps the census, got ${fish45.nodes.length} nodes / ${fish45.links.length} links`);
const yield45 = f45Of('yield per unit capital')?.expr;
if (!(yield45?.kind === '/' && yield45?.left?.left?.value === 1.01
      && yield45?.right?.right?.value === 0.01 && yield45?.left?.right?.right?.value === 2.8))
  fail('fish 45', 'figure 44\'s Hill curve with the half-yield point at 0.01');
const chain47 = JSON.parse(M.go(EX_CHAIN47));
if (chain47.nodes.length !== 9)   // 2 clouds, 4 faucets, 3 stocks — no info arrows, so no ports
  fail('chain 47', `9 nodes expected, got ${chain47.nodes.length}`);
if (chain47.links.length !== 8 || !chain47.links.every(l => l.type === 'flow'))
  fail('chain 47', 'one straight pipe: 8 flow links and not a single info arrow');
if (!chain47.nodes.every(n => n.group === 0))
  fail('chain 47', 'one band — the whole chain lies on a single line');
const c47Source = chain47.nodes.find(n => n.type === 'cloud' && !chain47.links.some(l => l.target === n.id));
const c47Path = [];
for (let l = chain47.links.find(x => x.source === c47Source?.id); l; l = chain47.links.find(x => x.source === l.target))
  c47Path.push(chain47.nodes.find(n => n.id === l.target)?.label);
if (JSON.stringify(c47Path) !== JSON.stringify(['raw materials processing', 'raw materials', 'production',
    'inventory', 'sales', 'consumers home stocks', 'depreciation or discard', '|']))
  fail('chain 47', `cloud-to-cloud walk out of order: ${JSON.stringify(c47Path)}`);
if (chain47.nodes.some(n => n.value !== undefined || n.expr !== undefined || n.loop !== undefined))
  fail('chain 47', 'the structure figure carries no numbers and no loops');
const pop48 = JSON.parse(M.go(EX_POP48));
if (pop48.nodes.length !== 5 || pop48.links.length !== 4)   // 2 clouds, 2 faucets, 1 stock
  fail('pop 48', `5 nodes / 4 links expected, got ${pop48.nodes.length} / ${pop48.links.length}`);
if (!pop48.links.every(l => l.type === 'flow') || !pop48.nodes.every(n => n.group === 0))
  fail('pop 48', 'one bare pipe on one band — no info arrows');
const p48Stock = pop48.nodes.find(n => n.type === 'stock');
if (!(p48Stock?.label === 'population'
      && pop48.links.some(l => l.source === pop48.nodes.find(n => n.label === 'births')?.id && l.target === p48Stock?.id)
      && pop48.links.some(l => l.source === p48Stock?.id && l.target === pop48.nodes.find(n => n.label === 'deaths')?.id)))
  fail('pop 48', 'births fills population, deaths drains it');
if (pop48.nodes.some(n => n.value !== undefined || n.loop !== undefined))
  fail('pop 48', 'figure 21\'s skeleton stays value-less and loop-less');
const trio49 = JSON.parse(M.go(EX_TRIO49));
const t49Of = label => trio49.nodes.find(n => n.label === label);
if (trio49.nodes.length !== 17)   // 7 clouds, 7 faucets, 3 stocks — no info arrows, so no ports
  fail('trio 49', `17 nodes expected, got ${trio49.nodes.length}`);
if (trio49.links.length !== 14 || !trio49.links.every(l => l.type === 'flow'))
  fail('trio 49', '14 flow links and not a single info arrow');
if (!(t49Of('criminals in jail')?.group === 0 && t49Of('fuel rods in nuclear power plants')?.group === 1
      && t49Of('registered unemployed')?.group === 2))
  fail('trio 49', 'three disconnected bands in statement order');
const t49Out = trio49.links.filter(l => l.source === t49Of('registered unemployed')?.id)
  .map(l => trio49.nodes.find(n => n.id === l.target)?.label);
if (JSON.stringify(t49Out) !== JSON.stringify(['hiring rate', 'registration lapses']))
  fail('trio 49', `unemployed drains through hiring rate (the band) then registration lapses (the branch), got ${JSON.stringify(t49Out)}`);
if (trio49.links.filter(l => l.target === t49Of('registered unemployed')?.id).length !== 1)
  fail('trio 49', 'one inflow — the layoff rate');
if (trio49.nodes.some(n => n.value !== undefined || n.loop !== undefined))
  fail('trio 49', 'the structure figure carries no numbers and no loops');

console.log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
