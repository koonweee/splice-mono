import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  LinkedAccountCreatedEvent,
  LinkedAccountEvents,
  LinkedAccountUpdatedEvent,
} from '../events/account.events';
import type { Account, CreateAccountDto } from '../types/Account';
import type {
  APIAccount,
  CreateBankLinkDto,
  InitiateLinkResponse,
  SanitizedBankLink,
  UpdateBankLinkDto,
} from '../types/BankLink';
import { UserService } from '../user/user.service';
import { WebhookEventService } from '../webhook-event/webhook-event.service';
import { BankLinkEntity } from './bank-link.entity';
import type { IBankLinkProvider } from './providers/bank-link-provider.interface';
import { ProviderRegistry } from './providers/provider.registry';

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
   * @param providerName - Provider to use (e.g., 'plaid', 'simplefin')
   * @param userId - User initiating the link
   * @param redirectUri - Optional redirect after linking
   * @returns Link information for frontend
   */
  async initiateLinking(
    providerName: string,
    userId: string,
    redirectUri?: string,
  ): Promise<InitiateLinkResponse> {
    this.logger.log({ providerName, userId }, 'Initiating link with provider');

    // Get provider
    const provider = this.providerRegistry.getProvider(providerName);

    // Fetch existing provider-specific user details
    const providerUserDetails = await this.userService.getProviderDetails(
      userId,
      providerName,
    );

    // Call provider to get link URL/token
    const linkResponse = await provider.initiateLinking({
      userId,
      redirectUri,
      providerUserDetails,
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

    // Create pending webhook event to track this link request
    // The webhookId (e.g., link_token for Plaid) will be used to correlate the webhook callback
    if (linkResponse.webhookId) {
      await this.webhookEventService.createPending(
        linkResponse.webhookId,
        providerName,
        userId,
        linkResponse.expiresAt,
      );
      this.logger.log(
        { webhookId: linkResponse.webhookId },
        'Created pending webhook event',
      );
    }

    return linkResponse;
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
        await this.handleStatusWebhook(statusInfo);
        return;
      }
    }

    // 2. Check for update webhooks (DEFAULT_UPDATE)
    if (provider.parseUpdateWebhook) {
      const updateInfo = provider.parseUpdateWebhook(parsedPayload);
      if (updateInfo) {
        await this.handleUpdateWebhook(updateInfo);
        return;
      }
    }

    // 3. Check for link completion webhooks (SESSION_FINISHED)
    const webhookId = provider.shouldProcessWebhook(parsedPayload);
    if (webhookId) {
      await this.handleLinkCompletionWebhook(
        providerName,
        provider,
        webhookId,
        parsedPayload,
      );
      return;
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
   */
  private async handleUpdateWebhook(updateInfo: {
    itemId: string;
    type: string;
  }): Promise<void> {
    this.logger.log(
      { type: updateInfo.type, itemId: updateInfo.itemId },
      'Processing update webhook',
    );

    const bankLink = await this.findByPlaidItemId(updateInfo.itemId);
    this.logger.log(
      {
        itemId: updateInfo.itemId,
        found: !!bankLink,
        bankLinkId: bankLink?.id,
        userId: bankLink?.userId,
      },
      'Bank link lookup by Plaid item_id',
    );

    if (bankLink) {
      await this.syncAccounts(bankLink.id, bankLink.userId);
      this.logger.log(
        { bankLinkId: bankLink.id },
        'Synced accounts for bank link',
      );
    } else {
      this.logger.warn(
        { itemId: updateInfo.itemId },
        'No bank link found for item',
      );
    }
  }

  /**
   * Handle status webhooks (e.g., Plaid ITEM webhooks: ERROR, LOGIN_REPAIRED, etc.)
   * Updates bank link status, statusDate, and statusBody fields
   * Optionally triggers account sync (e.g., after LOGIN_REPAIRED)
   */
  private async handleStatusWebhook(statusInfo: {
    itemId: string;
    webhookCode: string;
    status: 'OK' | 'ERROR' | 'PENDING_REAUTH';
    statusBody: Record<string, any> | null;
    shouldSync: boolean;
  }): Promise<void> {
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

    // Update bank link status
    bankLink.status = statusInfo.status;
    bankLink.statusDate = new Date();
    bankLink.statusBody = statusInfo.statusBody;

    await this.repository.save(bankLink);
    this.logger.log(
      { bankLinkId: bankLink.id, status: statusInfo.status },
      'Updated bank link status',
    );

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
    this.logger.log({ webhookId, userId }, 'Found pending webhook event');

    try {
      const linkCompletionResponses =
        await provider.processWebhook(parsedPayload);
      if (!linkCompletionResponses) {
        this.logger.warn(
          { providerName },
          'No link completion responses from provider',
        );
        await this.webhookEventService.markFailed(
          webhookId,
          'No link completion responses from provider',
          parsedPayload,
        );
        return;
      }

      // Bank links from link completion responses
      const bankLinks = linkCompletionResponses.map((response) => {
        return BankLinkEntity.fromDto(
          {
            providerName: providerName,
            authentication: response.authentication,
            accountIds: response.accounts.map((account) => account.accountId),
            institutionId: response.institution?.id ?? null,
            institutionName: response.institution?.name ?? null,
          },
          userId,
        );
      });

      // Save bank links
      const savedBankLinks = await this.repository.save(bankLinks);
      this.logger.log({ count: savedBankLinks.length }, 'Saved bank links');

      // Map of external account ids to bank link entities
      const accountIdToBankLink = new Map<string, BankLinkEntity>();
      savedBankLinks.forEach((bankLink) => {
        bankLink.accountIds.forEach((accountId) => {
          accountIdToBankLink.set(accountId, bankLink);
        });
      });

      // Flat map of all accounts
      const allAccounts = linkCompletionResponses.flatMap(
        (response) => response.accounts,
      );

      // Create accounts from all accounts using helper method
      const accounts = allAccounts.map((apiAccount) => {
        const bankLinkId = accountIdToBankLink.get(apiAccount.accountId)?.id;
        if (!bankLinkId) {
          throw new Error(
            `Bank link not found for account ${apiAccount.accountId}`,
          );
        }
        const dto = this.createAccountDtoFromAPIAccount(apiAccount, bankLinkId);
        return AccountEntity.fromDto(dto, userId);
      });

      // Save accounts
      const savedAccounts = await this.accountRepository.save(accounts);
      this.logger.log({ count: savedAccounts.length }, 'Saved accounts');

      // Emit linked account created events for all new accounts
      savedAccounts.forEach((account) => {
        this.eventEmitter.emit(
          LinkedAccountEvents.CREATED,
          new LinkedAccountCreatedEvent(account.toObject()),
        );
      });

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
   * Sync accounts for all bank links across all users (system operation)
   * Used by scheduled tasks and admin operations
   * Excludes Plaid providers which are synced via webhooks
   *
   * @returns Updated accounts from all bank links
   */
  async syncAllAccountsSystem(): Promise<Account[]> {
    this.logger.log(
      {},
      'Syncing accounts for all bank links (system operation)',
    );

    // Exclude Plaid - it uses webhook-driven sync via DEFAULT_UPDATE
    const bankLinks = await this.repository.find({
      where: { providerName: Not('plaid') },
    });
    this.logger.log(
      { count: bankLinks.length },
      'Found bank links to sync (system)',
    );

    const results = await Promise.allSettled(
      bankLinks.map((bankLink) =>
        this.syncAccounts(bankLink.id, bankLink.userId),
      ),
    );

    const allAccounts: Account[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allAccounts.push(...result.value);
      } else {
        this.logger.error(
          { bankLinkId: bankLinks[index].id, error: String(result.reason) },
          'Failed to sync accounts for bank link (system)',
        );
      }
    });

    this.logger.log(
      { count: allAccounts.length },
      'Synced accounts total (system)',
    );
    return allAccounts;
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

    const savedAccounts = await this.accountRepository.save(accountsToSave);

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

  /**
   * Find a bank link by Plaid item_id
   * Uses JSONB query to search within the authentication column
   *
   * @param itemId - Plaid item_id to search for
   * @returns BankLink entity or null if not found
   */
  async findByPlaidItemId(itemId: string): Promise<BankLinkEntity | null> {
    return this.repository
      .createQueryBuilder('bankLink')
      .where('bankLink.providerName = :provider', { provider: 'plaid' })
      .andWhere("bankLink.authentication->>'itemId' = :itemId", { itemId })
      .getOne();
  }

  /**
   * Backfill item IDs for existing Plaid bank links that don't have them
   * Fetches item_id from Plaid API and updates the authentication JSONB
   *
   * @returns Number of bank links updated
   */
  async backfillPlaidItemIds(): Promise<number> {
    this.logger.log({}, 'Starting backfill of Plaid item IDs');

    const plaidLinks = await this.repository.find({
      where: { providerName: 'plaid' },
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
