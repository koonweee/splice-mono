import { Alert, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAccountMetadataMutation } from '../../hooks/useAccountMetadataMutation'
import {
  adjustedAccountBalance,
  hasAccountValueAdjustments,
  parseAccountPercentage,
} from '../../lib/account-value-adjustments'
import { getApiErrorMessage } from '../../lib/api-errors'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyWithSign,
} from '../../lib/format'
import { useAppTransitionGuard } from '../../lib/pwa/app-transition'
import {
  invalidateMutationFamilies,
  reconcileAccount,
} from '../../lib/query-invalidation'
import { DecimalInput } from '../forms/DecimalInput'
import { ValueAdjustmentsFrame } from './ValueAdjustmentsFrame'
import styles from './ValueAdjustmentsSection.module.css'
import type { Account, MoneyWithSign } from '../../api/models'

export function ValueAdjustmentsSection({
  account,
  balance = account.currentBalance,
  balancesHidden = false,
  initiallyEditing = false,
}: {
  account: Account
  balance?: MoneyWithSign
  balancesHidden?: boolean
  initiallyEditing?: boolean
}) {
  const queryClient = useQueryClient()
  const mutation = useAccountMetadataMutation(account.id)
  const pending = useRef(false)
  const [draft, setDraft] = useState<{ value: string; tax: string } | null>(
    () =>
      initiallyEditing
        ? {
            value: account.expectedValuePercent ?? '100',
            tax: account.expectedTaxPercent ?? '0',
          }
        : null,
  )
  const [error, setError] = useState<string>()
  useAppTransitionGuard(draft !== null)
  const configured = hasAccountValueAdjustments(account)
  const value = draft ? parseAccountPercentage(draft.value) : undefined
  const tax = draft ? parseAccountPercentage(draft.tax, true) : undefined
  let preview: MoneyWithSign | undefined
  if (value !== undefined && tax !== undefined) {
    try {
      preview = adjustedAccountBalance(balance, {
        expectedValuePercent: value,
        expectedTaxPercent: tax,
      })
    } catch {
      /* Show the bounded-money error beside the draft. */
    }
  }
  const format = (money: MoneyWithSign) =>
    balancesHidden
      ? HIDDEN_BALANCE_PLACEHOLDER
      : formatMoneyWithSign({ value: money, appendCurrency: true })
  const save = (expectedValuePercent: string, expectedTaxPercent: string) => {
    if (pending.current || mutation.isPending) return
    pending.current = true
    setError(undefined)
    mutation.mutate(
      {
        id: account.id,
        data: { expectedValuePercent, expectedTaxPercent },
      },
      {
        onSuccess: async (updated) => {
          reconcileAccount(queryClient, updated)
          await invalidateMutationFamilies(queryClient, [
            'accounts',
            'balances',
            'investments',
          ])
          setDraft(null)
        },
        onError: (cause) =>
          setError(
            getApiErrorMessage(
              cause,
              'Unable to save value adjustments. Please try again.',
            ),
          ),
        onSettled: () => {
          pending.current = false
        },
      },
    )
  }
  return (
    <ValueAdjustmentsFrame
      action={
        !draft && (
          <Button
            variant="subtle"
            size="compact-md"
            leftSection={configured ? <Pencil size={14} /> : <Plus size={14} />}
            onClick={() => {
              setError(undefined)
              setDraft({
                value: account.expectedValuePercent ?? '100',
                tax: account.expectedTaxPercent ?? '0',
              })
            }}
          >
            {configured ? 'Edit' : 'Add'}
          </Button>
        )
      }
    >
      {draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (value !== undefined && tax !== undefined && preview)
              save(value, tax)
          }}
        >
          <Stack gap="sm" mt="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <DecimalInput
                label="Expected value"
                value={draft.value}
                onChange={(next) => setDraft({ ...draft, value: next })}
                rightSection={
                  <Text data-typography="metadata" c="dimmed">
                    %
                  </Text>
                }
                maxLength={100}
                disabled={mutation.isPending}
                error={
                  value === undefined
                    ? 'Enter a percentage greater than 0'
                    : undefined
                }
                data-autofocus
              />
              <DecimalInput
                label="Expected tax"
                value={draft.tax}
                onChange={(next) => setDraft({ ...draft, tax: next })}
                rightSection={
                  <Text data-typography="metadata" c="dimmed">
                    %
                  </Text>
                }
                maxLength={100}
                disabled={mutation.isPending}
                error={
                  tax === undefined
                    ? 'Enter a percentage from 0 to 100'
                    : undefined
                }
              />
            </SimpleGrid>
            <Stack className={styles.preview} gap="xs">
              <Group justify="space-between">
                <Text data-typography="metadata" c="dimmed">
                  Account balance
                </Text>
                <Text data-typography="numericMetadata">{format(balance)}</Text>
              </Group>
              <Group justify="space-between">
                <Text data-typography="label">Adjusted value</Text>
                <Text
                  component="output"
                  aria-live="polite"
                  data-typography="amount"
                >
                  {preview ? format(preview) : '—'}
                </Text>
              </Group>
            </Stack>
            {value !== undefined && tax !== undefined && !preview && (
              <Text data-typography="caption" c="red">
                Adjusted value exceeds the supported amount
              </Text>
            )}
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <Group justify="space-between" className={styles.actions}>
              {configured && (
                <Button
                  type="button"
                  variant="subtle"
                  color="gray"
                  size="compact-md"
                  disabled={mutation.isPending}
                  onClick={() => save('100', '0')}
                >
                  Remove adjustments
                </Button>
              )}
              <Group className={styles.saveActions}>
                <Button
                  type="button"
                  variant="default"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setDraft(null)
                    setError(undefined)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={mutation.isPending}
                  disabled={!preview}
                >
                  Save
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      ) : configured ? (
        <Stack gap="xs" mt="xs">
          <Group justify="space-between">
            <Text data-typography="metadata" c="dimmed">
              Expected value
            </Text>
            <Text data-typography="numericMetadata">
              {account.expectedValuePercent ?? '100'}%
            </Text>
          </Group>
          <Group justify="space-between">
            <Text data-typography="metadata" c="dimmed">
              Expected tax
            </Text>
            <Text data-typography="numericMetadata">
              {account.expectedTaxPercent ?? '0'}%
            </Text>
          </Group>
        </Stack>
      ) : null}
    </ValueAdjustmentsFrame>
  )
}
