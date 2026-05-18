import { Alert, Grid, Group, Loader, Stack } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../../components/PageHeader'
import { ProjectionChart } from '../../components/projections/ProjectionChart'
import { ProjectionControlsPanel } from '../../components/projections/ProjectionControlsPanel'
import { ProjectionDisclaimer } from '../../components/projections/ProjectionDisclaimer'
import { ProjectionPromptPanel } from '../../components/projections/ProjectionPromptPanel'
import { ProjectionSummaryMetrics } from '../../components/projections/ProjectionSummaryMetrics'
import { ScenarioComparison } from '../../components/projections/ScenarioComparison'
import { useProjectionScenario } from '../../hooks/useProjectionScenario'

export const Route = createFileRoute('/_authed/projections')({
  component: ProjectionsPage,
})

function ProjectionsPage() {
  const {
    editControl,
    error,
    isComputing,
    isPlanning,
    messages,
    plan,
    result,
    scenario,
    submitPrompt,
  } = useProjectionScenario()
  const busy = isPlanning || isComputing

  return (
    <>
      <PageHeader title="Projections" />
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, lg: 3 }}>
          <ProjectionPromptPanel
            disabled={isPlanning}
            followUpQuestions={plan.followUpQuestions}
            messages={messages}
            onSubmit={submitPrompt}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 9 }}>
          <Stack gap="lg">
            <ProjectionChart result={result} />
            {busy && (
              <Group justify="center">
                <Loader size="sm" />
              </Group>
            )}
            <Grid gutter="lg">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <ProjectionSummaryMetrics
                  assumptions={scenario.assumptions}
                  metrics={result.metrics}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }}>
                <ProjectionControlsPanel
                  controls={scenario.controls}
                  disabled={busy}
                  onChange={editControl}
                  scenario={scenario}
                />
              </Grid.Col>
            </Grid>
            <ScenarioComparison result={result} scenario={scenario} />
            <ProjectionDisclaimer />
          </Stack>
        </Grid.Col>
      </Grid>
    </>
  )
}
