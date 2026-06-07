import { renderMcpAppHtml } from './app-shell';
import type { SpliceMcpAppDefinition } from '../mcp-apps';

export function renderCashflowExplorerApp(app: SpliceMcpAppDefinition): string {
  return renderMcpAppHtml(app);
}
