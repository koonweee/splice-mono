import { PageHeader } from '../PageHeader'
import styles from './HomePage.module.css'
import type { ReactNode } from 'react'

export function HomePageFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.heading}>
        <PageHeader title="Home" mb="md" />
      </div>
      {children}
    </>
  )
}
