import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CloseButton,
  Group,
  Modal,
  MultiSelect,
  Pagination,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { IconEdit, IconFilter, IconSearch, IconX } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useCallback, useMemo, useState } from 'react'
import {
  getTransactionControllerFindAllQueryKey,
  useAccountControllerFindAll,
  useTransactionControllerFindAll,
  useTransactionControllerUpdate,
} from '../../api/clients/spliceAPI'
import { formatMoneyWithSign } from '../../lib/format'
import type {
  Transaction,
  TransactionControllerFindAllParams,
} from '../../api/models'

type TransactionsSearch = {
  page?: number
  limit?: number
  accountId?: Array<string>
  categoryId?: Array<string>
  startDate?: string
  endDate?: string
  search?: string
}

export const Route = createFileRoute('/_authed/transactions')({
  component: TransactionsPage,
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    limit: typeof search.limit === 'number' ? search.limit : undefined,
    accountId: Array.isArray(search.accountId)
      ? (search.accountId as Array<string>)
      : typeof search.accountId === 'string'
        ? [search.accountId]
        : undefined,
    categoryId: Array.isArray(search.categoryId)
      ? (search.categoryId as Array<string>)
      : typeof search.categoryId === 'string'
        ? [search.categoryId]
        : undefined,
    startDate:
      typeof search.startDate === 'string' ? search.startDate : undefined,
    endDate: typeof search.endDate === 'string' ? search.endDate : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
  }),
})

const PAGE_SIZE_OPTIONS = [
  { value: '25', label: '25 per page' },
  { value: '50', label: '50 per page' },
  { value: '100', label: '100 per page' },
]

