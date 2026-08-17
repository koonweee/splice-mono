import {
  defineAppResource,
  defineServer,
  defineTool,
  validateMcpApps,
  type McpToolResult,
} from '@koonweee/mcp-kit';
import {
  acceptedContent,
  inputRequired,
  type InputRequiredResult,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { z } from 'zod';

interface ContractFixtureDependencies {
  readonly lookup: (id: string) => Promise<string>;
}

const ContractFixtureInputSchema = z.object({
  id: z.string().min(1),
});
const ContractFixtureOutputSchema = z.object({
  value: z.string(),
});
const ContractFixtureConfirmationSchema = z.object({
  confirmed: z.boolean(),
});

export const mcpKitContractFixtureApp =
  defineAppResource<ContractFixtureDependencies>()({
    name: 'mcp_kit_contract_fixture_app',
    uri: 'ui://fixture/contract.html',
    title: 'MCP Kit Contract Fixture App',
    requiredScopes: ['fixture:read'],
    ui: {
      domain: 'https://fixture.example.com',
      csp: { connectDomains: [], resourceDomains: [] },
      prefersBorder: true,
    },
    html: async (context) =>
      `<p>${await context.dependencies.lookup('fixture-app')}</p>`,
  });

export const mcpKitContractFixtureTool =
  defineTool<ContractFixtureDependencies>()({
    name: 'mcp_kit_contract_fixture',
    title: 'MCP Kit Contract Fixture',
    description:
      'Compile-time fixture for typed output, metadata, SDK context, and input-required results.',
    inputSchema: ContractFixtureInputSchema,
    outputSchema: ContractFixtureOutputSchema,
    requiredScopes: ['fixture:read'],
    risk: { kind: 'read' },
    ui: {
      resourceUri: mcpKitContractFixtureApp.uri,
      visibility: ['model', 'app'],
    },
    handler: async (
      input,
      context,
      sdkContext,
    ): Promise<McpToolResult<typeof ContractFixtureOutputSchema>> => {
      const officialSdkContext: ServerContext = sdkContext;

      if (!context.client.inputRequired.formElicitation) {
        return {
          content: [{ type: 'text', text: 'Form elicitation unsupported.' }],
          structuredContent: { value: 'unsupported' },
        };
      }

      const confirmation = acceptedContent(
        officialSdkContext.mcpReq.inputResponses,
        'confirmation',
        ContractFixtureConfirmationSchema,
      );

      if (!confirmation?.confirmed) {
        const request: InputRequiredResult = inputRequired({
          inputRequests: {
            confirmation: inputRequired.elicit({
              message: 'Confirm the compile-time contract fixture lookup.',
              requestedSchema: ContractFixtureConfirmationSchema,
            }),
          },
        });

        return request;
      }

      const value = await context.dependencies.lookup(input.id);

      return {
        content: [{ type: 'text', text: value }],
        structuredContent: { value },
      };
    },
  });

export const mcpKitContractFixtureDefinition =
  defineServer<ContractFixtureDependencies>()({
    name: 'mcp-kit-contract-fixture',
    version: '1.0.0',
    apps: {
      resources: [mcpKitContractFixtureApp],
      compatibility: { openaiLegacyAliases: true },
    },
    tools: [mcpKitContractFixtureTool],
  });

validateMcpApps(mcpKitContractFixtureDefinition, {
  profile: 'openai-submission',
});
