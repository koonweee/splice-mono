import {
  ActionIcon,
  Box,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { Plus, Trash2 } from 'lucide-react'
import { useCompactLayout } from '../../../lib/responsive'
import type { Account, CategorizationRuleCondition } from '../../../api/models'

type TextField =
  | 'merchantName'
  | 'providerTransactionName'
  | 'originalDescription'
  | 'merchantEntityId'
  | 'website'
  | 'providerCategoryPrimary'
  | 'providerCategoryDetailed'

type TextOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith'

export type EditableCategorizationCondition =
  | {
      field: TextField
      operator: TextOperator
      value: string
    }
  | {
      field: 'accountId'
      operator: 'equals' | 'in'
      value: string | Array<string>
    }
  | {
      field: 'amountSign'
      operator: 'equals'
      value: 'positive' | 'negative'
    }
  | {
      field: 'amount'
      operator: 'equals' | 'greaterThan' | 'lessThan' | 'between'
      value: number | { min?: number; max?: number }
    }

type TransactionConditionInputProps = {
  accounts: Array<Account>
  conditions: Array<EditableCategorizationCondition>
  onChange: (conditions: Array<EditableCategorizationCondition>) => void
}

const textFields: Array<TextField> = [
  'merchantName',
  'providerTransactionName',
  'originalDescription',
  'merchantEntityId',
  'website',
  'providerCategoryPrimary',
  'providerCategoryDetailed',
]

const fieldOptions = [
  { value: 'merchantName', label: 'Merchant name' },
  { value: 'providerTransactionName', label: 'Bank description' },
  { value: 'originalDescription', label: 'Original description' },
  { value: 'merchantEntityId', label: 'Merchant identifier' },
  { value: 'website', label: 'Website' },
  { value: 'providerCategoryPrimary', label: 'Bank category' },
  { value: 'providerCategoryDetailed', label: 'Bank subcategory' },
  { value: 'accountId', label: 'Account' },
  { value: 'amountSign', label: 'Money direction' },
  { value: 'amount', label: 'Amount' },
]

const textOperatorOptions = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
]

const accountOperatorOptions = [
  { value: 'equals', label: 'is' },
  { value: 'in', label: 'is one of' },
]

