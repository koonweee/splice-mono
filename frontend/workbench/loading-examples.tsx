import { useState } from 'react'
import { Button, Stack, Text } from '@mantine/core'
import { DeferredFeature } from '../src/components/DeferredFeature'
import { EditorModal } from '../src/components/forms/EditorModal'
import { DeferredOverlay } from '../src/components/DeferredOverlay'
import { HomeSkeleton } from '../src/components/loading/HomeSkeleton'
import { ChartSkeleton as HomeChartSkeleton } from '../src/components/loading/ChartSkeleton'
import {
  AddAccountSkeleton,
  BackfillSkeleton,
} from '../src/components/loading/AccountDialogSkeletons'
import {
  AccessTokensSkeleton,
  AccountDetailsSkeleton,
  AccountsSkeleton,
  AnalysisSkeleton,
  CategoriesTableSkeleton,
  ChartSkeleton,
  FormSkeleton,
  LoadingSkeleton,
  RowSkeleton,
  SettingsSkeleton,
  TableSkeleton,
} from '../src/components/loading/LoadingSkeleton'
import type { ExampleProps } from './examples'

const pending = new Promise<never>(() => {})
function DeferredContent({ state }: ExampleProps) {
  if (state === 'loading') throw pending
  if (state === 'error') throw new Error('Deliberate fixture chunk failure')
  return <Text>Feature loaded successfully.</Text>
}
function Deferred({ state, masked }: ExampleProps) {
  const overlayState = state.startsWith('overlay-')
  const contentState = overlayState ? state.slice('overlay-'.length) : state
  const [opened, setOpened] = useState(overlayState)
  return (
    <Stack>
      <DeferredFeature key={state} label="Sample feature">
        <DeferredContent
          state={overlayState ? 'ready' : state}
          masked={masked}
        />
      </DeferredFeature>
      <Button onClick={() => setOpened(true)}>Open deferred overlay</Button>
      {opened && (
        <DeferredOverlay
          label="Account editor"
          onClose={() => setOpened(false)}
        >
          <LoadedOverlay
            state={contentState}
            onClose={() => setOpened(false)}
          />
        </DeferredOverlay>
      )}
    </Stack>
  )
}

function LoadedOverlay({
  state,
  onClose,
}: {
  state: string
  onClose: () => void
}) {
  if (state === 'loading') throw pending
  if (state === 'error') throw new Error('Deliberate fixture chunk failure')
  return (
    <EditorModal opened onClose={onClose} title="Account editor">
      <Text>Feature loaded successfully.</Text>
    </EditorModal>
  )
}

export const loadingExamples = [
  {
    id: 'loading-home',
    title: 'Loading: Home',
    component: HomeSkeleton,
    states: ['loading'],
    components: ['HomeSkeleton'],
  },
  {
    id: 'loading-chart',
    title: 'Loading: decorative chart',
    component: HomeChartSkeleton,
    states: ['loading'],
    components: ['ChartSkeleton'],
  },
  {
    id: 'loading-account-add',
    title: 'Loading: add account',
    component: AddAccountSkeleton,
    states: ['loading'],
    components: ['AddAccountSkeleton'],
  },
  {
    id: 'loading-backfill',
    title: 'Loading: CSV backfill',
    component: BackfillSkeleton,
    states: ['loading'],
    components: ['BackfillSkeleton', 'BackfillInstructions'],
  },
  ...Object.entries({
    AccessTokensSkeleton,
    AccountDetailsSkeleton,
    AccountsSkeleton,
    AnalysisSkeleton,
    CategoriesTableSkeleton,
    ChartSkeleton,
    FormSkeleton,
    RowSkeleton,
    SettingsSkeleton,
    TableSkeleton,
  }).map(([name, Skeleton]) => ({
    id: `loading-${name.toLowerCase()}`,
    title: `Loading: ${name.replace(/Skeleton$/, '')}`,
    component: () => (
      <LoadingSkeleton>
        <Skeleton />
      </LoadingSkeleton>
    ),
    states: ['loading'],
    components: [name, 'LoadingSkeleton'],
  })),
  {
    id: 'deferred',
    title: 'Deferred feature and overlay',
    component: Deferred,
    states: [
      'ready',
      'loading',
      'error',
      'overlay-ready',
      'overlay-loading',
      'overlay-error',
    ],
    components: ['DeferredFeature', 'DeferredOverlay'],
  },
]
