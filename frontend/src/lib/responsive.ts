import { useMediaQuery } from '@mantine/hooks'
import { mediaQueries } from './media-queries'

/** Phone-only toolbar wrapping. */
export function usePhoneLayout() {
  return useMediaQuery(mediaQueries['--phone-layout'])
}

/** Page controls, transaction lists, filter sheets, and Settings lists. */
export function useCompactLayout() {
  return useMediaQuery(mediaQueries['--compact-layout'])
}

/** Compact overlays, including short phone landscape viewports. */
export function useSheetLayout() {
  return useMediaQuery(mediaQueries['--sheet-layout'])
}

/** Denser investment data and charts need slightly more horizontal room. */
export function useDataListLayout() {
  return useMediaQuery(mediaQueries['--data-list-layout'])
}

export function useSupportsHover() {
  // SSR and first client render agree; capability updates after hydration.
  return useMediaQuery(mediaQueries['--supports-hover'], false, {
    getInitialValueInEffect: true,
  })
}

export function useCoarsePointer() {
  return useMediaQuery(mediaQueries['--coarse-pointer'])
}
