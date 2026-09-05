import { notifications } from '@mantine/notifications'
import { getApiErrorMessage } from './api-errors'

export function notifyMutationError({
  title,
  error,
  fallback,
}: {
  title: string
  error: unknown
  fallback: string
}) {
  return notifications.show({
    title,
    message: getApiErrorMessage(error, fallback),
    color: 'red',
  })
}

export function notifyMutationSuccess({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return notifications.show({ title, message, color: 'green' })
}
