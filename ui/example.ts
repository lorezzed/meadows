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