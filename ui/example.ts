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