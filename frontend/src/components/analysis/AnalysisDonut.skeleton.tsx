export const analysisDonutGeometry = { size: 160, thickness: 24 } as const

/** Transparent center matches the actual donut while values are unavailable. */
export function AnalysisDonutSkeleton() {
  const { size, thickness } = analysisDonutGeometry
  return (
    <svg
      style={{ display: 'block', marginInline: 'auto' }}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={(size - thickness) / 2}
        fill="none"
        stroke="var(--mantine-color-dimmed)"
        strokeWidth={thickness}
        opacity={0.18}
      />
    </svg>
  )
}
