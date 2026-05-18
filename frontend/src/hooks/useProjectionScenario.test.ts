import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProjectionResponse } from '../lib/projections/mock-data'
import { useProjectionScenario } from './useProjectionScenario'
import type * as SpliceApi from '../api/clients/spliceAPI'

const mockFns = vi.hoisted(() => ({
  computeMutateAsync: vi.fn(),
  planMutateAsync: vi.fn(),
}))

vi.mock('../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceApi = await vi.importActual(
    '../api/clients/spliceAPI',
  )
  return {
    ...actual,
    useProjectionControllerCompute: () => ({
      mutateAsync: mockFns.computeMutateAsync,
    }),
    useProjectionControllerPlan: () => ({
      mutateAsync: mockFns.planMutateAsync,
    }),
  }
})

beforeEach(() => {
  mockFns.computeMutateAsync.mockReset()
  mockFns.planMutateAsync.mockReset()
})

describe('useProjectionScenario', () => {
  it('submits prompts through the generated projection plan mutation', async () => {
    const plannedResponse = {
      ...mockProjectionResponse,
      plan: {
        ...mockProjectionResponse.plan,
        assistantMessage: 'Planned from backend.',
        scenario: {
          ...mockProjectionResponse.plan.scenario,
          id: 'planned-scenario',
          title: 'Planned scenario',
        },
      },
    }
    mockFns.planMutateAsync.mockResolvedValue(plannedResponse)
    const { result } = renderHook(() => useProjectionScenario())

    await act(async () => {
      await result.current.submitPrompt('What if I retire at 52?')
    })

    expect(mockFns.planMutateAsync).toHaveBeenCalledWith({
      data: expect.objectContaining({
        prompt: 'What if I retire at 52?',
        currentScenario: expect.objectContaining({ id: 'mock-base' }),
      }),
    })
    expect(result.current.scenario.id).toBe('planned-scenario')
    expect(result.current.messages.at(-1)?.content).toBe(
      'Planned from backend.',
    )
  })

  it('recomputes locally edited controls through the generated compute mutation', async () => {
    const recomputedResult = {
      ...mockProjectionResponse.result,
      scenarioId: 'mock-base',
      metrics: [
        {
          id: 'projected-end-value',
          label: 'Projected value in 15 years',
          value: 3100000,
          formattedValue: '$3.1M',
        },
      ],
    }
    mockFns.computeMutateAsync.mockResolvedValue(recomputedResult)
    const { result } = renderHook(() => useProjectionScenario())

    await act(async () => {
      await result.current.editControl('horizonYears', 15)
    })

    expect(mockFns.computeMutateAsync).toHaveBeenCalledWith({
      data: {
        scenario: expect.objectContaining({ horizonYears: 15 }),
      },
    })
    expect(result.current.scenario.horizonYears).toBe(15)
    expect(result.current.result.metrics[0]?.formattedValue).toBe('$3.1M')
  })

  it('preserves the last result when recompute fails', async () => {
    mockFns.computeMutateAsync.mockRejectedValue(new Error('network failed'))
    const { result } = renderHook(() => useProjectionScenario())
    const initialResult = result.current.result

    await act(async () => {
      await result.current.editControl('horizonYears', 15)
    })

    await waitFor(() => {
      expect(result.current.error).toMatch(/could not recompute/i)
    })
    expect(result.current.result).toBe(initialResult)
    expect(result.current.scenario.horizonYears).toBe(15)
  })
})
