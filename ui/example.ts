export const exampleList = [
    {
        label: 'figure 1',
        content: `| =>inflow [stock] =>outflow |`
    },
    {
        label: 'figure 2',
        content: `[mineral deposit] =>mining |`
    },
    {
        label: 'figure 3',
        content: `| =>rain [water in reservoir] =>evaporation |
| =>river inflow [water in reservoir] =>discharge |`
    },
    {
        label: 'figure 4',
        content: `| =>tree growth [wood in living trees] =>logging [lumber inventory] =>lumber sales |
[wood in living trees] =>tree deaths |`
    },
    {
        label: 'figure 5 & 6',
        content: `| =>inflow [water in tub: 50] =>outflow: 5 |`
    },
    {
        label: 'figure 5 & 7',
        content: `| =>inflow: 0 @5: 5 [water in tub: 50] =>outflow: 5 |`
    },
    {
        label: 'figure 8',
        content: `| =>inflow [stock1] -> inflow
[stock2] =>outflow |
stock2 -> outflow`
    },
    {
        label: 'figure 9',
        content: `[stored energy in body] =>metabolic mobilization of energy [energy available for work] =>energy expenditure |
B(metabolic mobilization of energy <- coffee intake <- discrepancy <- energy available for work)
desired energy level <- discrepancy`
    },
    {
        label: 'figure 10',
        content: `[coffee temperature1] =>cooling |
B(coffee temperature1 -> discrepancy1 -> cooling)
room temperature1 -> discrepancy1
| =>heating [coffee temperature2]
B(heating <- discrepancy2 <- coffee temperature2)
discrepancy2 <- room temperature2`
    },
    {
        label: 'figure 10 & 11',
        content: `[hot coffee: 100] =>cooling: 0.26 |
B(cooling <- discrepancy <- hot coffee)
room temperature: 18 -> discrepancy
| =>heating: 0.26 [iced coffee: 0]
B(heating <- warming discrepancy <- iced coffee)
room temperature -> warming discrepancy`
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
rate at ten: 0.1 -> interest at ten`
    },
    {
        label: 'figure 14',
        content: `| =>investment [capital: 100]
R(capital -> output -> investment)
output: (capital / 3)
investment: (output * fraction of output invested)
fraction of output invested: 0.2`
    },
    {
        label: 'figure 15',
        content: `| =>heat from furnace [room temperature] =>heat to outside |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'figure 15 & 16',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'figure 15 & 17',
        content: `| =>heat from furnace [room temperature: 18] =>heat to outside: 0.13 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'figure 15 & 18',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside: 0.13 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures`
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
outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10)) -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'figure 15 & 20',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside: 0.4 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: (2.5 + 7.5 * cos(2 * pi * t / 10)) -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'figure 21 & 22',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.09 -> deaths`
    },
    {
        label: 'figure 21 & 23',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.3 -> deaths`
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
mortality: 0.09 -> deaths`
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
mortality c: 0.09 -> deaths c`
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
mortality: 0.09 -> deaths`
    },
    {
        label: 'figure 27',
        content: `| =>investment [capital stock] =>depreciation |
