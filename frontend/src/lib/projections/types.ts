export type { LLMProjectionPlanResponse } from '../../api/models/lLMProjectionPlanResponse'
export type { ProjectionAnnualContribution } from '../../api/models/projectionAnnualContribution'
export type { ProjectionAssumption } from '../../api/models/projectionAssumption'
export type { ProjectionChartAnnotation } from '../../api/models/projectionChartAnnotation'
export type { ProjectionControlSpec } from '../../api/models/projectionControlSpec'
export type { ProjectionMetric } from '../../api/models/projectionMetric'
export type { ProjectionMilestone } from '../../api/models/projectionMilestone'
export type { ProjectionPlanResponse } from '../../api/models/projectionPlanResponse'
export type { ProjectionPoint } from '../../api/models/projectionPoint'
export type { ProjectionResult } from '../../api/models/projectionResult'
export type { ProjectionScenario } from '../../api/models/projectionScenario'
export type { ProjectionScope } from '../../api/models/projectionScope'

export type ProjectionTranscriptMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}
