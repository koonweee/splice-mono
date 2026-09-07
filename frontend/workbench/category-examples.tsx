import { Stack } from '@mantine/core'
import { useState } from 'react'
import { CategorySelect } from '../src/components/categories/CategorySelect'
import { CategoryScopeInput } from '../src/components/categories/CategoryScopeInput'
import { TransactionConditionInput } from '../src/components/settings/categorization/TransactionConditionInput'
import { fixtureAccounts } from './fixtures'
import type { EditableCategorizationCondition } from '../src/components/settings/categorization/TransactionConditionInput'
import type { AnalysisCategoryScope } from '../src/api/models'
import type { ExampleProps } from './examples'

const categories = [
  {
    id: 'food',
    primary: 'Food and drink',
    detailed: 'Groceries',
    color: '#e599f7',
    archivedAt: null,
  },
  {
    id: 'travel',
    primary: 'Travel',
    detailed: 'Long international journeys and accommodation',
    color: '#74c0fc',
    archivedAt: null,
  },
  {
    id: 'archived',
    primary: 'Other',
    detailed: 'Archived category',
    color: '#ffd43b',
    archivedAt: '2026-08-01',
  },
]
function Categories({ state }: ExampleProps) {
  const [selected, setSelected] = useState<string | null>('food')
  const [scope, setScope] = useState<AnalysisCategoryScope>({
    mode: 'selected',
    categoryIds: ['food', 'archived'],
    includeUncategorized: true,
  })
  const [conditions, setConditions] = useState<
    Array<EditableCategorizationCondition>
  >([
    { field: 'merchantName', operator: 'contains', value: 'Example' },
    {
      field: 'amount',
      operator: 'between',
      value: { min: '10.00', max: '100.00' },
    },
  ])
  return (
    <Stack>
      <CategorySelect
        label="Category"
        value={selected}
        onChange={setSelected}
        disabled={state === 'disabled'}
        data={
          state === 'empty'
            ? []
            : categories.map((c) => ({
                value: c.id,
                primary: c.primary,
                secondary: c.detailed,
                color: c.color,
                disabled: Boolean(c.archivedAt),
              }))
        }
      />
      <CategoryScopeInput
        label="Category scope"
        value={scope}
        onChange={setScope}
        categories={state === 'empty' ? [] : categories}
        disabled={state === 'disabled'}
        viewportAwareDropdown
      />
      <TransactionConditionInput
        accounts={fixtureAccounts}
        conditions={conditions}
        onChange={setConditions}
      />
    </Stack>
  )
}
export const categoryExamples = [
  {
    id: 'category-inputs',
    title: 'Categories and rule conditions',
    component: Categories,
    states: ['ready', 'empty', 'disabled'],
    components: [
      'CategorySelect',
      'CategoryScopeInput',
      'TransactionConditionInput',
    ],
  },
]
