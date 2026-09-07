/** Workbench examples must opt into fixture handlers, never fall through to HTTP. */
export function installNetworkIsolation(target: Window & typeof globalThis) {
  const report = (method: string, url: string): never => {
    const message = `Unmocked workbench request: ${method} ${url}`
    target.dispatchEvent(
      new CustomEvent('workbench:request-blocked', { detail: message }),
    )
    throw new Error(message)
  }
  const originalFetch = target.fetch
  const originalOpen = target.XMLHttpRequest.prototype.open
  target.fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    try {
      return report(init?.method ?? 'GET', url)
    } catch (error) {
      return Promise.reject(error)
    }
  }
  target.XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
  ) {
    report(method, String(url))
  }
  return () => {
    target.fetch = originalFetch
    target.XMLHttpRequest.prototype.open = originalOpen
  }
}