R(capital stock -> annual output -> investment)
B(capital stock -> depreciation)
investment fraction -> investment
output per unit capital -> annual output
capital lifetime -> depreciation`
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
capital lifetime at ten: 2`
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
customer demand -> sales`
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
adjustment: 10`
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
perception delay -> perceived sales`
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
delivery delay: 0.5`
    },
    {
        // The same run as figure 31 & 32, opened in the chart's flows view:
        // figure 33's panels — sales vs perceived sales (the perception
        // pair), orders vs deliveries (the delivery pair).
        label: 'figure 31 & 33',
        flows: true,
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
delivery delay: 0.5`
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
delivery delay: 0.5`
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
delivery delay: 0.5`
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
delivery delay: 0.5`
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
resource -> yield per unit capital`
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
yield per unit capital: (resource / 1000)`
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
yield per unit capital quadrupled: (resource quadrupled / 4000)`
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
yield per unit capital at one: (resource at one / 1000)`
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
yield per unit capital: (resource / 1000)`
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
regeneration <- regeneration rate <- resource -> regeneration`
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
        // the loop. The button opens preset to the flows view its profit
        // delay unlocks, showing every panel at once. The solid harvest
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
        flows: true,
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
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)`
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
        // forever, period ~21 years. The button opens preset to the
        // flows view. The solid harvest rate is panel A: cresting ~4150
        // (~277/yr — per-unit rates are 15x the book's per-year axis)
        // near year 100, then cycling with rebound peaks clearly BELOW
        // the crest. Capital's line is panel B: topping out ~1115 —
        // nowhere near 43's 1450 — then cycling. The resource's line is
        // panel C: bottoming ~308 and cycling without ever regaining
        // halfway. The dashed profit line swings a beat behind each
        // cycle — the delay driving the dance. Nothing collapses and
        // nothing settles: the book's sustained oscillation.
        label: 'figure 42 & 44',
        flows: true,
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
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)`
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
        // capital rots at its bare 20-year lifetime. The button opens
        // preset to the flows view. The solid harvest rate is panel A:
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
        flows: true,
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
regeneration rate: (112 (resource / 1000 * (1 - resource / 1000))^2)`
    },

    {
        // Figure 47's materials economy: one straight cloud-to-cloud chain
        // through three stocks — the figure 1/4 shape at full length.
        // Structure only, value-less. The book's "consumers' home stocks"
        // drops its apostrophe (not an identifier character).
        label: 'figure 47',
        content: `| =>raw materials processing [raw materials] =>production [inventory] =>sales [consumers home stocks] =>depreciation or discard |`
    },
    {
        // Figure 48's bare population stock: births in, deaths out —
        // figure 21's skeleton with no loops, no values, no fertility or
        // mortality web. Structure only.
        label: 'figure 48',
        content: `| =>births [population] =>deaths |`
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
[registered unemployed] =>registration lapses |`
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
B(infection <- susceptible)`
    },
    {
        // Two espresso shots as @ pulses (the tap opens for half an hour and
        // shuts again) against a proportional decay — the afternoon shot
        // stacks on the morning's residue.
        label: 'caffeine',
        content: `| =>espresso: 0 @1: 240 @1.5: 0 @6: 240 @6.5: 0 [caffeine in blood: 0] =>metabolism |
metabolism: (0.14 caffeine in blood)
B(metabolism <- caffeine in blood)`
    },
    {
        // The hog cycle: farmers breed on the price TWO UNITS AGO — a loop
        // legally closed through the pipeline shift price(t - 2), so supply
        // forever overshoots demand and the market never settles.
        label: 'boom & bust',
        content: `| =>breeding [pigs at market: 90] =>sales |
breeding: (price(t - 2))
price: (200 - pigs at market)
sales: (0.5 pigs at market)
B(breeding <- price <- pigs at market)`
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
B(air drag <- speed)`
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
        content: `| =>cars arriving: (2t) [cars on the road: 0] =>cars leaving: 8 |`
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
rolling: (2 * pi * wheel radius * cadence)`
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
sea level: (3 + 1.5 * cos(2 * pi * t / 5)) -> gap`
    },
    {
        // `sin` as a season: one half-wave of rain over the whole horizon
        // against a steady river draw. The reservoir dips to ~14 before
        // the rains beat the river (t≈1), crests ~148 as they fall back
        // under it (t=9), and recedes — the wet season passing through.
        label: 'monsoon (sin)',
        content: `| =>rainfall [reservoir: 20] =>river outflow: 12 |
rainfall: (38 * sin(pi * t / 10))`
    },
    {
        // `min` as a capacity clamp: real chargers are constant-current
        // then constant-voltage — flat out at 25 until the gap-
        // proportional trickle undercuts it (≈72% full at t≈2.8), then
        // the exponential taper onto exactly full.
        label: 'phone charger (min)',
        content: `| =>charging [battery: 10]
full charge: 100
charging: (min(25, 1.2 * (full charge - battery)))
B(charging <- battery)`
    },
    {
        // `max` as a floor: while water is plentiful the town drinks in
        // proportion (an exponential coast), but essential use never
        // drops below 6 — the floor breaks the balancing loop below
        // level 24 and crashes the reservoir to exactly 0 at t≈9.7.
        label: 'drought (max)',
        content: `[town reservoir: 100] =>consumption |
consumption: (max(6, 0.25 * town reservoir))
B(consumption <- town reservoir)`
    },

]
