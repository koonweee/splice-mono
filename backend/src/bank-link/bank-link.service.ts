import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { In, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  LinkedAccountCreatedEvent,
  LinkedAccountEvents,
  LinkedAccountUpdatedEvent,
} from '../events/account.events';
import {
  BankLinkEvents,
  BankLinkNeedsAttentionEvent,
} from '../events/bank-link.events';
import { InvestmentService } from '../investment/investment.service';
import { TransactionService } from '../transaction/transaction.service';
import type { Account, CreateAccountDto } from '../types/Account';
import type {
  APIAccount,
  CreateBankLinkDto,
  InitiateLinkResponse,
  LinkCompletionResponse,
  SanitizedBankLink,
  UpdateBankLinkDto,
} from '../types/BankLink';
import type {
  InvestmentHoldingsSyncResult,
  InvestmentTransactionsSyncResult,
} from '../types/Investment';
import { UserService } from '../user/user.service';
import { WebhookEventService } from '../webhook-event/webhook-event.service';
import { BankLinkEntity } from './bank-link.entity';
import type { IBankLinkProvider } from './providers/bank-link-provider.interface';
import { ProviderRegistry } from './providers/provider.registry';

type LinkConversionContext = {
  mode: 'convert-manual-account';
  convertAccountId: string;
};

type LinkUpdateContext = {
  mode: 'update-bank-link';
  bankLinkId: string;
};

type LinkFlowContext = LinkConversionContext | LinkUpdateContext;

const INVESTMENT_ACCOUNT_TYPES = ['investment', 'brokerage'];
const INVESTMENT_TRANSACTION_LOOKBACK_DAYS = 730;

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Orchestrates bank account linking across multiple providers
 * Manages the lifecycle: initiation -> webhook -> completion
 */
@Injectable()
export class BankLinkService extends OwnedCrudService<
  BankLinkEntity,
  SanitizedBankLink,
  CreateBankLinkDto,
  UpdateBankLinkDto
