import { describe, expect, it } from 'vitest'
import {
  ACCENT_SWATCHES,
  DEFAULT_APPEARANCE,
  contrastRatio,
  parseAppearance,
  resolveAppearance,
} from './appearance'

describe('appearance resolver', () => {
  it('validates complete preferences and keeps normalized seeds', () => {
    expect(parseAppearance({ mode: 'oled', accent: '#AAbbCC' })).toEqual({
      mode: 'oled',
      accent: '#aabbcc',
    })
    for (const value of [
      null,
      {},
      { mode: 'dark' },
      { mode: 'dracula', accent: null },
      { mode: 'light', accent: '#fff' },
      { mode: 'dark', accent: 'url(x)' },
    ])
      expect(parseAppearance(value)).toBeNull()
    expect(resolveAppearance({}).preference).toEqual(DEFAULT_APPEARANCE)
  })

  for (const mode of ['light', 'dark', 'oled'] as const) {
    for (const accent of [
      ...ACCENT_SWATCHES.map((swatch) => swatch.value),
      '#000000',
      '#ffffff',
      '#ffff00',
      '#777777',
      '#ff0000',
      '#0000ff',
      '#00ff00',
      '#010101',
    ]) {
      it(`${mode}/${accent}: readable text, controls and graph`, () => {
        const result = resolveAppearance({ mode, accent })
        const c = result.colors
        for (const provider of ['plaid', 'simplefin', 'crypto']) {
          const variables: Record<string, string> = result.variables
          const neutral: Record<string, string> = resolveAppearance({
            mode,
            accent: null,
          }).variables
          const foreground = `--splice-provider-${provider}-fg`
          const background = `--splice-provider-${provider}-bg`
          expect(
            contrastRatio(variables[foreground], variables[background]),
          ).toBeGreaterThanOrEqual(4.5)
          expect(variables[foreground]).toBe(neutral[foreground])
          expect(variables[background]).toBe(neutral[background])
        }
        for (const role of [
          'success',
          'warning',
          'danger',
          'neutral',
          'info',
          'rule',
        ]) {
          const variables: Record<string, string> = result.variables
          expect(
            contrastRatio(
              variables[`--splice-status-${role}-fg`],
              variables[`--splice-status-${role}-bg`],
            ),
          ).toBeGreaterThanOrEqual(4.5)
          for (const background of [
            variables[`--splice-status-${role}-bg`],
            variables[`--splice-status-${role}-hover`],
            c.canvas,
            c.raised,
            c.muted,
            c.control,
          ]) {
            expect(
              contrastRatio(
                variables[`--splice-status-${role}-control-fg`],
                background,
              ),
            ).toBeGreaterThanOrEqual(4.5)
          }
          const neutral: Record<string, string> = resolveAppearance({
            mode,
            accent: null,
          }).variables
          expect(variables[`--splice-status-${role}-fg`]).toBe(
            neutral[`--splice-status-${role}-fg`],
          )
          expect(variables[`--splice-status-${role}-bg`]).toBe(
            neutral[`--splice-status-${role}-bg`],
          )
        }
        for (const background of [c.canvas, c.raised, c.muted, c.control]) {
          for (const financial of [
            '--splice-error',
            '--splice-positive',
            '--splice-negative',
          ] as const)
            expect(
              contrastRatio(result.variables[financial], background),
            ).toBeGreaterThanOrEqual(4.5)
          expect(contrastRatio(c.text, background)).toBeGreaterThanOrEqual(4.5)
          expect(contrastRatio(c.dimmed, background)).toBeGreaterThanOrEqual(
            4.5,
          )
          expect(contrastRatio(c.focus, background)).toBeGreaterThanOrEqual(3)
        }
        expect(
          contrastRatio(c.selectedText, c.selected),
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(c.selectedText, c.selectedHover),
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(c.actionForeground, c.action),
        ).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(c.chart, c.canvas)).toBeGreaterThanOrEqual(3)
        expect(
          contrastRatio(c.controlBorder, c.control),
        ).toBeGreaterThanOrEqual(3)
        expect(result.preference.accent).toBe(accent)
        expect(result).toEqual(resolveAppearance({ mode, accent }))
        if (mode === 'oled') expect(c.canvas).toBe('#000000')
      })
    }
  }

  it('keeps financial and status colors independent of personal accent', () => {
    const first = resolveAppearance({ mode: 'dark', accent: '#ff0000' })
    const second = resolveAppearance({ mode: 'dark', accent: '#0000ff' })
    expect(first.variables['--splice-positive']).toBe(
      second.variables['--splice-positive'],
    )
    expect(first.variables['--splice-negative']).toBe(
      second.variables['--splice-negative'],
    )
    expect(first.theme.colors?.teal).toBeUndefined()
    expect(first.theme.colors?.red).toBeUndefined()
  })

  it('uses untinted foundations for a neutral accent', () => {
    const { colors } = resolveAppearance({ mode: 'dark', accent: null })
    expect(colors.canvas).toBe('#191c21')
    expect(colors.raised).toBe('#24282e')
  })
})
