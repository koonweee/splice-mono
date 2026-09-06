import { Group, Title } from '@mantine/core'
import styles from './PageHeader.module.css'
import type { GroupProps } from '@mantine/core'
import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  actions?: ReactNode
  titleAccessory?: ReactNode
  align?: GroupProps['align']
  mb?: GroupProps['mb']
  wrap?: GroupProps['wrap']
}

export function PageHeader({
  title,
  actions,
  titleAccessory,
  align = 'baseline',
  mb = 'xl',
  wrap = 'wrap',
}: PageHeaderProps) {
  return (
    <Group align={align} justify="space-between" mb={mb} wrap={wrap}>
      <Group gap={6} wrap="nowrap">
        <Title order={1} className={styles.title}>
          {title}
        </Title>
        {titleAccessory}
      </Group>
      {actions}
    </Group>
  )
}