> {
  protected readonly logger = new Logger(BankLinkService.name);
  protected readonly entityName = 'BankLink';
  protected readonly EntityClass = BankLinkEntity;

  constructor(
    @InjectRepository(BankLinkEntity)
    bankLinkRepository: Repository<BankLinkEntity>,
    private providerRegistry: ProviderRegistry,
    private webhookEventService: WebhookEventService,
    @InjectRepository(AccountEntity)
    private accountRepository: Repository<AccountEntity>,
    private eventEmitter: EventEmitter2,
    private userService: UserService,
    private transactionService: TransactionService,
    private investmentService: InvestmentService,
  ) {
    super(bankLinkRepository);
  }

  protected applyUpdate(entity: BankLinkEntity, dto: UpdateBankLinkDto): void {
    if (dto.providerName !== undefined) {
      entity.providerName = dto.providerName;
    }
    if (dto.authentication !== undefined) {
      entity.authentication = dto.authentication;
    }
    if (dto.accountIds !== undefined) {
      entity.accountIds = dto.accountIds;
    }
  }

  /**
   * Step 1: Initiate bank account linking
   * Creates a pending webhook event and returns link info for frontend
   *
   * For webhook-based providers (Plaid): Returns link URL, creates pending webhook
   * For immediate providers (crypto): Creates accounts immediately, returns empty response
   *
   * @param providerName - Provider to use (e.g., 'plaid', 'crypto')
   * @param userId - User initiating the link
   * @param redirectUri - Optional redirect after linking
   * @param walletAddress - Optional wallet address for crypto providers
   * @param network - Optional network for crypto providers
   * @returns Link information for frontend
   */
  async initiateLinking(
    providerName: string,
    userId: string,
    redirectUri?: string,
    walletAddress?: string,
    network?: string,
    bankLinkId?: string,
    convertAccountId?: string,
  ): Promise<InitiateLinkResponse> {
    this.logger.log(
      { providerName, userId, bankLinkId, convertAccountId },
      'Initiating link with provider',
    );

    if (bankLinkId && convertAccountId) {
      throw new BadRequestException(
        'bankLinkId and convertAccountId cannot be used together',
      );
    }
    if (convertAccountId && providerName !== 'plaid') {
      throw new BadRequestException(
        'Manual account conversion is currently only supported for Plaid',
      );
    }

    // Get provider
    const provider = this.providerRegistry.getProvider(providerName);

    // If bankLinkId is provided, look up existing bank link for update mode
    let accessToken: string | undefined;
    if (bankLinkId) {
      const existingLink = await this.repository.findOne({
        where: { id: bankLinkId, userId },
      });
      if (!existingLink) {
        throw new Error(`Bank link not found: ${bankLinkId}`);
      }
      accessToken = existingLink.authentication?.accessToken as
        | string
        | undefined;
      this.logger.log(
        { bankLinkId },
        'Using existing bank link for update mode',
      );
    }

    let linkFlowContext: LinkFlowContext | undefined;
    if (bankLinkId) {
      linkFlowContext = { mode: 'update-bank-link', bankLinkId };
    }
    if (convertAccountId) {
      const accountToConvert = await this.accountRepository.findOne({
        where: { id: convertAccountId, userId },
      });
      if (!accountToConvert) {
        throw new NotFoundException(
          `Account with id ${convertAccountId} not found`,
        );
      }
      if (accountToConvert.bankLinkId) {
        throw new BadRequestException(
          `Account with id ${convertAccountId} is already linked`,
        );
      }

      linkFlowContext = {
        mode: 'convert-manual-account',
        convertAccountId,
      };
    }

    // Build provider user details
    // For crypto: use wallet params directly
    // For others: fetch existing provider-specific user details
    const providerUserDetails =
      walletAddress && network
        ? { walletAddress, network }
        : await this.userService.getProviderDetails(userId, providerName);

    // Call provider to get link URL/token
    const linkResponse = await provider.initiateLinking({
      userId,
      redirectUri,
      providerUserDetails,
      accessToken,
      singleAccountSelect: linkFlowContext?.mode === 'convert-manual-account',
    });

    // If provider returned updated user details, persist them
    if (linkResponse.updatedProviderUserDetails) {
      await this.userService.updateProviderDetails(
        userId,
        providerName,
        linkResponse.updatedProviderUserDetails,
      );
      this.logger.log(
        { userId, providerName },
        'Updated provider details for user',
      );
    }

    // Handle immediate account creation (crypto flow)
    if (linkResponse.immediateAccounts) {
      await this.createAccountsFromLinkCompletion(
        providerName,
        userId,
        linkResponse.immediateAccounts,
        this.getConversionContext(linkFlowContext),
      );
      // Return empty response (accounts created, no redirect needed)
      return {};
    }

    // Create pending webhook event to track this link request
    // The webhookId (e.g., link_token for Plaid) will be used to correlate the webhook callback
    if (linkResponse.webhookId) {
      await this.webhookEventService.createPending(
        linkResponse.webhookId,
        providerName,
        userId,
        linkResponse.expiresAt,
        linkFlowContext,
      );
      this.logger.log(
        { webhookId: linkResponse.webhookId },
        'Created pending webhook event',
      );
    }

    return linkResponse;
  }

  /**
   * Create BankLinks and Accounts from link completion responses
   * Used for both webhook-based and immediate linking flows
   */
  private async createAccountsFromLinkCompletion(
    providerName: string,
    userId: string,
    linkCompletionResponses: LinkCompletionResponse[],
    conversionContext?: LinkConversionContext,
  ): Promise<void> {
    this.logger.log(
      { providerName, userId, responseCount: linkCompletionResponses.length },
      'Creating accounts from link completion',
    );

    if (conversionContext) {
      await this.convertManualAccountFromLinkCompletion(
        providerName,
        userId,
        linkCompletionResponses,
        conversionContext,
      );
      return;
    }

    const savedBankLinks: BankLinkEntity[] = [];

    // For each response, check if a bank link already exists (by itemId) or create a new one
    for (const response of linkCompletionResponses) {
      savedBankLinks.push(
        await this.saveBankLinkFromLinkCompletionResponse(
          providerName,
          userId,
          response,
        ),
      );
    }

    this.logger.log({ count: savedBankLinks.length }, 'Saved bank links');

    // Upsert accounts for each bank link using the shared method
    for (let i = 0; i < linkCompletionResponses.length; i++) {
      const response = linkCompletionResponses[i];
      const bankLink = savedBankLinks[i];

      const accountIdToBankLinkId = new Map<string, string>();
      response.accounts.forEach((a) => {
        accountIdToBankLinkId.set(a.accountId, bankLink.id);
      });

      await this.upsertAccountsFromAPI(
        response.accounts,
        accountIdToBankLinkId,
        userId,
      );
    }

    // Trigger initial transaction sync for each new bank link
    const provider = this.providerRegistry.getProvider(providerName);
    if (provider.syncTransactions) {
      const syncResults = await Promise.allSettled(
        savedBankLinks.map((bankLink) =>
          this.syncTransactions(bankLink.id, userId),
        ),
      );
      syncResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            {
              bankLinkId: savedBankLinks[index].id,
              error: String(result.reason),
            },
            'Failed initial transaction sync for new bank link',
          );
        }
      });
    }

    if (provider.syncInvestmentHoldings) {
      const holdingsResults = await Promise.allSettled(
        savedBankLinks.map((bankLink) =>
          this.syncInvestmentHoldings(bankLink.id, userId),
        ),
      );
      holdingsResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            {
              bankLinkId: savedBankLinks[index].id,
              error: String(result.reason),
            },
            'Failed initial investment holdings sync for new bank link',
          );
        }
      });
    }

    if (provider.syncInvestmentTransactions) {
      const investmentTransactionResults = await Promise.allSettled(
        savedBankLinks.map((bankLink) =>
          this.syncInvestmentTransactions(bankLink.id, userId),
        ),
      );
      investmentTransactionResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            {
              bankLinkId: savedBankLinks[index].id,
              error: String(result.reason),
            },
            'Failed initial investment transaction sync for new bank link',
          );
        }
      });
    }
  }

  /**
   * Handle webhook from provider
   * Routes to appropriate handler based on webhook type:
   * - Update webhooks (DEFAULT_UPDATE): Trigger account sync for existing bank links
   * - Link completion webhooks (SESSION_FINISHED): Finalize new bank link setup
   *
   * @param providerName - Provider sending webhook
   * @param rawBody - Raw webhook body as string (for signature verification)
   * @param headers - HTTP headers from the request
   * @param parsedPayload - Parsed webhook body
   */
  async handleWebhook(
    providerName: string,
    rawBody: string,
    headers: Record<string, string>,
    parsedPayload: Record<string, any>,
  ): Promise<void> {
    this.logger.log(
      {
        providerName,
        webhookType: parsedPayload.webhook_type as string | undefined,
        webhookCode: parsedPayload.webhook_code as string | undefined,
        itemId: parsedPayload.item_id as string | undefined,
      },
      'Received webhook from provider',
    );

    const provider = this.providerRegistry.getProvider(providerName);

    // Verify webhook signature before processing
    const isValid = await provider.verifyWebhook(rawBody, headers);
    if (!isValid) {
      this.logger.warn({ providerName }, 'Webhook verification failed');
      throw new UnauthorizedException('Invalid webhook signature');
    }
    this.logger.log({ providerName }, 'Webhook verified successfully');

    // Route to appropriate handler based on webhook type

    // 1. Check for status webhooks (ERROR, LOGIN_REPAIRED, etc.)
    if (provider.parseStatusWebhook) {
      const statusInfo = provider.parseStatusWebhook(parsedPayload);
      if (statusInfo) {
        await this.handleStatusWebhook(statusInfo, parsedPayload);
        return;
      }
    }

    // 2. Check for update webhooks (DEFAULT_UPDATE)
    if (provider.parseUpdateWebhook) {
      const updateInfo = provider.parseUpdateWebhook(parsedPayload);
      if (updateInfo) {
        await this.handleUpdateWebhook(updateInfo, parsedPayload);
        return;
      }
    }

    // 3. Check for link completion webhooks (SESSION_FINISHED)
    if (provider.parseLinkCompletionWebhook) {
      const linkInfo = provider.parseLinkCompletionWebhook(parsedPayload);
      if (linkInfo) {
        await this.handleLinkCompletionWebhook(
          providerName,
          provider,
          linkInfo.linkToken,
          parsedPayload,
        );
        return;
      }
    }

    this.logger.log(
      {
        providerName,
        webhookType: parsedPayload.webhook_type as string | undefined,
        webhookCode: parsedPayload.webhook_code as string | undefined,
      },
      'Webhook not a processable type, skipping',
    );
  }

  /**
   * Handle update webhooks (e.g., Plaid DEFAULT_UPDATE for transactions/investments)
   * Triggers account sync for the bank link associated with the item
   * Includes time-based deduplication to prevent redundant syncs from webhook retries
   */
  private async handleUpdateWebhook(
    updateInfo: {
      itemId: string;
      type: string;
    },
    parsedPayload: Record<string, any>,
  ): Promise<void> {
    this.logger.log(
      { type: updateInfo.type, itemId: updateInfo.itemId },
      'Processing update webhook',
    );

    const bankLink = await this.findByPlaidItemId(updateInfo.itemId);
    if (!bankLink) {
      this.logger.warn(
        { itemId: updateInfo.itemId },
        'No bank link found for item',
      );
      return;
    }

    // Deduplicate using composite key with 5-minute window
    const baseWebhookId = `plaid:${updateInfo.type}:DEFAULT_UPDATE:${updateInfo.itemId}`;
    const result = await this.webhookEventService.tryAcquireWebhook(
      baseWebhookId,
      'plaid',
      bankLink.userId,
      parsedPayload,
      5 * 60 * 1000, // 5 minutes
    );

    if (!result.acquired) {
      this.logger.log(
        { baseWebhookId, reason: result.reason },
        'Skipping duplicate update webhook',
      );
      return;
    }

    await this.syncAccounts(bankLink.id, bankLink.userId);
    this.logger.log(
      { bankLinkId: bankLink.id },
      'Synced accounts for bank link',
    );

    if (updateInfo.type === 'HOLDINGS') {
      try {
        await this.syncInvestmentHoldings(bankLink.id, bankLink.userId);
        this.logger.log(
          { bankLinkId: bankLink.id },
          'Synced investment holdings for bank link',
        );
      } catch (error) {
        this.logger.error(
          {
            bankLinkId: bankLink.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to sync investment holdings for bank link',
        );
      }
    }

    if (updateInfo.type === 'INVESTMENTS_TRANSACTIONS') {
      try {
        await this.syncInvestmentTransactions(bankLink.id, bankLink.userId);
        this.logger.log(
          { bankLinkId: bankLink.id },
          'Synced investment transactions for bank link',
        );
      } catch (error) {
        this.logger.error(
          {
            bankLinkId: bankLink.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to sync investment transactions for bank link',
        );
      }
    }

    // Also sync transactions if this is a TRANSACTIONS webhook
    if (updateInfo.type === 'TRANSACTIONS') {
      try {
        await this.syncTransactions(bankLink.id, bankLink.userId);
        this.logger.log(
          { bankLinkId: bankLink.id },
          'Synced transactions for bank link',
        );
      } catch (error) {
        this.logger.error(
          {
            bankLinkId: bankLink.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to sync transactions for bank link',
        );
      }
    }
  }

  /**
   * Handle status webhooks (e.g., Plaid ITEM webhooks: ERROR, LOGIN_REPAIRED, etc.)
   * Updates bank link status, statusDate, and statusBody fields
   * Optionally triggers account sync (e.g., after LOGIN_REPAIRED)
   * Includes time-based deduplication to prevent redundant updates from webhook retries
   */
  private async handleStatusWebhook(
    statusInfo: {
      itemId: string;
      webhookCode: string;
      status: 'OK' | 'ERROR' | 'PENDING_REAUTH';
      statusBody: Record<string, any> | null;
      shouldSync: boolean;
    },
    parsedPayload: Record<string, any>,
  ): Promise<void> {
    this.logger.log(
      { webhookCode: statusInfo.webhookCode, itemId: statusInfo.itemId },
      'Processing ITEM status webhook',
    );

    const bankLink = await this.findByPlaidItemId(statusInfo.itemId);
    if (!bankLink) {
      this.logger.warn(
        { itemId: statusInfo.itemId },
        'No bank link found for item',
      );
      return;
    }

    // Deduplicate using composite key with 1-minute window
    const baseWebhookId = `plaid:ITEM:${statusInfo.webhookCode}:${statusInfo.itemId}`;
    const result = await this.webhookEventService.tryAcquireWebhook(
      baseWebhookId,
      'plaid',
      bankLink.userId,
      parsedPayload,
      1 * 60 * 1000, // 1 minute
    );

    if (!result.acquired) {
      this.logger.log(
        { baseWebhookId, reason: result.reason },
        'Skipping duplicate status webhook',
      );
      return;
    }

    const previousStatus = bankLink.status;
    let statusBody = statusInfo.statusBody;
    const provider = this.providerRegistry.getProvider(bankLink.providerName);
    if (statusInfo.status !== 'OK' && provider.getConnectionDiagnostics) {
      try {
        const diagnostics = await provider.getConnectionDiagnostics(
          bankLink.authentication,
        );
        const meaningfulDiagnostics = Object.fromEntries(
          Object.entries(diagnostics).filter(
            ([, value]) => value !== null && value !== undefined,
          ),
        );
        statusBody = { ...statusBody, ...meaningfulDiagnostics };
      } catch (error) {
        this.logger.warn(
          {
            bankLinkId: bankLink.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to enrich bank link status with provider diagnostics',
        );
      }
    }

    // Update bank link status
    bankLink.status = statusInfo.status;
    bankLink.statusDate = new Date();
    bankLink.statusBody = statusBody;

    await this.repository.save(bankLink);
    this.logger.log(
      { bankLinkId: bankLink.id, status: statusInfo.status },
      'Updated bank link status',
    );

    if (statusInfo.status !== 'OK' && previousStatus !== statusInfo.status) {
      this.eventEmitter.emit(
        BankLinkEvents.NEEDS_ATTENTION,
        new BankLinkNeedsAttentionEvent(
          bankLink.userId,
          bankLink.id,
          bankLink.providerName,
          bankLink.institutionName,
          statusInfo.status,
          statusBody,
          bankLink.statusDate.toISOString(),
        ),
      );
    }

    // Optionally sync accounts after status update (e.g., LOGIN_REPAIRED)
    if (statusInfo.shouldSync) {
      this.logger.log(
        { webhookCode: statusInfo.webhookCode, bankLinkId: bankLink.id },
        'Triggering account sync after status webhook',
      );
      await this.syncAccounts(bankLink.id, bankLink.userId);
    }
  }

  /**
   * Handle link completion webhooks (e.g., Plaid SESSION_FINISHED)
   * Creates new bank links and accounts from the provider response
   */
  private async handleLinkCompletionWebhook(
    providerName: string,
    provider: IBankLinkProvider,
    webhookId: string,
    parsedPayload: Record<string, any>,
  ): Promise<void> {
    this.logger.log({ webhookId }, 'Processing link completion webhook');

    // Look up pending webhook event by webhookId to get userId
    const pendingEvent =
      await this.webhookEventService.findPendingByWebhookId(webhookId);
    if (!pendingEvent) {
      this.logger.warn(
        { webhookId },
        'No pending webhook event found. Either already processed, expired, or initiation was never called.',
      );
      return;
    }

    const userId = pendingEvent.userId;
    const linkFlowContext = this.parseLinkFlowContext(pendingEvent.context);
    this.logger.log({ webhookId, userId }, 'Found pending webhook event');

    try {
      if (linkFlowContext?.mode === 'update-bank-link') {
        await this.completeBankLinkUpdate(linkFlowContext.bankLinkId, userId);
        await this.webhookEventService.markCompleted(webhookId, parsedPayload);
        this.logger.log(
          { webhookId, bankLinkId: linkFlowContext.bankLinkId },
          'Bank link update completed',
        );
        return;
      }

      if (!provider.processLinkCompletion) {
        this.logger.warn(
          { providerName },
          'Provider does not support processLinkCompletion',
        );
        await this.webhookEventService.markFailed(
          webhookId,
          'Provider does not support processLinkCompletion',
          parsedPayload,
        );
        return;
      }

      const linkCompletionResponses =
        await provider.processLinkCompletion(parsedPayload);

      // Use shared method to create bank links and accounts
      await this.createAccountsFromLinkCompletion(
        providerName,
        userId,
        linkCompletionResponses,
        this.getConversionContext(linkFlowContext),
      );

      // Mark webhook event as completed
      await this.webhookEventService.markCompleted(webhookId, parsedPayload);
      this.logger.log({ webhookId }, 'Webhook processing completed');
    } catch (error) {
      // Mark webhook event as failed
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.webhookEventService.markFailed(
        webhookId,
        errorMessage,
        parsedPayload,
      );
      this.logger.error(
        { webhookId, error: errorMessage },
        'Webhook processing failed',
      );
      throw error;
    }
  }

  /**
   * Sync accounts for all bank links for a user
   *
   * @param userId - ID of the user whose bank links to sync
   * @returns Updated accounts from all bank links
   */
  async syncAllAccounts(userId: string): Promise<Account[]> {
    this.logger.log({ userId }, 'Syncing accounts for all bank links');

    const bankLinks = await this.repository.find({
      where: { userId },
    });
    this.logger.log({ count: bankLinks.length }, 'Found bank links to sync');

    const results = await Promise.allSettled(
      bankLinks.map((bankLink) => this.syncAccounts(bankLink.id, userId)),
    );

    const allAccounts: Account[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allAccounts.push(...result.value);
      } else {
        this.logger.error(
          { bankLinkId: bankLinks[index].id, error: String(result.reason) },
          'Failed to sync accounts for bank link',
        );
      }
    });

    this.logger.log({ count: allAccounts.length }, 'Synced accounts total');
    return allAccounts;
  }

  /**
   * Sync transactions for all bank links for a user
   * Used to backfill transactions for existing Plaid links that were created
   * before transaction sync was implemented
   *
   * @param userId - ID of the user whose bank links to sync transactions for
   * @returns Counts of synced and failed bank links
   */
  async syncAllTransactions(
    userId: string,
  ): Promise<{ synced: number; failed: number }> {
    this.logger.log({ userId }, 'Syncing transactions for all bank links');

    const bankLinks = await this.repository.find({
      where: { userId },
    });
    this.logger.log(
      { count: bankLinks.length },
      'Found bank links for transaction sync',
    );

    let synced = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      bankLinks.map((bankLink) => this.syncTransactions(bankLink.id, userId)),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        synced++;
      } else {
        failed++;
        this.logger.error(
          {
            bankLinkId: bankLinks[index].id,
            error: String(result.reason),
          },
          'Failed to sync transactions for bank link',
        );
      }
    });

    this.logger.log(
      { synced, failed, total: bankLinks.length },
      'Transaction sync complete for all bank links',
    );
    return { synced, failed };
  }

  async syncAllInvestmentHoldings(
    userId: string,
  ): Promise<{ synced: number; failed: number; skipped: number }> {
    this.logger.log(
      { userId },
      'Syncing investment holdings for all bank links',
    );

    const bankLinks = await this.repository.find({
      where: { userId },
    });

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    const results = await Promise.allSettled(
      bankLinks.map(async (bankLink) => {
        const provider = this.providerRegistry.getProvider(
          bankLink.providerName,
        );
        if (!provider.syncInvestmentHoldings) {
          return { skipped: true };
        }

        const hasInvestmentAccounts = await this.hasInvestmentAccounts(
          userId,
          bankLink.id,
        );
        if (!hasInvestmentAccounts) {
          this.logger.log(
            { bankLinkId: bankLink.id },
            'Bank link has no investment accounts, skipping holdings sync',
          );
          return { skipped: true };
        }

        await this.syncInvestmentHoldings(bankLink.id, userId);
        return { skipped: false };
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.skipped) {
          skipped++;
        } else {
          synced++;
        }
      } else {
        failed++;
        this.logger.error(
          {
            bankLinkId: bankLinks[index].id,
            error: String(result.reason),
          },
          'Failed to sync investment holdings for bank link',
        );
      }
    });

    this.logger.log(
      { synced, failed, skipped, total: bankLinks.length },
      'Investment holdings sync complete for all bank links',
    );

    return { synced, failed, skipped };
  }

  async syncAllInvestmentTransactions(
    userId: string,
  ): Promise<{ synced: number; failed: number; skipped: number }> {
    this.logger.log(
      { userId },
      'Syncing investment transactions for all bank links',
    );

    const bankLinks = await this.repository.find({
      where: { userId },
    });

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    const results = await Promise.allSettled(
      bankLinks.map(async (bankLink) => {
        const provider = this.providerRegistry.getProvider(
          bankLink.providerName,
        );
        if (!provider.syncInvestmentTransactions) {
          return { skipped: true };
        }

        const hasInvestmentAccounts = await this.hasInvestmentAccounts(
          userId,
          bankLink.id,
        );
        if (!hasInvestmentAccounts) {
          this.logger.log(
            { bankLinkId: bankLink.id },
            'Bank link has no investment accounts, skipping investment transaction sync',
          );
          return { skipped: true };
        }

        await this.syncInvestmentTransactions(bankLink.id, userId);
        return { skipped: false };
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.skipped) {
          skipped++;
        } else {
          synced++;
        }
      } else {
        failed++;
        this.logger.error(
          {
            bankLinkId: bankLinks[index].id,
            error: String(result.reason),
          },
          'Failed to sync investment transactions for bank link',
        );
      }
    });

    this.logger.log(
      { synced, failed, skipped, total: bankLinks.length },
      'Investment transaction sync complete for all bank links',
    );

    return { synced, failed, skipped };
  }

  /**
   * Sync accounts for a bank link by fetching latest data from the provider
   *
   * @param bankLinkId - The ID of the bank link to sync
   * @param userId - ID of the user who owns this bank link
   * @returns Updated accounts
   */
  async syncAccounts(bankLinkId: string, userId: string): Promise<Account[]> {
    // Get bank link entity (scoped by userId)
    const bankLink = await this.repository.findOne({
      where: { id: bankLinkId, userId },
    });
    if (!bankLink) {
      throw new Error(`Bank link not found: ${bankLinkId}`);
    }

    this.logger.log(
      {
        bankLinkId,
        userId,
        providerName: bankLink.providerName,
        institutionName: bankLink.institutionName,
      },
      'Starting account sync for bank link',
    );

    // Get provider
    const provider = this.providerRegistry.getProvider(bankLink.providerName);

    // Fetch accounts and institution info from provider
    const { accounts: apiAccounts, institution } = await provider.getAccounts(
      bankLink.authentication,
    );
    this.logger.log(
      { count: apiAccounts.length, providerName: bankLink.providerName },
      'Fetched accounts from provider',
    );

    // Update bank link institution info if changed
    if (institution) {
      const institutionId = institution.id ?? null;
      const institutionName = institution.name ?? null;
      if (
        bankLink.institutionId !== institutionId ||
        bankLink.institutionName !== institutionName
      ) {
        bankLink.institutionId = institutionId;
        bankLink.institutionName = institutionName;
        await this.repository.save(bankLink);
        this.logger.log(
          { bankLinkId, institutionName, institutionId },
          'Updated institution info for bank link',
        );
      }
    }

    // Create mapping of all external account IDs to this bank link ID
    const accountIdToBankLinkId = new Map<string, string>();
    apiAccounts.forEach((apiAccount) => {
      accountIdToBankLinkId.set(apiAccount.accountId, bankLink.id);
    });

    // Upsert accounts using shared method
    const savedAccounts = await this.upsertAccountsFromAPI(
      apiAccounts,
      accountIdToBankLinkId,
      bankLink.userId,
    );
    this.logger.log({ count: savedAccounts.length }, 'Synced accounts');

    return savedAccounts;
  }

  /**
   * Sync transactions for a bank link using the provider's cursor-based sync API
   * Fetches sync results, maps external account IDs to internal IDs, processes results,
   * and updates the stored cursor
   *
   * @param bankLinkId - The ID of the bank link to sync transactions for
   * @param userId - ID of the user who owns this bank link
   */
  async syncTransactions(bankLinkId: string, userId: string): Promise<void> {
    const bankLink = await this.repository.findOne({
      where: { id: bankLinkId, userId },
    });
    if (!bankLink) {
      throw new Error(`Bank link not found: ${bankLinkId}`);
    }

    const provider = this.providerRegistry.getProvider(bankLink.providerName);
    if (!provider.syncTransactions) {
      this.logger.log(
        { providerName: bankLink.providerName },
        'Provider does not support transaction sync, skipping',
      );
      return;
    }

    // Get current cursor from authentication data
    const currentCursor = bankLink.authentication.nextCursor as
      | string
      | undefined;

    this.logger.log(
      {
        bankLinkId,
        hasCursor: !!currentCursor,
        providerName: bankLink.providerName,
      },
      'Starting transaction sync for bank link',
    );

    // Call provider to get sync results
    const syncResults = await provider.syncTransactions(
      bankLink.authentication,
      currentCursor,
    );

    // Build external account ID -> internal account ID map
    const externalAccountIds = bankLink.accountIds;
    const accounts = await this.accountRepository.find({
      where: {
        externalAccountId: In(externalAccountIds),
        userId,
      },
    });

    const accountIdMap = new Map<string, string>();
    accounts.forEach((account) => {
      if (account.externalAccountId) {
        accountIdMap.set(account.externalAccountId, account.id);
      }
    });

    this.logger.log(
      {
        mappedAccounts: accountIdMap.size,
        totalExternalIds: externalAccountIds.length,
      },
      'Built account ID map for transaction sync',
    );

    // Process sync results (add/modify/remove transactions)
    await this.transactionService.processSyncResults(
      userId,
      accountIdMap,
      syncResults,
    );

    // Update cursor in authentication data
    bankLink.authentication = {
      ...bankLink.authentication,
      nextCursor: syncResults.nextCursor,
    };
    await this.repository.save(bankLink);

    this.logger.log(
      { bankLinkId, newCursor: syncResults.nextCursor },
      'Transaction sync completed, cursor updated',
    );
  }

  async syncInvestmentHoldings(
    bankLinkId: string,
    userId: string,
  ): Promise<InvestmentHoldingsSyncResult> {
    const bankLink = await this.repository.findOne({
      where: { id: bankLinkId, userId },
    });
    if (!bankLink) {
      throw new Error(`Bank link not found: ${bankLinkId}`);
    }

    const provider = this.providerRegistry.getProvider(bankLink.providerName);
    if (!provider.syncInvestmentHoldings) {
      this.logger.log(
        { providerName: bankLink.providerName },
        'Provider does not support investment holdings sync, skipping',
      );
      return {
        accounts: 0,
        securities: 0,
        holdings: 0,
        deletedStaleHoldings: 0,
      };
    }

    const hasInvestmentAccounts = await this.hasInvestmentAccounts(
      userId,
      bankLink.id,
    );
    if (!hasInvestmentAccounts) {
      this.logger.log(
        { bankLinkId },
        'Bank link has no investment accounts, skipping holdings sync',
      );
      return {
        accounts: 0,
        securities: 0,
        holdings: 0,
        deletedStaleHoldings: 0,
      };
    }

    this.logger.log(
      { bankLinkId, providerName: bankLink.providerName },
      'Starting investment holdings sync for bank link',
    );

    const holdingsResponse = await provider.syncInvestmentHoldings(
      bankLink.authentication,
    );
    const accountIdMap = await this.buildExternalAccountIdMap(
      userId,
      bankLink.id,
      holdingsResponse.externalAccountIds,
    );
    const snapshotDate = await this.getSnapshotDate(userId);
    const result = await this.investmentService.upsertPlaidHoldings(
      userId,
      accountIdMap,
      snapshotDate,
      holdingsResponse,
    );

    this.logger.log(
      {
        bankLinkId,
        accountCount: result.accounts,
        securityCount: result.securities,
        holdingCount: result.holdings,
        deletedStaleHoldings: result.deletedStaleHoldings,
      },
      'Investment holdings sync completed',
    );

    return result;
  }

  async syncInvestmentTransactions(
    bankLinkId: string,
    userId: string,
  ): Promise<InvestmentTransactionsSyncResult> {
    const bankLink = await this.repository.findOne({
      where: { id: bankLinkId, userId },
    });
    if (!bankLink) {
      throw new Error(`Bank link not found: ${bankLinkId}`);
    }

    const provider = this.providerRegistry.getProvider(bankLink.providerName);
    if (!provider.syncInvestmentTransactions) {
      this.logger.log(
        { providerName: bankLink.providerName },
        'Provider does not support investment transaction sync, skipping',
      );
      return {
        accounts: 0,
        securities: 0,
        transactions: 0,
        skippedMissingAccount: 0,
      };
    }

    const hasInvestmentAccounts = await this.hasInvestmentAccounts(
      userId,
      bankLink.id,
    );
    if (!hasInvestmentAccounts) {
      this.logger.log(
        { bankLinkId },
        'Bank link has no investment accounts, skipping investment transaction sync',
      );
      return {
        accounts: 0,
        securities: 0,
        transactions: 0,
        skippedMissingAccount: 0,
      };
    }

    const { startDate, endDate } =
      await this.getInvestmentTransactionSyncWindow(userId);

    this.logger.log(
      { bankLinkId, providerName: bankLink.providerName, startDate, endDate },
      'Starting investment transaction sync for bank link',
    );

    const response = await provider.syncInvestmentTransactions(
      bankLink.authentication,
      startDate,
      endDate,
    );
    const accountIdMap = await this.buildExternalAccountIdMap(
      userId,
      bankLink.id,
      response.externalAccountIds,
    );
    const result =
      await this.investmentService.upsertPlaidInvestmentTransactions(
        userId,
        accountIdMap,
        response,
      );

    bankLink.authentication = {
      ...bankLink.authentication,
      investmentTransactionsSync: {
        lastSyncedAt: new Date().toISOString(),
        lastStartDate: startDate,
        lastEndDate: endDate,
      },
    };
    await this.repository.save(bankLink);

    this.logger.log(
      {
        bankLinkId,
        accountCount: result.accounts,
        securityCount: result.securities,
        transactionCount: result.transactions,
        skippedMissingAccount: result.skippedMissingAccount,
      },
      'Investment transaction sync completed',
    );

    return result;
  }

  /**
   * Upsert accounts from API responses - updates existing accounts or creates new ones
   *
   * @param apiAccounts - Accounts from the provider API
   * @param accountIdToBankLinkId - Map of external account ID to bank link ID
   * @param userId - ID of the user who owns these accounts
   * @returns Saved account domain objects
   */
  async upsertAccountsFromAPI(
    apiAccounts: APIAccount[],
    accountIdToBankLinkId: Map<string, string>,
    userId: string,
  ): Promise<Account[]> {
    if (apiAccounts.length === 0) {
      return [];
    }

    this.logger.log(
      {
        apiAccountCount: apiAccounts.length,
        accountIds: apiAccounts.map((a) => a.accountId),
        userId,
      },
      'Upserting accounts from API',
    );

    // Get existing accounts by external account IDs (scoped by userId)
    const externalAccountIds = apiAccounts.map((a) => a.accountId);
    const existingAccounts = await this.accountRepository.find({
      where: { externalAccountId: In(externalAccountIds), userId },
    });

    this.logger.log(
      {
        existingAccountCount: existingAccounts.length,
        existingAccountIds: existingAccounts.map((a) => a.externalAccountId),
        newAccountCount: apiAccounts.length - existingAccounts.length,
      },
      'Found existing accounts for upsert',
    );

    // Create a map of external account ID to existing entity
    const existingAccountMap = new Map<string, AccountEntity>();
    existingAccounts.forEach((account) => {
      if (account.externalAccountId) {
        existingAccountMap.set(account.externalAccountId, account);
      }
    });

    // Update existing accounts or create new ones
    const accountsToSave: AccountEntity[] = [];
    const newAccountExternalIds = new Set<string>();

    apiAccounts.forEach((apiAccount) => {
      const bankLinkId = accountIdToBankLinkId.get(apiAccount.accountId);
      if (!bankLinkId) {
        throw new Error(
          `Bank link ID not found for account ${apiAccount.accountId}`,
        );
      }

      const dto = this.createAccountDtoFromAPIAccount(apiAccount, bankLinkId);
      const existingAccount = existingAccountMap.get(apiAccount.accountId);
      if (existingAccount) {
        if (existingAccount.archivedAt) {
          this.logger.log(
            {
              accountId: existingAccount.id,
              externalAccountId: apiAccount.accountId,
            },
            'Skipping archived account during sync',
          );
          return;
        }

        // Capture old balance for logging
        const oldCurrentBalance = existingAccount.currentBalance;
        this.applyAccountDtoToEntity(existingAccount, dto);
        const newCurrentBalance = existingAccount.currentBalance;

        // Log if balance changed (compare amount values)
        if (oldCurrentBalance.amount !== newCurrentBalance.amount) {
          this.logger.log(
            {
              accountId: existingAccount.id,
              externalAccountId: apiAccount.accountId,
              oldBalance: {
                amount: oldCurrentBalance.amount,
                currency: oldCurrentBalance.currency,
              },
              newBalance: {
                amount: newCurrentBalance.amount,
                currency: newCurrentBalance.currency,
              },
            },
            'Account balance changed during sync',
          );
        }
        accountsToSave.push(existingAccount);
      } else {
        accountsToSave.push(AccountEntity.fromDto(dto, userId));
        newAccountExternalIds.add(apiAccount.accountId);
      }
    });

    const savedAccounts =
      accountsToSave.length > 0
        ? await this.accountRepository.save(accountsToSave)
        : [];

    // Log event emission counts
    const createdCount = newAccountExternalIds.size;
    const updatedCount = savedAccounts.length - createdCount;
    this.logger.log({ createdCount, updatedCount }, 'Emitting account events');

    // Emit events for saved accounts
    savedAccounts.forEach((account) => {
      const accountObj = account.toObject();
      if (
        account.externalAccountId &&
        newAccountExternalIds.has(account.externalAccountId)
      ) {
        this.eventEmitter.emit(
          LinkedAccountEvents.CREATED,
          new LinkedAccountCreatedEvent(accountObj),
        );
      } else {
        this.eventEmitter.emit(
          LinkedAccountEvents.UPDATED,
          new LinkedAccountUpdatedEvent(accountObj),
        );
      }
    });

    return savedAccounts.map((account) => account.toObject());
  }

  private async hasInvestmentAccounts(
    userId: string,
    bankLinkId: string,
  ): Promise<boolean> {
    const account = await this.accountRepository.findOne({
      where: [
        { userId, bankLinkId, type: In(INVESTMENT_ACCOUNT_TYPES) },
        { userId, bankLinkId, subType: 'brokerage' },
      ],
    });

    return !!account;
  }

  private async buildExternalAccountIdMap(
    userId: string,
    bankLinkId: string,
    externalAccountIds: string[],
  ): Promise<Map<string, string>> {
    if (externalAccountIds.length === 0) {
      return new Map();
    }

    const accounts = await this.accountRepository.find({
      where: {
        externalAccountId: In(externalAccountIds),
        userId,
        bankLinkId,
      },
    });

    const accountIdMap = new Map<string, string>();
    accounts.forEach((account) => {
      if (account.externalAccountId) {
        accountIdMap.set(account.externalAccountId, account.id);
      }
    });

    this.logger.log(
      {
        bankLinkId,
        mappedAccounts: accountIdMap.size,
        totalExternalIds: externalAccountIds.length,
      },
      'Built account ID map for investment holdings sync',
    );

    return accountIdMap;
  }

  private async getSnapshotDate(userId: string): Promise<string> {
    const userTimezone = await this.userService.getTimezone(userId);
    return dayjs().tz(userTimezone).format('YYYY-MM-DD');
  }

  private async getInvestmentTransactionSyncWindow(
    userId: string,
  ): Promise<{ startDate: string; endDate: string }> {
    const userTimezone = await this.userService.getTimezone(userId);
    const end = dayjs().tz(userTimezone);
    return {
      startDate: end
        .subtract(INVESTMENT_TRANSACTION_LOOKBACK_DAYS, 'day')
        .format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
    };
  }

  /**
   * Find a bank link by Plaid item_id
   * Uses JSONB query to search within the authentication column
   *
   * @param itemId - Plaid item_id to search for
   * @returns BankLink entity or null if not found
   */
  private async findByPlaidItemId(
    itemId: string,
  ): Promise<BankLinkEntity | null> {
    return this.repository
      .createQueryBuilder('bankLink')
      .where('bankLink.providerName = :provider', { provider: 'plaid' })
      .andWhere(`"bankLink"."authentication"->>'itemId' = :itemId`, { itemId })
      .getOne();
  }

  private parseLinkFlowContext(
    context?: Record<string, any> | null,
  ): LinkFlowContext | undefined {
    if (
      context?.mode === 'update-bank-link' &&
      typeof context.bankLinkId === 'string'
    ) {
      return {
        mode: 'update-bank-link',
        bankLinkId: context.bankLinkId,
      };
    }
    if (
      context?.mode === 'convert-manual-account' &&
      typeof context.convertAccountId === 'string'
    ) {
      return {
        mode: 'convert-manual-account',
        convertAccountId: context.convertAccountId,
      };
    }
    return undefined;
  }

  private getConversionContext(
    context?: LinkFlowContext,
  ): LinkConversionContext | undefined {
    return context?.mode === 'convert-manual-account' ? context : undefined;
  }

  private async completeBankLinkUpdate(
    bankLinkId: string,
    userId: string,
  ): Promise<void> {
    const bankLink = await this.repository.findOne({
      where: { id: bankLinkId, userId },
    });
    if (!bankLink) {
      throw new NotFoundException(`Bank link not found: ${bankLinkId}`);
    }

    await this.syncAccounts(bankLinkId, userId);

    bankLink.status = 'OK';
    bankLink.statusDate = new Date();
    bankLink.statusBody = null;
    await this.repository.save(bankLink);
  }

  private async saveBankLinkFromLinkCompletionResponse(
    providerName: string,
    userId: string,
    response: LinkCompletionResponse,
    repository: Pick<Repository<BankLinkEntity>, 'save'> = this.repository,
  ): Promise<BankLinkEntity> {
    const itemId = response.authentication.itemId as string | undefined;
    let bankLink: BankLinkEntity | null = null;

    if (itemId) {
      bankLink = await this.findByPlaidItemId(itemId);
    }

    if (bankLink) {
      this.logger.log(
        { bankLinkId: bankLink.id, itemId },
        'Found existing bank link, updating',
      );
      const mergedAccountIds = new Set([
        ...bankLink.accountIds,
        ...response.accounts.map((a) => a.accountId),
      ]);
      bankLink.authentication = response.authentication;
      bankLink.status = 'OK';
      bankLink.statusDate = new Date();
      bankLink.statusBody = null;
      bankLink.accountIds = Array.from(mergedAccountIds);
      if (response.institution?.id !== undefined) {
        bankLink.institutionId = response.institution.id ?? null;
      }
      if (response.institution?.name !== undefined) {
        bankLink.institutionName = response.institution.name ?? null;
      }
    } else {
      bankLink = BankLinkEntity.fromDto(
        {
          providerName,
          authentication: response.authentication,
          accountIds: response.accounts.map((a) => a.accountId),
          institutionId: response.institution?.id ?? null,
          institutionName: response.institution?.name ?? null,
        },
        userId,
      );
    }

    return repository.save(bankLink);
  }

  private async convertManualAccountFromLinkCompletion(
    providerName: string,
    userId: string,
    linkCompletionResponses: LinkCompletionResponse[],
    conversionContext: LinkConversionContext,
  ): Promise<void> {
    if (linkCompletionResponses.length !== 1) {
      throw new BadRequestException(
        'Conversion requires exactly one linked institution',
      );
    }

    const response = linkCompletionResponses[0];
    if (response.accounts.length !== 1) {
      throw new BadRequestException(
        'Conversion requires exactly one selected provider account',
      );
    }

    const apiAccount = response.accounts[0];

    const { bankLink, convertedAccount } =
      await this.repository.manager.transaction(async (manager) => {
        const bankLinkRepository = manager.getRepository(BankLinkEntity);
        const accountRepository = manager.getRepository(AccountEntity);
        const bankLink = await this.saveBankLinkFromLinkCompletionResponse(
          providerName,
          userId,
          response,
          bankLinkRepository,
        );
        const targetAccount = await accountRepository.findOne({
          where: {
            id: conversionContext.convertAccountId,
            userId,
          },
        });

        if (!targetAccount) {
          throw new NotFoundException(
            `Account with id ${conversionContext.convertAccountId} not found`,
          );
        }
        if (targetAccount.bankLinkId) {
          throw new BadRequestException(
            `Account with id ${conversionContext.convertAccountId} is already linked`,
          );
        }

        const conflictingAccount = await accountRepository.findOne({
          where: {
            externalAccountId: apiAccount.accountId,
            userId,
          },
        });
        if (conflictingAccount && conflictingAccount.id !== targetAccount.id) {
          throw new ConflictException(
            `Provider account ${apiAccount.accountId} is already linked`,
          );
        }

        const dto = this.createAccountDtoFromAPIAccount(
          apiAccount,
          bankLink.id,
        );
        const existingCustomName = targetAccount.customName;
        const previousName = targetAccount.name;

        this.applyAccountDtoToEntity(targetAccount, dto);
        if (
          !existingCustomName &&
          previousName &&
          previousName !== apiAccount.name
        ) {
          targetAccount.customName = previousName;
        }

        const convertedAccount = await accountRepository.save(targetAccount);
        return { bankLink, convertedAccount };
      });

    this.eventEmitter.emit(
      LinkedAccountEvents.UPDATED,
      new LinkedAccountUpdatedEvent(convertedAccount.toObject()),
    );

    const provider = this.providerRegistry.getProvider(providerName);
    if (provider.syncTransactions) {
      await this.syncTransactions(bankLink.id, userId);
    }
    if (provider.syncInvestmentHoldings) {
      try {
        await this.syncInvestmentHoldings(bankLink.id, userId);
      } catch (error) {
        this.logger.error(
          {
            bankLinkId: bankLink.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed initial investment holdings sync for converted bank link',
        );
      }
    }
  }

  /**
   * Backfill item IDs for existing Plaid bank links that don't have them
   * Fetches item_id from Plaid API and updates the authentication JSONB
   *
   * @param userId - ID of the user whose bank links to update
   * @returns Number of bank links updated
   */
  async backfillPlaidItemIds(userId: string): Promise<number> {
    this.logger.log({ userId }, 'Starting backfill of Plaid item IDs');

    const plaidLinks = await this.repository.find({
      where: { providerName: 'plaid', userId },
    });

    const provider = this.providerRegistry.getProvider('plaid');
    if (!provider.getItemId) {
      throw new Error('Provider does not support getItemId');
    }

    // Filter out links that already have itemId
    const linksToUpdate = plaidLinks.filter((link) => {
      if (link.authentication.itemId) {
        this.logger.log(
          { bankLinkId: link.id },
          'Bank link already has itemId, skipping',
        );
        return false;
      }
      return true;
    });

    const results = await Promise.allSettled(
      linksToUpdate.map(async (link) => {
        const itemId = await provider.getItemId!(link.authentication);
        link.authentication = { ...link.authentication, itemId };
        await this.repository.save(link);
        this.logger.log(
          { bankLinkId: link.id },
          'Backfilled itemId for bank link',
        );
        return link.id;
      }),
    );

    let updatedCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        updatedCount++;
      } else {
        this.logger.error(
          { bankLinkId: linksToUpdate[index].id, error: String(result.reason) },
          'Failed to backfill itemId for bank link',
        );
      }
    });

    this.logger.log(
      { updatedCount, totalCount: plaidLinks.length },
      'Backfill complete',
    );
    return updatedCount;
  }

  /**
   * Update webhook URLs for all bank links to use current API_DOMAIN
   * Only updates bank links whose providers support updateWebhookUrl
   *
   * @param userId - ID of the user whose bank links to update
   * @returns Counts of updated and failed bank links
   */
  async updateAllWebhookUrls(
    userId: string,
  ): Promise<{ updated: number; failed: number }> {
    this.logger.log({ userId }, 'Starting webhook URL update for bank links');

    const bankLinks = await this.repository.find({ where: { userId } });
    this.logger.log(
      { count: bankLinks.length, userId },
      'Found bank links for webhook URL update',
    );

    let updated = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      bankLinks.map(async (link) => {
        const provider = this.providerRegistry.getProvider(link.providerName);
        if (!provider.updateWebhookUrl) {
          this.logger.log(
            { bankLinkId: link.id, providerName: link.providerName },
            'Provider does not support updateWebhookUrl, skipping',
          );
          return { skipped: true };
        }

        await provider.updateWebhookUrl(link.authentication);
        this.logger.log(
          { bankLinkId: link.id, providerName: link.providerName },
          'Updated webhook URL for bank link',
        );
        return { skipped: false };
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (!result.value.skipped) {
          updated++;
        }
      } else {
        failed++;
        this.logger.error(
          { bankLinkId: bankLinks[index].id, error: String(result.reason) },
          'Failed to update webhook URL for bank link',
        );
      }
    });

    this.logger.log(
      { updated, failed, total: bankLinks.length },
      'Webhook URL update complete',
    );
    return { updated, failed };
  }

  /**
   * Convert an APIAccount to a CreateAccountDto
   */
  private createAccountDtoFromAPIAccount(
    apiAccount: APIAccount,
    bankLinkId: string,
  ): CreateAccountDto {
    return {
      name: apiAccount.name,
      mask: apiAccount.mask,
      availableBalance: apiAccount.availableBalance,
      currentBalance: apiAccount.currentBalance,
      type: apiAccount.type,
      subType: apiAccount.subType,
      externalAccountId: apiAccount.accountId,
      rawApiAccount: apiAccount,
      bankLinkId,
    };
  }

  /**
   * Apply a CreateAccountDto to an existing AccountEntity
   */
  private applyAccountDtoToEntity(
    entity: AccountEntity,
    dto: CreateAccountDto,
  ): void {
    entity.name = dto.name;
    entity.mask = dto.mask ?? null;
    entity.availableBalance = BalanceColumns.fromMoneyWithSign(
      dto.availableBalance,
    );
    entity.currentBalance = BalanceColumns.fromMoneyWithSign(
      dto.currentBalance,
    );
    entity.type = dto.type;
    entity.subType = dto.subType;
    entity.externalAccountId = dto.externalAccountId ?? null;
    entity.rawApiAccount = dto.rawApiAccount ?? null;
    entity.bankLinkId = dto.bankLinkId ?? null;
  }
}
