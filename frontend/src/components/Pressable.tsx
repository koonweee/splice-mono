import { forwardRef, useRef, useState } from 'react'
import styles from './Pressable.module.css'
import type {
  ButtonHTMLAttributes,
  FocusEventHandler,
  KeyboardEventHandler,
  PointerEventHandler,
} from 'react'

const SCROLL_CANCEL_DISTANCE_PX = 8

type PointerStart = {
  id: number
  x: number
  y: number
}

export function usePressFeedback<T extends Element>(enabled = true) {
  const [pressed, setPressed] = useState(false)
  const pointerStartRef = useRef<PointerStart | null>(null)

  const clearPress = () => {
    pointerStartRef.current = null
    setPressed(false)
  }

  const onPointerDown: PointerEventHandler<T> = (event) => {
    if (!enabled || event.isPrimary === false || event.button !== 0) return

    pointerStartRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
    setPressed(true)
  }

  const onPointerMove: PointerEventHandler<T> = (event) => {
    const start = pointerStartRef.current
    if (!start || start.id !== event.pointerId) return

    if (
      Math.abs(event.clientX - start.x) > SCROLL_CANCEL_DISTANCE_PX ||
      Math.abs(event.clientY - start.y) > SCROLL_CANCEL_DISTANCE_PX
    ) {
      clearPress()
    }
  }

  const onKeyDown: KeyboardEventHandler<T> = (event) => {
    if (
      enabled &&
      !event.repeat &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      setPressed(true)
    }
  }

  const onKeyUp: KeyboardEventHandler<T> = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      setPressed(false)
    }
  }

  const onBlur: FocusEventHandler<T> = () => clearPress()

  return {
    pressed,
    pressProps: {
      'data-pressed': pressed ? 'true' : undefined,
      onBlur,
      onKeyDown,
      onKeyUp,
      onPointerCancel: clearPress as PointerEventHandler<T>,
      onPointerDown,
      onPointerLeave: clearPress as PointerEventHandler<T>,
      onPointerMove,
      onPointerUp: clearPress as PointerEventHandler<T>,
    },
  }
}

export interface PressableProps extends ButtonHTMLAttributes<HTMLButtonElement> {}

export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  function Pressable(
    {
      className,
      onBlur,
      onKeyDown,
      onKeyUp,
      onPointerCancel,
      onPointerDown,
      onPointerLeave,
      onPointerMove,
      onPointerUp,
      type = 'button',
      ...props
    },
    ref,
  ) {
    const { pressProps } = usePressFeedback<HTMLButtonElement>()

    return (
      <button
        {...props}
        {...pressProps}
        className={`${styles.root} ${className ?? ''}`}
        onBlur={(event) => {
          onBlur?.(event)
          pressProps.onBlur(event)
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (!event.defaultPrevented) pressProps.onKeyDown(event)
        }}
        onKeyUp={(event) => {
          onKeyUp?.(event)
          pressProps.onKeyUp(event)
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event)
          pressProps.onPointerCancel(event)
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event)
          if (!event.defaultPrevented) pressProps.onPointerDown(event)
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event)
          pressProps.onPointerLeave(event)
        }}
        onPointerMove={(event) => {
          onPointerMove?.(event)
          pressProps.onPointerMove(event)
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event)
          pressProps.onPointerUp(event)
        }}
        ref={ref}
        type={type}
      />
    )
  },
)
