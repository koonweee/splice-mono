# Shared UI conventions

Use these defaults when adding or changing UI. Extend an existing primitive when
the same behavior is needed in another screen; keep financial rules and data
mutations in their feature.

## Editors and form actions

Use [EditorModal](../src/components/forms/EditorModal.tsx) with
[FormActions](../src/components/forms/FormActions.tsx) for create/edit forms.
The modal is full screen at widths up to `36em` and centered above that. The
footer supplies Cancel, sticky positioning, safe-area spacing, and equal-width
phone buttons. Callers supply the primary action, validation, and pending state.

```tsx
<EditorModal opened={opened} onClose={onClose} title="Edit item">
  <form onSubmit={form.onSubmit(handleSave)}>
    <Stack>
      <TextInput label="Name" {...form.getInputProps('name')} />
      <FormActions onCancel={onClose} cancelDisabled={isPending}>
        <Button type="submit" loading={isPending}>
          Save
        </Button>
      </FormActions>
    </Stack>
  </form>
</EditorModal>
```

Keep the semantic `form` → `Stack` structure and put `FormActions` last: the
[layout CSS](../src/components/forms/EditorModal.module.css) depends on it.
Use short action labels such as Save or Create. Guard duplicate/invalid submits
in the handler and decide whether dismissal is safe while saving; the shell
does not enforce these policies. Preserve its content/body classes when
customizing styles. A details viewer or confirmation need not be an editor.

Current adopters include account editors, manual transactions, categories,
analysis rules, categorization rules, and recurring transactions.

## Settings sections

| Primitive                                                                     | Use it for                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [SettingsToolbar](../src/components/settings/SettingsToolbar.tsx)             | Section title, description, Add action, and optional extra actions; wraps on phones. It renders styled text, so provide appropriate heading semantics when needed. |
| [SettingsStatusBadge](../src/components/settings/SettingsStatusBadge.tsx)     | Active, Paused, Archived, and Ended states, with consistent colors and contrast. Other domains keep their own status meanings.                                     |
| [SettingsArchiveFilter](../src/components/settings/SettingsArchiveFilter.tsx) | The controlled “Archived only” checkbox. The caller owns filtering.                                                                                                |

These are used across categories and rule sections; recurring transactions also
use the toolbar and status badge.

## Dates and dropdowns

- Use [DateRangeControl](../src/components/DateRangeControl.tsx) for a standalone
  reporting range: desktop popover, bottom sheet at widths up to `48em`.
- Reuse its exported `DateRangeFields` inside an existing filter sheet. It shares
  Start/End fields, range-order correction, and month/MTD/YTD presets. The parent
  owns applying, clearing, and closing the surrounding filters.
- Use [formatDateRangeLabel](../src/lib/date-range.ts) everywhere a range is
  summarized. It retains the year and handles single-day, open, and empty ranges.
- For dropdowns, use [mobile-combobox helpers](../src/lib/mobile-combobox.ts):
  `getViewportAwareComboboxProps` normally, and
  `getViewportAwareOverlayComboboxProps` within an overlay. Pair with
  `viewportAwareDropdownMaxHeight` rather than copying positioning/z-index rules.

## Appearance and interaction

[theme.ts](../src/lib/theme.ts) owns Mantine component defaults and palettes;
[styles.css](../src/styles.css) owns shared appearance and responsive input
rules. Use theme spacing, radii, and semantic colors before adding local values.
Buttons and common form inputs default to `md`. Keep explicit size overrides
intentional. Check custom text/background combinations in light and dark themes;
a palette name alone does not guarantee readable contrast.

Prefer these existing building blocks alongside the new editor/settings pieces:

| Reuse                                                                                        | Responsibility                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PageHeader](../src/components/PageHeader.tsx)                                               | Page-level `h1`, responsive title sizing, and actions.                                                                                           |
| [MobileTableList](../src/components/MobileTableList.tsx)                                     | Mobile row shell and loading/error/empty presentation; callers supply row content and accessible interactions.                                   |
| [Table chrome](../src/components/MantineTableChrome.module.css)                              | Shared desktop table styling.                                                                                                                    |
| [Pressable](../src/components/Pressable.tsx)                                                 | Native button semantics and pointer/keyboard press feedback. Its hook alone does not make a `div` keyboard accessible.                           |
| [Transaction badge styles](../src/components/transactions/TransactionStatusBadge.module.css) | Shared Rule, Pending, and Review presentation.                                                                                                   |
| [Money/date formatters](../src/lib/format.ts)                                                | `formatMoneyWithSign` accepts API minor units; `formatMoneyNumber` accepts major units. Keep date-only calendar values distinct from timestamps. |
| [Category colors](../src/lib/category-colors.ts)                                             | Color normalization, fallbacks, and contrast helpers.                                                                                            |
| [API error messages](../src/lib/api-errors.ts)                                               | Extract server messages with a caller-supplied fallback. Callers still choose inline or notification presentation.                               |

Use native buttons/links, label icon-only actions, and avoid nesting interactive
controls. Distinguish narrow layouts from coarse-pointer/hover capability.
Current `36em`, `48em`, and `50em` thresholds serve different roles; breakpoint
consolidation remains an [audit recommendation](ui-standardization-audit.md).

For visual changes, follow the repository's testing guidance. When browser
validation is requested, check narrow phone, tablet portrait/landscape, and
desktop paths, including overflow, focus, and overlays. Viewport emulation does
not replace testing native browser keyboards or safe-area behavior on devices.
