import { defineAppResource } from '@koonweee/mcp-kit';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { normalizeMcpMoney } from './mcp-money';
import { renderCashflowExplorerApp } from './apps/cashflow-explorer';
import { renderCategoryRuleWorkbenchApp } from './apps/category-rule-workbench';
import { renderPortfolioViewerApp } from './apps/portfolio-viewer';
import { renderProjectionScenarioModelerApp } from './apps/projection-scenario-modeler';
import type { SpliceMcpDependencies } from './mcp.definition';

export const MCP_APP_DOMAIN = 'https://splice-mcp.kw0.dev';

export interface SpliceMcpAppDefinition {
  id:
    | 'cashflow_explorer'
    | 'projection_scenario_modeler'
    | 'portfolio_viewer'
    | 'category_rule_workbench';
  title: string;
  description: string;
  resourceName: string;
  resourceUri: `ui://splice/${string}/v2.html`;
  initialToolName: string;
}

export const APP_RESOURCES = {
  cashflowExplorer: {
    id: 'cashflow_explorer',
    title: 'Cashflow Explorer',
    description: 'Interactive cash-flow chart and category drilldown UI.',
    resourceName: 'splice_cashflow_explorer_app',
    resourceUri: 'ui://splice/cashflow-explorer/v2.html',
    initialToolName: 'show_cashflow_explorer',
  },
  projectionScenarioModeler: {
    id: 'projection_scenario_modeler',
    title: 'Projection Scenario Modeler',
    description:
      'Interactive projection assumption UI for non-persistent scenarios.',
    resourceName: 'splice_projection_scenario_modeler_app',
    resourceUri: 'ui://splice/projection-scenario-modeler/v2.html',
    initialToolName: 'show_projection_scenario_modeler',
  },
  portfolioViewer: {
    id: 'portfolio_viewer',
    title: 'Portfolio Viewer',
    description: 'Interactive portfolio holdings and activity UI.',
    resourceName: 'splice_portfolio_viewer_app',
    resourceUri: 'ui://splice/portfolio-viewer/v2.html',
    initialToolName: 'show_portfolio_viewer',
  },
  categoryRuleWorkbench: {
    id: 'category_rule_workbench',
    title: 'Category Rule Workbench',
    description:
      'Interactive category, analysis rule, and categorization recommendation UI.',
    resourceName: 'splice_category_rule_workbench_app',
    resourceUri: 'ui://splice/category-rule-workbench/v2.html',
    initialToolName: 'show_category_rule_workbench',
  },
} as const satisfies Record<string, SpliceMcpAppDefinition>;

const defineSpliceAppResource = defineAppResource<SpliceMcpDependencies>();

export function createSpliceMcpAppResources(
  renderHtml: (app: SpliceMcpAppDefinition) => string = renderMcpAppHtml,
) {
  return Object.values(APP_RESOURCES).map((app) =>
    defineSpliceAppResource({
      name: app.resourceName,
      uri: app.resourceUri,
      title: app.title,
      description: app.description,
      requiredScopes: ['splice:read'],
      ui: {
        domain: MCP_APP_DOMAIN,
        csp: {
          connectDomains: [],
          resourceDomains: [],
          frameDomains: [],
          baseUriDomains: [],
        },
        prefersBorder: true,
      },
      html: () => renderHtml(app),
    }),
  );
}

export const MCP_APP_RESOURCES = createSpliceMcpAppResources();

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

export function renderMcpAppHtml(app: SpliceMcpAppDefinition): string {
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
