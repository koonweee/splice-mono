import { BASES } from '../design-system/bases'
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
} from '../design-system/appearance-preference'
import type { AppearancePreference } from '../design-system/appearance-preference'

/** Read only non-private appearance, without pulling the UI runtime into bootstrap. */
export function readLaunchAppearance(): AppearancePreference | null {
  if (typeof document === 'undefined') return null
  try {
    const cookie = document.cookie
      .split(';')
      .find((part) => part.trim().startsWith('splice_appearance='))
      ?.trim()
      .slice('splice_appearance='.length)
    if (cookie) return parseAppearance(JSON.parse(decodeURIComponent(cookie)))
    const stored = window.localStorage.getItem('splice:appearance')
    return stored
      ? parseAppearance(JSON.parse(decodeURIComponent(stored)))
      : null
  } catch {
    return null
  }
}

// A real fixed box lets WebKit sample an opaque top edge even before React.
// Keep the coarse-pointer minimum independent of viewport width for tablets.
// The later AppShell header uses the same app layer and paints above this box,
// preserving its existing safe-area spacing and unobscured focus outlines.
export const standaloneSafeAreaCss = `
.splice-pwa-safe-area { display: none; }
@media (display-mode: standalone) {
  .splice-pwa-safe-area {
    display: block;
    position: fixed;
    inset: 0 0 auto;
    height: env(safe-area-inset-top, 0px);
    background: var(--splice-header, var(--splice-launch-canvas, ${BASES.dark.canvas}));
    pointer-events: none;
    z-index: var(--mantine-z-index-app, 100);
  }
}
@media (display-mode: standalone) and (any-pointer: coarse) {
  .splice-pwa-safe-area { height: max(12px, env(safe-area-inset-top, 0px)); }
}
`

export const standaloneSafeAreaHtml =
  '<div class="splice-pwa-safe-area" aria-hidden="true"></div>'

// Runs before stylesheet/module loading. Only fixed design-system colors reach CSS.
export const launchCanvasBootstrap = `<style>html,body{margin:0;min-height:100%;background:var(--mantine-color-body,var(--splice-launch-canvas,${BASES.dark.canvas}));color-scheme:dark}${standaloneSafeAreaCss}</style><script>(()=>{let mode=${JSON.stringify(DEFAULT_APPEARANCE.mode)};try{const cookie=document.cookie.split(';').find(p=>p.trim().startsWith('splice_appearance='));const value=cookie?cookie.trim().slice(18):localStorage.getItem('splice:appearance');const parsed=value?JSON.parse(decodeURIComponent(value)):null;if(parsed&&['light','dark','oled','auto'].includes(parsed.mode))mode=parsed.mode}catch{}if(mode==='auto')mode=typeof matchMedia==='function'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):'dark';const colors=${JSON.stringify(Object.fromEntries(Object.entries(BASES).map(([mode, base]) => [mode, base.canvas])))};document.documentElement.style.setProperty('--splice-launch-canvas',colors[mode]);document.documentElement.style.colorScheme=mode==='light'?'light':'dark';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[mode])})()</script>`
