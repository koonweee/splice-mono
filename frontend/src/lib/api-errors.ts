function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isRecord(error) || !isRecord(error.response)) return fallback
  const data = error.response.data
  if (!isRecord(data)) return fallback
  const message = data.message
  if (typeof message === 'string') return message
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === 'string')
  ) {
    return message.join(' ')
  }
  return fallback
}
