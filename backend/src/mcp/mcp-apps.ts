import { defineAppResource } from '@koonweee/mcp-kit';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { normalizeMcpMoney } from './mcp-money';
import { renderCashFlowApp } from './apps/cash-flow';
import { renderPortfolioViewerApp } from './apps/portfolio-viewer';
import type { SpliceMcpDependencies } from './mcp.definition';

export const MCP_APP_DOMAIN = 'https://splice-mcp.kw0.dev';

export interface SpliceMcpAppDefinition {
  id: 'cash_flow' | 'portfolio_viewer';
  title: string;
  description: string;
  resourceName: string;
  resourceUri: `ui://splice/${string}/v${number}.html`;
  initialToolName: string;
}

export const APP_RESOURCES = {
  cashFlow: {
    id: 'cash_flow',
    title: 'Cash Flow',
    description:
      'Mobile-first cash-flow visualization with ranked category evidence.',
    resourceName: 'splice_cash_flow_app',
    resourceUri: 'ui://splice/cash-flow/v3.html',
    initialToolName: 'visualize_cash_flow',
  },
  portfolioViewer: {
    id: 'portfolio_viewer',
    title: 'Portfolio Viewer',
    description: 'Interactive portfolio holdings and activity UI.',
    resourceName: 'splice_portfolio_viewer_app',
    resourceUri: 'ui://splice/portfolio-viewer/v2.html',
    initialToolName: 'show_portfolio_viewer',
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
    case 'cash_flow':
      return renderCashFlowApp(app);
    case 'portfolio_viewer':
      return renderPortfolioViewerApp(app);
  }
}
