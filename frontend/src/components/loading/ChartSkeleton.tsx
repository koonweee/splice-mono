import { useId } from 'react'
import styles from './ChartSkeleton.module.css'

/** Decorative chart silhouette; never represents account history. */
export function ChartSkeleton() {
  const gradientId = useId()

  return (
    <div className={styles.root} role="status" aria-label="Loading chart">
      <svg
        viewBox="0 0 600 180"
        preserveAspectRatio="none"
        aria-hidden="true"
        className={styles.graph}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 165 C18 165 36 144 55 144 S90 150 109 150 S145 113 164 113 S200 129 218 129 S254 93 273 93 S309 98 327 98 S363 62 382 62 S418 72 436 72 S472 36 491 36 S527 41 545 41 S582 15 600 15 L600 180 L0 180 Z"
          fill={`url(#${gradientId})`}
        />
        <path
          d="M0 165 C18 165 36 144 55 144 S90 150 109 150 S145 113 164 113 S200 129 218 129 S254 93 273 93 S309 98 327 98 S363 62 382 62 S418 72 436 72 S472 36 491 36 S527 41 545 41 S582 15 600 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
