import { createContext } from 'react'

/** Nested Settings panels can place their structured actions in the page header. */
export const PageActionTarget = createContext<HTMLDivElement | null>(null)

export const PageToolbarTarget = createContext<HTMLDivElement | null>(null)
