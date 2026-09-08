import { Check, X } from 'lucide-react'
import { ActionIcon, Group, Skeleton, Stack } from '@mantine/core'
import styles from './NotificationInbox.module.css'

export function NotificationInboxSkeleton() {
  return (
    <ul className={styles.list}>
      {Array.from({ length: 3 }, (_, index) => (
        <li className={styles.item} key={index}>
          <div className={styles.row}>
            <Skeleton
              width={30}
              height={30}
              radius="md"
              style={{ flexShrink: 0 }}
            />
            <div className={styles.detail}>
              <Skeleton height={18} width="65%" />
              <Stack gap={4} py={3}>
                <Skeleton height={14} />
                <Skeleton height={14} width="80%" />
              </Stack>
              <Skeleton height={14} width={115} />
            </div>
            <Group className={styles.rowActions} gap={2} wrap="nowrap">
              <ActionIcon variant="subtle" color="gray" disabled>
                <Check size={16} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="gray" disabled>
                <X size={16} />
              </ActionIcon>
            </Group>
          </div>
        </li>
      ))}
    </ul>
  )
}
