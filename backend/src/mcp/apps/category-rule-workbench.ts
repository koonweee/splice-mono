import { renderMcpAppHtml } from './app-shell';
import type { SpliceMcpAppDefinition } from '../mcp-apps';

export function renderCategoryRuleWorkbenchApp(
  app: SpliceMcpAppDefinition,
): string {
  return renderMcpAppHtml(app);
}
