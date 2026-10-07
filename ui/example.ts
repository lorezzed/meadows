// Every example is its model, then its notes: comment lines after the last
// statement, like a caption, telling the story the model shows. The editor
// shows about six lines, so a load keeps the opening statements in view and
// the notes are a scroll away; the compiler never sees them. A number in a
// note is the run's own reading at the default horizon, so changing a
// model's numbers means rereading its notes.
export const exampleList = [
    {
        label: 'figure 1',
        content: `| =>inflow [stock] =>outflow |
// How to read the diagrams. [stock] is a stock: whatever has
// built up, drawn as a box. =>inflow and =>outflow are flows,
// taps that fill and drain it. Each | is a cloud, where a
// flow comes from or goes: outside the part of the world
// we're modeling.`
    },
    {
        label: 'figure 2',
        content: `[mineral deposit] =>mining |
// A stock with only an outflow: mining drains the deposit and
// nothing refills it. A nonrenewable resource can only run
// down; how fast is the only question.`
    },
    {
        label: 'figure 3',
        content: `| =>rain [water in reservoir] =>evaporation |
| =>river inflow [water in reservoir] =>discharge |
// Both lines name the same stock, so one reservoir gets two
// inflows and two outflows. It rises while rain and river
// bring in more than evaporation and discharge take out,
// falls while they bring in less, and holds when they match.`
    },
    {
        label: 'figure 4',
        content: `| =>tree growth [wood in living trees] =>logging [lumber inventory] =>lumber sales |
[wood in living trees] =>tree deaths |
// Stocks in a chain: logging drains the forest and fills the
// lumber yard, so one stock's outflow is the next one's
// inflow. The second line gives the forest one more outflow:
// trees that die where they stand.`
    },
    {
        label: 'figure 5 & 6',
        content: `| =>inflow [water in tub: 50] =>outflow: 5 |
// The bathtub with numbers: 50 in the tub and the drain open
// at 5 a minute. The inflow has no number, so its tap stays
// shut. The level falls in a straight line, and the tub is
// empty at minute 10.`
    },
    {
        label: 'figure 5 & 7',
        content: `| =>inflow: 0 @5: 5 [water in tub: 50] =>outflow: 5 |
// The same tub, but the tap opens at minute 5: 0 @5: 5 means
// 0 until t = 5, then 5. From then on water comes in exactly
// as fast as it drains, so the level holds at 25: a dynamic
// equilibrium. Water keeps moving; the stock stops changing.`
    },
    {
        label: 'figure 8',
        content: `| =>inflow [stock1] -> inflow
[stock2] =>outflow |
stock2 -> outflow
// A feedback loop forms when a stock's level changes its own
// flows. stock1 -> inflow: the stock sets how fast it fills.
// stock2 -> outflow: the stock sets how fast it drains. The
// thin arrows carry information, not material.`
    },
    {
        label: 'figure 9',
        content: `[stored energy in body] =>metabolic mobilization of energy [energy available for work] =>energy expenditure |
B(metabolic mobilization of energy <- coffee intake <- discrepancy <- energy available for work)
desired energy level <- discrepancy
// Coffee as a balancing loop. Energy moves from the body's
// store into energy available for work, and work spends it.
// B: more energy available, a smaller gap to the level you
// want, less coffee, less energy mobilized, less available.
// One link turns more into less, so the loop pushes back
// toward the level you want. Coffee adds no energy, though:
// it only draws down the body's store faster.`
    },
    {
        label: 'figure 10',
        content: `[coffee temperature1] =>cooling |
B(coffee temperature1 -> discrepancy1 -> cooling)
room temperature1 -> discrepancy1
| =>heating [coffee temperature2]
B(heating <- discrepancy2 <- coffee temperature2)
discrepancy2 <- room temperature2
// Two cups heading for room temperature: a hot one cooling
// and an iced one warming, each reading its gap to the room.
// B: hotter coffee, a wider gap, faster cooling, cooler
// coffee.
// B: warmer iced coffee, a narrower gap, slower heating.
// One link in each turns more into less, so each loop closes
// its gap: fast while it's wide, slowly as it shrinks.`
    },
    {
        label: 'figure 10 & 11',
        content: `[hot coffee: 100] =>cooling: 0.26 |
B(cooling <- discrepancy <- hot coffee)
room temperature: 18 -> discrepancy
| =>heating: 0.26 [iced coffee: 0]
B(heating <- warming discrepancy <- iced coffee)
room temperature -> warming discrepancy
// The two cups with numbers, in an 18-degree room: one poured
// at 100, one at 0. Each tap runs at 0.26 times its cup's gap
// to the room, so each slows as it closes in. By t = 10 both
// have closed the same 93% of their gaps: the hot cup is 6
// degrees off, the iced one just over 1.`
    },
    {
        label: 'figure 12 & 13',
        content: `| =>interest at two [two percent interest: 100]
R(interest at two <- two percent interest)
rate at two: 0.02 -> interest at two
| =>interest at four [four percent interest: 100]
R(interest at four <- four percent interest)
rate at four: 0.04 -> interest at four
| =>interest at six [six percent interest: 100]
R(interest at six <- six percent interest)
rate at six: 0.06 -> interest at six
| =>interest at eight [eight percent interest: 100]
R(interest at eight <- eight percent interest)
rate at eight: 0.08 -> interest at eight
| =>interest at ten [ten percent interest: 100]
R(interest at ten <- ten percent interest)
rate at ten: 0.1 -> interest at ten
// Five accounts of 100 each, at 2, 4, 6, 8, and 10% a year.
// R: more money, more interest, more money. Every link keeps
// the direction, so each account grows by a fixed share of an
// ever bigger balance. After 10 years: 122, 149, 182, 222,
// and 271. The 10% account doubles about every 7 years
// (70 / 10), the 2% one every 35.`
    },
    {
        label: 'figure 14',
        content: `| =>investment [capital: 100]
R(capital -> output -> investment)
output: (capital / 3)
investment: (output * fraction of output invested)
fraction of output invested: 0.2
// An economy's capital: each year capital makes output worth
// a third of it, a fifth of the output is invested, and
// investment builds more capital.
// R: more capital, more output, more investment, more
// capital. It compounds like a bank account, at 6.7% a year:
// capital nearly doubles in 10 years, 100 to 195.`
    },
    {
        label: 'figure 15',
        content: `| =>heat from furnace [room temperature] =>heat to outside |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures
// A thermostat: two balancing loops pull one stock toward
// different goals. The furnace heats toward the thermostat
// setting; heat leaks out toward the outside temperature.
// B: a cooler room, a wider gap below the setting, more heat
// from the furnace, a warmer room.
// B: a warmer room, a wider gap above the outside, more heat
// lost, a cooler room.
// Where the room settles depends on which loop is stronger.`
    },
    {
        label: 'figure 15 & 16',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures
// The furnace loop alone: the room starts at 10 with the
// thermostat at 18. Outside temperature has no number, so the
// leak stays shut. The furnace closes the gap fast, then
// gently, and the room settles right on 18.`
    },
    {
        label: 'figure 15 & 17',
        content: `| =>heat from furnace [room temperature: 18] =>heat to outside: 0.13 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures
// The leak loop alone: thermostat setting has no number, so
// the furnace stays off, and the room, starting at 18, leaks
// heat to a 10-degree outside at 0.13 times the difference.
// It cools quickly at first, then ever more slowly: 12.2 by
// t = 10, still drifting down toward 10.`
    },
    {
        label: 'figure 15 & 18',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside: 0.13 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures
// Both loops at once: the furnace heats toward 18 while heat
// leaks toward the 10 outside. The room never reaches the
// setting: it settles at 17.2, where the furnace's heat just
// matches the leak. To get 18, you'd set the thermostat a
// little higher.`
    },
    {
        // The cold day is an equation of time — a period-10 cosine dipping
        // to -5 at midday and back to 10 — the driving curve the run
        // integrates, drawn as the smooth dashed goal path.
        label: 'figure 15 & 19',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside: 0.13 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10)) -> discrepancy between inside and outside temperatures
