import { renderMcpAppHtml } from './app-shell';
import type { SpliceMcpAppDefinition } from '../mcp-apps';

export function renderCashFlowApp(app: SpliceMcpAppDefinition): string {
  return renderMcpAppHtml(app);
}
