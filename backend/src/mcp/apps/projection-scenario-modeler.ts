import { renderMcpAppHtml } from './app-shell';
import type { SpliceMcpAppDefinition } from '../mcp-apps';

export function renderProjectionScenarioModelerApp(
  app: SpliceMcpAppDefinition,
): string {
  return renderMcpAppHtml(app);
}
