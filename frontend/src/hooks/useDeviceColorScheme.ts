import { useEffect, useLayoutEffect, useState } from 'react'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Keep SSR/hydration deterministic, then adopt and observe device settings. */
export function useDeviceColorScheme(enabled = true): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>('dark')
  useIsomorphicLayoutEffect(() => {
    if (!enabled || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setScheme(query.matches ? 'dark' : 'light')
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [enabled])
  return scheme
}
