import type { HomeView } from './home-continuity'

/** Retain presentation only, never session authority or query cache entries. */
export function retainLiveHomeContent(
  home: HomeView,
  previous: HomeView['content'],
): HomeView['content'] {
  const incoming = home.content
  if (!incoming)
    return previous
      ? {
          ...previous,
          ...home.controls,
          isChangingPeriod: true,
          seriesLoading: true,
        }
      : null
  const points = incoming.chartDisplayData ?? incoming.dashboard.chartData
  const previousPoints =
    previous?.chartDisplayData ?? previous?.dashboard.chartData
  if (
    (incoming.seriesLoading || incoming.seriesError) &&
    !points.length &&
    previousPoints?.length
  ) {
    return {
      ...incoming,
      chartDisplayData: previousPoints,
      seriesLoading: true,
    }
  }
  return incoming
}
