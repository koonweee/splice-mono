import { Alert, Button, Group, Modal, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useEffect, useRef, useState } from 'react'
import { getApiErrorMessage } from '../../lib/api-errors'
import { useIsMobile } from '../../lib/hooks'
import {
  ManualBrokeragePositionsEditor,
  isPositiveDecimal,
} from './ManualBrokeragePositionsEditor'
import type { InvestmentHoldingSnapshot } from '../../api/models'
import type {
  ManualBrokeragePositionDraft,
  ManualBrokerageSecurityResult,
} from './ManualBrokeragePositionsEditor'

export interface ManualBrokerageSaveResult {
  staleSymbols: Array<string>
}

interface ManualBrokerageHoldingsModalProps {
  accountId: string
  opened: boolean
  onClose: () => void
  holdings: Array<InvestmentHoldingSnapshot>
  searchSecurities: (
    query: string,
    signal?: AbortSignal,
  ) => Promise<Array<ManualBrokerageSecurityResult>>
  saveHoldings: (
    positions: Array<{ symbol: string; quantity: string }>,
  ) => Promise<ManualBrokerageSaveResult>
  onSaved?: (result: ManualBrokerageSaveResult) => void
}

export function formatQuantityForInput(value: string | null): string {
  if (value === null) return ''
  const trimmed = value.trim()
  if (!trimmed.includes('.')) return trimmed
  return trimmed.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1')
}

function toDraft(
  holding: InvestmentHoldingSnapshot,
): ManualBrokeragePositionDraft {
  const symbol =
    holding.security.tickerSymbol ?? holding.security.externalSecurityId
  return {
    symbol,
    quantity: formatQuantityForInput(holding.quantity),
    security: {
      symbol,
      name: holding.security.name ?? symbol,
      quoteType: holding.security.type === 'ETF' ? 'ETF' : 'EQUITY',
      exchangeCode: holding.security.marketIdentifierCode ?? 'Unknown',
      exchangeName: holding.security.marketIdentifierCode ?? 'Unknown exchange',
      currency:
        holding.isoCurrencyCode ??
        holding.security.isoCurrencyCode ??
        holding.unofficialCurrencyCode ??
        holding.security.unofficialCurrencyCode ??
        'USD',
      marketIdentifierCode: holding.security.marketIdentifierCode,
    },
  }
}

export function ManualBrokerageHoldingsModal({
  accountId,
  opened,
  onClose,
  holdings,
  searchSecurities,
  saveHoldings,
  onSaved,
}: ManualBrokerageHoldingsModalProps) {
  const isMobile = useIsMobile()
  const [positions, setPositions] = useState(() => holdings.map(toDraft))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wasOpened = useRef(false)
  const previousAccountId = useRef(accountId)

  useEffect(() => {
    const justOpened = opened && !wasOpened.current
    const accountChanged = previousAccountId.current !== accountId

    if (opened && (justOpened || accountChanged)) {
      setPositions(holdings.map(toDraft))
      setError(null)
    }

    wasOpened.current = opened
    previousAccountId.current = accountId
  }, [accountId, holdings, opened])

  const allQuantitiesValid = positions.every((position) =>
    isPositiveDecimal(position.quantity),
  )

  const handleSave = async () => {
    if (!allQuantitiesValid) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await saveHoldings(
        positions.map(({ symbol, quantity }) => ({
          symbol,
          quantity: quantity.trim(),
        })),
      )
      onSaved?.(result)
      notifications.show({
        title: 'Holdings updated',
        message:
          result.staleSymbols.length > 0
            ? `Saved using cached prices for ${result.staleSymbols.join(', ')}.`
            : 'Your brokerage value has been updated.',
        color: result.staleSymbols.length > 0 ? 'yellow' : 'green',
      })
      onClose()
    } catch (saveError) {
      setError(
        getApiErrorMessage(
          saveError,
          'Unable to value these positions. Check the symbols and try again.',
        ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      fullScreen={isMobile}
      onClose={onClose}
      opened={opened}
      size="lg"
      title="Edit holdings"
    >
      <Stack>
        {error && (
          <Alert color="red" role="alert" title="Holdings not saved">
            {error}
          </Alert>
        )}
        <ManualBrokeragePositionsEditor
          disabled={isSaving}
          onChange={setPositions}
          positions={positions}
          searchSecurities={searchSecurities}
        />
        <Group grow={isMobile} justify="flex-end" wrap="nowrap">
          <Button
            disabled={isSaving}
            onClick={onClose}
            size={isMobile ? 'md' : 'sm'}
            variant="default"
          >
            Cancel
          </Button>
          <Button
            disabled={!allQuantitiesValid}
            loading={isSaving}
            onClick={() => void handleSave()}
            size={isMobile ? 'md' : 'sm'}
          >
            Save holdings
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
