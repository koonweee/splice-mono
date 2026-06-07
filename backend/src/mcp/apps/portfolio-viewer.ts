import { renderMcpAppHtml } from './app-shell';
import type { SpliceMcpAppDefinition } from '../mcp-apps';

export function renderPortfolioViewerApp(app: SpliceMcpAppDefinition): string {
  return renderMcpAppHtml(app);
}
