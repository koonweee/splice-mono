export const cachedHomeEnabled = import.meta.env.VITE_CACHED_HOME !== 'false'

// Captured before React owns the document; never derived from session data.
export const isLocalLaunch =
  typeof document !== 'undefined' &&
  document.documentElement.dataset.spliceLaunch === 'local'

export function isHomeLaunchUrl(url: URL) {
  return (
    (url.pathname === '/' && !url.search) ||
    (url.pathname === '/home' &&
      [...url.searchParams.keys()].every((key) =>
        ['period', 'accountId'].includes(key),
      ))
  )
}
