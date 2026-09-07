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
  const abort = () => controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  if (init.signal?.aborted) abort()
  const timer = setTimeout(abort, milliseconds)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}