// A cold day: the outside temperature is now a formula of
// time, falling from 10 to -5 at t = 5 and rising back to 10
// (the dashed curve). The colder it gets, the faster heat
// leaks, so the room sags to 15.8 just after the coldest
// point, then recovers to 17.1.`
    },
    {
        label: 'figure 15 & 20',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside: 0.4 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10)) -> discrepancy between inside and outside temperatures
// The same cold day in a leakier house: heat escapes at 0.4
// times the difference instead of 0.13. Now the furnace can't
// keep up: the room sags to 12.4 near the coldest point and
// is back only to 15.8 at t = 10. The stronger the leak loop,
// the further the room settles from its setting.`
    },
    {
        label: 'figure 21 & 22',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.09 -> deaths
// World population from 6.6 billion (1 unit = 10 years).
// R: more people, more births, more people.
// B: more people, more deaths, fewer people.
// Births (0.21 per person per decade) outpace deaths (0.09),
// so the reinforcing loop dominates: exponential growth, to
// 21.8 billion in a century.`
    },
    {
        label: 'figure 21 & 23',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.3 -> deaths
// The same loops with deaths (0.3 per person per decade)
// outpacing births (0.21). Now the balancing loop dominates,
// and the population declines exponentially: 6.6 billion
// down to 2.7 in a century.`
    },
    {
        // The fertility transition is the book's straight ramp itself:
        // 0.21 down to replacement 0.09 over two decades, flat after —
        // max() holds the floor.
        label: 'figure 21 & 24',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: (max(0.09, 0.21 - 0.06 * t)) -> births
mortality: 0.09 -> deaths
// Fertility falls from 0.21 to 0.09 over 20 years and holds
// there: max(0.09, ...) never lets it go lower. Once births
// fall to match deaths, neither loop dominates, and the
// population levels off at 7.5 billion.`
    },
    {
        label: 'figure 25',
        content: `| =>births a [growth: 6.6] =>deaths a |
R(births a <- growth)
B(deaths a <- growth)
fertility a: 0.21 -> births a
mortality a: 0.09 -> deaths a
| =>births b [decline: 6.6] =>deaths b |
R(births b <- decline)
B(deaths b <- decline)
fertility b: 0.21 -> births b
mortality b: 0.3 -> deaths b
| =>births c [stabilization: 6.6] =>deaths c |
R(births c <- stabilization)
B(deaths c <- stabilization)
fertility c: (max(0.09, 0.21 - 0.06 * t)) -> births c
mortality c: 0.09 -> deaths c
// Three futures side by side: growth (births outpace deaths),
// decline (deaths outpace births), and stabilization
// (fertility falls to match mortality). The loops are the
// same in all three; only the numbers decide which one
// dominates. A century on: 21.8, 2.7, and 7.5 billion.`
    },
    {
        // The rebound scenario's fertility as ramp-down plus quarter-wave
        // climb: down to replacement by 2.5, flat to 5 (both maxes hold
        // their floors), then the sin carries it to 0.36 at t=10 — grow,
        // hold, grow again, ending near the book's ≈18 billion.
        label: 'figure 21 & 26',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: (max(0.09, 0.21 - 0.048 * t) + max(0, 0.27 * sin(pi * (t - 5) / 10))) -> births
mortality: 0.09 -> deaths
// Shifting dominance: fertility falls to match mortality by
// year 25, holds there, then climbs again after year 50. The
// population grows, levels off at 7.7 billion, then takes off
// again, reaching 18 billion by the end of the century. Which
// loop dominates can change as the numbers change.`
    },
    {
        label: 'figure 27',
        content: `| =>investment [capital stock] =>depreciation |
R(capital stock -> annual output -> investment)
B(capital stock -> depreciation)
investment fraction -> investment
output per unit capital -> annual output
capital lifetime -> depreciation
// Capital works like a population: investment is its births
// and depreciation its deaths.
// R: more capital, more output, more investment, more
// capital.
// B: more capital, more depreciation, less capital.
// Output per unit capital and the investment fraction set the
// R loop's strength; capital lifetime sets the B loop's.`
    },
    {
        label: 'figure 27 & 28',
        content: `| =>investment at twenty [capital at twenty: 100] =>depreciation at twenty |
R(capital at twenty -> annual output at twenty -> investment at twenty)
B(capital at twenty -> depreciation at twenty)
annual output at twenty: (capital at twenty * output per unit capital at twenty)
investment at twenty: (annual output at twenty * investment fraction at twenty)
depreciation at twenty: (capital at twenty / capital lifetime at twenty)
investment fraction at twenty: 0.2
output per unit capital at twenty: (5 / 3)
capital lifetime at twenty: 4
| =>investment at fifteen [capital at fifteen: 100] =>depreciation at fifteen |
R(capital at fifteen -> annual output at fifteen -> investment at fifteen)
B(capital at fifteen -> depreciation at fifteen)
annual output at fifteen: (capital at fifteen * output per unit capital at fifteen)
investment at fifteen: (annual output at fifteen * investment fraction at fifteen)
depreciation at fifteen: (capital at fifteen / capital lifetime at fifteen)
investment fraction at fifteen: 0.2
output per unit capital at fifteen: (5 / 3)
capital lifetime at fifteen: 3
| =>investment at ten [capital at ten: 100] =>depreciation at ten |
R(capital at ten -> annual output at ten -> investment at ten)
B(capital at ten -> depreciation at ten)
annual output at ten: (capital at ten * output per unit capital at ten)
investment at ten: (annual output at ten * investment fraction at ten)
depreciation at ten: (capital at ten / capital lifetime at ten)
investment fraction at ten: 0.2
output per unit capital at ten: (5 / 3)
capital lifetime at ten: 2
// Three economies that differ only in how long machines last
// (1 unit = 5 years). Each invests a fifth of its output,
// adding capital at 6.7% a year. With 20-year machines, 5% a
// year wears out and capital grows: 230 in 50 years. With 15,
// the loops balance exactly and capital stays at 100. With
// 10, 10% a year wears out: capital shrinks to 19.`
    },
    {
        label: 'figure 29',
        content: `| =>deliveries [inventory of cars on the lot] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
B(inventory of cars on the lot -> sales)
desired inventory -> discrepancy
perceived sales -> orders to factory
perceived sales -> desired inventory
sales -> perceived sales
customer demand -> sales
// A car dealer's lot: deliveries from the factory fill it,
// and sales empty it.
// B: fewer cars on the lot, a bigger gap to the inventory the
// dealer wants, more orders, more deliveries, more cars.
// B: more cars on the lot, more sales, fewer cars (an empty
// lot sells nothing).
// The dealer also watches sales: the more cars sell, the more
// the dealer orders and wants on hand.`
    },
    {
        label: 'figure 29 & 30',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + adjustment * discrepancy)
