import { useCallback, useMemo, useState } from 'react'
import {
  useProjectionControllerCompute,
  useProjectionControllerPlan,
} from '../api/clients/spliceAPI'
import { updateProjectionParameter } from '../lib/projections/control-bindings'
import { mockProjectionResponse } from '../lib/projections/mock-data'
import type {
  ProjectionPlanResponse,
  ProjectionResult,
  ProjectionScenario,
  ProjectionTranscriptMessage,
} from '../lib/projections/types'

type ProjectionHookState = {
  error?: string
  isComputing: boolean
  isPlanning: boolean
  messages: Array<ProjectionTranscriptMessage>
  plan: ProjectionPlanResponse['plan']
  result: ProjectionResult
  scenario: ProjectionScenario
}

function messageId(role: ProjectionTranscriptMessage['role']) {
  return `${role}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

export function useProjectionScenario() {
  const planMutation = useProjectionControllerPlan()
  const computeMutation = useProjectionControllerCompute()
  const [scenario, setScenario] = useState(mockProjectionResponse.plan.scenario)
  const [result, setResult] = useState(mockProjectionResponse.result)
  const [plan, setPlan] = useState(mockProjectionResponse.plan)
  const [messages, setMessages] = useState<Array<ProjectionTranscriptMessage>>([
    {
      id: 'mock:user',
      role: 'user',
      content: mockProjectionResponse.plan.scenario.prompt ?? '',
    },
    {
      id: 'mock:assistant',
      role: 'assistant',
      content: mockProjectionResponse.plan.assistantMessage,
    },
  ])
  const [isPlanning, setIsPlanning] = useState(false)
  const [isComputing, setIsComputing] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const submitPrompt = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim()
      if (!trimmedPrompt) return

      setError(undefined)
      setIsPlanning(true)
      setMessages((current) => [
        ...current,
        { id: messageId('user'), role: 'user', content: trimmedPrompt },
      ])

      try {
        const response: ProjectionPlanResponse = await planMutation.mutateAsync({
          data: {
            prompt: trimmedPrompt,
            currentScenario: scenario,
          },
        })
        setScenario(response.plan.scenario)
        setResult(response.result)
        setPlan(response.plan)
        setMessages((current) => [
          ...current,
          {
            id: messageId('assistant'),
            role: 'assistant',
            content: response.plan.assistantMessage,
          },
        ])
      } catch {
        setError('Could not generate that projection. The last result is still shown.')
      } finally {
        setIsPlanning(false)
      }
    },
    [planMutation, scenario],
  )

  const editControl = useCallback(
    async (parameterPath: string, value: string | number | boolean) => {
      const nextScenario = updateProjectionParameter(
        scenario,
        parameterPath,
        value,
      )
      if (nextScenario === scenario) return

      setScenario(nextScenario)
      setPlan((current) => ({ ...current, scenario: nextScenario }))
      setError(undefined)
      setIsComputing(true)

      try {
        const nextResult: ProjectionResult = await computeMutation.mutateAsync({
          data: { scenario: nextScenario },
        })
        setResult(nextResult)
      } catch {
        setError('Could not recompute this projection. The last result is still shown.')
      } finally {
        setIsComputing(false)
      }
    },
    [computeMutation, scenario],
  )

  const state = useMemo<ProjectionHookState>(
    () => ({
      error,
      isComputing,
      isPlanning,
      messages,
      plan,
      result,
      scenario,
    }),
    [error, isComputing, isPlanning, messages, plan, result, scenario],
  )

  return {
    ...state,
    editControl,
    submitPrompt,
  }
}
