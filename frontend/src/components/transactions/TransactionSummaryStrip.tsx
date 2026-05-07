import { Popover, Skeleton, Text } from '@mantine/core'
import { useState } from 'react'
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

function FlowRow({
  label,
  tone,
  value,
}: {
  label: string
  tone?: string
  value: string
}) {
  return (
    <div className={styles.flowRow}>
      <span className={styles.flowLabel}>{label}</span>
      <span className={`${styles.flowValue} ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export function TransactionSummaryStrip({
  isError = false,
  isLoading = false,
  summary,
}: TransactionSummaryStripProps) {
  const [opened, setOpened] = useState(false)

  if (isLoading) {
    return (
      <div
        aria-label="Loading transaction summary"
        className={styles.summaryStrip}
      >
        <div
          className={`${styles.summaryItem} ${styles.primaryMetric} ${styles.netSummaryItem}`}
        >
          <Skeleton height={12} width={44} />
          <Skeleton height={18} width={112} />
        </div>
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
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        shadow="md"
        width={260}
        withArrow
        withinPortal
      >
        <Popover.Target>
          <button
            aria-label="Show inflow and outflow summary"
            className={`${styles.summaryItem} ${styles.primaryMetric} ${styles.netSummaryItem}`}
            type="button"
            onBlur={() => setOpened(false)}
            onClick={() => setOpened(true)}
            onFocus={() => setOpened(true)}
            onMouseEnter={() => setOpened(true)}
            onMouseLeave={() => setOpened(false)}
          >
            <span className={styles.summaryLabel}>Net</span>
            <span
              className={`${styles.summaryValue} ${getMoneyClass(
                summary.net.sign,
              )}`}
            >
              {formatMoneyWithSign({ value: summary.net })}
            </span>
          </button>
        </Popover.Target>
        <Popover.Dropdown
          onMouseEnter={() => setOpened(true)}
          onMouseLeave={() => setOpened(false)}
        >
          <div className={styles.flowBreakdown}>
            <FlowRow
              label="Inflow"
              tone={styles.positive}
              value={formatMoneyWithSign({ value: summary.inflow })}
            />
            <FlowRow
              label="Outflow"
              tone={styles.negative}
              value={formatMoneyWithSign({ value: summary.outflow })}
            />
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  )
}
