import { IconPlus, IconRefresh, IconUpload } from '@tabler/icons-react'
import { PageLayout } from '../PageLayout'
import {
  loadAddAccountModal,
  loadBackfillModal,
} from '../../lib/feature-loaders'
import type { ReactNode } from 'react'

export function AccountsPageFrame({
  children,
  onAdd,
  onSync,
  onBackfill,
  syncing = false,
}: {
  children: ReactNode
  onAdd?: () => void
  onSync?: () => void
  onBackfill?: () => void
  syncing?: boolean
}) {
  return (
    <PageLayout
      title="Accounts"
      actions={{
        primary: {
          id: 'add',
          label: 'Add account',
          icon: IconPlus,
          onClick: onAdd ?? (() => {}),
          disabled: !onAdd,
          onPrepare: () => {
            void loadAddAccountModal().catch(() => undefined)
          },
        },
        secondary: [
          {
            id: 'sync',
            label: syncing ? 'Syncing' : 'Sync all',
            icon: IconRefresh,
            onClick: onSync ?? (() => {}),
            disabled: !onSync,
            loading: syncing,
          },
          {
            id: 'backfill',
            label: 'Backfill',
            icon: IconUpload,
            onClick: onBackfill ?? (() => {}),
            disabled: !onBackfill,
            onPrepare: () => {
              void loadBackfillModal().catch(() => undefined)
            },
          },
        ],
      }}
    >
      {children}
    </PageLayout>
  )
}
