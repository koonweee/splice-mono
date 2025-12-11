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
    this.logger.log(
      `Initiating link with provider ${providerName} for user ${userId}`,
    );

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
        `Updated provider details for user ${userId}, provider ${providerName}`,
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
        `Created pending webhook event for webhookId=${linkResponse.webhookId}`,
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
    this.logger.log(`Received webhook from provider ${providerName}`);

    const provider = this.providerRegistry.getProvider(providerName);

    // Verify webhook signature before processing
    const isValid = await provider.verifyWebhook(rawBody, headers);
    if (!isValid) {
      this.logger.warn(
        `Webhook verification failed for provider ${providerName}`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }
    this.logger.log(
      `Webhook verified successfully for provider ${providerName}`,
    );

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
      `Webhook from ${providerName} not a processable type, skipping`,
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
      `Processing ${updateInfo.type} update webhook for item ${updateInfo.itemId}`,
    );

    const bankLink = await this.findByPlaidItemId(updateInfo.itemId);
    if (bankLink) {
      await this.syncAccounts(bankLink.id, bankLink.userId);
      this.logger.log(`Synced accounts for bank link ${bankLink.id}`);
    } else {
      this.logger.warn(`No bank link found for item_id=${updateInfo.itemId}`);
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
      `Processing ITEM ${statusInfo.webhookCode} webhook for item ${statusInfo.itemId}`,
    );

    const bankLink = await this.findByPlaidItemId(statusInfo.itemId);
    if (!bankLink) {
      this.logger.warn(`No bank link found for item_id=${statusInfo.itemId}`);
      return;
    }

    // Update bank link status
    bankLink.status = statusInfo.status;
    bankLink.statusDate = new Date();
    bankLink.statusBody = statusInfo.statusBody;

    await this.repository.save(bankLink);
    this.logger.log(
      `Updated bank link ${bankLink.id} status to ${statusInfo.status}`,
    );

    // Optionally sync accounts after status update (e.g., LOGIN_REPAIRED)
    if (statusInfo.shouldSync) {
      this.logger.log(
        `Triggering account sync after ${statusInfo.webhookCode} for bank link ${bankLink.id}`,
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
    this.logger.log(`Processing link completion webhook: ${webhookId}`);

    // Look up pending webhook event by webhookId to get userId
    const pendingEvent =
      await this.webhookEventService.findPendingByWebhookId(webhookId);
    if (!pendingEvent) {
      this.logger.warn(
        `No pending webhook event found for webhookId=${webhookId}. ` +
          `Either already processed, expired, or initiation was never called.`,
      );
      return;
    }

    const userId = pendingEvent.userId;
    this.logger.log(
      `Found pending webhook event for webhookId=${webhookId}, userId=${userId}`,
    );

    try {
      const linkCompletionResponses =
        await provider.processWebhook(parsedPayload);
      if (!linkCompletionResponses) {
        this.logger.warn(
          `No link completion responses from provider ${providerName}`,
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
      this.logger.log(`Saved ${savedBankLinks.length} bank links`);

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
      this.logger.log(`Saved ${savedAccounts.length} accounts`);

      // Emit linked account created events for all new accounts
      for (const account of savedAccounts) {
        this.eventEmitter.emit(
          LinkedAccountEvents.CREATED,
          new LinkedAccountCreatedEvent(account.toObject()),
        );
      }

      // Mark webhook event as completed
      await this.webhookEventService.markCompleted(webhookId, parsedPayload);
      this.logger.log(
        `Webhook processing completed for webhookId=${webhookId}`,
      );
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
        `Webhook processing failed for webhookId=${webhookId}: ${errorMessage}`,
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
    this.logger.log(`Syncing accounts for all bank links for userId=${userId}`);

    const bankLinks = await this.repository.find({
      where: { userId },
    });
    this.logger.log(`Found ${bankLinks.length} bank links to sync`);

    const allAccounts: Account[] = [];
    for (const bankLink of bankLinks) {
      try {
        const accounts = await this.syncAccounts(bankLink.id, userId);
        allAccounts.push(...accounts);
      } catch (error) {
        this.logger.error(
          `Failed to sync accounts for bank link ${bankLink.id}: ${error}`,
        );
      }
    }

    this.logger.log(`Synced ${allAccounts.length} accounts total`);
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
    this.logger.log('Syncing accounts for all bank links (system operation)');

    // Exclude Plaid - it uses webhook-driven sync via DEFAULT_UPDATE
    const bankLinks = await this.repository.find({
      where: { providerName: Not('plaid') },
    });
    this.logger.log(`Found ${bankLinks.length} bank links to sync`);

    const allAccounts: Account[] = [];
    for (const bankLink of bankLinks) {
      try {
        const accounts = await this.syncAccounts(bankLink.id, bankLink.userId);
        allAccounts.push(...accounts);
      } catch (error) {
        this.logger.error(
          `Failed to sync accounts for bank link ${bankLink.id}: ${error}`,
        );
      }
    }

    this.logger.log(`Synced ${allAccounts.length} accounts total`);
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
    this.logger.log(
      `Syncing accounts for bank link ${bankLinkId}, userId=${userId}`,
    );

    // Get bank link entity (scoped by userId)
    const bankLink = await this.repository.findOne({
      where: { id: bankLinkId, userId },
    });
    if (!bankLink) {
      throw new Error(`Bank link not found: ${bankLinkId}`);
    }

    // Get provider
    const provider = this.providerRegistry.getProvider(bankLink.providerName);

    // Fetch accounts and institution info from provider
    const { accounts: apiAccounts, institution } = await provider.getAccounts(
      bankLink.authentication,
    );
    this.logger.log(
      `Fetched ${apiAccounts.length} accounts from ${bankLink.providerName}`,
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
          `Updated institution info for bank link ${bankLinkId}: ${institutionName} (${institutionId})`,
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
    this.logger.log(`Synced ${savedAccounts.length} accounts`);

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

    // Get existing accounts by external account IDs (scoped by userId)
    const externalAccountIds = apiAccounts.map((a) => a.accountId);
    const existingAccounts = await this.accountRepository.find({
      where: { externalAccountId: In(externalAccountIds), userId },
    });

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

    for (const apiAccount of apiAccounts) {
      const bankLinkId = accountIdToBankLinkId.get(apiAccount.accountId);
      if (!bankLinkId) {
        throw new Error(
          `Bank link ID not found for account ${apiAccount.accountId}`,
        );
      }

      const dto = this.createAccountDtoFromAPIAccount(apiAccount, bankLinkId);
      const existingAccount = existingAccountMap.get(apiAccount.accountId);
      if (existingAccount) {
        this.applyAccountDtoToEntity(existingAccount, dto);
        accountsToSave.push(existingAccount);
      } else {
        accountsToSave.push(AccountEntity.fromDto(dto, userId));
        newAccountExternalIds.add(apiAccount.accountId);
      }
    }

    const savedAccounts = await this.accountRepository.save(accountsToSave);

    // Emit events for saved accounts
    for (const account of savedAccounts) {
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
    }

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
    this.logger.log('Starting backfill of Plaid item IDs');

    const plaidLinks = await this.repository.find({
      where: { providerName: 'plaid' },
    });

    const provider = this.providerRegistry.getProvider('plaid');
    if (!provider.getItemId) {
      throw new Error('Provider does not support getItemId');
    }

    let updatedCount = 0;
    for (const link of plaidLinks) {
      // Skip if already has itemId
      if (link.authentication.itemId) {
        this.logger.log(`Bank link ${link.id} already has itemId, skipping`);
        continue;
      }

      try {
        const itemId = await provider.getItemId(link.authentication);
        link.authentication = { ...link.authentication, itemId };
        await this.repository.save(link);
        updatedCount++;
        this.logger.log(`Backfilled itemId for bank link ${link.id}`);
      } catch (error) {
        this.logger.error(
          `Failed to backfill itemId for bank link ${link.id}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Backfill complete: ${updatedCount}/${plaidLinks.length} bank links updated`,
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
