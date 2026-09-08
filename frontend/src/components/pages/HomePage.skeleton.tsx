import { Box, Grid, Skeleton, Title } from '@mantine/core'
import styles from '../NetWorthCard.module.css'
import { HomeChartSkeleton } from '../Chart.skeleton'
import { NetWorthCardFrame } from '../NetWorthCardFrame'
import { HomePeriodControl } from '../HomePeriodControl'
import { AccountSectionSkeleton } from '../AccountSection.skeleton'
import { TimePeriod } from '../../lib/types'

export function HomeSkeleton({
  period = TimePeriod.month,
}: {
  period?: TimePeriod
}) {
  return (
    <>
      <NetWorthCardFrame
        summary={
          <>
            <Box pos="relative">
              <Title
                data-typography="display"
                order={2}
                className={styles.amount}
              >
                {'\u00A0'}
              </Title>
              <Skeleton h="75%" w={210} pos="absolute" top="12.5%" />
            </Box>
            <Box className={styles.comparison}>
              <Skeleton h={14} w={180} />
            </Box>
          </>
        }
        chart={
          <Box className={styles.chartBleed}>
            <HomeChartSkeleton />
          </Box>
        }
        period={
          <HomePeriodControl period={period} onChange={() => {}} disabled />
        }
      />
      <Grid>
        {['Assets', 'Liabilities'].map((title) => (
          <Grid.Col span={{ base: 12, md: 6 }} key={title}>
            <AccountSectionSkeleton
              title={title}
              groups={title === 'Assets' ? ['Investment', 'Depository'] : []}
            />
          </Grid.Col>
        ))}
      </Grid>
    </>
  )
}
