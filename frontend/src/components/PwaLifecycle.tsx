import { Alert, Button, Group, Text } from '@mantine/core'
import { IconCloudOff, IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import {
  getPwaUpdateState,
  registerPwaServiceWorker,
  subscribeToPwaUpdates,
} from '../lib/pwa/service-worker'
import styles from './PwaLifecycle.module.css'
import type { PwaUpdateState } from '../lib/pwa/service-worker'

let activeLifecycleMounted = false

function getInitialOnlineStatus(): boolean {
  if (typeof navigator === 'undefined') {
    return true
  }

  return navigator.onLine
}

export function PwaLifecycle() {
  const [isActiveInstance, setIsActiveInstance] = useState(false)
  const [isOnline, setIsOnline] = useState(getInitialOnlineStatus)
  const [updateState, setUpdateState] =
    useState<PwaUpdateState>(getPwaUpdateState)

  useEffect(() => {
    if (activeLifecycleMounted) {
      return
    }

    activeLifecycleMounted = true
    setIsActiveInstance(true)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const unsubscribe = subscribeToPwaUpdates(setUpdateState)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    void registerPwaServiceWorker().catch(() => undefined)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      unsubscribe()
      activeLifecycleMounted = false
    }
  }, [])

  if (!isActiveInstance) {
    return null
  }

  if (isOnline && !updateState.needRefresh) {
    return null
  }

  return (
    <div className={styles.container}>
      {!isOnline ? (
        <Alert
          className={styles.alert}
          color="yellow"
          icon={<IconCloudOff size={18} />}
          role="alert"
          title="Offline"
          variant="light"
        >
          Live financial data may not load until your connection returns.
        </Alert>
      ) : null}
      {updateState.needRefresh ? (
        <Alert
          className={styles.alert}
          color="blue"
          icon={<IconRefresh size={18} />}
          role="status"
          title="Update available"
          variant="light"
        >
          <Group gap="sm" justify="space-between" wrap="nowrap">
            <Text size="sm">Reload to use the latest version of Splice.</Text>
            <Button
              onClick={() => void updateState.updateServiceWorker?.()}
              size="xs"
              variant="filled"
            >
              Update
            </Button>
          </Group>
        </Alert>
      ) : null}
    </div>
  )
}
