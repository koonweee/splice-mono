import { lazy } from 'react'
import { loadChart } from '../lib/feature-loaders'
import { DeferredFeature } from './DeferredFeature'
import type { ComponentProps } from 'react'
import type { Chart as ChartComponent } from './Chart'

const Chart = lazy(loadChart)

export function LazyChart(props: ComponentProps<typeof ChartComponent>) {
  return (
    <DeferredFeature label="Chart" minHeight={props.height ?? 280}>
      <Chart {...props} />
    </DeferredFeature>
  )
}
