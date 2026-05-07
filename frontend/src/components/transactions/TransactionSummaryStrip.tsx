import { Skeleton, Text } from '@mantine/core'
import { MoneyWithSignSign } from '../../api/models'
import { formatMoneyWithSign } from '../../lib/format'
import styles from './TransactionSummaryStrip.module.css'
import type { TransactionSummary } from '../../api/models'

type TransactionSummaryStripProps = {
  isError?: boolean
  isLoading?: boolean
  summary?: TransactionSummary
}

function getMoneyClass(sign: MoneyWithSignSign) {
  return sign === MoneyWithSignSign.positive ? styles.positive : styles.negative
}

function SummaryItem({
  itemTone,
  label,
  tone,
  value,
}: {
  itemTone?: string
  label: string
  tone?: string
  value: string
}) {
  return (
    <div className={`${styles.summaryItem} ${itemTone ?? ''}`}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={`${styles.summaryValue} ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export function TransactionSummaryStrip({
  isError = false,
  isLoading = false,
  summary,
}: TransactionSummaryStripProps) {
  if (isLoading) {
    return (
      <div
        aria-label="Loading transaction summary"
        className={styles.summaryStrip}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div className={styles.summaryItem} key={index}>
            <Skeleton height={12} mb={6} width="50%" />
            <Skeleton height={20} width="80%" />
          </div>
        ))}
      </div>
    )
  }

  if (isError || !summary) {
    return (
      <Text c="dimmed" mb="sm" size="sm">
        Summary unavailable.
      </Text>
    )
  }

  return (
    <div aria-label="Transaction summary" className={styles.summaryStrip}>
      <SummaryItem
        label="Net"
        itemTone={styles.primaryMetric}
        tone={getMoneyClass(summary.net.sign)}
        value={formatMoneyWithSign({ value: summary.net })}
      />
      <SummaryItem
        label="Inflow"
        tone={styles.positive}
        value={formatMoneyWithSign({ value: summary.inflow })}
      />
      <SummaryItem
        label="Outflow"
        tone={styles.negative}
        value={formatMoneyWithSign({ value: summary.outflow })}
      />
      <SummaryItem
        label="Transactions"
        itemTone={styles.countMetric}
        value={summary.transactionCount.toLocaleString()}
      />
      <SummaryItem
        label="Pending"
        itemTone={styles.countMetric}
        value={summary.pendingCount.toLocaleString()}
      />
      <SummaryItem
        label="Needs review"
        itemTone={styles.countMetric}
        value={summary.needsReviewCount.toLocaleString()}
      />
    </div>
  )
}
