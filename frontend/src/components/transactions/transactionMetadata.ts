import dayjs from 'dayjs'
import type { Transaction } from '@/api/models'
import { formatCategoryName, formatPrimaryCategory } from '@/lib/format'

const HIGH_CONFIDENCE = new Set(['VERY_HIGH', 'HIGH'])

export type TransactionCounterpartyView = {
  name: string
  type: string | null
  confidenceLevel: string | null
  website: string | null
  logoUrl: string | null
}

export type MerchantDisplay = {
  primary: string
  secondary: string | null
  marketplaceName: string | null
  paymentTerminalName: string | null
  hasAdditionalInfo: boolean
}

export type TransactionMetadataDetails = {
  merchantDisplay: MerchantDisplay
  counterparties: Array<TransactionCounterpartyView>
  categoryConfidence: string | null
  categoryLabel: string | null
  categoryPrimaryLabel: string | null
  authorizedAt: string | null
  paymentProcessor: string | null
  hasLowCategoryConfidence: boolean
  hasMarketplaceCounterparty: boolean
}

function stringFromRecord(
  record: Record<string, unknown | null>,
  key: string,
): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function canonicalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function differsMeaningfully(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) {
    return Boolean(left || right)
  }
  return canonicalize(left) !== canonicalize(right)
}

function formatCounterpartyType(type: string | null): string {
  return type ? type.replaceAll('_', ' ') : 'counterparty'
}

export function getTransactionCounterparties(
  transaction: Pick<Transaction, 'counterparties'>,
): Array<TransactionCounterpartyView> {
  return (transaction.counterparties ?? [])
    .map((counterparty) => {
      const name = stringFromRecord(counterparty, 'name')
      if (!name) {
        return null
      }

      return {
        name,
        type: stringFromRecord(counterparty, 'type'),
        confidenceLevel: stringFromRecord(counterparty, 'confidence_level'),
        website: stringFromRecord(counterparty, 'website'),
        logoUrl: stringFromRecord(counterparty, 'logo_url'),
      }
    })
    .filter((counterparty): counterparty is TransactionCounterpartyView =>
      Boolean(counterparty),
    )
}

export function getMerchantDisplay(transaction: Transaction): MerchantDisplay {
  const counterparties = getTransactionCounterparties(transaction)
  const marketplace =
    counterparties.find(
      (counterparty) =>
        counterparty.type === 'marketplace' &&
        counterparty.confidenceLevel === 'VERY_HIGH',
    ) ?? null
  const paymentTerminal =
    counterparties.find(
      (counterparty) =>
        counterparty.type === 'payment_terminal' &&
        (!counterparty.confidenceLevel ||
          HIGH_CONFIDENCE.has(counterparty.confidenceLevel)),
    ) ?? null

  const baseMerchant =
    normalizeText(transaction.merchantName) ??
    normalizeText(transaction.providerTransactionName) ??
    normalizeText(transaction.originalDescription) ??
    '--'

  const primary =
    marketplace && differsMeaningfully(marketplace.name, baseMerchant)
      ? `${marketplace.name} · ${baseMerchant}`
      : baseMerchant

  const originalDescription = normalizeText(transaction.originalDescription)
  const providerTransactionName = normalizeText(transaction.providerTransactionName)
  let secondary: string | null = null

  if (
    originalDescription &&
    differsMeaningfully(originalDescription, primary) &&
    differsMeaningfully(originalDescription, baseMerchant)
  ) {
    secondary = originalDescription
  } else if (
    providerTransactionName &&
    differsMeaningfully(providerTransactionName, primary) &&
    differsMeaningfully(providerTransactionName, baseMerchant)
  ) {
    secondary = providerTransactionName
  } else if (
    paymentTerminal &&
    differsMeaningfully(paymentTerminal.name, primary)
  ) {
    secondary = `via ${paymentTerminal.name}`
  }

  const hasAdditionalInfo = Boolean(
    secondary ||
      transaction.website ||
      transaction.logoUrl ||
      transaction.merchantEntityId ||
      transaction.paymentChannel ||
      transaction.personalFinanceCategoryIconUrl ||
      transaction.pendingTransactionId ||
      transaction.accountOwner ||
      transaction.authorizedDate ||
      transaction.authorizedDatetime ||
      counterparties.length > 0 ||
      transaction.paymentMeta ||
      transaction.location,
  )

  return {
    primary,
    secondary,
    marketplaceName: marketplace?.name ?? null,
    paymentTerminalName: paymentTerminal?.name ?? null,
    hasAdditionalInfo,
  }
}

export function getCategoryConfidence(transaction: Transaction): string | null {
  return normalizeText(transaction.personalFinanceCategoryConfidenceLevel)
}

export function getMetadataDetails(
  transaction: Transaction,
): TransactionMetadataDetails {
  const merchantDisplay = getMerchantDisplay(transaction)
  const counterparties = getTransactionCounterparties(transaction)
  const categoryConfidence = getCategoryConfidence(transaction)
  const effectiveCategory = transaction.effectiveCategory ?? null
  const paymentProcessor =
    transaction.paymentMeta && 'payment_processor' in transaction.paymentMeta
      ? normalizeText(String(transaction.paymentMeta.payment_processor ?? ''))
      : null
  const authorizedAt =
    transaction.authorizedDatetime || transaction.authorizedDate
      ? dayjs(transaction.authorizedDatetime ?? transaction.authorizedDate).format(
          transaction.authorizedDatetime ? 'MMM D, YYYY h:mm A' : 'MMM D, YYYY',
        )
      : null

  return {
    merchantDisplay,
    counterparties,
    categoryConfidence,
    categoryLabel: effectiveCategory ? formatCategoryName(effectiveCategory) : null,
    categoryPrimaryLabel: effectiveCategory
      ? effectiveCategory.source === 'user'
        ? effectiveCategory.primary
        : formatPrimaryCategory(effectiveCategory.primary)
      : null,
    authorizedAt,
    paymentProcessor,
    hasLowCategoryConfidence: categoryConfidence === 'LOW',
    hasMarketplaceCounterparty: counterparties.some(
      (counterparty) => counterparty.type === 'marketplace',
    ),
  }
}

export function getCategoryReviewTooltip(
  transaction: Transaction,
  details: TransactionMetadataDetails,
): string {
  if (!transaction.categoryNeedsReview) {
    return 'Category reviewed'
  }
  if (details.hasMarketplaceCounterparty) {
    return 'Category needs review · Marketplace detected'
  }
  if (details.hasLowCategoryConfidence) {
    return 'Category needs review · Plaid confidence low'
  }
  return 'Category needs review'
}

export function formatCounterpartyLabel(
  counterparty: TransactionCounterpartyView,
): string {
  return [
    counterparty.name,
    formatCounterpartyType(counterparty.type),
    counterparty.confidenceLevel?.toLowerCase().replaceAll('_', ' '),
  ]
    .filter(Boolean)
    .join(' · ')
}
