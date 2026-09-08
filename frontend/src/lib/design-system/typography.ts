/** Canonical type roles. Surfaces choose a role; only this module owns metrics. */
export const typographyScale = {
  xs: '0.75rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
}

export const typographyFonts = {
  body: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
}

function role(fontSize: string, fontWeight: number, lineHeight = '1.5') {
  return { fontSize, fontWeight, lineHeight }
}

// Financial figures follow the saved amount-font preference through one token.
function numericRole(fontSize: string, fontWeight: number, lineHeight = '1.5') {
  return {
    ...role(fontSize, fontWeight, lineHeight),
    fontFamily: 'var(--splice-font-amount, var(--mantine-font-family))',
  }
}

export const typographyRoles = {
  launchScreen: {
    ...role(typographyScale.md, 400),
    fontFamily: typographyFonts.body,
  },
  display: numericRole('clamp(1.75rem, 6vw, 2.5rem)', 700, '1.2'),
  brandDisplay: role('3rem', 700, '1.2'),
  brand: role(typographyScale.lg, 700, '1.4'),
  pageTitle: role('1.375rem', 700, '1.4'),
  sectionHeading: role(typographyScale.md, 600, '1.5'),
  subsectionHeading: role(typographyScale.sm, 600, '1.45'),
  dialogTitle: role(typographyScale.lg, 600, '1.4'),
  body: role(typographyScale.md, 400),
  bodySmall: role(typographyScale.sm, 400, '1.45'),
  lead: role(typographyScale.lg, 400),
  rowTitle: role(typographyScale.md, 500),
  rowTitleSmall: role(typographyScale.sm, 500, '1.45'),
  amount: numericRole(typographyScale.md, 600),
  amountSmall: numericRole(typographyScale.sm, 600, '1.45'),
  amountLarge: numericRole(typographyScale.xl, 600, '1.4'),
  label: role(typographyScale.sm, 500, '1.45'),
  control: role(typographyScale.sm, 500, '1.45'),
  input: role(typographyScale.md, 400),
  nativeDateInput: role(
    typographyScale.md,
    400,
    'calc(var(--input-size, var(--splice-size-touch-input)) - 2px)',
  ),
  metadata: role(typographyScale.sm, 400, '1.45'),
  caption: role(typographyScale.xs, 400, '1.4'),
  captionStrong: role(typographyScale.xs, 600, '1.4'),
  numericCaption: numericRole(typographyScale.xs, 400, '1.4'),
  numericCaptionStrong: numericRole(typographyScale.xs, 600, '1.4'),
  numericMetadata: numericRole(typographyScale.sm, 400, '1.45'),
  numericInput: numericRole(typographyScale.md, 400),
  badge: role('0.625rem', 600, '1.2'),
  chartLabel: role(typographyScale.xs, 400, '1.4'),
  code: {
    ...role(typographyScale.sm, 400, '1.45'),
    fontFamily: typographyFonts.mono,
  },
  offlineTitle: role('2.5rem', 700, '1.2'),
} as const
export type TypographyRole = keyof typeof typographyRoles

export const compactTypographyRoles: Partial<
  Record<TypographyRole, ReturnType<typeof role>>
> = {
  pageTitle: role(typographyScale.lg, 700, '1.4'),
}

/** Library internals get roles too, independent of control geometry (`size`). */
export const typographyDefaults: Partial<Record<TypographyRole, string>> = {
  body: 'body, .mantine-Text-root, .mantine-Table-td',
  sectionHeading: '.mantine-Title-root',
  dialogTitle: '.splice-overlay-title',
  label: '.splice-input-label, .mantine-Table-th',
  control:
    '.splice-button-root, .splice-menu-item, .splice-combobox-option, .splice-tabs-tab, .splice-navlink-label, .splice-segmented-control-label, .mantine-Checkbox-label, .mantine-Radio-label, .mantine-Switch-label, .splice-calendar-control',
  input: '.splice-input-input',
  caption: '.splice-input-description, .splice-input-error, .splice-tooltip',
  badge: '.splice-badge-root',
  code: 'code, .mantine-Code-root',
  chartLabel: '.recharts-text, .recharts-label, .recharts-legend-item-text',
  numericInput:
    '.splice-input-input[inputmode="decimal"], .splice-input-input[inputmode="numeric"]',
}
