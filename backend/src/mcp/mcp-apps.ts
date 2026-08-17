import { mcpExtensionErrorBoundary } from '@koonweee/mcp-kit';
import type {
  CallToolResult,
  McpServer,
  ReadResourceResult,
} from '@modelcontextprotocol/server';
import { normalizeMcpMoney } from './mcp-money';
import { renderCashflowExplorerApp } from './apps/cashflow-explorer';
import { renderCategoryRuleWorkbenchApp } from './apps/category-rule-workbench';
import { renderPortfolioViewerApp } from './apps/portfolio-viewer';
import { renderProjectionScenarioModelerApp } from './apps/projection-scenario-modeler';

export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

export interface SpliceMcpAppDefinition {
  id:
    | 'cashflow_explorer'
    | 'projection_scenario_modeler'
    | 'portfolio_viewer'
    | 'category_rule_workbench';
  title: string;
  description: string;
  resourceName: string;
  resourceUri: `ui://splice/${string}.html`;
  initialToolName: string;
}

export const APP_RESOURCES = {
  cashflowExplorer: {
    id: 'cashflow_explorer',
    title: 'Cashflow Explorer',
    description: 'Interactive cash-flow chart and category drilldown UI.',
    resourceName: 'splice_cashflow_explorer_app',
    resourceUri: 'ui://splice/cashflow-explorer.html',
    initialToolName: 'show_cashflow_explorer',
  },
  projectionScenarioModeler: {
    id: 'projection_scenario_modeler',
    title: 'Projection Scenario Modeler',
    description:
      'Interactive projection assumption UI for non-persistent scenarios.',
    resourceName: 'splice_projection_scenario_modeler_app',
    resourceUri: 'ui://splice/projection-scenario-modeler.html',
    initialToolName: 'show_projection_scenario_modeler',
  },
  portfolioViewer: {
    id: 'portfolio_viewer',
    title: 'Portfolio Viewer',
    description: 'Interactive portfolio holdings and activity UI.',
    resourceName: 'splice_portfolio_viewer_app',
    resourceUri: 'ui://splice/portfolio-viewer.html',
    initialToolName: 'show_portfolio_viewer',
  },
  categoryRuleWorkbench: {
    id: 'category_rule_workbench',
    title: 'Category Rule Workbench',
    description:
      'Interactive category, analysis rule, and categorization recommendation UI.',
    resourceName: 'splice_category_rule_workbench_app',
    resourceUri: 'ui://splice/category-rule-workbench.html',
    initialToolName: 'show_category_rule_workbench',
  },
} as const satisfies Record<string, SpliceMcpAppDefinition>;

const APP_RESOURCE_META = {
  ui: {
    csp: {
      connectDomains: [],
      resourceDomains: [],
      frameDomains: [],
      baseUriDomains: [],
    },
    prefersBorder: true,
  },
} as const;

export function appToolMeta(app: SpliceMcpAppDefinition): {
  ui: { resourceUri: string; visibility: Array<'model' | 'app'> };
  'ui/resourceUri': string;
  'openai/outputTemplate': string;
} {
  return {
    ui: { resourceUri: app.resourceUri, visibility: ['model', 'app'] },
    'ui/resourceUri': app.resourceUri,
    'openai/outputTemplate': app.resourceUri,
  };
}

export function appToolResult(
  app: SpliceMcpAppDefinition,
  fallback: string,
  data?: unknown,
): CallToolResult & {
  readonly structuredContent: {
    readonly app: SpliceMcpAppDefinition;
    readonly data?: unknown;
    readonly fallback: string;
  };
} {
  const structuredContent = normalizeMcpMoney({
    app,
    data,
    fallback,
  }) as {
    app: SpliceMcpAppDefinition;
    data?: unknown;
    fallback: string;
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

export function registerMcpAppResources(
  server: McpServer,
  authorizeRead: () => void,
): void {
  Object.values(APP_RESOURCES).forEach((app) => {
    server.registerResource(
      app.resourceName,
      app.resourceUri,
      {
        title: app.title,
        description: app.description,
        mimeType: MCP_APP_MIME_TYPE,
      },
      mcpExtensionErrorBoundary.resource((uri) => {
        authorizeRead();

        return readMcpAppResource(uri, app);
      }),
    );
  });
}

export function readMcpAppResource(
  uri: URL,
  app: SpliceMcpAppDefinition,
): ReadResourceResult {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: MCP_APP_MIME_TYPE,
        text: renderApp(app),
        _meta: APP_RESOURCE_META,
      },
    ],
  };
}

function renderApp(app: SpliceMcpAppDefinition): string {
  switch (app.id) {
    case 'cashflow_explorer':
      return renderCashflowExplorerApp(app);
    case 'projection_scenario_modeler':
      return renderProjectionScenarioModelerApp(app);
    case 'portfolio_viewer':
      return renderPortfolioViewerApp(app);
    case 'category_rule_workbench':
      return renderCategoryRuleWorkbenchApp(app);
  }
}
