import { OFFLINE_COLORS } from '../design-system/offline'

export const OFFLINE_RECOVERY_SCRIPT = `(() => {
  if (window.__spliceOfflineRecoveryStarted) return;
  window.__spliceOfflineRecoveryStarted = true;
  const button = document.getElementById('splice-retry');
  const status = document.getElementById('splice-recovery-status');
  if (!button || !status) return;
  let pending = false;
  let queued = false;
  let retryTimer;
  let lastProbe = 0;
  let lastReload = 0;
  try { lastReload = Number(sessionStorage.getItem('splice-offline-recovery-at')) || 0; } catch {}
  const deferRetry = () => {
    if (retryTimer !== undefined) return;
    const wait = Math.max(0, 10000 - (Date.now() - lastProbe), 30000 - (Date.now() - lastReload));
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (navigator.onLine && document.visibilityState === 'visible') void retry(false);
    }, wait);
  };
  const retry = async (manual) => {
    const now = Date.now();
    if (pending) { if (!manual) queued = true; return; }
    if (!manual && (now - lastProbe < 10000 || now - lastReload < 30000)) { deferRetry(); return; }
    clearTimeout(retryTimer);
    retryTimer = undefined;
    queued = false;
    pending = true;
    lastProbe = now;
    button.disabled = true;
    status.textContent = 'Checking connection…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/_pwa/recovery', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
      const result = await response.json();
      if (result.app !== 'splice' || !['ready', 'login'].includes(result.status)) throw new Error();
      queued = false;
      lastReload = Date.now();
      try { sessionStorage.setItem('splice-offline-recovery-at', String(lastReload)); } catch {}
      status.textContent = result.status === 'login' ? 'Connection restored. Returning to sign in…' : 'Connection restored. Opening Splice…';
      location.reload();
    } catch {
      status.textContent = navigator.onLine ? 'Splice is still unavailable. Try again shortly.' : 'You’re offline. Reconnect and try again.';
    } finally {
      clearTimeout(timer);
      pending = false;
      button.disabled = false;
      if (queued) {
        queued = false;
        deferRetry();
      }
    }
  };
  button.addEventListener('click', () => void retry(true));
  addEventListener('online', () => void retry(false));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void retry(false); });
  // A reconnect can precede listener installation on a cold fallback document.
  // Reconcile current state once, using the same probe and reload limits.
  if (navigator.onLine && document.visibilityState === 'visible') void retry(false);
})();`

export function offlineAssetPath(buildId: string): string {
  return `/pwa-offline-${buildId}.js`
}

export function offlinePageResponse(
  buildId: string,
  reason: 'network' | 'server' | 'timeout',
): Response {
  const message =
    reason === 'server'
      ? 'Splice is temporarily unavailable. Try again shortly.'
      : 'Reconnect to load your live financial data.'
  return new Response(
    `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Splice · Connection unavailable</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:${OFFLINE_COLORS.canvas};color:${OFFLINE_COLORS.text}}
main{box-sizing:border-box;width:min(28rem,100%);padding:max(2rem,env(safe-area-inset-top)) max(1.25rem,env(safe-area-inset-right)) max(2rem,env(safe-area-inset-bottom)) max(1.25rem,env(safe-area-inset-left));text-align:center}
h1{margin:0 0 1rem;font-size:2rem}p{color:${OFFLINE_COLORS.dimmed};line-height:1.5}button{font:inherit;min-height:44px;padding:.65rem 1.25rem;border:1px solid ${OFFLINE_COLORS.dimmed};border-radius:.5rem;background:${OFFLINE_COLORS.canvas};color:${OFFLINE_COLORS.text};cursor:pointer}button:disabled{opacity:.65;cursor:wait}button:focus-visible{outline:2px solid currentColor;outline-offset:4px}
</style></head><body><main><h1>Splice</h1><p id="splice-recovery-status" role="status" aria-live="polite">${message}</p>
<button id="splice-retry" type="button">Retry</button>
<noscript><p>Reconnect, then reload this page to return to Splice.</p></noscript>
</main><script>${OFFLINE_RECOVERY_SCRIPT}</script><script async src="${offlineAssetPath(buildId)}"></script></body></html>`,
    {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Splice-Offline': reason,
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
      },
    },
  )
}

/** Headers-only deadline: return the original streaming/auth response untouched. */
export async function handlePwaNavigation(
  event: FetchEvent,
): Promise<Response> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('Navigation timed out'))
    }, 8_000)
  })
  try {
    const network = async () => {
      // A rejected preload is a failed navigation, not permission to duplicate it.
      const preload = await event.preloadResponse
      if (controller.signal.aborted) throw new Error('Navigation timed out')
      if (preload) return preload
      return fetch(event.request, { signal: controller.signal })
    }
    const response = await Promise.race([network(), deadline])
    if (response.status >= 500)
      return offlinePageResponse(__SPLICE_BUILD_ID__, 'server')
    return response
  } catch {
    return offlinePageResponse(
      __SPLICE_BUILD_ID__,
      controller.signal.aborted ? 'timeout' : 'network',
    )
  } finally {
    clearTimeout(timer)
  }
}
