import { useState } from 'react'
import { Button, Stack, Text } from '@mantine/core'
import { DeferredFeature } from '../src/components/DeferredFeature'
import { EditorModal } from '../src/components/forms/EditorModal'
import { DeferredOverlay } from '../src/components/DeferredOverlay'
import { LoadingSkeleton } from '../src/components/loading/LoadingSkeleton'
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
      <DeferredFeature
        key={state}
        label="Sample feature"
        fallback={
          <LoadingSkeleton>
            <Text>Feature content is loading.</Text>
          </LoadingSkeleton>
        }
      >
        <DeferredContent
          state={overlayState ? 'ready' : state}
          masked={masked}
        />
      </DeferredFeature>
      <Button onClick={() => setOpened(true)}>Open deferred overlay</Button>
      {opened && (
        <DeferredOverlay
          label="Account editor"
          skeleton={<Text>Feature content is loading.</Text>}
          minHeight={0}
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
    components: ['DeferredFeature', 'DeferredOverlay', 'LoadingSkeleton'],
  },
]
