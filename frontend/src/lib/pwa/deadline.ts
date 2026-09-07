/** Bounds optional browser APIs which do not expose cancellation. */
export function withDeadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Aborts stalled response-header requests without buffering streamed bodies. */
export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit = {},
  milliseconds = 10_000,
): Promise<Response> {
  const controller = new AbortController()
  const caller = init.signal
  let signal = controller.signal
  if (caller) {
    if (typeof AbortSignal.any === 'function') {
      signal = AbortSignal.any([caller, controller.signal])
    } else {
      // Older browsers still need caller cancellation after headers arrive.
      const forwardAbort = () => controller.abort(caller.reason)
      if (caller.aborted) forwardAbort()
      else {
        caller.addEventListener('abort', forwardAbort, { once: true })
        controller.signal.addEventListener(
          'abort',
          () => caller.removeEventListener('abort', forwardAbort),
          { once: true },
        )
      }
    }
  }
  const timer = setTimeout(() => controller.abort(), milliseconds)
  try {
    return await fetch(input, { ...init, signal })
  } finally {
    // Only the header deadline ends here. The caller still owns body cancellation.
    clearTimeout(timer)
  }
}
