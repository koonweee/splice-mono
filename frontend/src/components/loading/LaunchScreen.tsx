import { BASES } from '../../lib/design-system/bases'
import styles from './LaunchScreen.module.css'

/** Public launch placeholder: never reads a session or renders account data. */
export function LaunchScreen({ native = false }: { native?: boolean }) {
  return (
    <main
      className={styles.screen}
      style={{
        background: BASES.oled.canvas,
        color: BASES.oled.text,
      }}
      aria-busy={native ? undefined : true}
    >
      <div className={styles.brand}>
        <h1 className={styles.title}>Splice</h1>
        <p className={styles.subtitle} style={{ color: BASES.oled.dimmed }}>
          Your personal finance dashboard
        </p>
        <div className={styles.status} role={native ? undefined : 'status'}>
          {!native && (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Checking session…</span>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
