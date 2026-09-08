/** Deterministic holds live only in the workbench bundle, never the app. */
export function createLoadingGate(held: boolean) {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    wait: () => (held ? pending : Promise.resolve()),
    release: () => {
      held = false
      release()
    },
  }
}

const params = new URLSearchParams(
  typeof location === 'undefined' ? '' : location.search,
)
const readHold = params.get('hold')
const reads = createLoadingGate(Boolean(readHold))
const routes = createLoadingGate(params.get('holdRoute') === 'true')
const moduleTarget = params.get('holdModule')
const modules = createLoadingGate(
  params.get('holdModules') === 'true' || Boolean(moduleTarget),
)
if (typeof window !== 'undefined') {
  window.addEventListener('workbench:release-route', routes.release)
  window.addEventListener('workbench:release-reads', reads.release)
  window.addEventListener('workbench:release-modules', modules.release)
}

export function waitForRead(path: string) {
  const matches =
    (readHold === 'reads' && path !== '/user/me') ||
    (readHold === 'user' && path === '/user/me') ||
    (readHold === 'series' && path.endsWith('-series')) ||
    readHold === path
  return matches ? reads.wait() : Promise.resolve()
}
export const waitForModule = (name?: string) =>
  !moduleTarget || name === moduleTarget ? modules.wait() : Promise.resolve()

export const waitForRoute = routes.wait
