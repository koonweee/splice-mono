import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Popover,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import styles from './ManualBrokeragePositionsEditor.module.css'
import type { MarketSecuritySearchResult } from '../../api/models'

export type ManualBrokerageSecurityResult = MarketSecuritySearchResult

export interface ManualBrokeragePositionDraft {
  symbol: string
  quantity: string
  security?: ManualBrokerageSecurityResult
}

interface ManualBrokeragePositionsEditorProps {
  positions: Array<ManualBrokeragePositionDraft>
  onChange: (positions: Array<ManualBrokeragePositionDraft>) => void
  searchSecurities: (
    query: string,
    signal?: AbortSignal,
  ) => Promise<Array<ManualBrokerageSecurityResult>>
  disabled?: boolean
}

export function isPositiveDecimal(value: string): boolean {
  if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/.test(value.trim())) {
    return false
  }
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0
}

export function ManualBrokeragePositionsEditor({
  positions,
  onChange,
  searchSecurities,
  disabled = false,
}: ManualBrokeragePositionsEditorProps) {
  const [searchInput, setSearchInput] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [debouncedSearch] = useDebouncedValue(searchInput.trim(), 300)
  const [duplicateSymbol, setDuplicateSymbol] = useState<string | null>(null)
  const searchEnabled = debouncedSearch.length >= 2
  const trimmedSearchInput = searchInput.trim()
  const searchQuery = useQuery({
    queryKey: ['investment-security-search', debouncedSearch],
    queryFn: ({ signal }) => searchSecurities(debouncedSearch, signal),
    enabled: searchEnabled,
    staleTime: 5 * 60 * 1000,
  })
  const settledSearchMatchesInput =
    debouncedSearch === trimmedSearchInput &&
    !searchQuery.isFetching &&
    (searchQuery.isSuccess || searchQuery.isError)
  const searchPopoverOpened =
    searchFocused &&
    trimmedSearchInput.length >= 2 &&
    settledSearchMatchesInput

  const positionSymbols = useMemo(
    () => new Set(positions.map((position) => position.symbol.toUpperCase())),
    [positions],
  )

  const addSecurity = (security: ManualBrokerageSecurityResult) => {
    if (positionSymbols.has(security.symbol.toUpperCase())) {
      setDuplicateSymbol(security.symbol)
      return
    }

    onChange([
      ...positions,
      {
        symbol: security.symbol,
        quantity: '1',
        security,
      },
    ])
    setSearchInput('')
    setSearchFocused(false)
    setDuplicateSymbol(null)
  }

  const updateQuantity = (index: number, quantity: string) => {
    onChange(
      positions.map((position, positionIndex) =>
        positionIndex === index ? { ...position, quantity } : position,
      ),
    )
  }

  const removePosition = (index: number) => {
    onChange(
      positions.filter((_position, positionIndex) => positionIndex !== index),
    )
  }

  return (
    <Stack gap="sm">
      <Box>
        <Text fw={500} size="sm" mb={4}>
          Positions
        </Text>
        <Popover
          opened={searchPopoverOpened}
          position="bottom-start"
          shadow="md"
          width="target"
          withinPortal
        >
          <Popover.Target>
            <TextInput
              aria-label="Search stocks and ETFs"
              disabled={disabled}
              leftSection={<Search size={14} />}
              onBlur={() => setSearchFocused(false)}
              onChange={(event) => {
                setSearchInput(event.currentTarget.value)
                setDuplicateSymbol(null)
              }}
              onFocus={() => setSearchFocused(true)}
              placeholder="Search AAPL or C6L.SI"
              rightSection={
                searchQuery.isFetching ? <Loader size={14} /> : undefined
              }
              rightSectionPointerEvents="none"
              size="md"
              styles={{ input: { minHeight: 44 } }}
              value={searchInput}
            />
          </Popover.Target>
          <Popover.Dropdown aria-label="Security search results" p="xs">
            {searchQuery.isError ? (
              <Text c="red" role="alert" size="sm">
                Stock search failed. Try again in a moment.
              </Text>
            ) : searchQuery.isSuccess && searchQuery.data.length === 0 ? (
              <Text c="dimmed" size="sm">
                No supported stocks or ETFs found.
              </Text>
            ) : searchQuery.isSuccess ? (
              <Box style={{ maxHeight: 280, overflowY: 'auto' }}>
                <Stack gap={4}>
                  {searchQuery.data.map((security) => {
                    const alreadyAdded = positionSymbols.has(
                      security.symbol.toUpperCase(),
                    )
                    return (
                      <Button
                        aria-label={`Add ${security.symbol}`}
                        disabled={disabled}
                        justify="flex-start"
                        key={`${security.symbol}-${security.exchangeCode}`}
                        leftSection={<Plus size={14} />}
                        onClick={() => addSecurity(security)}
                        onMouseDown={(event) => event.preventDefault()}
                        styles={{
                          label: { flex: 1, minWidth: 0 },
                          root: {
                            height: 'auto',
                            minHeight: 52,
                            paddingBottom: 8,
                            paddingTop: 8,
                          },
                        }}
                        variant="subtle"
                        fullWidth
                      >
                        <Group justify="space-between" wrap="nowrap" w="100%">
                          <Box style={{ minWidth: 0, textAlign: 'left' }}>
                            <Text fw={600} size="sm">
                              {security.symbol} · {security.name}
                            </Text>
                            <Text c="dimmed" size="xs">
                              {security.exchangeName} · {security.currency}
                            </Text>
                          </Box>
                          {alreadyAdded && (
                            <Text c="dimmed" size="xs">
                              Added
                            </Text>
                          )}
                        </Group>
                      </Button>
                    )
                  })}
                </Stack>
              </Box>
            ) : null}
          </Popover.Dropdown>
        </Popover>
      </Box>

      {duplicateSymbol && (
        <Alert color="yellow" role="alert">
          {duplicateSymbol} is already in this brokerage.
        </Alert>
      )}

      {positions.length === 0 ? (
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm" ta="center">
            No positions added yet.
          </Text>
        </Paper>
      ) : (
        <Stack gap="xs">
          <div aria-hidden="true" className={styles.positionHeader}>
            <Text size="xs">Stock</Text>
            <Text size="xs">Shares</Text>
            <span />
          </div>
          {positions.map((position, index) => {
            const quantityIsValid = isPositiveDecimal(position.quantity)
            return (
              <div className={styles.positionRow} key={position.symbol}>
                <Box className={styles.positionDetails}>
                  <Text fw={600} size="sm" truncate>
                    {position.symbol}
                    {position.security?.name
                      ? ` · ${position.security.name}`
                      : ''}
                  </Text>
                  {position.security && (
                    <Text c="dimmed" size="xs" truncate>
                      {position.security.exchangeName} ·{' '}
                      {position.security.currency}
                    </Text>
                  )}
                </Box>
                <TextInput
                  aria-label={`${position.symbol} quantity`}
                  className={styles.quantityInput}
                  disabled={disabled}
                  error={
                    quantityIsValid
                      ? undefined
                      : 'Enter a quantity greater than 0'
                  }
                  inputMode="decimal"
                  onChange={(event) =>
                    updateQuantity(index, event.currentTarget.value)
                  }
                  size="md"
                  styles={{ input: { minHeight: 44 } }}
                  value={position.quantity}
                />
                <ActionIcon
                  aria-label={`Remove ${position.symbol}`}
                  color="red"
                  disabled={disabled}
                  onClick={() => removePosition(index)}
                  size={44}
                  variant="subtle"
                >
                  <Trash2 size={16} />
                </ActionIcon>
              </div>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
