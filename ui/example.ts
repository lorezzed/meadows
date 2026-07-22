export const exampleList = [
    {
        label: 'Figure 1',
        content: `|=>inflow[stock]=>outflow|`
    },
    {
        label: 'Figure 2',
        content: `[mineral deposit]=>mining|`
    },
    {
        label: 'Figure 3',
        content: `|=>rain[water in reservoir]=>evaporation|
|=>river inflow[water in reservoir]=>discharge|`
    },
    {
        label: 'Figure 4',
        content: `|=>tree growth[wood in living trees]=>logging[lumber inventory]=>lumber sales|
[wood in living trees]=>tree deaths|`
    },
    {
        label: 'Figure 5 & 6',
        content: `|=>inflow[water in tub: 50]=>outflow: 5|`
    },
    {
        label: 'Figure 5 & 7',
        content: `|=>inflow: 0 @5: 5[water in tub: 50]=>outflow: 5|`
    },
    {
        label: 'Figure 8',
        content: `|=>inflow[stock1]->inflow
[stock2]=>outflow|
stock2->outflow`
    },
    {
        label: 'Figure 9',
        content: `[stored energy in body]=>metabolic mobilization of energy[energy available for work]=>energy expenditure|
B(metabolic mobilization of energy <- coffee intake <- discrepancy <- energy available for work)
desired energy level <- discrepancy`
    },
    {
        label: 'Figure 10',
        content: `[coffee temperature1]=>cooling|
B(coffee temperature1 -> discrepancy1 -> cooling)
room temperature1 -> discrepancy1
|=>heating[coffee temperature2]
B(heating <- discrepancy2 <- coffee temperature2)
discrepancy2 <- room temperature2`
    },
    {
        label: 'Figure 10 & 11',
        content: `[hot coffee: 100]=>cooling: 0.26|
B(cooling <- discrepancy <- hot coffee)
room temperature: 18 -> discrepancy
|=>heating: 0.26[iced coffee: 0]
B(heating <- warming discrepancy <- iced coffee)
room temperature -> warming discrepancy`
    },
    {
        label: 'Figure 12 & 13',
        content: `|=>interest at two[two percent interest: 100]
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
rate at ten: 0.1 -> interest at ten`
    },
    {
        label: 'Figure 14',
        content: `|=>investment[capital: 100]
R(capital -> output -> investment)
output: (capital / 3)
investment: (output * fraction of output invested)
fraction of output invested: 0.2`
    },
    {
        label: 'Figure 15',
        content: `|=>heat from furnace[room temperature]=>heat to outside|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'Figure 15 & 16',
        content: `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'Figure 15 & 17',
        content: `|=>heat from furnace[room temperature: 18]=>heat to outside: 0.13|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'Figure 15 & 18',
        content: `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: 0.13|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'Figure 15 & 19',
        content: `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: 0.13|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 ~1: 7 ~2: 4 ~3: 0 ~4: -3 ~4.5: -5 ~5.5: -3 ~6: 0 ~7: 4 ~8: 7 ~9: 10 -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'Figure 15 & 20',
        content: `|=>heat from furnace: 1.2[room temperature: 10]=>heat to outside: 0.4|
B(heat from furnace <- discrepancy between desired and actual room temperatures <- room temperature)
thermostat setting: 18 -> discrepancy between desired and actual room temperatures
B(heat to outside <- discrepancy between inside and outside temperatures <- room temperature)
outside temperature: 10 ~1: 7 ~2: 4 ~3: 0 ~4: -3 ~4.5: -5 ~5.5: -3 ~6: 0 ~7: 4 ~8: 7 ~9: 10 -> discrepancy between inside and outside temperatures`
    },
    {
        label: 'Figure 21 & 22',
        content: `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.09 -> deaths`
    },
    {
        label: 'Figure 21 & 23',
        content: `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 -> births
mortality: 0.3 -> deaths`
    },
    {
        label: 'Figure 21 & 24',
        content: `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 ~2: 0.09 -> births
mortality: 0.09 -> deaths`
    },
    {
        label: 'Figure 25',
        content: `|=>births a[growth: 6.6]=>deaths a|
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
fertility c: 0.21 ~2: 0.09 -> births c
mortality c: 0.09 -> deaths c`
    },
    {
        label: 'Figure 21 & 26',
        content: `|=>births[population: 6.6]=>deaths|
R(births <- population)
B(deaths <- population)
fertility: 0.21 ~2.5: 0.09 ~4.5: 0.09 ~7: 0.27 ~10: 0.36 -> births
mortality: 0.09 -> deaths`
    },
    {
        label: 'Figure 27',
        content: `|=>investment[capital stock]=>depreciation|
R(capital stock -> annual output -> investment)
B(capital stock -> depreciation)
investment fraction -> investment
output per unit capital -> annual output
capital lifetime -> depreciation`
    },
    {
        label: 'Figure 27 & 28',
        content: `|=>investment at twenty[capital at twenty: 100]=>depreciation at twenty|
R(capital at twenty -> annual output at twenty -> investment at twenty)
B(capital at twenty -> depreciation at twenty)
annual output at twenty: (capital at twenty * output per unit capital at twenty)
investment at twenty: (annual output at twenty * investment fraction at twenty)
depreciation at twenty: (capital at twenty / capital lifetime at twenty)
investment fraction at twenty: 0.2
output per unit capital at twenty: (5 / 3)
capital lifetime at twenty: 4
|=>investment at fifteen[capital at fifteen: 100]=>depreciation at fifteen|
R(capital at fifteen -> annual output at fifteen -> investment at fifteen)
B(capital at fifteen -> depreciation at fifteen)
annual output at fifteen: (capital at fifteen * output per unit capital at fifteen)
investment at fifteen: (annual output at fifteen * investment fraction at fifteen)
depreciation at fifteen: (capital at fifteen / capital lifetime at fifteen)
investment fraction at fifteen: 0.2
output per unit capital at fifteen: (5 / 3)
capital lifetime at fifteen: 3
|=>investment at ten[capital at ten: 100]=>depreciation at ten|
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
        label: 'Figure 42',
        content: `|=>investment[capital]=>depreciation|
|=>regeneration[resource]=>harvest|
capital->growth goal->investment
R(investment<-profit<-capital)
B(depreciation<-capital)
capital lifetime->depreciation
B(profit <- capital -> harvest)
profit<-price<-yield per unit capital->harvest
resource->yield per unit capital
regeneration<-regeneration rate<-resource->regeneration`
    },

]