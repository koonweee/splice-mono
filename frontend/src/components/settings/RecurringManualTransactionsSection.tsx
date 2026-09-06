import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import tableChrome from '../MantineTableChrome.module.css'
import { ResponsiveSlot } from '../ResponsiveSlot'
import { TableSkeleton } from '../loading/LoadingSkeleton'
import { moneyToMajorString, tryParseMoneyDraft } from '../../lib/money'
import { DecimalInput } from '../forms/DecimalInput'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import {
  useAccountControllerFindAll,
  useCategoryControllerFindAll,
  useRecurringManualTransactionControllerArchive,
  useRecurringManualTransactionControllerCreate,
  useRecurringManualTransactionControllerFindAll,
  useRecurringManualTransactionControllerPause,
  useRecurringManualTransactionControllerResume,
  useRecurringManualTransactionControllerUpdate,
} from '../../api/clients/spliceAPI'
import { getApiErrorMessage } from '../../lib/api-errors'
import { isAssignableCategoryOption } from '../../lib/category-options'
import {
  formatCalendarDate,
  formatMoneyWithSign,
  getDecimalPlaces,
} from '../../lib/format'
import {
  notifyMutationError,
  notifyMutationSuccess,
} from '../../lib/mutation-feedback'
import { useCompactLayout } from '../../lib/responsive'
import { DataState } from '../DataState'
import {
  getViewportAwareOverlayComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import { AccountSelect } from '../accounts/AccountSelect'
import { CategorySelect } from '../categories/CategorySelect'
import { ConfirmActionDialog } from '../ConfirmActionDialog'
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

  return moneyToMajorString(schedule.amount)
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
  const [amount, setAmount] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [dayOfMonth, setDayOfMonth] = useState<NumberInputProps['value']>(1)
  const [startDate, setStartDate] = useState('')
  const [errors, setErrors] = useState<ScheduleFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const submissionPending = useRef(false)
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
    setSaveError(null)
  }, [accounts, opened, schedule])

  function validate() {
    const nextErrors: ScheduleFormErrors = {}
    const parsedAmount = tryParseMoneyDraft(amount, currency)
    const numericDay = getNumericAmount(dayOfMonth)

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
      parsedAmount,
      numericDay,
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionPending.current || isSaving) return

    const { isValid, parsedAmount, numericDay } = validate()
    if (!isValid || !currency || !categoryId || !parsedAmount) {
      return
    }
    submissionPending.current = true
    setSaveError(null)

    const payload = {
      accountId,
      amount: parsedAmount,
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
        notifyMutationSuccess({
          title: schedule ? 'Schedule updated' : 'Schedule added',
          message: 'The recurring manual transaction schedule was saved.',
        })
      },
      onError: (error: unknown) => {
        setSaveError(
          getApiErrorMessage(
            error,
            'The recurring transaction could not be saved. Try again.',
          ),
        )
      },
      onSettled: () => {
        submissionPending.current = false
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

  const closeIfIdle = () => {
    if (!submissionPending.current && !isSaving) onClose()
  }

  return (
    <EditorModal
      opened={opened}
      onClose={closeIfIdle}
      closeOnEscape={!isSaving}
      closeOnClickOutside={!isSaving}
      closeButtonProps={{ disabled: isSaving }}
      title={
        schedule ? 'Edit recurring transaction' : 'Add recurring transaction'
      }
      centered
      size="md"
      transitionProps={{ duration: 0 }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {saveError && (
            <Alert color="red" role="alert" title="Schedule not saved">
              {saveError}
            </Alert>
          )}
          <AccountSelect
            disabled={isSaving}
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
            <DecimalInput
              disabled={isSaving}
              error={errors.amount}
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
            disabled={isSaving}
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
            disabled={isSaving}
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
              disabled={isSaving}
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
              disabled={isSaving}
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
          <FormActions onCancel={closeIfIdle} cancelDisabled={isSaving}>
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
  const isMobile = useCompactLayout()
  const queryClient = useQueryClient()
  const schedulesQuery = useRecurringManualTransactionControllerFindAll()
  const { data: accounts = [] } = useAccountControllerFindAll()
  const { data: categories = [] } = useCategoryControllerFindAll()
  const [modalOpened, setModalOpened] = useState(false)
  const [editingSchedule, setEditingSchedule] =
    useState<RecurringManualTransactionSchedule | null>(null)
  const [deletingSchedule, setDeletingSchedule] =
    useState<RecurringManualTransactionSchedule | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const actionPending = useRef(false)
  const invalidateSchedules = () => {
    void invalidateMutationFamilies(queryClient, ['schedules'])
  }

  const pauseSchedule = useRecurringManualTransactionControllerPause()
  const resumeSchedule = useRecurringManualTransactionControllerResume()
  const archiveSchedule = useRecurringManualTransactionControllerArchive()
  const isActionPending =
    pauseSchedule.isPending ||
    resumeSchedule.isPending ||
    archiveSchedule.isPending

  const setSchedulePaused = (
    schedule: RecurringManualTransactionSchedule,
    paused: boolean,
  ) => {
    if (actionPending.current || isActionPending) return
    actionPending.current = true
    const mutation = paused ? pauseSchedule : resumeSchedule
    mutation.mutate(
      { id: schedule.id },
      {
        onSuccess: () => {
          invalidateSchedules()
          notifyMutationSuccess({
            title: paused ? 'Schedule paused' : 'Schedule resumed',
            message: `${schedule.merchantName} was ${paused ? 'paused' : 'resumed'}.`,
          })
        },
        onError: (error) => {
          notifyMutationError({
            title: paused ? 'Pause failed' : 'Resume failed',
            error,
            fallback: `Unable to ${paused ? 'pause' : 'resume'} this schedule. Try again.`,
          })
        },
        onSettled: () => {
          actionPending.current = false
        },
      },
    )
  }

  const deleteSchedule = () => {
    if (!deletingSchedule || actionPending.current || isActionPending) return
    actionPending.current = true
    setDeleteError(null)
    archiveSchedule.mutate(
      { id: deletingSchedule.id },
      {
        onSuccess: () => {
          invalidateSchedules()
          setDeletingSchedule(null)
          notifyMutationSuccess({
            title: 'Schedule deleted',
            message: 'The recurring manual transaction schedule was deleted.',
          })
        },
        onError: (error) => {
          setDeleteError(
            getApiErrorMessage(
              error,
              'Unable to delete this schedule. Try again.',
            ),
          )
        },
        onSettled: () => {
          actionPending.current = false
        },
      },
    )
  }

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
      <Group
        className={tableChrome.actions}
        gap={4}
        justify="flex-end"
        wrap="nowrap"
      >
        <Tooltip label="Edit recurring transaction">
          <ActionIcon
            disabled={isActionPending}
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
              onClick={() => setSchedulePaused(schedule, false)}
              disabled={isActionPending}
              loading={
                resumeSchedule.isPending &&
                resumeSchedule.variables.id === schedule.id
              }
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
              onClick={() => setSchedulePaused(schedule, true)}
              disabled={isActionPending}
              loading={
                pauseSchedule.isPending &&
                pauseSchedule.variables.id === schedule.id
              }
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
            disabled={isActionPending}
            onClick={() => {
              setDeleteError(null)
              setDeletingSchedule(schedule)
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
                <span>{formatCalendarDate(schedule.nextOccurrenceDate)}</span>
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
      <ConfirmActionDialog
        opened={deletingSchedule !== null}
        onClose={() => {
          if (!actionPending.current) setDeletingSchedule(null)
        }}
        title="Delete recurring transaction"
        targetLabel={deletingSchedule?.merchantName ?? ''}
        consequence="Future transactions will no longer be created by this schedule. Existing transactions will be kept."
        confirmLabel="Delete"
        onConfirm={deleteSchedule}
        isPending={archiveSchedule.isPending}
        error={deleteError}
      />
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
      <DataState
        loadingFallback={<TableSkeleton rows={4} />}
        hasData={schedules.length > 0}
        isLoading={schedulesQuery.isLoading}
        isError={schedulesQuery.isError}
        isFetching={schedulesQuery.isFetching}
        onRetry={() => void schedulesQuery.refetch()}
        loadingMessage="Loading recurring transactions…"
        errorMessage="Failed to load recurring transactions"
        emptyMessage="No recurring transactions"
      >
        <ResponsiveSlot compact={Boolean(isMobile)} variant="compact">
          <MobileTableList
            ariaLabel={`Recurring transactions list, ${schedules.length.toLocaleString()} total`}
            data={schedules}
            emptyMessage="No recurring transactions"
            getRowKey={(schedule) => schedule.id}
            renderRow={renderMobileSchedule}
          />
        </ResponsiveSlot>
        <ResponsiveSlot compact={Boolean(isMobile)} variant="wide">
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
                          ? formatCalendarDate(schedule.nextOccurrenceDate)
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
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </ResponsiveSlot>
      </DataState>
    </Stack>
  )
}
