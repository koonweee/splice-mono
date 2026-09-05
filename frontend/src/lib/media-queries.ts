/** Shared by React hooks and Vite's CSS media expansion. Widths are CSS pixels/em. */
export const mediaQueries = {
  '--phone-layout': '(max-width: 36em)',
  '--compact-layout': '(max-width: 48em)',
  '--data-list-layout': '(max-width: 50em)',
  '--supports-hover': '(hover: hover) and (pointer: fine)',
  '--coarse-pointer': '(pointer: coarse)',
} as const

/** Expand our named media conditions to browser-native queries at build time. */
export function expandMediaQuery(params: string): string {
  return params.replace(/\(--[a-z-]+\)/g, (condition) => {
    const name = condition.slice(1, -1)
    if (!Object.prototype.hasOwnProperty.call(mediaQueries, name)) {
      throw new Error(`Unknown responsive condition: ${name}`)
    }
    return mediaQueries[name as keyof typeof mediaQueries]
  })
}
