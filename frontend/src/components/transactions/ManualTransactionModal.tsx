import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  useRecurringManualTransactionControllerCreate,
  useTransactionControllerCreateManual,
  useTransactionControllerUpdateManual,
} from '../../api/clients/spliceAPI'
import { MoneyWithSignSign } from '../../api/models'
import { isAssignableCategoryOption } from '../../lib/category-options'
import { getDecimalPlaces } from '../../lib/format'
import {
  getViewportAwareOverlayComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import { AccountSelect } from '../accounts/AccountSelect'
import { CategorySelect } from '../categories/CategorySelect'
import type { CategorySelectOption } from '../categories/CategorySelect'
import type { Account, Category, Transaction } from '../../api/models'
import type { NumberInputProps } from '@mantine/core'
import type { FormEvent } from 'react'

type ManualTransactionModalProps = {
  opened: boolean
  onClose: () => void
  accounts: Array<Account>
  categories: Array<Category>
  defaultAccountId: string | null
  transaction?: Transaction | null
  onSaved?: () => void
}

type FormErrors = Partial<
  Record<
    | 'accountId'
    | 'amount'
    | 'merchantName'
    | 'providerDate'
    | 'categoryId'
    | 'recurrenceDay',
    string
  >
>

function getAccountLabel(account: Account) {
  return `${account.customName ?? account.name ?? 'Account'}${account.mask ? ` ••${account.mask}` : ''}`
}

function getInitialAccountId(
  accounts: Array<Account>,
  defaultAccountId: string | null,
  transaction?: Transaction | null,
) {
  const activeAccounts = accounts.filter((account) => !account.archivedAt)
  const preferredAccountId = transaction?.accountId ?? defaultAccountId

  if (
    preferredAccountId &&
    activeAccounts.some((account) => account.id === preferredAccountId)
  ) {
    return preferredAccountId
  }

  return activeAccounts[0]?.id ?? ''
}

function getSignedAmountDraft(transaction: Transaction | null | undefined) {
  if (!transaction) {
    return ''
  }

  const decimals = getDecimalPlaces(transaction.amount.money.currency)
  const unsignedAmount =
    transaction.amount.money.amount / Math.pow(10, decimals)

  return transaction.amount.sign === MoneyWithSignSign.negative
    ? -unsignedAmount
    : unsignedAmount
}

function getCategorySelectOption(
  category: Pick<Category, 'id' | 'primary' | 'detailed' | 'color'>,
): CategorySelectOption {
  return {
    value: category.id,
    primary: category.primary,
    secondary: category.detailed,
    color: category.color,
  }
}

function sortCategoryOptions(
  left: CategorySelectOption,
  right: CategorySelectOption,
) {
  return (
    left.primary.localeCompare(right.primary) ||
    left.secondary.localeCompare(right.secondary)
  )
}

function getNumericAmount(value: NumberInputProps['value']) {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value)
  }

  return Number.NaN
}

function toggleAmountSign(value: NumberInputProps['value']) {
  const numericAmount = getNumericAmount(value)

  if (!Number.isFinite(numericAmount)) {
    return '-'
  }

  if (numericAmount === 0) {
    return value
  }

  return -numericAmount
}

function getDateDayOfMonth(value: string) {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.date() : 1
}

