/** Shared desktop action geometry; touch layouts replace multiple actions with a menu. */
export const settingsRowActionLayout = {
  size: 36,
  gap: 4,
  cellPadding: 10,
} as const
export function settingsRowActionColumnWidth(count: number) {
  const { size, gap, cellPadding } = settingsRowActionLayout
  return count * size + Math.max(0, count - 1) * gap + 2 * cellPadding
}
