import { lazy } from 'react'
import { DeferredFeature } from './DeferredFeature'
import type { ComponentProps } from 'react'
import type { Chart as ChartComponent } from './Chart'

const Chart = lazy(() =>
  import('./Chart').then((module) => ({ default: module.Chart })),
)

export function LazyChart(props: ComponentProps<typeof ChartComponent>) {
  return (
    <DeferredFeature label="Chart" minHeight={props.height ?? 280}>
      <Chart {...props} />
    </DeferredFeature>
  )
}
