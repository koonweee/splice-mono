import { Injectable } from '@nestjs/common';
import {
  createAuth0BearerGate,
  createAuth0ProtectedResourceHandler,
  createAuth0Verifier,
  getAuth0ProtectedResourceMetadataUrl,
  principalFromAuthInfo,
  type Auth0JwksOptions,
} from '@koonweee/mcp-kit/auth0';
import { serveNode, type RunningNodeMcpServer } from '@koonweee/mcp-kit/node';
import { Logger } from 'nestjs-pino';
import { AccountsSurfaceService } from '../account/accounts-surface.service';
import { BalanceHistorySurfaceService } from '../balance-query/balance-history-surface.service';
import { TransactionAnalysisService } from '../transaction-analysis/transaction-analysis.service';
import { TransactionsSurfaceService } from '../transaction/transactions-surface.service';
import { UserService } from '../user/user.service';
import type { SpliceMcpRuntimeConfig } from './mcp.config';
import { McpCategorizationService } from './mcp-categorization.service';
import {
  createSpliceMcpDependencies,
  spliceMcpDefinition,
} from './mcp.definition';
import { resolveSpliceMcpUserId } from './mcp.identity';
import { McpReadService } from './mcp-read.service';
import { McpPortfolioVisualizationService } from './mcp-portfolio-visualization.service';

export type SpliceMcpStartOptions = {
  readonly hostname?: string;
  readonly jwks?: Auth0JwksOptions;
};

@Injectable()
export class SpliceMcpRuntimeService {
  private running?: RunningNodeMcpServer;

  constructor(
    private readonly userService: UserService,
    private readonly accountsSurfaceService: AccountsSurfaceService,
    private readonly balanceHistorySurfaceService: BalanceHistorySurfaceService,
    private readonly transactionsSurfaceService: TransactionsSurfaceService,
    private readonly mcpReadService: McpReadService,
    private readonly mcpPortfolioVisualizationService: McpPortfolioVisualizationService,
    private readonly mcpCategorizationService: McpCategorizationService,
    private readonly transactionAnalysisService: TransactionAnalysisService,
    private readonly logger: Logger,
  ) {}

  async start(
    config: SpliceMcpRuntimeConfig,
    options: SpliceMcpStartOptions = {},
  ): Promise<URL | undefined> {
    if (!config.enabled) {
      this.logger.log({}, 'MCP listener disabled');
      return undefined;
    }
    if (this.running) {
      throw new Error('MCP listener is already running.');
    }

    const verifier = createAuth0Verifier({
      issuer: config.issuer,
      audience: config.resourceServerUrl,
      dangerouslyAllowInsecureIssuerUrl: config.issuer.protocol === 'http:',
      ...(options.jwks ? { jwks: options.jwks } : {}),
    });
    const resourceMetadataUrl = getAuth0ProtectedResourceMetadataUrl(
      config.resourceServerUrl,
    );

    this.running = await serveNode(spliceMcpDefinition, {
      hostname: options.hostname ?? '0.0.0.0',
      port: config.port,
      mcpPath: '/mcp',
      healthPath: '/healthz',
      maxBodyBytes: 1_048_576,
      allowedHostnames: config.allowedHostnames,
      allowedOriginHostnames: config.allowedOriginHostnames,
      authenticate: createAuth0BearerGate({
        verifier,
        resourceMetadataUrl,
      }),
      principalFromAuthInfo,
      discovery: createAuth0ProtectedResourceHandler({
        issuer: config.issuer,
        resourceServerUrl: config.resourceServerUrl,
        resourceName: 'Splice MCP',
        scopesSupported: ['splice:read', 'splice:write'],
        dangerouslyAllowInsecureIssuerUrl: config.issuer.protocol === 'http:',
      }),
      logger: {
        log: (record) => this.logger.log(record, 'MCP tool event'),
        error: (record) => this.logger.error(record, 'MCP tool failed'),
      },
      dependencies: async ({ principal }) => {
        if (!principal) {
          throw new Error('Authenticated MCP principal is required.');
        }
        const userId = await resolveSpliceMcpUserId(
          principal.subject,
          this.userService,
        );
        return createSpliceMcpDependencies(userId, {
          userService: this.userService,
          accountsSurfaceService: this.accountsSurfaceService,
          balanceHistorySurfaceService: this.balanceHistorySurfaceService,
          transactionsSurfaceService: this.transactionsSurfaceService,
          mcpReadService: this.mcpReadService,
          mcpPortfolioVisualizationService:
            this.mcpPortfolioVisualizationService,
          mcpCategorizationService: this.mcpCategorizationService,
          transactionAnalysisService: this.transactionAnalysisService,
        });
      },
    });

    this.logger.log(
      { port: config.port, resource: config.resourceServerUrl.href },
      'MCP listener started',
    );
    return this.running.url;
  }

  async close(): Promise<void> {
    const running = this.running;
    this.running = undefined;
    if (running) {
      await running.close();
      this.logger.log({}, 'MCP listener stopped');
    }
  }
}
