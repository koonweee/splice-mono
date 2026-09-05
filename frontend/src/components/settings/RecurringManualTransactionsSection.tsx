import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getRecurringManualTransactionControllerFindAllQueryKey,
  useAccountControllerFindAll,
  useCategoryControllerFindAll,
  useRecurringManualTransactionControllerArchive,
  useRecurringManualTransactionControllerCreate,
  useRecurringManualTransactionControllerFindAll,
  useRecurringManualTransactionControllerPause,
  useRecurringManualTransactionControllerResume,
  useRecurringManualTransactionControllerUpdate,
} from '../../api/clients/spliceAPI'
import { MoneyWithSignSign } from '../../api/models'
import { isAssignableCategoryOption } from '../../lib/category-options'
import { formatMoneyWithSign, getDecimalPlaces } from '../../lib/format'
import {
  getViewportAwareOverlayComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import { AccountSelect } from '../accounts/AccountSelect'
import { CategorySelect } from '../categories/CategorySelect'
import { EditorModal } from '../forms/EditorModal'
import { FormActions } from '../forms/FormActions'
import { MobileTableList } from '../MobileTableList'
import { SettingsStatusBadge } from './SettingsStatusBadge'
import { SettingsToolbar } from './SettingsToolbar'
import type { CategorySelectOption } from '../categories/CategorySelect'
import type {
  Account,
  Category,
  RecurringManualTransactionSchedule,
} from '../../api/models'
import type { NumberInputProps } from '@mantine/core'
import type { FormEvent } from 'react'

type ScheduleFormErrors = Partial<
  Record<
    | 'accountId'
    | 'amount'
    | 'merchantName'
    | 'categoryId'
    | 'dayOfMonth'
    | 'startDate',
    string
  >
>

function getAccountLabel(account: Account) {
  return `${account.customName ?? account.name ?? 'Account'}${account.mask ? ` ••${account.mask}` : ''}`
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

function getSignedAmountDraft(
  schedule: RecurringManualTransactionSchedule | null,
) {
  if (!schedule) {
    return ''
  }

  const decimals = getDecimalPlaces(schedule.amount.money.currency)
  const unsignedAmount = schedule.amount.money.amount / Math.pow(10, decimals)

  return schedule.amount.sign === MoneyWithSignSign.negative
    ? -unsignedAmount
    : unsignedAmount
}

function getDefaultAccountId(accounts: Array<Account>) {
  return accounts.find((account) => !account.archivedAt)?.id ?? ''
}

function formatScheduleDay(dayOfMonth: number) {
  return dayOfMonth === 31 ? '31st' : `${dayOfMonth}`
}

type ScheduleModalProps = {
  accounts: Array<Account>
  categories: Array<Category>
  opened: boolean
  schedule: RecurringManualTransactionSchedule | null
  onClose: () => void
  onSaved: () => void
}

function RecurringScheduleModal({
  accounts,
  categories,
  opened,
  schedule,
  onClose,
  onSaved,
}: ScheduleModalProps) {
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState<NumberInputProps['value']>('')
  const [merchantName, setMerchantName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [dayOfMonth, setDayOfMonth] = useState<NumberInputProps['value']>(1)
  const [startDate, setStartDate] = useState('')
  const [errors, setErrors] = useState<ScheduleFormErrors>({})
  const createSchedule = useRecurringManualTransactionControllerCreate()
  const updateSchedule = useRecurringManualTransactionControllerUpdate()
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
  const comboboxProps = getViewportAwareOverlayComboboxProps()
  const isSaving = createSchedule.isPending || updateSchedule.isPending

  useEffect(() => {
    if (!opened) {
      return
    }

    setAccountId(schedule?.accountId ?? getDefaultAccountId(accounts))
    setAmount(getSignedAmountDraft(schedule))
    setMerchantName(schedule?.merchantName ?? '')
    setCategoryId(schedule?.categoryId ?? null)
    setDayOfMonth(schedule?.dayOfMonth ?? 1)
    setStartDate(schedule?.startDate ?? dayjs().format('YYYY-MM-DD'))
    setErrors({})
  }, [accounts, opened, schedule])

  function validate() {
    const nextErrors: ScheduleFormErrors = {}
    const numericAmount = getNumericAmount(amount)
    const numericDay = getNumericAmount(dayOfMonth)

    if (!accountId) {
      nextErrors.accountId = 'Account is required'
    }
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
      nextErrors.amount = 'Enter a non-zero amount'
    }
    if (!merchantName.trim()) {
      nextErrors.merchantName = 'Merchant is required'
    }
    if (!categoryId) {
      nextErrors.categoryId = 'Category is required'
    }
    if (!Number.isInteger(numericDay) || numericDay < 1 || numericDay > 31) {
      nextErrors.dayOfMonth = 'Enter a day from 1 to 31'
    }
    if (
      !startDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !dayjs(startDate).isValid()
    ) {
      nextErrors.startDate = 'Start date is required'
    }

    setErrors(nextErrors)
    return {
      isValid: Object.keys(nextErrors).length === 0,
      numericAmount,
      numericDay,
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const { isValid, numericAmount, numericDay } = validate()
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
      categoryId,
      frequency: 'monthly' as const,
      dayOfMonth: numericDay,
      startDate,
      endDate: null,
    }
    const mutationOptions = {
      onSuccess: () => {
        onSaved()
        onClose()
        notifications.show({
          title: schedule ? 'Schedule updated' : 'Schedule added',
          message: 'The recurring manual transaction schedule was saved.',
          color: 'green',
        })
      },
      onError: () => {
        notifications.show({
          title: 'Schedule save failed',
          message: 'The recurring manual transaction schedule was not saved.',
          color: 'red',
        })
      },
    }

    if (schedule) {
      updateSchedule.mutate(
        {
          id: schedule.id,
          data: payload,
        },
        mutationOptions,
      )
      return
    }

    createSchedule.mutate({ data: payload }, mutationOptions)
  }

  return (
    <EditorModal
      opened={opened}
      onClose={onClose}
      title={
        schedule ? 'Edit recurring transaction' : 'Add recurring transaction'
      }
      centered
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
            maxDropdownHeight={viewportAwareDropdownMaxHeight}
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
              value={amount}
            />
            <TextInput label="Currency" readOnly value={currency} />
          </Group>
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
            maxDropdownHeight={viewportAwareDropdownMaxHeight}
            onChange={(value) => {
              setCategoryId(value)
              setErrors((current) => ({ ...current, categoryId: undefined }))
            }}
            placeholder="Select category"
            required
            value={categoryId}
          />
          <Group align="flex-start" grow>
            <NumberInput
              allowDecimal={false}
              clampBehavior="strict"
              error={errors.dayOfMonth}
              label="Day of month"
              max={31}
              min={1}
              onChange={(value) => {
                setDayOfMonth(value)
                setErrors((current) => ({
                  ...current,
                  dayOfMonth: undefined,
                }))
              }}
              required
              value={dayOfMonth}
            />
            <TextInput
              error={errors.startDate}
              label="Start date"
              onChange={(event) => {
                setStartDate(event.currentTarget.value)
                setErrors((current) => ({
                  ...current,
                  startDate: undefined,
                }))
              }}
              required
              type="date"
              value={startDate}
            />
          </Group>
          <FormActions onCancel={onClose} cancelDisabled={isSaving}>
            <Button loading={isSaving} type="submit">
              Save
            </Button>
          </FormActions>
        </Stack>
      </form>
    </EditorModal>
  )
}

export function RecurringManualTransactionsSection() {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const queryClient = useQueryClient()
  const schedulesQuery = useRecurringManualTransactionControllerFindAll()
  const { data: accounts = [] } = useAccountControllerFindAll()
  const { data: categories = [] } = useCategoryControllerFindAll()
  const [modalOpened, setModalOpened] = useState(false)
  const [editingSchedule, setEditingSchedule] =
    useState<RecurringManualTransactionSchedule | null>(null)
  const invalidateSchedules = () => {
    queryClient.invalidateQueries({
      queryKey: getRecurringManualTransactionControllerFindAllQueryKey(),
    })
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes('transaction'),
    })
  }
  const pauseSchedule = useRecurringManualTransactionControllerPause({
    mutation: {
      onSuccess: invalidateSchedules,
    },
  })
  const resumeSchedule = useRecurringManualTransactionControllerResume({
    mutation: {
      onSuccess: invalidateSchedules,
    },
  })
  const archiveSchedule = useRecurringManualTransactionControllerArchive({
    mutation: {
      onSuccess: () => {
        invalidateSchedules()
        notifications.show({
          title: 'Schedule deleted',
          message: 'The recurring manual transaction schedule was deleted.',
          color: 'green',
        })
      },
      onError: () => {
        notifications.show({
          title: 'Delete failed',
          message: 'The recurring manual transaction schedule was not deleted.',
          color: 'red',
        })
      },
    },
  })

  const closeModal = () => {
    setModalOpened(false)
    setEditingSchedule(null)
  }

  const openCreateModal = () => {
    setEditingSchedule(null)
    setModalOpened(true)
  }

  const schedules = schedulesQuery.data ?? []

  function getScheduleStatus(schedule: RecurringManualTransactionSchedule) {
    return schedule.pausedAt
      ? 'Paused'
      : schedule.nextOccurrenceDate
        ? 'Active'
        : 'Ended'
  }

  function renderScheduleActions(schedule: RecurringManualTransactionSchedule) {
    return (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <Tooltip label="Edit recurring transaction">
          <ActionIcon
            aria-label="Edit recurring transaction"
            onClick={() => {
              setEditingSchedule(schedule)
              setModalOpened(true)
            }}
            size={isMobile ? 44 : 36}
            variant="subtle"
          >
            <Pencil size={16} />
          </ActionIcon>
        </Tooltip>
        {schedule.pausedAt ? (
          <Tooltip label="Resume recurring transaction">
            <ActionIcon
              aria-label="Resume recurring transaction"
              onClick={() => resumeSchedule.mutate({ id: schedule.id })}
              size={isMobile ? 44 : 36}
              variant="subtle"
            >
              <Play size={16} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label="Pause recurring transaction">
            <ActionIcon
              aria-label="Pause recurring transaction"
              onClick={() => pauseSchedule.mutate({ id: schedule.id })}
              size={isMobile ? 44 : 36}
              variant="subtle"
            >
              <Pause size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Delete recurring transaction">
          <ActionIcon
            aria-label="Delete recurring transaction"
            color="red"
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${schedule.merchantName}" recurring schedule?`,
                )
              ) {
                archiveSchedule.mutate({ id: schedule.id })
              }
            }}
            size={isMobile ? 44 : 36}
            variant="subtle"
          >
            <Trash2 size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    )
  }

  function renderMobileSchedule(schedule: RecurringManualTransactionSchedule) {
    return (
      <Stack px="sm" py="sm" gap="xs">
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Box style={{ flex: '1 1 auto', minWidth: 0 }}>
            <Text fw={700}>{schedule.merchantName}</Text>
            <Text c="dimmed" size="sm">
              {schedule.accountName ?? 'Account'}
            </Text>
          </Box>
          <Text fw={600} size="sm" style={{ flexShrink: 0 }}>
            {formatMoneyWithSign({ value: schedule.amount })}
          </Text>
        </Group>
        <Group gap="xs" justify="space-between">
          <Text c="dimmed" size="sm">
            Monthly on {formatScheduleDay(schedule.dayOfMonth)}
          </Text>
          <Text size="sm">
            {schedule.nextOccurrenceDate ? (
              <>
                Next:{' '}
                <span>
                  {dayjs(schedule.nextOccurrenceDate).format('MMM D, YYYY')}
                </span>
              </>
            ) : (
              'No upcoming transaction'
            )}
          </Text>
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <SettingsStatusBadge status={getScheduleStatus(schedule)} />
          {renderScheduleActions(schedule)}
        </Group>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <RecurringScheduleModal
        accounts={accounts}
        categories={categories}
        opened={modalOpened}
        schedule={editingSchedule}
        onClose={closeModal}
        onSaved={invalidateSchedules}
      />
      <SettingsToolbar
        title="Recurring transactions"
        description="Create monthly transactions automatically on their due date."
        addLabel="Add recurring"
        onAdd={openCreateModal}
      />
      {schedulesQuery.isError && (
        <Alert color="red">Failed to load recurring transactions</Alert>
      )}
      {schedulesQuery.isLoading && (
        <Group justify="center" py="lg">
          <Loader />
        </Group>
      )}
      {!schedulesQuery.isLoading &&
        !schedulesQuery.isError &&
        (isMobile ? (
          <MobileTableList
            ariaLabel={`Recurring transactions list, ${schedules.length.toLocaleString()} total`}
            data={schedules}
            emptyMessage="No recurring transactions"
            getRowKey={(schedule) => schedule.id}
            renderRow={renderMobileSchedule}
          />
        ) : (
          <Paper withBorder p={0} radius="md" style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Merchant</Table.Th>
                    <Table.Th>Amount</Table.Th>
                    <Table.Th>Schedule</Table.Th>
                    <Table.Th>Next</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {schedules.map((schedule) => (
                    <Table.Tr key={schedule.id}>
                      <Table.Td>
                        <Stack gap={0}>
                          <Text fw={600} size="sm">
                            {schedule.merchantName}
                          </Text>
                          <Text c="dimmed" size="xs">
                            {schedule.accountName ?? 'Account'}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        {formatMoneyWithSign({ value: schedule.amount })}
                      </Table.Td>
                      <Table.Td>
                        Monthly on {formatScheduleDay(schedule.dayOfMonth)}
                      </Table.Td>
                      <Table.Td>
                        {schedule.nextOccurrenceDate
                          ? dayjs(schedule.nextOccurrenceDate).format(
                              'MMM D, YYYY',
                            )
                          : '—'}
                      </Table.Td>
                      <Table.Td>
                        <SettingsStatusBadge
                          status={getScheduleStatus(schedule)}
                        />
                      </Table.Td>
                      <Table.Td>{renderScheduleActions(schedule)}</Table.Td>
                    </Table.Tr>
                  ))}
                  {schedules.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text c="dimmed" ta="center" py="lg">
                          No recurring transactions
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        ))}
    </Stack>
  )
}
