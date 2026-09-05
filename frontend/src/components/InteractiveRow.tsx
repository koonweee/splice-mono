import { useRef } from 'react'
import { usePressFeedback } from './Pressable'
import styles from './InteractiveRow.module.css'
import type { ReactNode } from 'react'

interface InteractiveRowProps {
  actionLabel: string
  children: ReactNode
  className?: string
  onActivate?: () => void
}

const secondaryControlSelector =
  'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [role="switch"], [role="link"], [contenteditable="true"]'

/** A primary row action with independent sibling controls, never nested buttons. */
export function InteractiveRow({
  actionLabel,
  children,
  className,
  onActivate,
}: InteractiveRowProps) {
  const primaryActionRef = useRef<HTMLButtonElement>(null)
  const { pressProps } = usePressFeedback<HTMLDivElement>(Boolean(onActivate))

  function isSecondaryControl(target: EventTarget | null) {
    if (!(target instanceof Element)) return false
    const control = target.closest(secondaryControlSelector)
    return control !== null && control !== primaryActionRef.current
  }

  return (
    <div
      {...pressProps}
      className={`${styles.root} ${className ?? ''}`}
      data-interactive={onActivate ? 'true' : undefined}
      onClick={(event) => {
        if (!event.defaultPrevented && !isSecondaryControl(event.target)) {
          onActivate?.()
        }
      }}
      onKeyDown={(event) => {
        if (!event.defaultPrevented && !isSecondaryControl(event.target)) {
          pressProps.onKeyDown(event)
        }
      }}
      onKeyUp={(event) => {
        if (!event.defaultPrevented && !isSecondaryControl(event.target)) {
          pressProps.onKeyUp(event)
        }
      }}
      onPointerDown={(event) => {
        if (!event.defaultPrevented && !isSecondaryControl(event.target)) {
          pressProps.onPointerDown(event)
        }
      }}
    >
      {onActivate && (
        <button
          aria-label={actionLabel}
          className={styles.action}
          onClick={(event) => {
            event.stopPropagation()
            onActivate()
          }}
          ref={primaryActionRef}
          type="button"
        />
      )}
      {children}
    </div>
  )
}
