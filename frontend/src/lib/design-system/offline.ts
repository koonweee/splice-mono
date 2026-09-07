import { BASES } from './bases'

/** Privacy-safe static colors when user appearance is unavailable (PWA/offline). */
export const OFFLINE_COLORS = {
  canvas: BASES.dark.canvas,
  text: BASES.dark.text,
  dimmed: BASES.dark.dimmed,
} as const
