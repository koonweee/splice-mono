import { MCP_APP_RUNTIME_SCRIPT } from './app-runtime.generated';
import type { SpliceMcpAppDefinition } from '../mcp-apps';

const APP_CSS = `
  :root {
    color-scheme: light dark;
    --color-background-primary: light-dark(#f8fafc, #111827);
    --color-background-secondary: light-dark(#ffffff, #1f2937);
    --color-background-tertiary: light-dark(#f3f4f6, #374151);
    --color-text-primary: light-dark(#111827, #f9fafb);
    --color-text-secondary: light-dark(#4b5563, #d1d5db);
    --color-text-danger: light-dark(#b91c1c, #fca5a5);
    --color-text-success: light-dark(#047857, #6ee7b7);
    --color-border-primary: light-dark(#d1d5db, #4b5563);
    --color-border-secondary: light-dark(#e5e7eb, #374151);
    --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --border-radius-sm: 6px;
    --border-radius-md: 8px;
  }

  * { box-sizing: border-box; }
  html { min-width: 0; background: var(--color-background-primary); }
  body { margin: 0; background: var(--color-background-primary); color: var(--color-text-primary); font-family: var(--font-sans); }
  #splice-mcp-app-safe-area { min-height: 0; }
  main { min-height: 0; padding: 18px; display: grid; gap: 14px; align-content: start; }
  h1, h2 { margin: 0; line-height: 1.2; letter-spacing: 0; }
  h1 { font-size: 21px; }
  h2 { font-size: 15px; }
  p { margin: 4px 0 0; color: var(--color-text-secondary); line-height: 1.45; }
  button, input, select { font: inherit; }
  button { min-height: 34px; border: 1px solid var(--color-border-primary); border-radius: var(--border-radius-sm); background: var(--color-background-secondary); color: var(--color-text-primary); padding: 7px 10px; cursor: pointer; }
  button:hover { background: var(--color-background-tertiary); }
  button:focus-visible, summary:focus-visible { outline: 3px solid light-dark(#2563eb, #93c5fd); outline-offset: 2px; }
  button[aria-pressed="true"] { border-color: #2563eb; background: light-dark(#dbeafe, #1e3a8a); }
  label { display: grid; gap: 4px; color: var(--color-text-secondary); font-size: 12px; }
  input, select { min-height: 34px; min-width: 0; border: 1px solid var(--color-border-primary); border-radius: var(--border-radius-sm); background: var(--color-background-secondary); color: var(--color-text-primary); padding: 6px 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px; border-bottom: 1px solid var(--color-border-secondary); text-align: left; vertical-align: top; }
  th { color: var(--color-text-secondary); font-weight: 650; }
  small { display: block; color: var(--color-text-secondary); margin-top: 2px; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }

  .hero { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .panel, .metric { border: 1px solid var(--color-border-primary); border-radius: var(--border-radius-md); background: var(--color-background-secondary); padding: 14px; }
  .panel { display: grid; gap: 12px; min-width: 0; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .metric { min-height: 76px; }
  .metric .label, .label { color: var(--color-text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: 0; }
  .metric .value, .value { margin-top: 6px; font-size: 18px; font-weight: 700; overflow-wrap: anywhere; }
  .metric[data-tone="positive"] .value { color: var(--color-text-success); }
  .metric[data-tone="negative"] .value { color: var(--color-text-danger); }
  .toolbar, .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; align-items: end; }
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .segmented, .tabs, .button-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .category-list, .detail-list, .check-list { display: grid; gap: 8px; }
  .category-row, .allocation-row, .detail-row, .check-row { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; text-align: left; }
  .allocation-row, .check-row { border: 1px solid var(--color-border-secondary); border-radius: var(--border-radius-sm); padding: 8px; }
  .detail-row { grid-template-columns: minmax(0, 1fr); }
  .category-main { min-width: 0; display: grid; gap: 6px; }
  .number-stack { text-align: right; white-space: nowrap; }
  .swatch { width: 11px; height: 11px; border-radius: 999px; flex: 0 0 auto; }
  .bar-track { height: 9px; border-radius: 999px; overflow: hidden; background: var(--color-background-tertiary); }
  .bar-fill { display: block; height: 100%; border-radius: inherit; }
  .table-wrap { overflow-x: auto; }
  .num { text-align: right; white-space: nowrap; }
  .muted, .hint, .empty { color: var(--color-text-secondary); font-size: 13px; }
  .empty, .hint, .error-list { border: 1px dashed var(--color-border-primary); border-radius: var(--border-radius-sm); padding: 10px; }
  .error-list { color: var(--color-text-danger); }
  .status-pill { max-width: 280px; border: 1px solid var(--color-border-primary); border-radius: 999px; padding: 6px 10px; color: var(--color-text-secondary); font-size: 12px; text-align: right; }
  .status-pill[data-kind="success"] { color: var(--color-text-success); }
  .status-pill[data-kind="error"] { color: var(--color-text-danger); }
  .checkbox-inline { display: flex; flex-direction: row; align-items: center; gap: 8px; min-height: 34px; }
  .checkbox-inline input, .check-row input { min-height: auto; }
  .detail-json { max-height: 420px; overflow: auto; border: 1px solid var(--color-border-secondary); border-radius: var(--border-radius-sm); padding: 10px; background: var(--color-background-tertiary); font-size: 12px; }

  .cash-flow-view { width: min(100%, 720px); margin: 0 auto; display: grid; gap: 18px; min-width: 0; }
  .cash-flow-header { display: flex; align-items: end; justify-content: space-between; gap: 12px; padding-bottom: 2px; }
  .cash-flow-header h1 { font-size: clamp(22px, 5vw, 30px); }
  .eyebrow { margin: 0 0 4px; color: var(--color-text-secondary); font-size: 11px; font-weight: 700; line-height: 1.25; letter-spacing: 0.06em; text-transform: uppercase; }
  .net-flow { display: grid; gap: 4px; padding: 18px; border: 1px solid var(--color-border-primary); border-radius: 14px; background: var(--color-background-secondary); }
  .net-flow p { margin: 0; font-size: 13px; }
  .net-flow strong { min-width: 0; font-size: clamp(32px, 10vw, 48px); line-height: 1.05; letter-spacing: -0.035em; overflow-wrap: anywhere; }
  .net-flow[data-tone="positive"] strong { color: var(--color-text-success); }
  .net-flow[data-tone="negative"] strong { color: var(--color-text-danger); }
  .net-flow small { margin-top: 4px; font-size: 12px; }
  [data-delta-tone="positive"] { color: var(--color-text-success); }
  [data-delta-tone="negative"] { color: var(--color-text-danger); }
  [data-delta-tone="neutral"] { color: var(--color-text-secondary); }
  .flow-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--color-border-primary); border-radius: 12px; background: var(--color-background-secondary); }
  .flow-pair > div { min-width: 0; padding: 13px 15px; display: grid; gap: 3px; }
  .flow-pair > div + div { border-left: 1px solid var(--color-border-secondary); }
  .flow-pair span { color: var(--color-text-secondary); font-size: 12px; }
  .flow-pair strong { min-width: 0; font-size: clamp(16px, 5vw, 22px); overflow-wrap: anywhere; }
  .flow-pair small { font-size: 11px; }
  .comparison-period { margin: -6px 2px 0; font-size: 12px; }
  .cash-flow-categories { display: grid; gap: 10px; min-width: 0; }
  .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
  .section-heading > span { flex: 0 0 auto; color: var(--color-text-secondary); font-size: 12px; }
  .cash-flow-category-list { display: grid; overflow: hidden; border: 1px solid var(--color-border-primary); border-radius: 12px; background: var(--color-background-secondary); }
  .cash-flow-category { width: 100%; min-height: 56px; display: grid; grid-template-columns: 24px minmax(0, 1fr) minmax(72px, auto); gap: 10px; align-items: center; padding: 10px 12px; border: 0; border-radius: 0; border-bottom: 1px solid var(--color-border-secondary); text-align: left; }
  .cash-flow-category:last-child { border-bottom: 0; }
  .cash-flow-category[aria-expanded="true"] { background: var(--color-background-tertiary); box-shadow: inset 3px 0 0 #2563eb; }
  .category-rank { width: 24px; color: var(--color-text-secondary); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
  .cash-flow-category-main { min-width: 0; display: grid; gap: 5px; }
  .category-label { min-width: 0; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
  .cash-flow-bar { width: 100%; height: 5px; overflow: hidden; border-radius: 999px; background: var(--color-background-tertiary); }
  .cash-flow-bar > span { display: block; height: 100%; border-radius: inherit; }
  .category-comparison { margin: 0; font-size: 10px; line-height: 1.25; }
  .category-comparison > span { margin-left: 3px; font-weight: 700; }
  .cash-flow-category-value { min-width: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .cash-flow-category-value strong { display: block; overflow-wrap: anywhere; }
  .cash-flow-category-value small { margin-top: 2px; font-size: 10px; }
  .cash-flow-other { border-bottom: 1px solid var(--color-border-secondary); }
  #cash-flow-other-rows { display: grid; background: light-dark(#f8fafc, #172033); }
  #cash-flow-other-rows .cash-flow-category { padding-left: 18px; }
  .uncategorized-separator { padding: 8px 12px; border-bottom: 1px solid var(--color-border-secondary); background: var(--color-background-tertiary); color: var(--color-text-secondary); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .cash-flow-category[data-row-kind="uncategorized"] .category-rank { color: var(--color-text-danger); font-weight: 800; }
  .cash-flow-detail { display: grid; gap: 12px; margin: 12px; padding: 15px; border: 1px solid var(--color-border-primary); border-radius: 12px; background: var(--color-background-secondary); }
  .cash-flow-detail-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  .cash-flow-detail-head h3 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
  .cash-flow-detail-head p:not(.eyebrow) { font-size: 12px; }
  .text-button { min-height: 44px; flex: 0 0 auto; border: 0; background: transparent; color: light-dark(#1d4ed8, #93c5fd); }
  .cash-flow-detail-state { min-height: 64px; display: grid; place-items: center; gap: 10px; padding: 14px; border-radius: 8px; background: var(--color-background-tertiary); color: var(--color-text-secondary); font-size: 13px; text-align: center; }
  .cash-flow-detail-state p { margin: 0; }
  .cash-flow-detail-state button { min-height: 44px; }
  .cash-flow-context-note { margin: 0; padding: 9px 10px; border-radius: 7px; background: var(--color-background-tertiary); font-size: 11px; }
  .spinner { width: 18px; height: 18px; border: 2px solid var(--color-border-primary); border-top-color: #2563eb; border-radius: 999px; animation: cash-flow-spin 700ms linear infinite; }
  @keyframes cash-flow-spin { to { transform: rotate(360deg); } }
  .transaction-evidence { margin: 0; padding: 0; list-style: none; display: grid; }
  .transaction-evidence li { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(72px, auto); gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-border-secondary); }
  .transaction-copy { min-width: 0; }
  .transaction-copy strong { display: block; overflow-wrap: anywhere; }
  .transaction-amount { min-width: 0; text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .show-more { min-height: 44px; justify-self: start; }
  .cash-flow-adjustments { border: 1px solid var(--color-border-primary); border-radius: 10px; background: var(--color-background-secondary); }
  .cash-flow-adjustments summary { min-height: 44px; display: flex; align-items: center; padding: 10px 12px; cursor: pointer; font-weight: 650; }
  .cash-flow-adjustments > div { padding: 0 12px 12px; }
  .cash-flow-adjustments p { font-size: 12px; }
  .cash-flow-empty { padding: 20px; border: 1px dashed var(--color-border-primary); border-radius: 12px; text-align: center; }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
  }

  @media (max-width: 760px) {
    main { padding: 12px; }
    .hero { display: grid; }
    .metrics, .split { grid-template-columns: 1fr; }
    .category-row, .allocation-row, .check-row { grid-template-columns: auto minmax(0, 1fr); }
    .number-stack { grid-column: 2; text-align: left; }
    th, td { padding: 7px 6px; }
  }

  @media (max-width: 420px) {
    main { padding: 10px; }
    .cash-flow-view { gap: 14px; }
    .net-flow { padding: 15px; }
    .flow-pair > div { padding: 11px 12px; }
    .cash-flow-category { grid-template-columns: 20px minmax(0, 1fr) minmax(66px, auto); gap: 8px; padding: 9px 10px; }
    .category-rank { width: 20px; }
    .cash-flow-category-value { font-size: 12px; }
    .cash-flow-detail-head { display: grid; }
    .text-button { justify-self: start; padding-left: 0; }
  }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMcpAppHtml(app: SpliceMcpAppDefinition): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(app.title)}</title>
  <style>${APP_CSS}</style>
</head>
<body>
  <div id="splice-mcp-app-safe-area">
    <main id="splice-mcp-app-root" data-splice-mcp-app="${escapeHtml(app.title)}" data-app-id="${escapeHtml(app.id)}">
      <section class="hero">
        <div>
          <h1>${escapeHtml(app.title)}</h1>
          <p>Loading live Splice data...</p>
        </div>
        <div class="status-pill" id="app-status" data-kind="info">Connecting</div>
      </section>
    </main>
  </div>
  <script>${MCP_APP_RUNTIME_SCRIPT}</script>
</body>
</html>`;
}
