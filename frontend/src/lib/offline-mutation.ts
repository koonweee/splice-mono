export class OfflineMutationError extends Error {
  constructor() {
    super(
      'You are offline. Your changes have not been sent. Reconnect and try again.',
    )
    this.name = 'OfflineMutationError'
  }
}

/** A missing response or server timeout cannot establish whether a write committed. */
export function isUncertainMutationError(error: unknown): boolean {
  if (error instanceof OfflineMutationError) return false
  if (typeof error !== 'object' || error === null || !('response' in error))
    return true
  const response = error.response
  if (
    typeof response !== 'object' ||
    response === null ||
    !('status' in response)
  )
    return true
  return (
    typeof response.status !== 'number' ||
    response.status >= 500 ||
    response.status === 408
  )
}
