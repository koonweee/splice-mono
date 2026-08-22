import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { spliceMcpDefinition } from '../../src/mcp/mcp.definition';
import { CASH_FLOW_TOOL_SELECTION_EVALS } from './fixtures/cash-flow-tool-selection-evals';

const ToolSelectionPlanSchema = z.object({
  steps: z.array(
    z.object({
      tool: z.string(),
      direction: z.enum(['outflow', 'inflow']).nullable(),
    }),
  ),
});

type ToolSelectionPlan = z.infer<typeof ToolSelectionPlanSchema>;

function inputFieldDescriptions(inputSchema: unknown): string {
  if (typeof inputSchema !== 'object' || inputSchema === null) return '';

  return Object.entries(inputSchema)
    .map(([name, schema]) => {
      const description =
        typeof schema === 'object' &&
        schema !== null &&
        'description' in schema &&
        typeof schema.description === 'string'
          ? schema.description
          : '';
      return description ? `${name}: ${description}` : name;
    })
    .join('; ');
}

function orderedToolsArePresent(
  actualTools: readonly string[],
  requiredTools: readonly string[],
): boolean {
  let searchFrom = 0;
  for (const requiredTool of requiredTools) {
    const index = actualTools.indexOf(requiredTool, searchFrom);
    if (index === -1) return false;
    searchFrom = index + 1;
  }
  return true;
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required for the live MCP tool-selection eval.',
    );
  }

  const model =
    process.env.MCP_TOOL_SELECTION_EVAL_MODEL ??
    process.env.CATEGORIZATION_RULE_RECOMMENDER_MODEL ??
    'gpt-5.4-mini';
  const knownTools = new Set(
    spliceMcpDefinition.tools.map((tool) => tool.name),
  );
  const catalog = spliceMcpDefinition.tools
    .map((tool) => {
      const fields = inputFieldDescriptions(tool.inputSchema);
      return [
        `- ${tool.name}: ${tool.description}`,
        fields ? `  Inputs: ${fields}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  const agent = new Agent({
    id: 'splice-mcp-tool-selection-eval',
    name: 'Splice MCP tool-selection eval',
    description: 'Plans tool usage from the published Splice MCP catalog.',
    instructions: [
      'Act as a general-purpose assistant selecting from the supplied MCP tool catalog.',
      'Return the ordered tool calls needed to answer the user; return an empty list when no personal-data tool is appropriate.',
      'Honor explicit prose-only/no-UI instructions and every inclusion or exclusion in the tool descriptions.',
      'For relative or year-ambiguous dates, plan get_user_context before any date-range tool.',
      'Set direction only on a visualize_cash_flow step; otherwise use null.',
      'Do not add tools merely because they are available.',
    ].join(' '),
    model: openai(model),
  });

  const failures: string[] = [];
  for (const evalCase of CASH_FLOW_TOOL_SELECTION_EVALS) {
    const result = await agent.generate(
      [
        {
          role: 'user',
          content: [
            'Today for this deterministic selection eval is 2026-08-17.',
            `User request: ${evalCase.prompt}`,
            'Available tools:',
            catalog,
          ].join('\n\n'),
        },
      ],
      {
        structuredOutput: { schema: ToolSelectionPlanSchema },
      },
    );
    const plan: ToolSelectionPlan = ToolSelectionPlanSchema.parse(
      result.object,
    );
    const actualTools = plan.steps.map(({ tool }) => tool);
    const unknownTools = actualTools.filter((tool) => !knownTools.has(tool));
    const forbiddenTools = evalCase.forbiddenTools.filter((tool) =>
      actualTools.includes(tool),
    );
    const visualStep = plan.steps.find(
      ({ tool }) => tool === 'visualize_cash_flow',
    );
    const directionMatches = evalCase.expectedDirection
      ? visualStep?.direction === evalCase.expectedDirection
      : true;
    const passed =
      unknownTools.length === 0 &&
      forbiddenTools.length === 0 &&
      orderedToolsArePresent(actualTools, evalCase.requiredToolsInOrder) &&
      directionMatches;

    process.stdout.write(
      `${passed ? 'PASS' : 'FAIL'} ${evalCase.id}: ${actualTools.join(' -> ') || '(no tools)'}\n`,
    );
    if (!passed) {
      failures.push(
        `${evalCase.id} selected [${actualTools.join(', ')}], expected ordered [${evalCase.requiredToolsInOrder.join(', ')}], forbidden [${evalCase.forbiddenTools.join(', ')}]${evalCase.expectedDirection ? `, direction ${evalCase.expectedDirection}` : ''}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Tool-selection eval failures:\n${failures.join('\n')}`);
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Unknown tool-selection eval failure'}\n`,
  );
  process.exitCode = 1;
});
