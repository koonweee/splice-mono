import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProjectionScenario } from '../../lib/projections/mock-data'
import { ProjectionControlsPanel } from './ProjectionControlsPanel'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })
  Object.defineProperty(window, 'ResizeObserver', {
    value: vi.fn().mockImplementation(() => ({
      disconnect: vi.fn(),
      observe: vi.fn(),
      unobserve: vi.fn(),
    })),
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
})

function renderPanel(onChange = vi.fn()) {
  render(
    <MantineProvider>
      <ProjectionControlsPanel
        controls={mockProjectionScenario.controls}
        disabled={false}
        onChange={onChange}
        scenario={mockProjectionScenario}
      />
    </MantineProvider>,
  )
  return onChange
}

describe('ProjectionControlsPanel', () => {
  it('renders generated controls from the typed spec', () => {
    renderPanel()

    expect(screen.getByLabelText(/401k contribution/i)).toBeTruthy()
    expect(screen.getByLabelText(/brokerage contribution/i)).toBeTruthy()
    expect(screen.getByText(/expected return/i)).toBeTruthy()
    expect(screen.getByText(/time horizon/i)).toBeTruthy()
  })

  it('emits typed parameter changes for currency controls', () => {
    const onChange = renderPanel()

    fireEvent.change(screen.getByLabelText(/401k contribution/i), {
      target: { value: '32000' },
    })

    expect(onChange).toHaveBeenCalledWith(
      'parameters.annualContributions.401k.amount',
      32000,
    )
  })
})