function TransactionsPage() {
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()

  const page = searchParams.page ?? 1
  const limit = searchParams.limit ?? 50

  // Local search input state with debouncing
  const [searchInput, setSearchInput] = useState(searchParams.search ?? '')
  const [debouncedSearch] = useDebouncedValue(searchInput, 300)

  // Filter panel visibility
  const [filtersOpen, { toggle: toggleFilters }] = useDisclosure(false)

  // Edit modal
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)
  const [editMerchantName, setEditMerchantName] = useState('')
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null)

  const openEditModal = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction)
    setEditMerchantName(transaction.merchantName ?? '')
    setEditCategoryId(transaction.categoryId ?? null)
  }, [])

  // Build API params from search state
  const apiParams: TransactionControllerFindAllParams = useMemo(
    () => ({
      page,
      limit,
      accountId: searchParams.accountId,
      categoryId: searchParams.categoryId,
      startDate: searchParams.startDate,
      endDate: searchParams.endDate,
      search: debouncedSearch || undefined,
    }),
    [
      page,
      limit,
      searchParams.accountId,
      searchParams.categoryId,
      searchParams.startDate,
      searchParams.endDate,
      debouncedSearch,
    ],
  )

  const {
    data: paginatedData,
    isLoading,
    error,
    isFetching,
  } = useTransactionControllerFindAll(apiParams)
  const { data: accounts } = useAccountControllerFindAll()

  const transactions = paginatedData?.data ?? []
  const total = paginatedData?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  // Derive unique categories from current results for the filter dropdown
  const categoryOptions = useMemo(() => {
    if (!transactions.length) return []
    const seen = new Map<string, string>()
    transactions.forEach((t) => {
      if (t.category && !seen.has(t.category.id)) {
        seen.set(t.category.id, t.category.detailed.replace(/_/g, ' '))
      }
    })
    return Array.from(seen.entries()).map(([value, label]) => ({
      value,
      label,
    }))
  }, [transactions])

  const accountOptions = useMemo(
    () =>
      (accounts ?? []).map((a) => ({
        value: a.id,
        label: a.customName ?? a.name ?? a.id,
      })),
    [accounts],
  )

  // Navigation helper to update search params
  const updateSearch = useCallback(
    (updates: Partial<TransactionsSearch>) => {
      navigate({
        search: (prev: TransactionsSearch) => {
          const next = { ...prev, ...updates }
          // Reset to page 1 when filters change (unless page is being explicitly set)
          if (!('page' in updates)) {
            next.page = 1
          }
          // Strip undefined/empty values
          Object.keys(next).forEach((key) => {
            const k = key as keyof TransactionsSearch
            const val = next[k]
            if (
              val === undefined ||
              val === '' ||
              (Array.isArray(val) && val.length === 0)
            ) {
              delete next[k]
            }
          })
          return next
        },
        replace: true,
      })
    },
    [navigate],
  )

  const hasActiveFilters =
    (searchParams.accountId?.length ?? 0) > 0 ||
    (searchParams.categoryId?.length ?? 0) > 0 ||
    !!searchParams.startDate ||
    !!searchParams.endDate

  const clearFilters = useCallback(() => {
    setSearchInput('')
    navigate({ search: {}, replace: true })
  }, [navigate])

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Title order={1}>Transactions</Title>
        <Text size="sm" c="dimmed">
          {total} transaction{total !== 1 ? 's' : ''}
        </Text>
      </Group>

      {/* Search & Filter Bar */}
      <Group>
        <TextInput
          placeholder="Search merchants..."
          leftSection={<IconSearch size={16} />}
          rightSection={
            searchInput ? (
              <CloseButton
                size="sm"
                onClick={() => {
                  setSearchInput('')
                  updateSearch({ search: undefined })
                }}
              />
            ) : null
          }
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.currentTarget.value)
            updateSearch({ search: e.currentTarget.value || undefined })
          }}
          style={{ flex: 1, maxWidth: 400 }}
        />
        <Button
          variant={hasActiveFilters ? 'light' : 'default'}
          leftSection={<IconFilter size={16} />}
          onClick={toggleFilters}
          rightSection={
            hasActiveFilters ? (
              <Badge size="xs" circle>
                {(searchParams.accountId?.length ?? 0) +
                  (searchParams.categoryId?.length ?? 0) +
                  (searchParams.startDate ? 1 : 0) +
                  (searchParams.endDate ? 1 : 0)}
              </Badge>
            ) : null
          }
        >
          Filters
        </Button>
        {(hasActiveFilters || searchInput) && (
          <Button
            variant="subtle"
            color="gray"
            onClick={clearFilters}
            leftSection={<IconX size={14} />}
          >
            Clear all
          </Button>
        )}
      </Group>

      {/* Filter Panel */}
      {filtersOpen && (
        <Card withBorder p="md" radius="md">
          <Group grow align="flex-start">
            <MultiSelect
              label="Account"
              placeholder="All accounts"
              data={accountOptions}
              value={searchParams.accountId ?? []}
              onChange={(value) =>
                updateSearch({ accountId: value.length ? value : undefined })
              }
              clearable
              searchable
            />
            <MultiSelect
              label="Category"
              placeholder="All categories"
              data={categoryOptions}
              value={searchParams.categoryId ?? []}
              onChange={(value) =>
                updateSearch({ categoryId: value.length ? value : undefined })
              }
              clearable
              searchable
            />
            <TextInput
              label="Start date"
              type="date"
              value={searchParams.startDate ?? ''}
              onChange={(e) =>
                updateSearch({ startDate: e.currentTarget.value || undefined })
              }
            />
            <TextInput
              label="End date"
              type="date"
              value={searchParams.endDate ?? ''}
              onChange={(e) =>
                updateSearch({ endDate: e.currentTarget.value || undefined })
              }
            />
          </Group>
        </Card>
      )}

      {/* Error state */}
      {error ? (
        <Alert color="red" title="Error">
          Failed to load transactions
        </Alert>
      ) : null}

      {/* Table */}
      <Card withBorder padding="0" radius="md">
        <Table verticalSpacing="sm" horizontalSpacing="md" stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Account</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
              <Table.Th style={{ width: 50 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Skeleton h={16} w={90} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton h={16} w={140} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton h={16} w={100} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton h={16} w={80} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton h={16} w={60} ml="auto" />
                    </Table.Td>
                    <Table.Td />
                  </Table.Tr>
                ))
              : transactions.map((transaction) => (
                  <Table.Tr
                    key={transaction.id}
                    style={{
                      opacity: isFetching ? 0.6 : 1,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <Table.Td>
                      <Text size="sm">
                        {dayjs(transaction.date).format('MMM D, YYYY')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {transaction.logoUrl && (
                          <img
                            src={transaction.logoUrl}
                            alt=""
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              objectFit: 'contain',
                            }}
                          />
                        )}
                        <Stack gap={0}>
                          <Text size="sm" fw={500} truncate="end">
                            {transaction.merchantName ?? 'Transaction'}
                          </Text>
                          {transaction.pending && (
                            <Badge size="xs" variant="light" color="orange">
                              Pending
                            </Badge>
                          )}
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {transaction.account?.customName ??
                          transaction.account?.name ??
                          'Unknown'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {transaction.category ? (
                        <Badge variant="outline" color="gray" size="sm">
                          {transaction.category.detailed.replace(/_/g, ' ')}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Uncategorized
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text
                        size="sm"
                        fw={600}
                        c={
                          transaction.amount.sign === 'negative'
                            ? 'red'
                            : 'teal'
                        }
                      >
                        {formatMoneyWithSign({ value: transaction.amount })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => openEditModal(transaction)}
                      >
                        <IconEdit size={14} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
            {!isLoading && transactions.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" ta="center" py="xl">
                    {hasActiveFilters || searchInput
                      ? 'No transactions match your filters'
                      : 'No transactions found'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Group justify="space-between">
          <Select
            data={PAGE_SIZE_OPTIONS}
            value={String(limit)}
            onChange={(val) =>
              updateSearch({ limit: val ? Number(val) : 50, page: 1 })
            }
            w={150}
          />
          <Pagination
            total={totalPages}
            value={page}
            onChange={(p) => updateSearch({ page: p })}
          />
          <Text size="sm" c="dimmed">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </Text>
        </Group>
      )}

      {/* Edit Modal */}
      <TransactionEditModal
        transaction={editingTransaction}
        onClose={() => setEditingTransaction(null)}
        apiParams={apiParams}
        merchantName={editMerchantName}
        setMerchantName={setEditMerchantName}
        categoryId={editCategoryId}
        setCategoryId={setEditCategoryId}
      />
    </Stack>
  )
}

function TransactionEditModal({
  transaction,
  onClose,
  apiParams,
  merchantName,
  setMerchantName,
  categoryId,
  setCategoryId,
}: {
  transaction: Transaction | null
  onClose: () => void
  apiParams: TransactionControllerFindAllParams
  merchantName: string
  setMerchantName: (value: string) => void
  categoryId: string | null
  setCategoryId: (value: string | null) => void
}) {
  const queryClient = useQueryClient()
  const updateMutation = useTransactionControllerUpdate()

  const opened = transaction !== null

  const handleSave = useCallback(() => {
    if (!transaction) return

    updateMutation.mutate(
      {
        id: transaction.id,
        data: {
          merchantName: merchantName || null,
          categoryId: categoryId ?? null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getTransactionControllerFindAllQueryKey(apiParams),
          })
          showNotification({
            title: 'Transaction updated',
            message: 'Changes saved successfully',
            color: 'teal',
          })
          onClose()
        },
        onError: () => {
          showNotification({
            title: 'Error',
            message: 'Failed to update transaction',
            color: 'red',
          })
        },
      },
    )
  }, [
    transaction,
    merchantName,
    categoryId,
    updateMutation,
    queryClient,
    apiParams,
    onClose,
  ])

  return (
    <Modal opened={opened} onClose={onClose} title="Edit Transaction">
      {transaction && (
        <Stack>
          <Text size="sm" c="dimmed">
            {dayjs(transaction.date).format('MMM D, YYYY')} ·{' '}
            {formatMoneyWithSign({ value: transaction.amount })}
          </Text>
          <TextInput
            label="Merchant Name"
            value={merchantName}
            onChange={(e) => setMerchantName(e.currentTarget.value)}
          />
          <TextInput
            label="Category ID"
            description="Enter the category UUID to re-categorize"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.currentTarget.value || null)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={updateMutation.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
