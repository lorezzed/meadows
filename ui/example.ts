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
        label: 'figure 15 & 19',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside: 0.13 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 ~1: 7 ~2: 4 ~3: 0 ~4: -3 ~4.5: -5 ~5.5: -3 ~6: 0 ~7: 4 ~8: 7 ~9: 10 -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'figure 15 & 20',
        content: `| =>heat from furnace: 1.2 [room temperature: 10] =>heat to outside: 0.4 |
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 ~1: 7 ~2: 4 ~3: 0 ~4: -3 ~4.5: -5 ~5.5: -3 ~6: 0 ~7: 4 ~8: 7 ~9: 10 -> discrepancy between inside and outside temperatures`
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
        label: 'figure 21 & 24',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: 0.21 ~2: 0.09 -> births
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
fertility c: 0.21 ~2: 0.09 -> births c
mortality c: 0.09 -> deaths c`
    },
    {
        label: 'figure 21 & 26',
        content: `| =>births [population: 6.6] =>deaths |
R(births <- population)
B(deaths <- population)
fertility: 0.21 ~2.5: 0.09 ~4.5: 0.09 ~7: 0.27 ~10: 0.36 -> births
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
        label: 'figure 31 & 32',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t ~ perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.3
delivery delay: 0.5`
    },
    {
        // The same run as figure 31 & 32, opened in the chart's flows view:
        // figure 33's panels — sales vs perceived sales (the smooth pair),
        // orders vs deliveries (the delay pair).
        label: 'figure 31 & 33',
        flows: true,
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t ~ perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.3
delivery delay: 0.5`
    },
    {
        // Figure 34's inventory chart: the SAME base model as 31 & 32
        // (response delay 0.3), duplicated under the book's own figure
        // number — flat 200 to day 25, dip to ~188 at day 31, then the
        // gently growing ~21-day oscillation (peaks near days 42/63/85).
        label: 'figure 31 & 34',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t ~ perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.3
delivery delay: 0.5`
    },
    {
        // Figure 35's growing oscillation: the dealer reacting FASTER
        // (response delay 0.2 = 2 days) makes it worse — peaks climbing
        // ~267/415/418 with troughs cut toward 120.
        label: 'figure 31 & 35',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t ~ perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.2
delivery delay: 0.5`
    },
    {
        // Figure 36's damped settle: the dealer reacting SLOWER (response
        // delay 0.6 = 6 days) — one shallow dip to ~188 at day 32, one
        // overshoot to ~227 at day 47, then flat on the new 220.
        label: 'figure 31 & 36',
        content: `| =>deliveries [inventory of cars on the lot: 200] =>sales |
B(deliveries <- orders to factory <- discrepancy <- inventory of cars on the lot)
orders to factory: (perceived sales + discrepancy / response delay)
deliveries: (orders to factory(t - delivery delay))
discrepancy: (desired inventory - inventory of cars on the lot)
desired inventory: (perceived sales)
perceived sales: (sales(t ~ perception delay))
sales: (customer demand)
customer demand: 200 @2.5: 220
perception delay: 0.5
response delay: 0.6
delivery delay: 0.5`
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
profit <- price <- yield per unit capital -> harvest
resource -> yield per unit capital
regeneration <- regeneration rate <- resource -> regeneration`
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

]
