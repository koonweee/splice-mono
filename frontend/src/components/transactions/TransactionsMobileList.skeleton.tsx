import { Skeleton, Stack } from '@mantine/core'
import styles from './TransactionsMobileList.module.css'

export function TransactionsMobileListSkeleton({
  rows = 6,
  variant = 'page',
}: {
  rows?: number
  variant?: 'page' | 'drilldown' | 'default'
}) {
  return (
    <div
      className={`${styles.list} ${variant === 'page' ? styles.pageList : variant === 'drilldown' ? styles.drilldownList : ''}`}
    >
      <section className={styles.dateGroup}>
        <div className={styles.dateHeader}>
          <Skeleton height={14} width={130} />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <TransactionMobileRowSkeleton key={index} />
        ))}
      </section>
    </div>
  )
}

export function TransactionMobileRowSkeleton() {
  return (
    <div className={styles.row}>
      <div className={styles.rowIdentity}>
        <Skeleton width={28} height={28} radius="sm" />
      </div>
      <div className={styles.merchantLine}>
        <Skeleton height={18} width="75%" />
      </div>
      <div className={styles.rowAside}>
        <Skeleton height={18} width={70} />
      </div>
      <div className={styles.rowDetails}>
        <Stack gap={3}>
          <Skeleton height={14} width="45%" />
          <div className={styles.categoryLine}>
            <Skeleton circle height={9} width={9} />
            <Skeleton height={14} width="55%" />
          </div>
        </Stack>
      </div>
    </div>
  )
}
