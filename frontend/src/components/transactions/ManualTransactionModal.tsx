import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import dayjs from 'dayjs'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  moneyToMajorString,
  toggleMoneyDraftSign,
  tryParseMoneyDraft,
} from '../../lib/money'
import {
  OfflineMutationError,
  isUncertainMutationError,
} from '../../lib/offline-mutation'
import { getApiErrorMessage } from '../../lib/api-errors'
import { checkManualSave } from '../../lib/transactions/manual-save-recovery'
import { DecimalInput } from '../forms/DecimalInput'
import { useCompactLayout } from '../../lib/responsive'
import {
  useRecurringManualTransactionControllerCreate,
  useTransactionControllerCreateManual,
  useTransactionControllerUpdateManual,
} from '../../api/clients/spliceAPI'
import { isAssignableCategoryOption } from '../../lib/category-options'
import { getDecimalPlaces } from '../../lib/format'
import {
  getViewportAwareOverlayComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import { AccountSelect } from '../accounts/AccountSelect'
import { CategorySelect } from '../categories/CategorySelect'
import { EditorModal } from '../forms/EditorModal'
import { FormActions } from '../forms/FormActions'
import {
  ManualTransactionFormFrame,
  manualTransactionLabels,
} from './ManualTransactionFormFrame'
import type { ManualSaveAttempt } from '../../lib/transactions/manual-save-recovery'
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

  return moneyToMajorString(transaction.amount)
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
  const isMobile = useCompactLayout()
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [providerDate, setProviderDate] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [recurringEnabled, setRecurringEnabled] = useState(false)
  const [recurrenceDay, setRecurrenceDay] =
    useState<NumberInputProps['value']>(1)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState<{
    attempt: ManualSaveAttempt
    matches?: number
  } | null>(null)
  const [checkingSave, setCheckingSave] = useState(false)
  const initializedDraft = useRef<string | null>(null)
  const draftVersion = useRef(0)
  const submissionPending = useRef(false)
  const mutationPolicy = {
    mutation: { networkMode: 'always' as const, retry: false },
  }
  const createManualTransaction =
    useTransactionControllerCreateManual(mutationPolicy)
  const updateManualTransaction =
    useTransactionControllerUpdateManual(mutationPolicy)
  const createRecurringManualTransaction =
    useRecurringManualTransactionControllerCreate(mutationPolicy)
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
  const formLocked = isSaving || Boolean(uncertain)
  const amountIsNegative = amount.trim().startsWith('-')

  useEffect(() => {
    if (!opened) {
      initializedDraft.current = null
      draftVersion.current++
      return
    }
    const key = transaction?.id ?? 'new'
    if (initializedDraft.current === key) return
    initializedDraft.current = key
    draftVersion.current++
    setSaveError(null)
    setUncertain(null)
    setCheckingSave(false)
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

  useEffect(
    () => () => {
      draftVersion.current++
    },
    [],
  )

  function validate() {
    const nextErrors: FormErrors = {}
    const parsedAmount = tryParseMoneyDraft(amount, currency)

    if (!accountId) {
      nextErrors.accountId = 'Account is required'
    }
    if (!parsedAmount || parsedAmount.money.amount === '0') {
      nextErrors.amount =
        'Enter a non-zero amount with at most ' +
        decimalPlaces +
        ' decimal places'
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
      parsedAmount,
      numericRecurrenceDay,
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const { isValid, parsedAmount, numericRecurrenceDay } = validate()
    if (
      isSaving ||
      submissionPending.current ||
      uncertain ||
      !isValid ||
      !currency ||
      !categoryId ||
      !parsedAmount
    ) {
      return
    }

    const payload = {
      accountId,
      amount: parsedAmount,
      merchantName: merchantName.trim(),
      providerDate,
      categoryId,
    }
    submissionPending.current = true
    setSaveError(null)
    const attempt: ManualSaveAttempt = {
      payload,
      transactionId: transaction?.id,
      recurrenceDay:
        !isEditing && recurringEnabled ? numericRecurrenceDay : undefined,
    }
    const mutationOptions = {
      onSuccess: () => {
        submissionPending.current = false
        onSaved?.()
        onClose()
      },
      onError: (cause: unknown) => {
        submissionPending.current = false
        if (isUncertainMutationError(cause)) {
          setUncertain({ attempt })
          setSaveError(null)
        } else {
          setSaveError(
            cause instanceof OfflineMutationError
              ? cause.message
              : getApiErrorMessage(
                  cause,
                  'Unable to save this transaction. Review the form and try again.',
                ),
          )
        }
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

  async function checkSavedEntries() {
    if (!uncertain || checkingSave) return
    const version = draftVersion.current
    setCheckingSave(true)
    setSaveError(null)
    try {
      const matches = await checkManualSave(uncertain.attempt)
      if (draftVersion.current === version)
        setUncertain({ attempt: uncertain.attempt, matches })
    } catch {
      if (draftVersion.current === version)
        setSaveError('Unable to check saved entries. Reconnect and try again.')
    } finally {
      if (draftVersion.current === version) setCheckingSave(false)
    }
  }

  return (
    <EditorModal
      opened={opened}
      onClose={() => {
        if (!isSaving) onClose()
      }}
      closeOnEscape={!isSaving}
      closeOnClickOutside={!isSaving}
      closeButtonProps={{ disabled: isSaving }}
      title={isEditing ? 'Edit transaction' : 'Add transaction'}
      size="md"
      transitionProps={{ duration: 0 }}
    >
      <ManualTransactionFormFrame onSubmit={handleSubmit}>
        {saveError && (
          <Alert color="red" role="alert">
            {saveError}
          </Alert>
        )}
        {uncertain && (
          <Alert color="yellow" title="Save confirmation missing" role="alert">
            <Stack gap="xs">
              <Text data-typography="bodySmall">
                The server may have saved this entry. Your draft is still here.
                Check saved entries before trying again.
              </Text>
              {uncertain.matches !== undefined && (
                <Text data-typography="bodySmall">
                  {uncertain.matches > 0
                    ? `${uncertain.matches} saved ${uncertain.matches === 1 ? 'entry matches' : 'entries match'} these details.`
                    : 'No match in the latest results. A delayed save may still finish.'}
                </Text>
              )}
              <Group gap="xs">
                <Button
                  variant="light"
                  loading={checkingSave}
                  onClick={() => void checkSavedEntries()}
                >
                  Check saved{' '}
                  {uncertain.attempt.recurrenceDay === undefined
                    ? 'transactions'
                    : 'schedules'}
                </Button>
                {uncertain.matches !== undefined && (
                  <Button
                    variant="default"
                    onClick={() => {
                      setUncertain(null)
                      setSaveError(
                        'Check for duplicates if a delayed save finishes. Your draft is ready to submit again.',
                      )
                    }}
                  >
                    Try saving again
                  </Button>
                )}
                {Boolean(uncertain.matches) && (
                  <Button
                    variant="subtle"
                    onClick={() => {
                      onSaved?.()
                      onClose()
                    }}
                  >
                    Done
                  </Button>
                )}
              </Group>
            </Stack>
          </Alert>
        )}
        <Box component="fieldset" disabled={formLocked} m={0} p={0} bd={0}>
          <Stack gap="md">
            <AccountSelect
              disabled={formLocked}
              allowDeselect={false}
              comboboxProps={comboboxProps}
              data={accountOptions}
              error={errors.accountId}
              label={manualTransactionLabels.account}
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
              <DecimalInput
                disabled={formLocked}
                error={errors.amount}
                label={manualTransactionLabels.amount}
                onChange={(value) => {
                  setAmount(value)
                  setErrors((current) => ({ ...current, amount: undefined }))
                }}
                placeholder="0.00"
                required
                rightSection={
                  <ActionIcon
                    disabled={formLocked}
                    aria-label={
                      amountIsNegative
                        ? 'Make amount positive'
                        : 'Make amount negative'
                    }
                    onClick={() => {
                      setAmount((current) => toggleMoneyDraftSign(current))
                      setErrors((current) => ({
                        ...current,
                        amount: undefined,
                      }))
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
              <TextInput
                label={manualTransactionLabels.currency}
                readOnly
                value={currency}
              />
            </Group>
            <TextInput
              disabled={formLocked}
              error={errors.providerDate}
              label={manualTransactionLabels.date}
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
              disabled={formLocked}
              error={errors.merchantName}
              label={manualTransactionLabels.merchant}
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
              disabled={formLocked}
              aria-label={manualTransactionLabels.category}
              clearable={false}
              comboboxProps={comboboxProps}
              data={categoryOptions}
              error={errors.categoryId}
              label={manualTransactionLabels.category}
              maxDropdownHeight={maxDropdownHeight}
              onChange={(value) => {
                setCategoryId(value)
                setErrors((current) => ({
                  ...current,
                  categoryId: undefined,
                }))
              }}
              placeholder="Select category"
              required
              value={categoryId}
            />
            {!isEditing && (
              <>
                <Switch
                  disabled={formLocked}
                  checked={recurringEnabled}
                  label={manualTransactionLabels.recurring}
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
                    disabled={formLocked}
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
          </Stack>
        </Box>
        <FormActions onCancel={onClose} cancelDisabled={isSaving}>
          <Button
            loading={isSaving}
            disabled={Boolean(uncertain)}
            type="submit"
          >
            Save
          </Button>
        </FormActions>
      </ManualTransactionFormFrame>
    </EditorModal>
  )
}