export function ManualTransactionModal({
  opened,
  onClose,
  accounts,
  categories,
  defaultAccountId,
  transaction = null,
  onSaved,
}: ManualTransactionModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState<NumberInputProps['value']>('')
  const [merchantName, setMerchantName] = useState('')
  const [providerDate, setProviderDate] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [recurringEnabled, setRecurringEnabled] = useState(false)
  const [recurrenceDay, setRecurrenceDay] = useState<NumberInputProps['value']>(
    1,
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const createManualTransaction = useTransactionControllerCreateManual()
  const updateManualTransaction = useTransactionControllerUpdateManual()
  const createRecurringManualTransaction =
    useRecurringManualTransactionControllerCreate()
  const isEditing = transaction !== null
  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archivedAt),
    [accounts],
  )
  const selectedAccount =
    activeAccounts.find((account) => account.id === accountId) ?? null
  const currency = selectedAccount?.currentBalance.money.currency ?? ''
  const decimalPlaces = currency ? getDecimalPlaces(currency) : 2
  const accountOptions = useMemo(
    () =>
      activeAccounts.map((account) => ({
        value: account.id,
        label: getAccountLabel(account),
      })),
    [activeAccounts],
  )
  const categoryOptions = useMemo(
    () =>
      categories
        .filter(isAssignableCategoryOption)
        .map(getCategorySelectOption)
        .sort(sortCategoryOptions),
    [categories],
  )
  const comboboxProps = isMobile
    ? getViewportAwareOverlayComboboxProps()
    : { withinPortal: true }
  const maxDropdownHeight = isMobile
    ? viewportAwareDropdownMaxHeight
    : undefined
  const isSaving =
    createManualTransaction.isPending ||
    updateManualTransaction.isPending ||
    createRecurringManualTransaction.isPending
  const displayedNumericAmount = getNumericAmount(amount)
  const amountIsNegative =
    (Number.isFinite(displayedNumericAmount) && displayedNumericAmount < 0) ||
    (typeof amount === 'string' && amount.trim().startsWith('-'))

  useEffect(() => {
    if (!opened) {
      return
    }

    setAccountId(getInitialAccountId(accounts, defaultAccountId, transaction))
    setAmount(getSignedAmountDraft(transaction))
    setMerchantName(transaction?.merchantName ?? '')
    const nextProviderDate = transaction?.providerDate ?? ''
    setProviderDate(nextProviderDate)
    setCategoryId(transaction?.categoryId ?? null)
    setRecurringEnabled(false)
    setRecurrenceDay(nextProviderDate ? getDateDayOfMonth(nextProviderDate) : 1)
    setErrors({})
  }, [accounts, defaultAccountId, opened, transaction])

  function validate() {
    const nextErrors: FormErrors = {}
    const numericAmount = getNumericAmount(amount)

    if (!accountId) {
      nextErrors.accountId = 'Account is required'
    }
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
      nextErrors.amount = 'Enter a non-zero amount'
    }
    if (!merchantName.trim()) {
      nextErrors.merchantName = 'Merchant is required'
    }
    if (
      !providerDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(providerDate) ||
      !dayjs(providerDate).isValid()
    ) {
      nextErrors.providerDate = 'Date is required'
    }
    if (!categoryId) {
      nextErrors.categoryId = 'Category is required'
    }
    const numericRecurrenceDay = getNumericAmount(recurrenceDay)
    if (
      recurringEnabled &&
      !isEditing &&
      (!Number.isInteger(numericRecurrenceDay) ||
        numericRecurrenceDay < 1 ||
        numericRecurrenceDay > 31)
    ) {
      nextErrors.recurrenceDay = 'Enter a day from 1 to 31'
    }

    setErrors(nextErrors)

    return {
      isValid: Object.keys(nextErrors).length === 0,
      numericAmount,
      numericRecurrenceDay,
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const { isValid, numericAmount, numericRecurrenceDay } = validate()
    if (!isValid || !currency || !categoryId) {
      return
    }

    const minorUnits = Math.round(
      Math.abs(numericAmount) * Math.pow(10, decimalPlaces),
    )
    const payload = {
      accountId,
      amount: {
        money: {
          amount: minorUnits,
          currency,
        },
        sign:
          numericAmount < 0
            ? MoneyWithSignSign.negative
            : MoneyWithSignSign.positive,
      },
      merchantName: merchantName.trim(),
      providerDate,
      categoryId,
    }
    const mutationOptions = {
      onSuccess: () => {
        onSaved?.()
        onClose()
      },
      onError: () => {
        notifications.show({
          title: 'Transaction save failed',
          message: 'The manual transaction was not saved.',
          color: 'red',
        })
      },
    }

    if (isEditing) {
      updateManualTransaction.mutate(
        { id: transaction.id, data: payload },
        mutationOptions,
      )
      return
    }

    if (recurringEnabled) {
      createRecurringManualTransaction.mutate(
        {
          data: {
            accountId,
            amount: payload.amount,
            merchantName: payload.merchantName,
            categoryId,
            frequency: 'monthly',
            dayOfMonth: numericRecurrenceDay,
            startDate: providerDate,
            endDate: null,
          },
        },
        mutationOptions,
      )
      return
    }

    createManualTransaction.mutate({ data: payload }, mutationOptions)
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? 'Edit transaction' : 'Add transaction'}
      centered={!isMobile}
      fullScreen={Boolean(isMobile)}
      size="md"
      transitionProps={{ duration: 0 }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <AccountSelect
            allowDeselect={false}
            comboboxProps={comboboxProps}
            data={accountOptions}
            error={errors.accountId}
            label="Account"
            maxDropdownHeight={maxDropdownHeight}
            onChange={(value) => {
              setAccountId(value ?? '')
              setErrors((current) => ({ ...current, accountId: undefined }))
            }}
            placeholder="Select account"
            required
            searchable
            value={accountId}
          />
          <Group align="flex-start" grow>
            <NumberInput
              decimalScale={decimalPlaces}
              error={errors.amount}
              fixedDecimalScale={decimalPlaces <= 6}
              label="Amount"
              onChange={(value) => {
                setAmount(value)
                setErrors((current) => ({ ...current, amount: undefined }))
              }}
              placeholder="0.00"
              required
              rightSection={
                <ActionIcon
                  aria-label={
                    amountIsNegative
                      ? 'Make amount positive'
                      : 'Make amount negative'
                  }
                  onClick={() => {
                    setAmount((current) => toggleAmountSign(current))
                    setErrors((current) => ({ ...current, amount: undefined }))
                  }}
                  size="sm"
                  type="button"
                  variant="subtle"
                >
                  {amountIsNegative ? (
                    <Plus aria-hidden size={16} />
                  ) : (
                    <Minus aria-hidden size={16} />
                  )}
                </ActionIcon>
              }
              rightSectionPointerEvents="auto"
              rightSectionWidth={40}
              value={amount}
            />
            <TextInput label="Currency" readOnly value={currency} />
          </Group>
          <TextInput
            error={errors.providerDate}
            label="Date"
            onChange={(event) => {
              const nextProviderDate = event.currentTarget.value
              setProviderDate(nextProviderDate)
              if (!isEditing && recurringEnabled && nextProviderDate) {
                setRecurrenceDay(getDateDayOfMonth(nextProviderDate))
              }
              setErrors((current) => ({
                ...current,
                providerDate: undefined,
              }))
            }}
            required
            type="date"
            value={providerDate}
          />
          <TextInput
            error={errors.merchantName}
            label="Merchant"
            onChange={(event) => {
              setMerchantName(event.currentTarget.value)
              setErrors((current) => ({
                ...current,
                merchantName: undefined,
              }))
            }}
            placeholder="Merchant or transaction name"
            required
            value={merchantName}
          />
          <CategorySelect
            aria-label="Category"
            clearable={false}
            comboboxProps={comboboxProps}
            data={categoryOptions}
            error={errors.categoryId}
            label="Category"
            maxDropdownHeight={maxDropdownHeight}
            onChange={(value) => {
              setCategoryId(value)
              setErrors((current) => ({ ...current, categoryId: undefined }))
            }}
            placeholder="Select category"
            required
            value={categoryId}
          />
          {!isEditing && (
            <>
              <Switch
                checked={recurringEnabled}
                label="Repeat monthly"
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  setRecurringEnabled(checked)
                  if (checked && providerDate) {
                    setRecurrenceDay(getDateDayOfMonth(providerDate))
                  }
                  setErrors((current) => ({
                    ...current,
                    recurrenceDay: undefined,
                  }))
                }}
              />
              {recurringEnabled && (
                <NumberInput
                  allowDecimal={false}
                  clampBehavior="strict"
                  error={errors.recurrenceDay}
                  label="Day of month"
                  max={31}
                  min={1}
                  onChange={(value) => {
                    setRecurrenceDay(value)
                    setErrors((current) => ({
                      ...current,
                      recurrenceDay: undefined,
                    }))
                  }}
                  value={recurrenceDay}
                />
              )}
            </>
          )}
          <Group justify="flex-end">
            <Button onClick={onClose} type="button" variant="subtle">
              Cancel
            </Button>
            <Button loading={isSaving} type="submit">
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
