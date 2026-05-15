export function resolveApiBaseUrl(): string | undefined {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  if (typeof window === 'undefined') {
    return undefined
  }

  const currentUrl = new URL(window.location.origin)

  if (currentUrl.hostname === 'localhost') {
    return `${currentUrl.protocol}//localhost:3000`
  }

  const hostParts = currentUrl.hostname.split('.')
  if (hostParts.length >= 2 && !hostParts[0].endsWith('-api')) {
    hostParts[0] = `${hostParts[0]}-api`
    currentUrl.hostname = hostParts.join('.')
    return currentUrl.origin
  }

  return currentUrl.origin
}

export function resolveApiUrl(path: string): URL | string {
  const apiBaseUrl = resolveApiBaseUrl()
  return apiBaseUrl ? new URL(path, apiBaseUrl) : path
}
