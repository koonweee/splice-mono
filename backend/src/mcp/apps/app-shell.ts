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
  html { min-width: 320px; background: var(--color-background-primary); }
  body { margin: 0; background: var(--color-background-primary); color: var(--color-text-primary); font-family: var(--font-sans); }
  #splice-mcp-app-safe-area { min-height: 100vh; }
  main { min-height: 100%; padding: 18px; display: grid; gap: 14px; align-content: start; }
  h1, h2 { margin: 0; line-height: 1.2; letter-spacing: 0; }
  h1 { font-size: 21px; }
  h2 { font-size: 15px; }
  p { margin: 4px 0 0; color: var(--color-text-secondary); line-height: 1.45; }
  button, input, select { font: inherit; }
  button { min-height: 34px; border: 1px solid var(--color-border-primary); border-radius: var(--border-radius-sm); background: var(--color-background-secondary); color: var(--color-text-primary); padding: 7px 10px; cursor: pointer; }
  button:hover { background: var(--color-background-tertiary); }
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

  @media (max-width: 760px) {
    main { padding: 12px; }
    .hero { display: grid; }
    .metrics, .split { grid-template-columns: 1fr; }
    .category-row, .allocation-row, .check-row { grid-template-columns: auto minmax(0, 1fr); }
    .number-stack { grid-column: 2; text-align: left; }
    th, td { padding: 7px 6px; }
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
