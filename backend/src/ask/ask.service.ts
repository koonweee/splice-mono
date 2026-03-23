import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AskQueryService } from './ask-query.service';
import type { AskAnswer } from './ask.types';
import { AskAnswerSchema } from './ask.types';

function buildAskSystemPrompt(now = new Date()): string {
  const today = now.toISOString().slice(0, 10);

  return `
You answer questions about the user's finances using the provided tools only.
Today is ${today}. Resolve relative dates like "last month", "this month", and "yesterday" against that date.
Be concise, state the scope you used, and never invent transactions or balances.
If the question is ambiguous, pick a conservative interpretation and say what you assumed.
Use summarize_transactions for spending, expenditure, outflow, or total spend questions.
Use compare_periods for questions about increases, decreases, changes, or comparing time periods.
Use search_transactions for merchant-level lookups, examples, or specific transaction searches.
Use get_accounts_snapshot only for balance, cash position, or account inventory questions.
`;
}

type AskRequest = {
  messages: UIMessage[];
};

type AskMessageMetadata = {
  ask?: AskAnswer;
};

type AskUIMessage = UIMessage<AskMessageMetadata>;

@Injectable()
export class AskService {
  constructor(private readonly askQueryService: AskQueryService) {}

  buildFinalAnswer(
    input: Omit<AskAnswer, 'confidence'> & {
      confidence?: AskAnswer['confidence'];
    },
  ): AskAnswer {
    return AskAnswerSchema.parse({
      answerText: input.answerText,
      confidence: input.confidence ?? 'high',
      queryScope: input.queryScope,
      evidence: {
        accounts: input.evidence.accounts.slice(0, 10),
        transactions: input.evidence.transactions.slice(0, 20),
        aggregates: input.evidence.aggregates.slice(0, 10),
        matchedCount: input.evidence.matchedCount,
        truncated: input.evidence.truncated,
      },
      followups: input.followups.slice(0, 3),
    });
  }

  async streamChat(
    userId: string,
    body: AskRequest,
    response: Response,
  ): Promise<void> {
    let finalAnswer: AskAnswer | undefined;
    let latestQueryScope: AskAnswer['queryScope'] = {
      accountIds: [],
      includePending: false,
      truncated: false,
    };
    const originalMessages = body.messages as AskUIMessage[];

    const result = streamText({
      model: openai(process.env.OPENAI_MODEL ?? 'gpt-5.4-mini'),
      stopWhen: stepCountIs(5),
      prepareStep: ({ stepNumber }) => {
        if (stepNumber === 0) {
          return {
            toolChoice: 'required' as const,
          };
        }

        return {};
      },
      providerOptions: {
        openai: {
          reasoningEffort: 'high',
        },
      },
      system: buildAskSystemPrompt(),
      messages: await convertToModelMessages(originalMessages),
      tools: {
        get_accounts_snapshot: tool({
          description:
            'Get a user-scoped snapshot of their accounts and balances.',
          inputSchema: z.object({}),
          execute: async () => {
            latestQueryScope = {
              accountIds: [],
              includePending: false,
              truncated: false,
            };
            return this.askQueryService.getAccountsSnapshot(userId);
          },
        }),
        search_transactions: tool({
          description:
            'Search for transactions by merchant, dates, account, category, amount, and pending state.',
          inputSchema: z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            accountIds: z.array(z.string()).optional(),
            categoryPrimary: z.string().optional(),
            merchantQuery: z.string().optional(),
            minAmount: z.number().optional(),
            maxAmount: z.number().optional(),
            sign: z.enum(['positive', 'negative']).optional(),
            includePending: z.boolean().optional(),
            limit: z.number().int().positive().max(20).optional(),
          }),
          execute: async (input) => {
            latestQueryScope = {
              startDate: input.startDate,
              endDate: input.endDate,
              accountIds: input.accountIds ?? [],
              includePending: input.includePending ?? false,
              truncated: false,
            };
            return this.askQueryService.searchTransactions(userId, input);
          },
        }),
        summarize_transactions: tool({
          description:
            'Summarize transactions over a date range with category, merchant, account, and recurring drivers.',
          inputSchema: z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            accountIds: z.array(z.string()).optional(),
            includePending: z.boolean().optional(),
            recurringOnly: z.boolean().optional(),
          }),
          execute: async (input) => {
            latestQueryScope = {
              startDate: input.startDate,
              endDate: input.endDate,
              accountIds: input.accountIds ?? [],
              includePending: input.includePending ?? false,
              truncated: false,
            };
            return this.askQueryService.summarizeTransactions(userId, input);
          },
        }),
        compare_periods: tool({
          description:
            'Compare current and previous periods and return the main category, merchant, and account deltas.',
          inputSchema: z.object({
            currentStartDate: z.string(),
            currentEndDate: z.string(),
            previousStartDate: z.string(),
            previousEndDate: z.string(),
            accountIds: z.array(z.string()).optional(),
            includePending: z.boolean().optional(),
          }),
          execute: async (input) => {
            latestQueryScope = {
              startDate: input.currentStartDate,
              endDate: input.currentEndDate,
              comparisonStartDate: input.previousStartDate,
              comparisonEndDate: input.previousEndDate,
              accountIds: input.accountIds ?? [],
              includePending: input.includePending ?? false,
              truncated: false,
            };
            return this.askQueryService.comparePeriods(userId, input);
          },
        }),
      },
      onFinish: ({ text, steps }) => {
        const lastToolResult = [...steps]
          .reverse()
          .flatMap((step) => step.toolResults)
          .find((result) => result.output);

        const evidenceSource =
          (lastToolResult?.output as
            | {
                accounts?: AskAnswer['evidence']['accounts'];
                transactions?: AskAnswer['evidence']['transactions'];
                topCategories?: AskAnswer['evidence']['aggregates'];
                topMerchants?: AskAnswer['evidence']['aggregates'];
                topAccounts?: AskAnswer['evidence']['aggregates'];
                matchedCount?: number;
                truncated?: boolean;
              }
            | undefined) ?? {};

        finalAnswer = this.buildFinalAnswer({
          answerText: text,
          queryScope: {
            ...latestQueryScope,
            truncated: Boolean(evidenceSource.truncated),
          },
          evidence: {
            accounts: evidenceSource.accounts ?? [],
            transactions: evidenceSource.transactions ?? [],
            aggregates: [
              ...(evidenceSource.topCategories ?? []),
              ...(evidenceSource.topMerchants ?? []),
              ...(evidenceSource.topAccounts ?? []),
            ],
            matchedCount: evidenceSource.matchedCount ?? 0,
            truncated: Boolean(evidenceSource.truncated),
          },
          followups: [],
        });
      },
    });

    pipeUIMessageStreamToResponse({
      response,
      stream: result.toUIMessageStream<AskUIMessage>({
        originalMessages,
        messageMetadata: ({ part }) =>
          part.type === 'finish' && finalAnswer
            ? { ask: finalAnswer }
            : undefined,
      }),
    });
  }
}
