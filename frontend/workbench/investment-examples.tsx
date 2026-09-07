import { Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { InvestmentHoldingsTable } from '../src/components/investments/InvestmentHoldingsTable'
import { InvestmentActivityTable } from '../src/components/investments/InvestmentActivityTable'
import { ManualBrokeragePositionsEditor } from '../src/components/investments/ManualBrokeragePositionsEditor'
import { activity, holding, securities } from './investment-fixtures'
import { money } from './fixtures'
import type { ManualBrokeragePositionDraft } from '../src/components/investments/ManualBrokeragePositionsEditor'

import type { ExampleProps } from './examples'

function Investments({ state, masked }: ExampleProps) {
  return (
    <Stack>
      <Text fw={600}>Holdings</Text>
      <InvestmentHoldingsTable
        holdings={
          state === 'empty'
            ? []
            : [
                holding,
                {
                  ...holding,
                  id: 'zero',
                  quantity: '0',
                  institutionValue: '0',
                  accountValue: '0',
                  security: {
                    ...holding.security,
                    name: null,
                    tickerSymbol: null,
                    closePrice: null,
                  },
                },
              ]
        }
        balancesHidden={masked}
        accountCurrency="USD"
      />
      <Text fw={600}>Activity</Text>
      <InvestmentActivityTable
        activity={
          state === 'empty'
            ? []
            : [
                activity,
                {
                  ...activity,
                  id: 'dividend',
                  name: 'Dividend',
                  investmentType: 'cash',
                  investmentSubtype: 'dividend',
                  amount: money('1234'),
                  quantity: '0',
                  price: '0',
                },
              ]
        }
        balancesHidden={masked}
      />
    </Stack>
  )
}
function Positions({ state }: ExampleProps) {
  const [positions, setPositions] = useState<
    Array<ManualBrokeragePositionDraft>
  >([{ symbol: 'EXM', quantity: '10.125', security: securities[0] }])
  return (
    <ManualBrokeragePositionsEditor
      positions={positions}
      onChange={setPositions}
      disabled={state === 'disabled'}
      searchSecurities={() =>
        state === 'error'
          ? Promise.reject(new Error('Fixture search unavailable'))
          : Promise.resolve(state === 'empty' ? [] : securities)
      }
    />
  )
}
export const investmentExamples = [
  {
    id: 'investments',
    title: 'Holdings and investment activity',
    component: Investments,
    states: ['ready', 'empty'],
    components: [
      'InvestmentHoldingsTable',
      'InvestmentActivityTable',
      'ResponsiveSlot',
    ],
  },
  {
    id: 'positions',
    title: 'Brokerage position editor',
    component: Positions,
    states: ['ready', 'empty', 'error', 'disabled'],
    components: ['ManualBrokeragePositionsEditor'],
  },
]