deliveries: (orders to factory)
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (coverage * perceived sales)
perceived sales: (customer demand)
sales: (customer demand)
customer demand: 20 @2.5: 22
coverage: 10
adjustment: 10
// The dealer with numbers but no delays (1 unit = 10 days).
// Demand steps up 10% on day 25. The dealer keeps inventory
// in proportion to sales, so the target rises from 200 to
// 220, and orders close the gap within days: one clean step
// up, then calm. This is the balancing loop as intended.`
    },
    {
        label: 'figure 31',
        content: `| =>deliveries [inventory of cars on the lot] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
B(inventory of cars on the lot -> sales)
desired inventory -> discrepancy
perceived sales -> orders to factory
perceived sales -> desired inventory
sales -> perceived sales
customer demand -> sales
delivery delay -> deliveries
response delay -> orders to factory
perception delay -> perceived sales
// The dealership with the three delays real dealers live
// with: perception (sales are seen late), response (the
// dealer closes a gap bit by bit, not all at once), and
// delivery (cars take time to come from the factory). Each
// delay dot marks where one bites.`
    },
    {
        // Both delays are pipeline shifts, minting no nodes — the diagram
        // stays exactly figure 31: perceived sales reads the sales flow
        // as it was 0.5 ago (sales(t - perception delay)), deliveries the
        // orders 0.5 ago. Inventory (1 unit = 10 days) holds 200 to day
        // 25, dips to ~187 at day 33, then oscillates on a ~20-day period
        // with growing swings: 261 at day 44, 155 at day 74, 296 at day
        // 84, 139 at day 95.
        label: 'figure 31 & 32',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t - perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.3
delivery delay: 0.5
// The dealer with delays (1 unit = 10 days): sales are seen
// 5 days late, orders arrive 5 days after they're placed, and
// the dealer orders to close any gap over 3 days. Demand
// steps up 10% on day 25, and the lot, instead of easing up
// to 220, swings: down to 187, up to 261, wider every time.
// The loop still balances; the delays make it overshoot.`
    },
    {
        // The 31 & 32 model with a 2-day response delay (0.2): figure 33's
        // panels are its flows — tick the chart's flows checkbox for sales
        // vs perceived sales (the perception pair) and orders vs deliveries
        // (the delivery pair).
        label: 'figure 31 & 33',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t - perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.2
delivery delay: 0.5
// The dealer's flows (figure 33): tick flows under the chart.
// Each dashed line is its solid partner seen late: perceived
// sales trail sales by 5 days, deliveries trail orders by 5.
// This dealer closes gaps over 2 days, not 3, and the lot
// swings harder than in 31 & 32, between 127 and 400.`
    },
    {
        // Figure 34's inventory chart, under the book's own figure
        // number: the 31 & 32 model with the dealer half a day quicker
        // (response delay 0.25 = 2.5 days) — the same opening, flat 200
        // to day 25 and a ~187 dip at day 32, then the same ~20-day
        // oscillation swinging WIDER than 32's for the quicker hand:
        // 333 at day 62, 132 at day 74, 350 at day 84.
        label: 'figure 31 & 34',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t - perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.25
delivery delay: 0.5
// The dealer reacting faster, closing gaps over 2.5 days
// instead of 3. The oscillation gets worse, not better: the
// lot swings between 132 and 350. Reacting faster to late
// information only amplifies the overshoot.`
    },
    {
        // Figure 35's growing oscillation: the dealer reacting FASTEST
        // (response delay 0.1 = 1 day) makes it worst of the family —
        // from the same ~188 dip at day 31, peaks are driven to 355 at
        // day 41 and 631 at day 61, troughs cut to 116. The order rate
        // swings so hard it goes deeply negative, clamping deliveries
        // shut on ~40% of steps. Figure 31 & 36 is the mirror: a SLOWER
        // dealer (6 days) rings once and settles.
        label: 'figure 31 & 35',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t - perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.1
delivery delay: 0.5
// The fastest dealer of all, closing gaps in a single day.
// Worst of the family: the lot swings between 115 and 630
// cars, and orders swing so hard that deliveries stop for up
// to three weeks at a time.`
    },
    {
        // Figure 36's damped settle: the dealer reacting SLOWER (response
        // delay 0.6 = 6 days) — one shallow dip to ~184, one overshoot to
        // ~233, then flat on the new 220.
        label: 'figure 31 & 36',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t - perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.6
delivery delay: 0.5
// The dealer reacting slower, closing gaps over 6 days. Now
// the swings die away: one dip to 184, one overshoot to 233,
// then the lot settles on the new 220. With delays in the
// loop, a patient response beats a quick one.`
    },
    {
        // The oil economy: renewable capital constrained by a NONRENEWABLE
        // resource — figure 42's capital band, but the resource band has no
        // regeneration (extraction drains to a cloud, figure 2's shape).
        // Structure only, value-less; extraction -> profit runs an info
        // arrow off a faucet (the figure 29 precedent).
        label: 'figure 37',
        content: `| =>investment [capital] =>depreciation |
[resource] =>extraction |
capital -> growth goal -> investment
R(investment <- profit <- capital)
B(depreciation <- capital)
capital lifetime -> depreciation
B(profit <- capital -> extraction)
extraction -> profit
profit <- price <- yield per unit capital -> extraction
resource -> yield per unit capital
// An oil economy: capital (rigs) is built from profit and
// wears out, and it extracts oil that nothing replaces.
// R: more capital, more profit, more investment, more
// capital.
// B: more capital, more depreciation, less capital.
// B: more capital, more extraction, less oil left, lower
// yield per unit of capital, less profit, less capital.`
    },
    {
        // Figure 38's depletion story on the figure-37 structure (1 unit =
        // 10 years): capital compounds ~5%/yr while profit covers the 10%
        // growth goal, peaks near year 55 as the resource thins, then
        // decays at the depreciation rate; the resource S-curves 1000 -> 0.
        // The book's investment = min(profit, goal) is a hard min the DSL
        // lacks — the cube-norm soft-min profit*goal/((profit^3+goal^3)^(1/3))
        // holds the goal while profit is ample and releases to profit as it
        // collapses. Price stays constant in this scenario, and profit reads
        // yield per unit capital in place of the extraction faucet (a
        // formula cannot read a faucet's rate).
        label: 'figure 37 & 38',
        content: `| =>investment [capital: 5] =>depreciation |
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
yield per unit capital: (resource / 1000)
// The oil economy with numbers (1 unit = 10 years). Capital
// grows about 5% a year while profits are ample. As the oil
// thins, each rig brings up less: extraction peaks around
// year 38, profit fades, and capital peaks near year 58 at
// 11 times its start, then shrinks as rigs wear out.`
    },
    {
        // Figure 39's endowment comparison: the 37 & 38 economy three times
        // over with the resource at 1000 / 2000 / 4000 — each copy's yield
        // reads its OWN endowment (resource / R0), so the three runs start
        // identically and each doubling buys only ~14 years, peaking about
        // twice as high and crashing harder. Every constant is per-copy
        // (the figures 12 & 13 / 25 / 27 & 28 convention) so the three
        // subsystems stay disconnected and settle as separate clusters.
        // The book plots extraction (a faucet, so no chart series here);
        // the capital humps and resource S-curves carry the same lesson.
        // Raise t = to ~12 to watch the quadrupled crash complete.
        label: 'figure 37 & 39',
        content: `| =>investment base [capital base: 5] =>depreciation base |
[resource base: 1000] =>extraction base |
R(investment base <- profit base <- capital base)
B(depreciation base <- capital base)
B(profit base <- capital base -> extraction base)
investment base: (profit base * growth goal base / ((profit base^3 + growth goal base^3)^(1 / 3)))
growth goal base: (capital base)
depreciation base: (capital base / capital lifetime base)
capital lifetime base: 2
extraction base: (14 capital base * yield per unit capital base)
profit base: (4 price base * capital base * yield per unit capital base)
price base: 1
yield per unit capital base: (resource base / 1000)
| =>investment doubled [capital doubled: 5] =>depreciation doubled |
[resource doubled: 2000] =>extraction doubled |
R(investment doubled <- profit doubled <- capital doubled)
B(depreciation doubled <- capital doubled)
B(profit doubled <- capital doubled -> extraction doubled)
investment doubled: (profit doubled * growth goal doubled / ((profit doubled^3 + growth goal doubled^3)^(1 / 3)))
growth goal doubled: (capital doubled)
depreciation doubled: (capital doubled / capital lifetime doubled)
capital lifetime doubled: 2
extraction doubled: (14 capital doubled * yield per unit capital doubled)
profit doubled: (4 price doubled * capital doubled * yield per unit capital doubled)
price doubled: 1
yield per unit capital doubled: (resource doubled / 2000)
| =>investment quadrupled [capital quadrupled: 5] =>depreciation quadrupled |
[resource quadrupled: 4000] =>extraction quadrupled |
R(investment quadrupled <- profit quadrupled <- capital quadrupled)
B(depreciation quadrupled <- capital quadrupled)
B(profit quadrupled <- capital quadrupled -> extraction quadrupled)
investment quadrupled: (profit quadrupled * growth goal quadrupled / ((profit quadrupled^3 + growth goal quadrupled^3)^(1 / 3)))
growth goal quadrupled: (capital quadrupled)
depreciation quadrupled: (capital quadrupled / capital lifetime quadrupled)
capital lifetime quadrupled: 2
extraction quadrupled: (14 capital quadrupled * yield per unit capital quadrupled)
profit quadrupled: (4 price quadrupled * capital quadrupled * yield per unit capital quadrupled)
price quadrupled: 1
yield per unit capital quadrupled: (resource quadrupled / 4000)
// The oil economy with the oil doubled, then quadrupled. Each
// doubling buys only about 14 more years before extraction
// peaks, and each peak is about twice as high, with a harder
// crash after. Raise t = to 12 to watch the last crash
// finish.`
    },
    {
        // Figure 40's growth-goal comparison: the 37 & 38 economy four
        // times over, differing only in the desired capital growth — net
        // 7 / 5 / 3 / 1 %/yr = gross goal coefficients 1.2 / 1 / 0.8 / 0.6
        // over the 5%/yr depreciation. The faster the growth, the sooner
        // and harder the crash (extraction peaks ~year 33 / 39 / 48); at
        // 1% the economy is still alive at year 100 with a third of the
        // resource left. Fully per-copy constants keep the four
        // subsystems disconnected. The book plots extraction (a faucet,
        // no series); the capital humps and resource S-curves carry the
        // same lesson.
        label: 'figure 37 & 40',
        content: `| =>investment at seven [capital at seven: 5] =>depreciation at seven |
[resource at seven: 1000] =>extraction at seven |
R(investment at seven <- profit at seven <- capital at seven)
B(depreciation at seven <- capital at seven)
B(profit at seven <- capital at seven -> extraction at seven)
investment at seven: (profit at seven * growth goal at seven / ((profit at seven^3 + growth goal at seven^3)^(1 / 3)))
growth goal at seven: (1.2 capital at seven)
depreciation at seven: (capital at seven / capital lifetime at seven)
capital lifetime at seven: 2
extraction at seven: (14 capital at seven * yield per unit capital at seven)
profit at seven: (4 price at seven * capital at seven * yield per unit capital at seven)
price at seven: 1
yield per unit capital at seven: (resource at seven / 1000)
| =>investment at five [capital at five: 5] =>depreciation at five |
[resource at five: 1000] =>extraction at five |
R(investment at five <- profit at five <- capital at five)
B(depreciation at five <- capital at five)
B(profit at five <- capital at five -> extraction at five)
investment at five: (profit at five * growth goal at five / ((profit at five^3 + growth goal at five^3)^(1 / 3)))
growth goal at five: (capital at five)
depreciation at five: (capital at five / capital lifetime at five)
capital lifetime at five: 2
extraction at five: (14 capital at five * yield per unit capital at five)
profit at five: (4 price at five * capital at five * yield per unit capital at five)
price at five: 1
yield per unit capital at five: (resource at five / 1000)
| =>investment at three [capital at three: 5] =>depreciation at three |
[resource at three: 1000] =>extraction at three |
R(investment at three <- profit at three <- capital at three)
B(depreciation at three <- capital at three)
B(profit at three <- capital at three -> extraction at three)
investment at three: (profit at three * growth goal at three / ((profit at three^3 + growth goal at three^3)^(1 / 3)))
growth goal at three: (0.8 capital at three)
depreciation at three: (capital at three / capital lifetime at three)
capital lifetime at three: 2
extraction at three: (14 capital at three * yield per unit capital at three)
profit at three: (4 price at three * capital at three * yield per unit capital at three)
price at three: 1
yield per unit capital at three: (resource at three / 1000)
| =>investment at one [capital at one: 5] =>depreciation at one |
[resource at one: 1000] =>extraction at one |
R(investment at one <- profit at one <- capital at one)
B(depreciation at one <- capital at one)
B(profit at one <- capital at one -> extraction at one)
investment at one: (profit at one * growth goal at one / ((profit at one^3 + growth goal at one^3)^(1 / 3)))
growth goal at one: (0.6 capital at one)
depreciation at one: (capital at one / capital lifetime at one)
capital lifetime at one: 2
extraction at one: (14 capital at one * yield per unit capital at one)
profit at one: (4 price at one * capital at one * yield per unit capital at one)
price at one: 1
yield per unit capital at one: (resource at one / 1000)
// Four oil economies aiming to grow 7, 5, 3, and 1% a year.
// The faster the growth, the sooner and harder the crash:
// capital peaks around year 48, 58, and 79. At 1% the economy
// is still growing at year 100, with 30% of its oil left.`
    },
    {
        // Figure 41's scarcity-pricing run: the 37 & 38 economy, but price
        // is no longer constant — it starts at 1 and saturates toward 6 as
        // the ore thins (price: (6 / (1 + 5 yield^2))), making the
        // structure figure's yield -> price arrow LIVE, and profit nets a
        // 0.5 capital operating cost so it crosses zero after the peak
        // (investment shuts off and capital decays at the full
        // depreciation rate). Result: the same extraction curve as 38
        // (~21/yr peaking near year 40 — the oil is what it is) but
        // capital keeps growing a decade longer and peaks near 102 at
        // year ~65, twice the base run — more rigs chasing less oil.
        label: 'figure 37 & 41',
        content: `| =>investment [capital: 5] =>depreciation |
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
yield per unit capital: (resource / 1000)
// Scarcity pricing: as the oil thins its price rises, from 1
// toward 6, so each barrel earns more. That keeps profit up
// and the rigs coming for longer: capital peaks near year 65
// at 102, nearly twice the fixed-price run. But extraction
// still peaks around year 40: more rigs chase less oil.`
    },
    {
        label: 'figure 42',
        content: `| =>investment [capital] =>depreciation |
| =>regeneration [resource] =>harvest |
capital -> growth goal -> investment
R(investment <- profit <- capital)
B(depreciation <- capital)
capital lifetime -> depreciation
B(profit <- capital -> harvest)
harvest -> profit
profit <- price <- yield per unit capital -> harvest
resource -> yield per unit capital
regeneration <- regeneration rate <- resource -> regeneration
// A fishing economy: the oil economy's capital, now boats,
// but fish breed, so the resource can refill itself.
// R: more boats, more profit, more investment, more boats.
// B: more boats, more harvest, fewer fish, a smaller catch
// per boat, less profit, fewer boats.
// How fast fish regenerate depends on how many there are.`
    },
    {
        // Figure 43, all three panels in one button (1 unit = 15 years,
        // the 150-year axis): the renewable sibling of the oil economy,
        // ringing once before it settles the way the book's panels do.
        // Three pieces make the dip: growth goal 1.5 capital is the
        // book's 5%/yr desired growth (net of the 0.75/unit depreciation
        // drain); profit is income read off the catch a season late
        // (price * harvest(t - 0.1), minus a 1.75/unit operating cost of
        // capital) — reading the FAUCET through the pipeline shift, which
        // mints no nodes, so the diagram stays exactly figure 42; and
        // per-fish regeneration is a depensation hump (112 (x(1 - x))^2,
        // x = resource/1000: crowded fish and scarce fish both breed
        // poorly), so total regeneration peaks at R = 600, ABOVE the
        // settle point, and its shallow slope at equilibrium barely damps
        // the loop. Ticking the chart's flows checkbox (the delay view its
        // profit read unlocks) shows every panel at once. The solid harvest
        // rate is panel A: riding the goal-blind ramp over the hump to
        // ~4070 (~271/yr — per-unit rates are 15x the book's per-year
        // axis) at year ~111, dipping, settling at ~3500 (~233/yr).
        // Capital's line is panel B: an S-curve cresting ~1450 before
        // easing onto ~1397. The resource's line is panel C: sliding to
        // ~484 and recovering onto the flat 500, where regeneration
        // balances the catch and profit meets depreciation. The dashed
        // profit line is the season-late income read whose overshoot
        // causes the dip. Figure 44 swaps in the technology yield curve
        // and never settles — this one does.
        label: 'figure 42 & 43',
        content: `| =>investment [capital: 5] =>depreciation |
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
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)
// The fishery with numbers (1 unit = 15 years). The fleet
// grows 5% a year until the fish thin out. Profit reads the
// catch a year and a half late, so the fleet overshoots and
// the fish dip to 484 (of 1000) before everything settles:
// fish at 500, capital near 1400, a steady catch. Tick flows
// to see the harvest.`
    },
    {
        // Figure 44, all three panels in one button: the same fishery as
        // 42 & 43 with ONE line changed — better fishing technology. The
        // squared yield curve becomes a saturating one (the Hill form
        // 1.27 x^2.8 / (x^2.8 + 0.27), x = resource/1000, still exactly
        // 1 at carrying capacity): sonar-era boats keep catching near
        // full efficiency down past half density, then the curve cliffs.
        // Efficiency no longer signals depletion, so the bind slides
        // from R = 500 down the regeneration hump's unstable left side
        // to R ~380 — and there the season-late profit read overpowers
        // what little damping is left: instead of ringing once and
        // settling, the fishery orbits its never-reached equilibrium
        // forever, period ~21 years. With the chart's flows checkbox
        // ticked, the solid harvest rate is panel A: cresting ~4150
        // (~277/yr — per-unit rates are 15x the book's per-year axis)
        // near year 100, then cycling with rebound peaks clearly BELOW
        // the crest. Capital's line is panel B: topping out ~1115 —
        // nowhere near 43's 1450 — then cycling. The resource's line is
        // panel C: bottoming ~308 and cycling without ever regaining
        // halfway. The dashed profit line swings a beat behind each
        // cycle — the delay driving the dance. Nothing collapses and
        // nothing settles: the book's sustained oscillation.
        label: 'figure 42 & 44',
        content: `| =>investment [capital: 5] =>depreciation |
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
yield per unit capital: ((1.27 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.27))
regeneration: (resource * regeneration rate)
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)
// Better technology: boats now catch almost as well from a
// thin stock as from a full one, so scarcity no longer shows
// in the catch. The fleet keeps growing into the decline, the
// fish fall to 308, and the fishery never settles: it cycles,
// boom and bust, about every 21 years.`
    },
    {
        // Figure 45, all three panels in one button: the same fishery
        // again, technology pushed to its endgame — ONE constant moves
        // from figure 44's line. The Hill curve's half-yield point drops
        // 0.27 -> 0.01 (yield above half strength until the fish fall
        // below ~a fifth of carrying capacity: sonar, spotter planes,
        // factory ships — catch efficiency no longer sags as the stock
        // thins). Below the bind harvest falls like x^2.8 while
        // depensation regeneration falls like x^3, so once the plunge
        // starts nothing turns it: the resource is stripped to ~2% and
        // STAYS there (the t = 20 horizon shows no comeback — scarce
        // fish can't find mates), profit dies with the catch, and
        // capital rots at its bare 20-year lifetime. With the chart's flows
        // checkbox ticked, the solid harvest rate is panel A:
        // cresting ~4840 (~322/yr — per-unit rates are 15x the book's
        // per-year axis) at year ~95, then cliffing to ZERO by year
        // ~108, flat forever. Capital's line is panel B: the 5%/yr ramp
        // to a pointed tent ~634 at year ~99, then pure-depreciation
        // exponential decay (~47 by year 150). The resource's line is
        // panel C: the gentle glide, the plunge through year ~100, and
        // the dead-flat ~2% tail. The dashed profit line spikes and
        // dies with the catch. Figure 43 settles, 44 oscillates — 45 is
        // the one-way trip.
        label: 'figure 42 & 45',
        content: `| =>investment [capital: 5] =>depreciation |
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
yield per unit capital: ((1.01 (resource / 1000)^2.8) / ((resource / 1000)^2.8 + 0.01))
regeneration: (resource * regeneration rate)
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)
// Technology's endgame: boats catch at full strength until
// the fish are nearly gone. Nothing warns the fleet, so it
// fishes the stock down to 2%, too few left to breed it back.
// The catch collapses to zero, profit with it, and the idle
// fleet rusts away.`
    },

    {
        // Figure 47's materials economy: one straight cloud-to-cloud chain
        // through three stocks — the figure 1/4 shape at full length.
        // Structure only, value-less. The book's "consumers' home stocks"
        // drops its apostrophe (not an identifier character).
        label: 'figure 47',
        content: `| =>raw materials processing [raw materials] =>production [inventory] =>sales [consumers home stocks] =>depreciation or discard |
// The materials economy as one chain, from the cloud it's dug
// out of to the cloud it's thrown into. Those clouds are where
// the diagram stops looking, not where the stuff stops: a
// mine at one end, a dump at the other.`
    },
    {
        // Figure 48's bare population stock: births in, deaths out —
        // figure 21's skeleton with no loops, no values, no fertility or
        // mortality web. Structure only.
        label: 'figure 48',
        content: `| =>births [population] =>deaths |
// Population as a bare stock: births in, deaths out, both
// through clouds. No loops are drawn, so nothing says what
// drives either flow: that's what figure 21 adds.`
    },
    {
        // Figure 49's three everyday stocks, each its own band: criminals
        // in jail, fuel rods in plants, and the registered unemployed —
        // whose SECOND outflow (registration lapses) leaves the band and
        // elbows down to its own cloud, figure 3's branch rule. Structure
        // only.
        label: 'figure 49',
        content: `| =>new sentences [criminals in jail] =>sentence completion |
| =>new fuel rods [fuel rods in nuclear power plants] =>fuel rod replacements |
| =>layoff rate [registered unemployed] =>hiring rate |
[registered unemployed] =>registration lapses |
// Three everyday stocks, each with its own taps: prisoners
// (sentences begin and end), fuel rods in nuclear plants (new
// ones in, spent ones out), and the registered unemployed,
// who leave by being hired or by letting their registration
// lapse.`
    },

    // Sketches (not from the book): structure alone, not a number anywhere —
    // the stocks, flows, and loops you'd draw on a whiteboard before any
    // quantity is known. They lead the examples row: structure first, then
    // the numbers. The chart stays an empty frame; the diagram tells the
    // story, and the animate toggle still beats every loop. Their notes
    // walk each loop link by link with one plain rule, which the notes on
    // the models further down reuse: a link that turns more into less makes
    // a loop push back (B), while links that all keep the direction make it
    // snowball (R). Each sketch is five statements at most, so a load keeps
    // every one in view.
    {
        // One balancing loop through a relay dot.
        label: 'hunger',
        content: `| =>eating [food in stomach] =>digestion |
B(eating <- hunger <- food in stomach)
// Eating fills the stomach, and digestion empties it.
// B: more hunger, more eating, a fuller stomach, less hunger.
// One link turns more into less, so the loop pushes back:
// it's what ends a meal.`
    },
    {
        // The classic first causal loop diagram, R against B: which loop
        // dominates is the one question a sketch can't answer.
        label: 'chicken & egg',
        content: `| =>hatching [chickens] =>road crossings |
R(hatching <- eggs <- chickens)
B(road crossings <- chickens)
// Chickens hatch from eggs, and leave by crossing the road.
// R: more chickens, more eggs, more hatching, more chickens.
// Every link keeps the direction, so change comes back bigger.
// B: more chickens, more road crossings, fewer chickens.
// One link turns more into less, so the loop pushes back.
// Boom or dwindling flock? Whichever loop is stronger wins,
// and only numbers can say which.`
    },
    {
        // A fix that backfires. The loops leave the backlog along one
        // arrow (backlog -> overtime, drawn once) and close on opposite
        // taps, so each letter keeps its own side.
        label: 'burnout',
        content: `| =>new tasks [backlog] =>finishing tasks |
B(finishing tasks <- overtime <- backlog)
R(new tasks <- mistakes <- fatigue <- overtime <- backlog)
// Tasks pile into the backlog and leave it once finished.
// B: a bigger backlog, more overtime, more tasks finished,
// a smaller backlog. One link turns more into less, so the
// loop pushes back.
// R: more overtime, more fatigue, more mistakes, and each
// mistake comes back as a new task: a bigger backlog, more
// overtime. Every link keeps the direction, so it snowballs.
// A fix that backfires: overtime clears the backlog today,
// and the fatigue it leaves behind refills it later.`
    },
    {
        // Two populations, three loops. The cross-band loop's two arrows
        // share no node, and one expression can't draw them without a
        // third to join them, so its annotation fans out from rabbits:
        // rabbits -> rabbits eaten is a real arrow too (a meal takes
        // rabbits as well as foxes).
        label: 'predator & prey',
        content: `| =>rabbit births [rabbits] =>rabbits eaten |
| =>fox births [foxes] =>fox deaths |
R(rabbit births <- rabbits)
B(fox births <- rabbits -> rabbits eaten <- foxes)
B(fox deaths <- foxes)
// Rabbits are born and eaten; foxes are born and die.
// R: more rabbits, more rabbit births, more rabbits.
// B: more foxes, more rabbits eaten, fewer rabbits, fewer fox
// births, fewer foxes. One link turns more into less, so the
// loop pushes back: foxes thrive until the rabbits run short.
// B: more foxes, more fox deaths, fewer foxes.`
    },
    {
        // No stocks at all: a causal loop diagram of three dots, closed by
        // naming its first node again.
        label: 'confidence',
        content: `R(confidence -> practice -> skill -> confidence)
// A loop on its own, no stocks or flows: a causal loop diagram.
// R: more confidence, more practice, more skill, more confidence.
// Every link keeps the direction, so change comes back bigger,
// downhill as readily as up: a vicious circle is the same loop.`
    },

    // Starter models (not from the book): the simplest systems, one behavior
    // each, in rising order — a stock filling at a constant rate, the net
    // of two flows, compounding growth, exponential decay, an equilibrium,
    // goal-seeking, an S-curve, and two stocks in a chain. Their formulas
    // spell every product with `*`, so each reads as it runs (and the
    // format button leaves it as written).
    {
        // One tap, never closed: 5 a week into a jar that already holds 10.
        // A stock is its starting level plus the running total of its
        // flows — a straight line from 10 to 60.
        label: 'piggy bank',
        content: `| =>pocket money: 5 [piggy bank: 10]
// A stock is where it started plus everything that has
// flowed in: 10, plus 5 a week for 10 weeks, makes 60. A
// constant inflow draws a straight line.`
    },
    {
        // Two constant flows: 6 new emails an hour against 10 replies. The
        // inbox moves by their difference alone, down 4 an hour, 50 to 10.
        label: 'inbox',
        content: `| =>new email: 6 [inbox: 50] =>replies: 10 |
// Two constant flows: 6 new emails an hour in, 10 replies
// out. Only the difference matters: the inbox falls by 4 an
// hour, from 50 to 10.`
    },
    {
        // Births in proportion to the rabbits already there — a reinforcing
        // loop that doubles the warren every ln 2 / 0.5 ≈ 1.4 time units:
        // 2 rabbits become ~280 by t=10.
        label: 'rabbits',
        content: `| =>births [rabbits: 2]
births: (0.5 * rabbits)
R(births <- rabbits)
// R: more rabbits, more births, more rabbits. Births run at
// half the population per unit of time, so the warren doubles
// about every 1.4 units: 2 rabbits become 279 by t = 10. Each
// doubling is bigger than all the ones before it.`
    },
    {
        // Clearance in proportion to what's left — a balancing loop that
        // halves the dose every ln 2 / 0.4 ≈ 1.7 time units: 100 falls
        // under 2 by t=10, and is never quite gone.
        label: 'medicine',
        content: `[medicine in blood: 100] =>clearance |
clearance: (0.4 * medicine in blood)
B(clearance <- medicine in blood)
// B: more medicine, faster clearance, less medicine. The body
// clears 40% of what's there per unit of time, so the dose
// halves about every 1.7 units: 100 falls under 2 by t = 10,
// and is never quite gone.`
    },
    {
        // A steady tap against a leak that grows with the water: the level
        // climbs until the leak (half the level) matches the tap's 6 — an
        // equilibrium at 12 it approaches but never passes.
        label: 'leaky bucket',
        content: `| =>tap: 6 [bucket: 0] =>leak |
leak: (0.5 * bucket)
B(leak <- bucket)
// A steady tap against a leak that grows with the water.
// B: more water, a faster leak, less water. The level climbs
// until the leak (half the level) matches the tap's 6: at 12
// they balance, and the bucket holds steady with water still
// running through it.`
    },
    {
        // Learning closes 30% of the gap to mastery per unit: quick at
        // first, then diminishing returns as the gap shrinks — 53 by t=2.5,
        // 95 by t=10, never quite 100.
        label: 'learning',
        content: `| =>learning [skill: 0]
mastery: 100
learning: (0.3 * (mastery - skill))
B(learning <- skill)
// Goal-seeking: you learn 30% of what's left to learn per
// unit of time.
// B: more skill, a smaller gap to mastery, slower learning.
// Quick at first, then diminishing returns: 53 by t = 2.5,
// 95 by t = 10, and never quite 100.`
    },
    {
        // Spawning compounds with the fish (R) while crowding throttles it
        // (B): a slow start, the fastest growth at half capacity (250,
        // around t≈4.3), then a leveling-off just under the pond's 500 —
        // the S-curve of growth meeting its limit.
        label: 'fish pond',
        content: `| =>spawning [fish: 10]
crowding: (fish / 500)
spawning: (0.9 * fish * (1 - crowding))
R(spawning <- fish)
B(spawning <- crowding <- fish)
// R: more fish, more spawning, more fish.
// B: more fish, more crowding, less spawning, fewer fish.
// At first the R loop dominates and growth speeds up. Past
// 250 fish, half the pond's 500, crowding takes over and
// growth slows: an S-curve, flattening out just under 500.`
    },
    {
        // Two stocks in a chain: snow melts into the lake as the river
        // drains it. The lake rises while melting outpaces the river and
        // falls once it doesn't — a pulse passing through, cresting near
        // 47 at t≈2.5.
        label: 'snowmelt',
        content: `[snow: 100] =>melting [lake: 0] =>river |
melting: (0.5 * snow)
river: (0.3 * lake)
B(melting <- snow)
B(river <- lake)
// Snow melts into the lake and the river drains it: two
// stocks in a chain, a balancing loop on each tap. The lake
// rises while melting outpaces the river and falls once it
// doesn't: a pulse passing through, cresting near 47 at
// t = 2.5.`
    },

    // Showcase models (not from the book): each button flexes a language
    // capability — a nonlinear rate law, @ pulse schedules, a feedback loop
    // closed through a time shift, and ^ in a real physical law.
    {
        // Logistic contagion: catching it needs BOTH crowds, so the rate law
        // multiplies the two stocks (0.001 susceptible * infected) — the R/B
        // pair around one faucet is the whole story of an S-curve.
        label: 'epidemic',
        content: `[susceptible: 990] =>infection [infected: 10]
infection: (0.001 susceptible * infected)
R(infection <- infected)
B(infection <- susceptible)
// Catching it takes both crowds, the infected meeting the
// not yet infected, so the rate multiplies the two stocks.
// R: more infected, more infection, more infected.
// B: more infection, fewer left to catch it, less infection.
// It spreads fastest at t = 4.7, with half the town infected,
// then burns out as it runs short of people to infect.`
    },
    {
        // Two espresso shots as @ pulses (the tap opens for half an hour and
        // shuts again) against a proportional decay — the afternoon shot
        // stacks on the morning's residue.
        label: 'caffeine',
        content: `| =>espresso: 0 @1: 240 @1.5: 0 @6: 240 @6.5: 0 [caffeine in blood: 0] =>metabolism |
metabolism: (0.14 caffeine in blood)
B(metabolism <- caffeine in blood)
// Two espressos as pulses: the tap opens at 240 an hour for
// half an hour, at hour 1 and again at hour 6. The body
// clears 14% an hour (a half-life of about 5 hours), so the
// second shot lands on what's left of the first and peaks
// higher: 174 against 116. Tick flows to see the pulses.`
    },
    {
        // The hog cycle: farmers breed on the price TWO UNITS AGO — a loop
        // legally closed through the pipeline shift price(t - 2), so supply
        // keeps overshooting demand and the market is slow to settle.
        label: 'boom & bust',
        content: `| =>breeding [pigs at market: 90] =>sales |
breeding: (price(t - 2))
price: (200 - pigs at market)
sales: (0.5 pigs at market)
B(breeding <- price <- pigs at market)
// The hog cycle: farmers breed on the price of two units ago,
// since a pig takes that long to raise. price(t - 2) is a
// time shift, not a product: the price as it was at t - 2.
// B: more pigs, a lower price, less breeding, fewer pigs.
// The loop would settle at 133 pigs, where breeding matches
// sales, but each correction answers the market of two units
// ago and lands after it has moved: it overshoots.
// Over t: until t = 2 there's no history, so breeding holds
// the opening price, 110, while the price falls to 27. The
// boom peaks at 177 at t = 2.4. From t = 2 breeding is
// exactly price(t - 2): it bottoms at 23 at t = 4.4,
// answering that peak after the glut is over, and the bust
// bottoms at 95 at t = 5.55. One cycle takes 6.3 units,
// about three delays.
// The delay's length decides the story:
//   price(t)      glides to 133, no swing at all
//   price(t - 1)  overshoots to 153, dips to 125, settles
//   price(t - 2)  swings, shrinking slowly (this model)
//   price(t - 3)  swings, growing: 193, 65, 212, 48, 232
// The tipping point lies between 2.3 and 2.4, just above
// this model's 2, so its swings die out slowly.
// Tick flows: breeding (dashed) is price (solid) 2 units
// later. Set t = to 40 to watch the swings shrink.`
    },
    {
        // A skydiver: drag grows with speed^2 until it balances gravity —
        // speed flattens at the terminal velocity √500 ≈ 22.4 — while
        // altitude drains at the OTHER band's speed and the outflow ration
        // parks it at exactly 0 on landing.
        label: 'skydiver',
        content: `| =>gravity [speed: 0] =>air drag |
gravity: 10
air drag: (0.02 speed^2)
[altitude: 180] =>falling |
falling: (speed)
B(air drag <- speed)
// Gravity adds 10 to the speed each second, and air drag
// takes away 0.02 times the speed squared (speed^2).
// B: more speed, much more drag, less speed.
// The fall speeds up until drag matches gravity at the
// terminal speed, about 22.4. The altitude drains at the
// current speed and stops at exactly 0: landing, at t = 9.65.`
    },

    // Keyword showcases (not from the book): one button per reserved word
    // of the formula language — t, pi, cos, sin, min, max — each a small
    // model whose story hinges on that keyword, tuned to the T_END = 10
    // horizon.
    {
        // Bare `t` as a rate law: arrivals grow with the clock while
        // departures hold at 8, so the road stays empty until the rates
        // cross at t=4 — then the jam compounds quadratically (to ~36).
        label: 'rush hour (t)',
        content: `| =>cars arriving: (2t) [cars on the road: 0] =>cars leaving: 8 |
// t is the time itself: cars arrive at 2t, none at first and
// 20 at t = 10. They leave at up to 8, so the road stays
// empty until arrivals pass 8 at t = 4. From then on the jam
// grows faster and faster: 36 cars by t = 10.`
    },
    {
        // `pi` where it lives: circumference. Distance accrues at
        // 2πr × cadence — the formula's implied arrows wire the two
        // constants in, and the line runs dead straight to 2π·0.35·3·10
        // ≈ 66.
        label: 'odometer (pi)',
        content: `| =>rolling [distance: 0]
wheel radius: 0.35
cadence: 3
rolling: (2 * pi * wheel radius * cadence)
// pi is 3.14159...: each turn of a wheel of radius 0.35 rolls
// 2 * pi * 0.35, about 2.2. Three turns per unit of time make
// 6.6 per unit, a dead straight line to 66.`
    },
    {
        // `cos` as a moving goal: the sea runs two full tide cycles
        // (period 5) and the basin chases it through a fill/drain faucet
        // pair — attenuated to ±1.2 and lagging about half a unit, the
        // classic tracking signature, under the smooth dashed goal curve.
        label: 'tides (cos)',
        content: `| =>flood tide: 1.5 [harbor basin: 3] =>ebb tide: 1.5 |
B(flood tide <- gap <- harbor basin)
B(ebb tide <- gap)
sea level: (3 + 1.5 * cos(2 * pi * t / 5)) -> gap
// cos makes the tide: the sea level swings from 4.5 down to
// 1.5 and back every 5 units, the dashed curve. Flood tide
// fills the basin while the sea is higher, ebb tide drains
// it while the sea is lower: two balancing loops chasing a
// moving goal. The basin lags about half a unit behind and
// swings less, between 1.8 and 4.2.`
    },
    {
        // `sin` as a season: one half-wave of rain over the whole horizon
        // against a steady river draw. The reservoir dips to ~14 before
        // the rains beat the river (t≈1), crests ~148 as they fall back
        // under it (t=9), and recedes — the wet season passing through.
        label: 'monsoon (sin)',
        content: `| =>rainfall [reservoir: 20] =>river outflow: 12 |
rainfall: (38 * sin(pi * t / 10))
// sin shapes the season: the rain rises from 0 to 38 at t = 5
// and falls back to 0, half a sine wave, while the river
// takes a steady 12. The reservoir dips to 14 until the rain
// beats the river (t = 1), then climbs until the rain falls
// back under it, cresting at 148 at t = 9.`
    },
    {
        // `min` as a capacity clamp: real chargers are constant-current
        // then constant-voltage — flat out at 25 until the gap-
        // proportional trickle undercuts it (≈79% full at t≈2.8), then
        // the exponential taper onto exactly full.
        label: 'phone charger (min)',
        content: `| =>charging [battery: 10]
full charge: 100
charging: (min(25, 1.2 * (full charge - battery)))
B(charging <- battery)
// min takes the smaller of two rates: the charger's 25 flat
// out, or 1.2 times what's left to fill. Flat out while the
// battery is low; past about 79% the gap rate is smaller, so
// charging tapers and eases onto full.`
    },
    {
        // `max` as a floor: while water is plentiful the town drinks in
        // proportion (an exponential coast), but essential use never
        // drops below 6 — the floor breaks the balancing loop below
        // level 24 and crashes the reservoir to exactly 0 at t≈9.7.
        label: 'drought (max)',
        content: `[town reservoir: 100] =>consumption |
consumption: (max(6, 0.25 * town reservoir))
B(consumption <- town reservoir)
// max sets a floor: the town uses a quarter of what's in the
// reservoir, but never less than 6. While water is plentiful
// the balancing loop eases use as the level falls. Below 24
// the floor takes over, the loop stops easing anything, and
// the reservoir runs dry at t = 9.7.`
    },

]
