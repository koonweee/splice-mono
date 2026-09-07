import { useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { PageActionTarget, PageToolbarTarget } from '../lib/page-layout-context'
import { PageActions } from './PageActions'
import { PageHeader } from './PageHeader'
import styles from './PageLayout.module.css'
import type { ReactNode } from 'react'
import type { PageActionSet } from './PageActions'

export function PageLayout({
  title,
  actions,
  navigation,
  toolbar,
  children,
  contentVariant = 'padded',
  scroll = 'page',
  titleAccessory,
}: {
  title: string
  actions?: PageActionSet
  titleAccessory?: ReactNode
  navigation?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  contentVariant?: 'padded' | 'edge-to-edge'
  scroll?: 'page' | 'content'
}) {
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null)
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(
    null,
  )
  return (
    <PageToolbarTarget.Provider value={toolbarTarget}>
      <PageActionTarget.Provider value={actionTarget}>
        <div
          className={`${styles.page} ${scroll === 'content' ? styles.contained : ''}`}
        >
          <div className={styles.header}>
            <PageHeader
              title={title}
              titleAccessory={titleAccessory}
              mb={0}
              align="center"
              wrap="nowrap"
              actions={
                <div className={styles.actions}>
                  {actions && <PageActions {...actions} />}
                  <div ref={setActionTarget} />
                </div>
              }
            />
          </div>
          {navigation && <div className={styles.navigation}>{navigation}</div>}
          {toolbar && <PageToolbar>{toolbar}</PageToolbar>}
          <div ref={setToolbarTarget} className={styles.toolbar} />
          <div
            className={`${styles.content} ${contentVariant === 'edge-to-edge' ? styles.edge : ''}`}
          >
            {children}
          </div>
        </div>
      </PageActionTarget.Provider>
    </PageToolbarTarget.Provider>
  )
}

export function PageToolbar({
  children,
  section = false,
}: {
  children: ReactNode
  section?: boolean
}) {
  const target = useContext(PageToolbarTarget)
  if (section && target) return createPortal(children, target)
  return <div className={styles.toolbar}>{children}</div>
}