const amountOperatorOptions = [
  { value: 'equals', label: 'equals' },
  { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' },
  { value: 'between', label: 'between' },
]

const defaultCondition: EditableCategorizationCondition = {
  field: 'merchantName',
  operator: 'contains',
  value: '',
}

function isTextField(field: string): field is TextField {
  return textFields.includes(field as TextField)
}

function isTextCondition(
  condition: EditableCategorizationCondition,
): condition is Extract<EditableCategorizationCondition, { field: TextField }> {
  return isTextField(condition.field)
}

function isAccountCondition(
  condition: EditableCategorizationCondition,
): condition is Extract<
  EditableCategorizationCondition,
  { field: 'accountId' }
> {
  return condition.field === 'accountId'
}

function isAmountCondition(
  condition: EditableCategorizationCondition,
): condition is Extract<EditableCategorizationCondition, { field: 'amount' }> {
  return condition.field === 'amount'
}

function getDefaultConditionForField(
  field: string,
): EditableCategorizationCondition {
  if (isTextField(field)) {
    return { field, operator: 'contains', value: '' }
  }

  if (field === 'accountId') {
    return { field, operator: 'equals', value: '' }
  }

  if (field === 'amountSign') {
    return { field, operator: 'equals', value: 'negative' }
  }

  return { field: 'amount', operator: 'between', value: { min: 10, max: 50 } }
}

function getAccountLabel(account: Account) {
  return account.customName ?? account.name ?? 'Account'
}

function conditionToApi(
  condition: EditableCategorizationCondition,
): CategorizationRuleCondition {
  return condition as CategorizationRuleCondition
}

export function toApiConditions(
  conditions: Array<EditableCategorizationCondition>,
): Array<CategorizationRuleCondition> {
  return conditions.map(conditionToApi)
}

export function getDefaultCategorizationCondition() {
  return defaultCondition
}

export function TransactionConditionInput({
  accounts,
  conditions,
  onChange,
}: TransactionConditionInputProps) {
  const isMobile = useCompactLayout()
  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: getAccountLabel(account),
  }))

  function updateCondition(
    index: number,
    condition: EditableCategorizationCondition,
  ) {
    onChange(
      conditions.map((existing, existingIndex) =>
        existingIndex === index ? condition : existing,
      ),
    )
  }

  function removeCondition(index: number) {
    onChange(conditions.filter((_, existingIndex) => existingIndex !== index))
  }

  function addCondition() {
    onChange([...conditions, getDefaultCategorizationCondition()])
  }

  function renderValueInput(
    condition: EditableCategorizationCondition,
    index: number,
  ) {
    if (isTextCondition(condition)) {
      return (
        <TextInput
          aria-label="Condition value"
          label="Value"
          value={condition.value}
          onChange={(event) =>
            updateCondition(index, {
              ...condition,
              value: event.currentTarget.value,
            })
          }
        />
      )
    }

    if (isAccountCondition(condition)) {
      if (condition.operator === 'in') {
        return (
          <MultiSelect
            aria-label="Condition accounts"
            data={accountOptions}
            label="Value"
            searchable
            value={Array.isArray(condition.value) ? condition.value : []}
            onChange={(value) =>
              updateCondition(index, { ...condition, value })
            }
          />
        )
      }

      return (
        <Select
          aria-label="Condition account"
          data={accountOptions}
          label="Value"
          searchable
          value={typeof condition.value === 'string' ? condition.value : null}
          onChange={(value) =>
            updateCondition(index, { ...condition, value: value ?? '' })
          }
        />
      )
    }

    if (condition.field === 'amountSign') {
      return (
        <Select
          aria-label="Condition amount direction"
          data={[
            { value: 'negative', label: 'Money out' },
            { value: 'positive', label: 'Money in' },
          ]}
          label="Value"
          value={condition.value}
          onChange={(value) =>
            updateCondition(index, {
              ...condition,
              value: value === 'positive' ? 'positive' : 'negative',
            })
          }
          allowDeselect={false}
        />
      )
    }

    if (!isAmountCondition(condition)) {
      return null
    }

    if (condition.operator === 'between') {
      const value =
        typeof condition.value === 'object' ? condition.value : { min: 0 }

      return (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Value
          </Text>
          <Group gap="xs" wrap="nowrap">
            <NumberInput
              aria-label="Minimum amount"
              decimalScale={2}
              min={0}
              value={value.min ?? ''}
              onChange={(next) =>
                updateCondition(index, {
                  ...condition,
                  value: {
                    ...value,
                    min: typeof next === 'number' ? next : undefined,
                  },
                })
              }
              style={{ flex: '1 1 0' }}
            />
            <Text c="dimmed" size="sm">
              and
            </Text>
            <NumberInput
              aria-label="Maximum amount"
              decimalScale={2}
              min={0}
              value={value.max ?? ''}
              onChange={(next) =>
                updateCondition(index, {
                  ...condition,
                  value: {
                    ...value,
                    max: typeof next === 'number' ? next : undefined,
                  },
                })
              }
              style={{ flex: '1 1 0' }}
            />
          </Group>
        </Stack>
      )
    }

    return (
      <NumberInput
        aria-label="Condition amount"
        decimalScale={2}
        label="Value"
        min={0}
        value={typeof condition.value === 'number' ? condition.value : 0}
        onChange={(value) =>
          updateCondition(index, {
            ...condition,
            value: typeof value === 'number' ? value : 0,
          })
        }
      />
    )
  }

  return (
    <Stack gap="sm">
      {conditions.map((condition, index) => (
        <Stack key={index} gap="xs">
          {index > 0 && (
            <Text c="dimmed" fw={700} size="xs" ta="center">
              AND
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
            <Select
              aria-label="Condition field"
              data={fieldOptions}
              label="Field"
              value={condition.field}
              onChange={(value) =>
                value &&
                updateCondition(index, getDefaultConditionForField(value))
              }
              allowDeselect={false}
            />
            <Select
              aria-label="Condition operator"
              data={
                isTextField(condition.field)
                  ? textOperatorOptions
                  : condition.field === 'accountId'
                    ? accountOperatorOptions
                    : condition.field === 'amount'
                      ? amountOperatorOptions
                      : [{ value: 'equals', label: 'is' }]
              }
              label="Operator"
              value={condition.operator}
              onChange={(value) => {
                if (!value) return
                if (isTextCondition(condition)) {
                  updateCondition(index, {
                    ...condition,
                    operator: value as TextOperator,
                  })
                } else if (isAccountCondition(condition)) {
                  updateCondition(index, {
                    ...condition,
                    operator: value as 'equals' | 'in',
                    value: value === 'in' ? [] : '',
                  })
                } else if (isAmountCondition(condition)) {
                  updateCondition(index, {
                    ...condition,
                    operator: value as
                      | 'equals'
                      | 'greaterThan'
                      | 'lessThan'
                      | 'between',
                    value: value === 'between' ? { min: 10, max: 50 } : 0,
                  })
                }
              }}
              allowDeselect={false}
            />
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <Box style={{ flex: '1 1 auto', minWidth: 0 }}>
                {renderValueInput(condition, index)}
              </Box>
              <Tooltip label="Remove condition">
                <ActionIcon
                  aria-label="Remove condition"
                  color="red"
                  disabled={conditions.length === 1}
                  mb={4}
                  onClick={() => removeCondition(index)}
                  size={isMobile ? 36 : undefined}
                  variant="subtle"
                >
                  <Trash2 size={isMobile ? 18 : 16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </SimpleGrid>
        </Stack>
      ))}
      <Button
        leftSection={<Plus size={16} />}
        mih={isMobile ? 48 : undefined}
        onClick={addCondition}
        size={isMobile ? 'md' : undefined}
        variant="light"
      >
        Add condition
      </Button>
    </Stack>
  )
}
