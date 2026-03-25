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
import type {
  AskAnswer,
  AskEvidenceAccount,
  AskEvidenceAggregate,
  AskEvidenceBalanceHistorySummary,
  AskEvidenceTransaction,
} from './ask.types';
import { AskAnswerSchema, AskSemanticMetadataSchema } from './ask.types';
import {
  MoneyWithSignSchema,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

function buildAskSystemPrompt(now = new Date()): string {
  const today = now.toISOString().slice(0, 10);

  return `
You answer questions about the user's finances using the provided tools only.
Today is ${today}. Resolve relative dates like "last month", "this month", and "yesterday" against that date.
Be concise, state the scope you used, and never invent transactions or balances.
If the question is ambiguous, pick a conservative interpretation and say what you assumed.
Prefer the smallest set of tools needed. Combine tools when a question spans multiple concepts.
Use get_accounts_snapshot only for balance, cash position, or account inventory questions.
Use get_balance_history for balance, net worth, or balance trend questions.
Use search_transactions for merchant lookups, examples, or specific transaction searches.
Use get_cashflow_analysis for why did this change, spending pattern, reconciliation, or change driver questions.
Prefer user-friendly labels unless the user explicitly asks for raw identifiers.
`;
}

type AskRequest = {
  messages: UIMessage[];
};

type AskMessageMetadata = {
  ask?: AskAnswer;
};

type AskUIMessage = UIMessage<AskMessageMetadata>;

interface AskEvidenceAccumulator {
  accounts: Map<string, AskEvidenceAccount>;
  transactions: Map<string, AskEvidenceTransaction>;
  aggregates: Map<string, AskEvidenceAggregate>;
  balanceHistory?: AskEvidenceBalanceHistorySummary;
  matchedCount: number;
  truncated: boolean;
}

interface AskQueryScopeAccumulator {
  scope: AskAnswer['queryScope'];
  usesAllAccounts: boolean;
}

function createAskEvidenceAccumulator(): AskEvidenceAccumulator {
  return {
    accounts: new Map(),
    transactions: new Map(),
    aggregates: new Map(),
    matchedCount: 0,
    truncated: false,
  };
}

function createInitialQueryScope(): AskQueryScopeAccumulator {
  return {
    scope: {
      accountIds: [],
      includePending: false,
      truncated: false,
    },
    usesAllAccounts: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSerializedMoneyWithSign(
  value: unknown,
): value is SerializedMoneyWithSign {
  return MoneyWithSignSchema.safeParse(value).success;
}

function getArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getMatchedCount(value: Record<string, unknown>): number {
  return typeof value.matchedCount === 'number' ? value.matchedCount : 0;
}

function getTruncated(value: Record<string, unknown>): boolean {
  return Boolean(value.truncated);
}

function getAggregateKey(aggregate: AskEvidenceAggregate): string {
  return [
    aggregate.kind,
    aggregate.label,
    aggregate.rawLabel ?? '',
    aggregate.currency,
    aggregate.amount,
  ].join('|');
}

function getEarlierDate(
  left?: string,
  right?: string,
): string | undefined {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return left <= right ? left : right;
}

function getLaterDate(
  left?: string,
  right?: string,
): string | undefined {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return left >= right ? left : right;
}

function mergeQueryScope(
  current: AskQueryScopeAccumulator,
  next: Partial<AskAnswer['queryScope']>,
  nextUsesAllAccounts = false,
): AskQueryScopeAccumulator {
  const usesAllAccounts = current.usesAllAccounts || nextUsesAllAccounts;

  return {
    usesAllAccounts,
    scope: {
      startDate: getEarlierDate(current.scope.startDate, next.startDate),
      endDate: getLaterDate(current.scope.endDate, next.endDate),
      comparisonStartDate: getEarlierDate(
        current.scope.comparisonStartDate,
        next.comparisonStartDate,
      ),
      comparisonEndDate: getLaterDate(
        current.scope.comparisonEndDate,
        next.comparisonEndDate,
      ),
      accountIds: usesAllAccounts
        ? []
        : Array.from(
            new Set([
              ...current.scope.accountIds,
              ...(next.accountIds ?? []),
            ]),
          ),
      includePending:
        current.scope.includePending || Boolean(next.includePending),
      truncated: current.scope.truncated || Boolean(next.truncated),
    },
  };
}

function mergeAccounts(
  accumulator: AskEvidenceAccumulator,
  value: Record<string, unknown>,
): void {
  getArray<Record<string, unknown>>(value.accounts).forEach((account) => {
    const id = typeof account.id === 'string' ? account.id : undefined;
    if (!id || accumulator.accounts.has(id)) {
      return;
    }

    accumulator.accounts.set(id, account as AskEvidenceAccount);
  });
}

function mergeTransactions(
  accumulator: AskEvidenceAccumulator,
  value: Record<string, unknown>,
): void {
  getArray<Record<string, unknown>>(value.transactions).forEach((transaction) => {
    const id = typeof transaction.id === 'string' ? transaction.id : undefined;
    if (!id || accumulator.transactions.has(id)) {
      return;
    }

    accumulator.transactions.set(id, transaction as AskEvidenceTransaction);
  });
}

function mergeAggregates(
  accumulator: AskEvidenceAccumulator,
  value: Record<string, unknown>,
): void {
  const aggregateSources = [
    ...getArray<unknown>(value.aggregates),
    ...getArray<unknown>(value.topCategories),
    ...getArray<unknown>(value.topMerchants),
    ...getArray<unknown>(value.topAccounts),
  ];

  aggregateSources.forEach((aggregate) => {
    if (!isRecord(aggregate)) {
      return;
    }

    const label = typeof aggregate.label === 'string' ? aggregate.label : undefined;
    const currency = typeof aggregate.currency === 'string' ? aggregate.currency : undefined;
    const kind = typeof aggregate.kind === 'string' ? aggregate.kind : undefined;
    const amount = typeof aggregate.amount === 'number' ? aggregate.amount : undefined;

    if (!label || !currency || !kind || amount === undefined) {
      return;
    }

    const normalizedAggregate = aggregate as AskEvidenceAggregate;
    const key = getAggregateKey(normalizedAggregate);
    if (!accumulator.aggregates.has(key)) {
      accumulator.aggregates.set(key, normalizedAggregate);
    }
  });
}

function normalizeBalanceHistoryEvidence(
  value: Record<string, unknown>,
): AskEvidenceBalanceHistorySummary | undefined {
  const currentTotal = value.currentTotal ?? value.netWorth;
  if (!isSerializedMoneyWithSign(currentTotal)) {
    return undefined;
  }

  const previousTotal = isSerializedMoneyWithSign(value.previousTotal)
    ? value.previousTotal
    : undefined;
  const deltaPercent =
    typeof value.deltaPercent === 'number'
      ? value.deltaPercent
      : typeof value.changePercent === 'number'
        ? value.changePercent
        : undefined;
  const pointCount =
    typeof value.pointCount === 'number'
      ? value.pointCount
      : getArray<unknown>(value.series).length ||
        getArray<unknown>(value.chartData).length ||
        getArray<unknown>(value.assets).length +
          getArray<unknown>(value.liabilities).length;

  const semanticMetadata = AskSemanticMetadataSchema.parse(
    isRecord(value.semanticMetadata)
      ? value.semanticMetadata
      : {
          pendingIncluded: false,
          reconciliationApplied: true,
          comparisonIncluded: false,
      },
  );

  const matchedCount =
    getMatchedCount(value) ||
    getArray<unknown>(value.series).length ||
    getArray<unknown>(value.chartData).length ||
    getArray<unknown>(value.assets).length +
      getArray<unknown>(value.liabilities).length;

  return {
    matchedCount,
    truncated: getTruncated(value),
    currentTotal,
    previousTotal,
    deltaPercent,
    pointCount,
    semanticMetadata,
  };
}

function mergeEvidence(
  accumulator: AskEvidenceAccumulator,
  output: unknown,
): void {
  if (!isRecord(output)) {
    return;
  }

  const balanceHistory = normalizeBalanceHistoryEvidence(output);
  const matchedCount = getMatchedCount(output) || balanceHistory?.matchedCount || 0;

  accumulator.matchedCount += matchedCount;
  accumulator.truncated =
    accumulator.truncated ||
    getTruncated(output) ||
    Boolean(balanceHistory?.truncated);

  mergeAccounts(accumulator, output);
  mergeTransactions(accumulator, output);
  mergeAggregates(accumulator, output);

  if (balanceHistory) {
    accumulator.balanceHistory = balanceHistory;
  }
}

@Injectable()
export class AskService {
  constructor(private readonly askQueryService: AskQueryService) {}

  buildFinalAnswer(
    input: Omit<AskAnswer, 'confidence'> & {
      confidence?: AskAnswer['confidence'];
    },
  ): AskAnswer {
    const accounts = input.evidence.accounts.slice(0, 10);
    const transactions = input.evidence.transactions.slice(0, 20);
    const aggregates = input.evidence.aggregates.slice(0, 10);
    const followups = input.followups.slice(0, 3);
    const askSideTruncated =
      accounts.length < input.evidence.accounts.length ||
      transactions.length < input.evidence.transactions.length ||
      aggregates.length < input.evidence.aggregates.length ||
      followups.length < input.followups.length;
    const finalTruncated =
      input.queryScope.truncated ||
      input.evidence.truncated ||
      input.evidence.balanceHistory?.truncated ||
      askSideTruncated ||
      false;

    return AskAnswerSchema.parse({
      answerText: input.answerText,
      confidence: input.confidence ?? 'high',
      queryScope: {
        ...input.queryScope,
        truncated: Boolean(finalTruncated),
      },
      evidence: {
        accounts,
        transactions,
        balanceHistory: input.evidence.balanceHistory,
        aggregates,
        matchedCount: input.evidence.matchedCount,
        truncated: Boolean(finalTruncated),
      },
      followups,
    });
  }

  async streamChat(
    userId: string,
    body: AskRequest,
    response: Response,
  ): Promise<void> {
    let finalAnswer: AskAnswer | undefined;
    let queryScope = createInitialQueryScope();
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
            'Get a user-scoped snapshot of their current accounts and balances.',
          inputSchema: z.object({}),
          execute: async () => {
            const output = await this.askQueryService.getAccountsSnapshot(userId);
            queryScope = mergeQueryScope(queryScope, {}, true);
            return output;
          },
        }),
        get_balance_history: tool({
          description:
            'Get balance history, net worth, and over-time change for a date range.',
          inputSchema: z.object({
            startDate: z.string(),
            endDate: z.string(),
            accountIds: z.array(z.string()).optional(),
          }),
          execute: async (input) => {
            const output = await this.askQueryService.getBalanceHistory(
              userId,
              input,
            );
            queryScope = mergeQueryScope(
              queryScope,
              {
                startDate: input.startDate,
                endDate: input.endDate,
                accountIds: input.accountIds,
                includePending: false,
                truncated: false,
              },
              !input.accountIds?.length,
            );
            return output;
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
            const output = await this.askQueryService.searchTransactions(
              userId,
              input,
            );
            queryScope = mergeQueryScope(
              queryScope,
              {
                startDate: input.startDate,
                endDate: input.endDate,
                accountIds: input.accountIds,
                includePending: input.includePending ?? false,
                truncated: false,
              },
              !input.accountIds?.length,
            );
            return output;
          },
        }),
        get_cashflow_analysis: tool({
          description:
            'Get spending totals, category breakdowns, inflow/outflow summaries, and why-did-this-change analysis.',
          inputSchema: z.object({
            startDate: z.string(),
            endDate: z.string(),
          }),
          execute: async (input) => {
            const output = await this.askQueryService.getCashflowAnalysis(
              userId,
              input,
            );
            queryScope = mergeQueryScope(
              queryScope,
              {
                startDate: input.startDate,
                endDate: input.endDate,
                includePending: false,
                truncated: false,
              },
              true,
            );
            return output;
          },
        }),
      },
      onFinish: ({ text, steps }) => {
        const evidence = createAskEvidenceAccumulator();

        steps.forEach((step) => {
          step.toolResults.forEach((toolResult) => {
            if (toolResult.output) {
              mergeEvidence(evidence, toolResult.output);
            }
          });
        });

        finalAnswer = this.buildFinalAnswer({
          answerText: text,
          queryScope: {
            ...queryScope.scope,
            truncated: evidence.truncated,
          },
          evidence: {
            accounts: Array.from(evidence.accounts.values()),
            transactions: Array.from(evidence.transactions.values()),
            balanceHistory: evidence.balanceHistory,
            aggregates: Array.from(evidence.aggregates.values()),
            matchedCount: evidence.matchedCount,
            truncated: evidence.truncated,
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
