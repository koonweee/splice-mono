import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { ProviderRegistry } from '../../src/bank-link/providers/provider.registry';
import { LinkedAccountEvents } from '../../src/events/account.events';
import { BankLinkEvents } from '../../src/events/bank-link.events';
import { InvestmentService } from '../../src/investment/investment.service';
import { TransactionService } from '../../src/transaction/transaction.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserService } from '../../src/user/user.service';
import { WebhookEventService } from '../../src/webhook-event/webhook-event.service';
import { mockProviderRegistry } from '../mocks/bank-link/provider-registry.mock';
import {
  mockApiAccount,
  mockInstitution,
  mockLinkCompletionResponse,
  mockLinkInitiationResponse,
  mockPlaidProvider,
} from '../mocks/bank-link/provider.mock';
import { mockUserService } from '../mocks/user/user-service.mock';
import { mockWebhookEventService } from '../mocks/webhook-event/webhook-event-service.mock';

const plaidSyncTransactions = mockPlaidProvider.syncTransactions;
if (!plaidSyncTransactions) {
  throw new Error('Plaid transaction sync mock is required');
}
const mockPlaidSyncTransactions = jest.mocked(plaidSyncTransactions);

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockTransactionService = {
  processSyncResults: jest.fn().mockResolvedValue(undefined),
};

const mockInvestmentService = {
  upsertPlaidHoldings: jest.fn().mockResolvedValue({
    accounts: 1,
    securities: 1,
    holdings: 1,
    deletedStaleHoldings: 0,
  }),
  upsertPlaidInvestmentTransactions: jest.fn().mockResolvedValue({
    accounts: 1,
    securities: 1,
    transactions: 1,
    skippedMissingAccount: 0,
  }),
};

const mockUserId = 'user-uuid-123';

const mockBankLink = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: mockUserId,
  providerName: 'plaid',
  authentication: { accessToken: 'test-token' },
  accountIds: ['acc-1', 'acc-2'],
};

const mockCreateBankLinkDto = {
  providerName: 'plaid',
  authentication: { accessToken: 'test-token' },
  accountIds: ['acc-1', 'acc-2'],
};

const mockBankLinkAuthentication: Record<string, unknown> = {
  accessToken: 'test-token',
};

const mockBankLinkEntity = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: mockUserId,
  providerName: 'plaid',
  authentication: mockBankLinkAuthentication,
  accountIds: ['acc-1', 'acc-2'],
  status: 'OK',
  statusDate: new Date('2026-01-01T00:00:00Z'),
  statusBody: null as Record<string, unknown> | null,
  toObject: jest.fn().mockReturnValue(mockBankLink),
};

const mockBankLinkRepository: any = {
  save: jest.fn().mockImplementation((entities: unknown) => {
    // Handle both single entity and array saves
    if (Array.isArray(entities)) {
      return Promise.resolve(
        entities.map((e: { accountIds?: string[] }, i: number) => ({
          ...e,
          id: `bank-link-id-${i}`,
          toObject: () => ({
            ...mockBankLink,
            id: `bank-link-id-${i}`,
            accountIds: e.accountIds || [],
          }),
        })),
      );
    }
    const entity = entities as {
      id?: string;
      providerName?: string;
      authentication?: Record<string, unknown>;
      accountIds?: string[];
    };
    return Promise.resolve({
      ...mockBankLinkEntity,
      ...entity,
      id: entity.id ?? mockBankLinkEntity.id,
      toObject: () => ({
        ...mockBankLink,
        providerName: entity.providerName ?? mockBankLink.providerName,
        authentication: entity.authentication ?? mockBankLink.authentication,
        accountIds: entity.accountIds ?? mockBankLink.accountIds,
        id: entity.id ?? mockBankLink.id,
      }),
    });
  }),
  findOne: jest.fn().mockResolvedValue(mockBankLinkEntity),
  find: jest.fn().mockResolvedValue([mockBankLinkEntity]),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mockBankLinkEntity),
  }),
  manager: {
    transaction: jest
      .fn()
      .mockImplementation(async (cb: any) => cb(mockEntityManager)),
  },
};

const mockAccountRepository: any = {
  insert: jest.fn().mockImplementation((entity: AccountEntity) => {
    entity.id = 'account-id-0';
    entity.createdAt = new Date('2026-01-01T00:00:00Z');
    entity.updatedAt = new Date('2026-01-01T00:00:00Z');
    return Promise.resolve({ identifiers: [{ id: entity.id }] });
  }),
  save: jest.fn().mockImplementation((entities: unknown) => {
    // Handle both single entity and array saves
    if (Array.isArray(entities)) {
      return Promise.resolve(
        entities.map((e: object, i: number) => ({
          ...e,
          id: `account-id-${i}`,
          toObject: () => ({ ...e, id: `account-id-${i}` }),
        })),
      );
    }
    return Promise.resolve({
      ...(entities as object),
      id: (entities as { id?: string }).id ?? 'account-id-0',
      toObject: () => ({
        ...(entities as object),
        id: (entities as { id?: string }).id ?? 'account-id-0',
      }),
    });
  }),
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
};

const mockEntityManager = {
  getRepository: jest.fn((entity: unknown) => {
    if (entity === BankLinkEntity) {
      return mockBankLinkRepository;
    }
    if (entity === AccountEntity) {
      return mockAccountRepository;
    }
    throw new Error('Unexpected repository request');
  }),
};

describe('BankLinkService', () => {
  let service: BankLinkService;
  let repository: typeof mockBankLinkRepository;
  let providerRegistry: typeof mockProviderRegistry;
  let userService: typeof mockUserService;

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Reset shared mockBankLinkEntity to original values (may be mutated by update tests)
    mockBankLinkEntity.providerName = 'plaid';
    mockBankLinkEntity.authentication = { accessToken: 'test-token' };
    mockBankLinkEntity.accountIds = ['acc-1', 'acc-2'];
    mockBankLinkEntity.status = 'OK';
    mockBankLinkEntity.statusDate = new Date('2026-01-01T00:00:00Z');
    mockBankLinkEntity.statusBody = null;
    mockBankLinkEntity.toObject.mockReturnValue(mockBankLink);
    mockAccountRepository.findOne.mockResolvedValue(null);
    mockBankLinkRepository.createQueryBuilder = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockBankLinkEntity),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankLinkService,
        {
          provide: getRepositoryToken(BankLinkEntity),
          useValue: mockBankLinkRepository,
        },
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockAccountRepository,
        },
        {
          provide: ProviderRegistry,
          useValue: mockProviderRegistry,
        },
        {
          provide: WebhookEventService,
          useValue: mockWebhookEventService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: InvestmentService,
          useValue: mockInvestmentService,
        },
      ],
    }).compile();

    service = module.get<BankLinkService>(BankLinkService);
    repository = module.get(getRepositoryToken(BankLinkEntity));
    providerRegistry = module.get(ProviderRegistry);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a bank link', async () => {
      const result = await service.create(mockCreateBankLinkDto, mockUserId);

      expect(result).toMatchObject({
        userId: mockUserId,
        providerName: 'plaid',
        authentication: { accessToken: 'test-token' },
        accountIds: ['acc-1', 'acc-2'],
      });
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a bank link when found', async () => {
      const result = await service.findOne(mockBankLink.id, mockUserId);

      expect(result).toEqual(mockBankLink);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: mockBankLink.id, userId: mockUserId },
        relations: [],
      });
    });

    it('should return null when bank link not found', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.findOne('non-existent-id', mockUserId);

      expect(result).toBeNull();
    });

    it('should return null when bank link belongs to different user', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.findOne(mockBankLink.id, 'different-user');

      expect(result).toBeNull();
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: mockBankLink.id, userId: 'different-user' },
        relations: [],
      });
    });
  });

  describe('findAll', () => {
    it('should return all bank links for user', async () => {
      const result = await service.findAll(mockUserId);

      expect(result).toEqual([mockBankLink]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: [],
      });
    });

    it('should return empty array when no bank links exist for user', async () => {
      repository.find.mockResolvedValueOnce([]);

      const result = await service.findAll(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update and return the bank link', async () => {
      const updateDto = { providerName: 'simplefin' };

      const result = await service.update(
        mockBankLink.id,
        updateDto,
        mockUserId,
      );

      expect(result).toMatchObject({
        id: mockBankLink.id,
        userId: mockUserId,
        providerName: 'simplefin',
      });
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: mockBankLink.id, userId: mockUserId },
        relations: [],
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should return null when bank link not found', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.update(
        'non-existent-id',
        { providerName: 'simplefin' },
        mockUserId,
      );

      expect(result).toBeNull();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should return null when bank link belongs to different user', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.update(
        mockBankLink.id,
        { providerName: 'simplefin' },
        'different-user',
      );

      expect(result).toBeNull();
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: mockBankLink.id, userId: 'different-user' },
        relations: [],
      });
    });

    it('should update authentication', async () => {
      const updateDto = { authentication: { newToken: 'new-value' } };

      await service.update(mockBankLink.id, updateDto, mockUserId);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: { newToken: 'new-value' },
        }),
      );
    });

    it('should update accountIds', async () => {
      const updateDto = { accountIds: ['acc-3', 'acc-4'] };

      await service.update(mockBankLink.id, updateDto, mockUserId);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accountIds: ['acc-3', 'acc-4'],
        }),
      );
    });
  });

  describe('remove', () => {
    it('should return true when bank link is deleted', async () => {
      const result = await service.remove(mockBankLink.id, mockUserId);

      expect(result).toBe(true);
      expect(repository.delete).toHaveBeenCalledWith({
        id: mockBankLink.id,
        userId: mockUserId,
      });
    });

    it('should return false when bank link not found', async () => {
      repository.delete.mockResolvedValueOnce({ affected: 0 });

      const result = await service.remove('non-existent-id', mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when bank link belongs to different user', async () => {
      repository.delete.mockResolvedValueOnce({ affected: 0 });

      const result = await service.remove(mockBankLink.id, 'different-user');

      expect(result).toBe(false);
      expect(repository.delete).toHaveBeenCalledWith({
        id: mockBankLink.id,
        userId: 'different-user',
      });
    });
  });

  describe('initiateLinking', () => {
    it('should call provider to initiate linking and create pending webhook event', async () => {
      const providerName = 'plaid';

      await service.initiateLinking(providerName, mockUserId);

      expect(providerRegistry.getProvider).toHaveBeenCalledWith(providerName);

      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri: undefined,
        providerUserDetails: undefined,
        accessToken: undefined,
        singleAccountSelect: false,
      });
      // Should create pending webhook event
      expect(mockWebhookEventService.createPending).toHaveBeenCalledWith(
        'webhook-mock-123', // webhookId from mock provider response
        providerName,
        mockUserId,
        expect.any(Date),
        undefined,
      );
    });

    it('should pass redirectUri to provider', async () => {
      const providerName = 'plaid';
      const redirectUri = 'https://myapp.com/callback';

      await service.initiateLinking(providerName, mockUserId, redirectUri);

      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri,
        providerUserDetails: undefined,
        accessToken: undefined,
        singleAccountSelect: false,
      });
    });

    it('should fetch and pass existing provider details to provider', async () => {
      const providerName = 'plaid';
      const existingDetails = { userToken: 'existing-token' };

      userService.getProviderDetails.mockResolvedValueOnce(existingDetails);

      await service.initiateLinking(providerName, mockUserId);

      expect(userService.getProviderDetails).toHaveBeenCalledWith(
        mockUserId,
        providerName,
      );

      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri: undefined,
        providerUserDetails: existingDetails,
        accessToken: undefined,
        singleAccountSelect: false,
      });
    });

    it('should update user provider details when provider returns them', async () => {
      const providerName = 'plaid';
      const updatedDetails = { userToken: 'new-token' };

      // Mock provider returning updated details
      (mockPlaidProvider.initiateLinking as jest.Mock).mockResolvedValueOnce({
        ...mockLinkInitiationResponse,
        updatedProviderUserDetails: updatedDetails,
      });

      await service.initiateLinking(providerName, mockUserId);

      expect(userService.updateProviderDetails).toHaveBeenCalledWith(
        mockUserId,
        providerName,
        updatedDetails,
      );
    });

    it('should not update user provider details when provider does not return them', async () => {
      const providerName = 'plaid';

      await service.initiateLinking(providerName, mockUserId);

      expect(userService.updateProviderDetails).not.toHaveBeenCalled();
    });

    it('should pass accessToken to provider when bankLinkId is provided', async () => {
      const providerName = 'plaid';
      const bankLinkId = mockBankLinkEntity.id;

      await service.initiateLinking(
        providerName,
        mockUserId,
        undefined,
        undefined,
        undefined,
        bankLinkId,
      );

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: bankLinkId, userId: mockUserId },
      });

      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri: undefined,
        providerUserDetails: undefined,
        accessToken: 'test-token',
        singleAccountSelect: false,
      });
      expect(mockWebhookEventService.createPending).toHaveBeenCalledWith(
        'webhook-mock-123',
        providerName,
        mockUserId,
        expect.any(Date),
        { mode: 'update-bank-link', bankLinkId },
      );
    });

    it('should throw error when bankLinkId not found', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.initiateLinking(
          'plaid',
          mockUserId,
          undefined,
          undefined,
          undefined,
          'non-existent-id',
        ),
      ).rejects.toThrow('Bank link not found: non-existent-id');
    });

    it('should enable single-account selection for explicit manual account conversion', async () => {
      const convertAccountId = 'manual-account-123';
      mockAccountRepository.findOne.mockResolvedValueOnce({
        id: convertAccountId,
        userId: mockUserId,
        bankLinkId: null,
      });

      await service.initiateLinking(
        'plaid',
        mockUserId,
        'https://myapp.com/callback',
        undefined,
        undefined,
        undefined,
        convertAccountId,
      );

      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri: 'https://myapp.com/callback',
        providerUserDetails: undefined,
        accessToken: undefined,
        singleAccountSelect: true,
      });
      expect(mockWebhookEventService.createPending).toHaveBeenCalledWith(
        'webhook-mock-123',
        'plaid',
        mockUserId,
        expect.any(Date),
        {
          mode: 'convert-manual-account',
          convertAccountId,
        },
      );
    });
  });

  describe('handleWebhook', () => {
    const mockRawBody = '{"webhook_type":"ITEM","webhook_code":"SUCCESS"}';
    const mockHeaders = { 'content-type': 'application/json' };
    const mockParsedPayload = {
      webhook_type: 'ITEM',
      webhook_code: 'SUCCESS',
    };

    it('should process webhook when valid and mark as completed', async () => {
      const providerName = 'plaid';

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      expect(providerRegistry.getProvider).toHaveBeenCalledWith(providerName);

      expect(mockPlaidProvider.verifyWebhook).toHaveBeenCalledWith(
        mockRawBody,
        mockHeaders,
      );
      // Should look up pending webhook event
      expect(
        mockWebhookEventService.findPendingByWebhookId,
      ).toHaveBeenCalledWith('webhook-mock-123');
      // Should mark as completed after processing
      expect(mockWebhookEventService.markCompleted).toHaveBeenCalledWith(
        'webhook-mock-123',
        mockParsedPayload,
      );
    });

    it('should throw UnauthorizedException when webhook verification fails', async () => {
      const providerName = 'plaid';

      (mockPlaidProvider.verifyWebhook as jest.Mock).mockResolvedValueOnce(
        false,
      );

      await expect(
        service.handleWebhook(
          providerName,
          mockRawBody,
          mockHeaders,
          mockParsedPayload,
        ),
      ).rejects.toThrow('Invalid webhook signature');

      expect(
        mockWebhookEventService.findPendingByWebhookId,
      ).not.toHaveBeenCalled();
    });

    it('should skip processing when no pending webhook event found', async () => {
      const providerName = 'plaid';

      mockWebhookEventService.findPendingByWebhookId.mockResolvedValueOnce(
        null,
      );

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      expect(mockWebhookEventService.markCompleted).not.toHaveBeenCalled();

      expect(mockPlaidProvider.processLinkCompletion).not.toHaveBeenCalled();
    });

    it('should skip processing when parseLinkCompletionWebhook returns undefined', async () => {
      const providerName = 'plaid';

      (
        mockPlaidProvider.parseLinkCompletionWebhook as jest.Mock
      ).mockReturnValueOnce(undefined);

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      expect(
        mockWebhookEventService.findPendingByWebhookId,
      ).not.toHaveBeenCalled();
    });

    it('should complete update mode without exchanging a replacement token', async () => {
      const providerName = 'plaid';
      mockBankLinkEntity.authentication = {
        accessToken: 'test-token',
        nextCursor: 'current-cursor',
      };
      mockBankLinkEntity.status = 'ERROR';
      mockBankLinkEntity.statusBody = {
        error_code: 'ITEM_LOGIN_REQUIRED',
        error_code_reason: 'OAUTH_CONSENT_EXPIRED',
      };
      mockWebhookEventService.findPendingByWebhookId.mockResolvedValueOnce({
        id: 'pending-webhook',
        userId: mockUserId,
        webhookId: 'webhook-mock-123',
        webhookContent: null,
        status: 'pending',
        providerName,
        expiresAt: null,
        completedAt: null,
        errorMessage: null,
        context: {
          mode: 'update-bank-link',
          bankLinkId: mockBankLinkEntity.id,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      expect(mockPlaidProvider.processLinkCompletion).not.toHaveBeenCalled();
      expect(mockPlaidProvider.getAccounts).toHaveBeenCalledWith(
        mockBankLinkEntity.authentication,
      );
      expect(mockBankLinkRepository.update).toHaveBeenCalledWith(
        { id: mockBankLinkEntity.id, userId: mockUserId },
        expect.objectContaining({
          status: 'OK',
          statusBody: null,
        }),
      );
      expect(mockBankLinkRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ authentication: expect.anything() }),
      );
      expect(mockWebhookEventService.markCompleted).toHaveBeenCalledWith(
        'webhook-mock-123',
        mockParsedPayload,
      );
    });

    it('should create accounts with rawApiAccount from provider response', async () => {
      const providerName = 'plaid';

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      expect(mockAccountRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: mockApiAccount.name,
          externalAccountId: mockApiAccount.accountId,
          rawApiAccount: mockApiAccount,
        }),
      );
    });

    it('should save institution info to bank links', async () => {
      const providerName = 'plaid';

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      // Verify bank links are saved with institution info
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: mockInstitution.id,
          institutionName: mockInstitution.name,
        }),
      );
    });

    it('should update existing bank link instead of creating new one when itemId matches', async () => {
      const providerName = 'plaid';
      mockBankLinkEntity.authentication = {
        accessToken: 'old-access-token',
        itemId: 'item-mock-123',
        nextCursor: 'current-cursor',
        investmentTransactionsSync: { lastSyncedAt: '2026-08-01T00:00:00Z' },
      };

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      // findByPlaidItemId is called (via createQueryBuilder) to check for existing link
      expect(mockBankLinkRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockBankLinkRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockBankLinkEntity.id, userId: mockUserId },
        lock: { mode: 'pessimistic_write' },
      });

      // Should save the updated existing entity (not create a new one via fromDto)
      // The authentication now includes nextCursor from initial transaction sync
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockBankLinkEntity.id, // Same entity ID = update, not create
          status: 'OK',
          statusBody: null,
          authentication: expect.objectContaining({
            accessToken: 'access-token-123',
            itemId: 'item-mock-123',
            nextCursor: 'current-cursor',
            investmentTransactionsSync: {
              lastSyncedAt: '2026-08-01T00:00:00Z',
            },
          }),
        }),
      );
    });

    it('should create new bank link when no existing link found by itemId', async () => {
      const providerName = 'plaid';

      // Make findByPlaidItemId return null (no existing link)
      mockBankLinkRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      // Should save a new entity (without the existing entity's id)
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          providerName: 'plaid',
          authentication: {
            accessToken: 'access-token-123',
            itemId: 'item-mock-123',
          },
        }),
      );
    });

    it('should mark webhook as failed when processing throws error', async () => {
      const providerName = 'plaid';
      const errorMessage = 'Provider error';

      (
        mockPlaidProvider.processLinkCompletion as jest.Mock
      ).mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        service.handleWebhook(
          providerName,
          mockRawBody,
          mockHeaders,
          mockParsedPayload,
        ),
      ).rejects.toThrow(errorMessage);

      expect(mockWebhookEventService.markFailed).toHaveBeenCalledWith(
        'webhook-mock-123',
        errorMessage,
        mockParsedPayload,
      );
    });

    it('should convert an unlinked account in place when webhook has conversion context', async () => {
      const providerName = 'plaid';
      const convertAccountId = 'manual-account-123';
      mockBankLinkEntity.accountIds = ['acc-1', 'acc-2'];

      mockWebhookEventService.findPendingByWebhookId.mockResolvedValueOnce({
        id: 'pending-webhook',
        userId: mockUserId,
        webhookId: 'webhook-mock-123',
        webhookContent: null,
        status: 'pending',
        providerName,
        expiresAt: null,
        completedAt: null,
        errorMessage: null,
        context: {
          mode: 'convert-manual-account',
          convertAccountId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockAccountRepository.findOne
        .mockResolvedValueOnce({
          id: convertAccountId,
          userId: mockUserId,
          name: 'Emergency Fund',
          customName: null,
          bankLinkId: null,
        })
        .mockResolvedValueOnce(null);

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: convertAccountId,
          name: mockApiAccount.name,
          customName: 'Emergency Fund',
          externalAccountId: mockApiAccount.accountId,
          bankLinkId: mockBankLinkEntity.id,
        }),
      );
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockBankLinkEntity.id,
          accountIds: ['acc-1', 'acc-2', mockApiAccount.accountId],
        }),
      );
    });

    it('should fail conversion when provider returns multiple accounts', async () => {
      const providerName = 'plaid';
      const convertAccountId = 'manual-account-123';

      mockWebhookEventService.findPendingByWebhookId.mockResolvedValueOnce({
        id: 'pending-webhook',
        userId: mockUserId,
        webhookId: 'webhook-mock-123',
        webhookContent: null,
        status: 'pending',
        providerName,
        expiresAt: null,
        completedAt: null,
        errorMessage: null,
        context: {
          mode: 'convert-manual-account',
          convertAccountId,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      (
        mockPlaidProvider.processLinkCompletion as jest.Mock
      ).mockResolvedValueOnce([
        {
          ...mockLinkCompletionResponse,
          accounts: [mockApiAccount, { ...mockApiAccount, accountId: 'acc-2' }],
        },
      ]);

      await expect(
        service.handleWebhook(
          providerName,
          mockRawBody,
          mockHeaders,
          mockParsedPayload,
        ),
      ).rejects.toThrow(
        'Conversion requires exactly one selected provider account',
      );

      expect(mockWebhookEventService.markFailed).toHaveBeenCalledWith(
        'webhook-mock-123',
        'Conversion requires exactly one selected provider account',
        mockParsedPayload,
      );
    });

    it('should handle update webhook and trigger sync', async () => {
      const providerName = 'plaid';
      const updatePayload = {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'item-mock-123',
      };

      // Mock parseUpdateWebhook to return update info
      (mockPlaidProvider.parseUpdateWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        type: 'TRANSACTIONS',
      });

      // Mock findByPlaidItemId via createQueryBuilder
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBankLinkEntity),
      };
      mockBankLinkRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.handleWebhook(
        providerName,
        JSON.stringify(updatePayload),
        mockHeaders,
        updatePayload,
      );

      // Should have called parseUpdateWebhook
      expect(mockPlaidProvider.parseUpdateWebhook).toHaveBeenCalledWith(
        updatePayload,
      );
      // Should have looked up bank link by item_id
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '"bankLink"."authentication"->>\'itemId\' = :itemId',
        { itemId: 'item-mock-123' },
      );
      // Should NOT have processed as link completion
      expect(
        mockWebhookEventService.findPendingByWebhookId,
      ).not.toHaveBeenCalled();
    });

    it('should skip sync when no bank link found for update webhook', async () => {
      const providerName = 'plaid';
      const updatePayload = {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'unknown-item-id',
      };

      (mockPlaidProvider.parseUpdateWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'unknown-item-id',
        type: 'TRANSACTIONS',
      });

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockBankLinkRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      // Should not throw, just log warning
      await service.handleWebhook(
        providerName,
        JSON.stringify(updatePayload),
        mockHeaders,
        updatePayload,
      );

      expect(mockPlaidProvider.getAccounts).not.toHaveBeenCalled();
    });

    it('should sync investment holdings for HOLDINGS update webhook', async () => {
      const providerName = 'plaid';
      const updatePayload = {
        webhook_type: 'HOLDINGS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'item-mock-123',
      };

      (mockPlaidProvider.parseUpdateWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        type: 'HOLDINGS',
      });
      mockAccountRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'account-id-0',
            externalAccountId: 'plaid-acc-123',
            userId: mockUserId,
            bankLinkId: mockBankLinkEntity.id,
          },
        ]);
      mockAccountRepository.findOne.mockResolvedValueOnce({
        id: 'account-id-0',
        type: 'investment',
        userId: mockUserId,
        bankLinkId: mockBankLinkEntity.id,
      });

      await service.handleWebhook(
        providerName,
        JSON.stringify(updatePayload),
        mockHeaders,
        updatePayload,
      );

      expect(mockPlaidProvider.syncInvestmentHoldings).toHaveBeenCalledWith(
        mockBankLinkEntity.authentication,
      );
      expect(mockInvestmentService.upsertPlaidHoldings).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Map),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        expect.objectContaining({
          holdings: expect.any(Array) as unknown[],
          securities: expect.any(Array) as unknown[],
        }),
      );
    });

    it('should skip investment holdings sync for HOLDINGS webhook when the item has no investment accounts', async () => {
      const providerName = 'plaid';
      const updatePayload = {
        webhook_type: 'HOLDINGS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'item-mock-123',
      };

      (mockPlaidProvider.parseUpdateWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        type: 'HOLDINGS',
      });
      mockAccountRepository.find.mockResolvedValueOnce([]);
      mockAccountRepository.findOne.mockResolvedValueOnce(null);

      await service.handleWebhook(
        providerName,
        JSON.stringify(updatePayload),
        mockHeaders,
        updatePayload,
      );

      expect(mockPlaidProvider.syncInvestmentHoldings).not.toHaveBeenCalled();
      expect(mockInvestmentService.upsertPlaidHoldings).not.toHaveBeenCalled();
    });

    it('should sync investment transactions for INVESTMENTS_TRANSACTIONS webhook', async () => {
      const providerName = 'plaid';
      const updatePayload = {
        webhook_type: 'INVESTMENTS_TRANSACTIONS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'item-mock-123',
      };

      (mockPlaidProvider.parseUpdateWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        type: 'INVESTMENTS_TRANSACTIONS',
      });
      mockAccountRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'account-id-0',
            externalAccountId: 'plaid-acc-123',
            userId: mockUserId,
            bankLinkId: mockBankLinkEntity.id,
          },
        ]);
      mockAccountRepository.findOne.mockResolvedValueOnce({
        id: 'account-id-0',
        type: 'investment',
        userId: mockUserId,
        bankLinkId: mockBankLinkEntity.id,
      });

      await service.handleWebhook(
        providerName,
        JSON.stringify(updatePayload),
        mockHeaders,
        updatePayload,
      );

      expect(mockPlaidProvider.syncInvestmentTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'test-token' }),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      expect(
        mockInvestmentService.upsertPlaidInvestmentTransactions,
      ).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Map),
        expect.objectContaining({
          transactions: expect.any(Array) as unknown[],
          securities: expect.any(Array) as unknown[],
        }),
      );
    });

    it('should handle ERROR status webhook and update bank link status', async () => {
      const providerName = 'plaid';
      const errorPayload = {
        webhook_type: 'ITEM',
        webhook_code: 'ERROR',
        item_id: 'item-mock-123',
        error: {
          error_type: 'ITEM_ERROR',
          error_code: 'ITEM_LOGIN_REQUIRED',
          error_code_reason: 'OAUTH_CONSENT_EXPIRED',
          error_message: 'the login details of this item have changed',
          display_message: 'Please update your credentials',
          suggested_action: 'relink',
        },
      };

      (mockPlaidProvider.parseStatusWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        webhookCode: 'ERROR',
        status: 'ERROR',
        statusBody: errorPayload.error,
        shouldSync: false,
      });
      (
        mockPlaidProvider.getConnectionDiagnostics as jest.Mock
      ).mockResolvedValueOnce({
        error_type: null,
        error_code: null,
        error_code_reason: null,
        error_message: null,
        consent_expiration_time: '2027-08-01T00:00:00Z',
        update_type: 'background',
      });

      const bankLinkWithStatus = {
        ...mockBankLinkEntity,
        authentication: {
          accessToken: 'test-token',
          nextCursor: 'current-cursor',
        },
        status: 'OK',
        statusDate: new Date(),
        statusBody: null,
        userId: mockUserId,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(bankLinkWithStatus),
      };
      mockBankLinkRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.handleWebhook(
        providerName,
        JSON.stringify(errorPayload),
        mockHeaders,
        errorPayload,
      );

      // Should have called parseStatusWebhook
      expect(mockPlaidProvider.parseStatusWebhook).toHaveBeenCalledWith(
        errorPayload,
      );
      // Should have updated the bank link status
      expect(mockBankLinkRepository.update).toHaveBeenCalledWith(
        { id: bankLinkWithStatus.id, userId: mockUserId },
        expect.objectContaining({
          status: 'ERROR',
          statusBody: {
            ...errorPayload.error,
            consent_expiration_time: '2027-08-01T00:00:00Z',
            update_type: 'background',
          },
        }),
      );
      expect(mockBankLinkRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ authentication: expect.anything() }),
      );
      // Should NOT have synced accounts
      expect(mockPlaidProvider.getAccounts).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        BankLinkEvents.NEEDS_ATTENTION,
        expect.objectContaining({
          userId: mockUserId,
          bankLinkId: bankLinkWithStatus.id,
          providerName: 'plaid',
          status: 'ERROR',
          statusBody: expect.objectContaining({
            error_code: 'ITEM_LOGIN_REQUIRED',
            error_code_reason: 'OAUTH_CONSENT_EXPIRED',
            error_message: 'the login details of this item have changed',
            update_type: 'background',
          }),
        }),
      );
    });

    it('should handle LOGIN_REPAIRED status webhook and trigger sync', async () => {
      const providerName = 'plaid';
      const repairedPayload = {
        webhook_type: 'ITEM',
        webhook_code: 'LOGIN_REPAIRED',
        item_id: 'item-mock-123',
        environment: 'production',
      };

      (mockPlaidProvider.parseStatusWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        webhookCode: 'LOGIN_REPAIRED',
        status: 'OK',
        statusBody: null,
        shouldSync: true,
      });

      const bankLinkWithError = {
        ...mockBankLinkEntity,
        status: 'ERROR',
        statusDate: new Date(),
        statusBody: { error_code: 'ITEM_LOGIN_REQUIRED' },
        userId: mockUserId,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(bankLinkWithError),
      };
      mockBankLinkRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      // Setup for syncAccounts call
      mockBankLinkRepository.findOne.mockResolvedValue(bankLinkWithError);
      mockAccountRepository.find.mockResolvedValue([]);

      await service.handleWebhook(
        providerName,
        JSON.stringify(repairedPayload),
        mockHeaders,
        repairedPayload,
      );

      // Should have updated status to OK and cleared statusBody
      expect(mockBankLinkRepository.update).toHaveBeenCalledWith(
        { id: bankLinkWithError.id, userId: mockUserId },
        expect.objectContaining({
          status: 'OK',
          statusBody: null,
        }),
      );
      // Should have triggered account sync
      expect(mockPlaidProvider.getAccounts).toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        BankLinkEvents.NEEDS_ATTENTION,
        expect.anything(),
      );
    });

    it('should handle PENDING_DISCONNECT status webhook', async () => {
      const providerName = 'plaid';
      const disconnectPayload = {
        webhook_type: 'ITEM',
        webhook_code: 'PENDING_DISCONNECT',
        item_id: 'item-mock-123',
        environment: 'production',
      };

      (mockPlaidProvider.parseStatusWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        webhookCode: 'PENDING_DISCONNECT',
        status: 'PENDING_REAUTH',
        statusBody: { environment: 'production' },
        shouldSync: false,
      });

      const bankLinkWithStatus = {
        ...mockBankLinkEntity,
        status: 'OK',
        statusDate: new Date(),
        statusBody: null,
        userId: mockUserId,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(bankLinkWithStatus),
      };
      mockBankLinkRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.handleWebhook(
        providerName,
        JSON.stringify(disconnectPayload),
        mockHeaders,
        disconnectPayload,
      );

      expect(mockBankLinkRepository.update).toHaveBeenCalledWith(
        { id: bankLinkWithStatus.id, userId: mockUserId },
        expect.objectContaining({
          status: 'PENDING_REAUTH',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        BankLinkEvents.NEEDS_ATTENTION,
        expect.objectContaining({
          userId: mockUserId,
          bankLinkId: bankLinkWithStatus.id,
          providerName: 'plaid',
          status: 'PENDING_REAUTH',
          statusBody: { environment: 'production' },
        }),
      );
    });

    it('should not notify again when status webhook repeats the current bad status', async () => {
      const providerName = 'plaid';
      const errorPayload = {
        webhook_type: 'ITEM',
        webhook_code: 'ERROR',
        item_id: 'item-mock-123',
        error: {
          error_code: 'ITEM_LOGIN_REQUIRED',
        },
      };

      (mockPlaidProvider.parseStatusWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'item-mock-123',
        webhookCode: 'ERROR',
        status: 'ERROR',
        statusBody: errorPayload.error,
        shouldSync: false,
      });

      const bankLinkWithError = {
        ...mockBankLinkEntity,
        status: 'ERROR',
        statusDate: new Date(),
        statusBody: errorPayload.error,
        userId: mockUserId,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(bankLinkWithError),
      };
      mockBankLinkRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.handleWebhook(
        providerName,
        JSON.stringify(errorPayload),
        mockHeaders,
        errorPayload,
      );

      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        BankLinkEvents.NEEDS_ATTENTION,
        expect.anything(),
      );
    });

    it('should skip status webhook when no bank link found', async () => {
      const providerName = 'plaid';
      const errorPayload = {
        webhook_type: 'ITEM',
        webhook_code: 'ERROR',
        item_id: 'unknown-item',
      };

      (mockPlaidProvider.parseStatusWebhook as jest.Mock).mockReturnValueOnce({
        itemId: 'unknown-item',
        webhookCode: 'ERROR',
        status: 'ERROR',
        statusBody: null,
        shouldSync: false,
      });

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockBankLinkRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.handleWebhook(
        providerName,
        JSON.stringify(errorPayload),
        mockHeaders,
        errorPayload,
      );

      // Should not have saved anything
      expect(mockBankLinkRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('syncAccounts', () => {
    beforeEach(() => {
      // Reset the bank link entity mock to ensure providerName is 'plaid'
      mockBankLinkRepository.findOne.mockResolvedValue(mockBankLinkEntity);
      mockAccountRepository.find = jest.fn().mockResolvedValue([]);
    });

    it('should fetch accounts from provider and save them', async () => {
      const result = await service.syncAccounts(mockBankLink.id, mockUserId);

      expect(providerRegistry.getProvider).toHaveBeenCalledWith('plaid');

      expect(mockPlaidProvider.getAccounts).toHaveBeenCalledWith({
        accessToken: 'test-token',
      });
      expect(mockAccountRepository.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when bank link not found', async () => {
      mockBankLinkRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.syncAccounts('non-existent-id', mockUserId),
      ).rejects.toThrow('Bank link not found: non-existent-id');
    });

    it('should throw error when bank link belongs to different user', async () => {
      mockBankLinkRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.syncAccounts(mockBankLink.id, 'different-user'),
      ).rejects.toThrow(`Bank link not found: ${mockBankLink.id}`);
    });

    it('should update existing accounts when matched by externalAccountId', async () => {
      const existingAccountEntity = {
        id: 'existing-account-id',
        bankLinkId: mockBankLink.id,
        externalAccountId: mockApiAccount.accountId,
        name: 'Old Name',
        currentBalance: { currency: 'USD', amount: 10000, sign: 'positive' },
        toObject: jest.fn().mockReturnValue({
          id: 'existing-account-id',
          name: mockApiAccount.name,
        }),
      };
      mockAccountRepository.find.mockResolvedValueOnce([existingAccountEntity]);

      await service.syncAccounts(mockBankLink.id, mockUserId);

      // Should have updated the existing entity
      expect(existingAccountEntity.name).toBe(mockApiAccount.name);
      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-account-id',
        }),
      );
    });

    it('should create new accounts when no match found', async () => {
      await service.syncAccounts(mockBankLink.id, mockUserId);

      expect(mockAccountRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          externalAccountId: mockApiAccount.accountId,
          name: mockApiAccount.name,
        }),
      );
    });

    it('should update institution info when it changes', async () => {
      // Create a bank link entity with different institution info
      const bankLinkWithOldInstitution = {
        ...mockBankLinkEntity,
        institutionId: 'old-institution-id',
        institutionName: 'Old Bank Name',
        userId: mockUserId,
      };
      mockBankLinkRepository.findOne.mockResolvedValueOnce(
        bankLinkWithOldInstitution,
      );

      await service.syncAccounts(mockBankLink.id, mockUserId);

      // Verify bank link is saved with updated institution info
      expect(mockBankLinkRepository.update).toHaveBeenCalledWith(
        { id: mockBankLink.id, userId: mockUserId },
        {
          institutionId: mockInstitution.id,
          institutionName: mockInstitution.name,
        },
      );
    });

    it('should not update institution info when unchanged', async () => {
      // Create a bank link entity with same institution info
      const bankLinkWithSameInstitution = {
        ...mockBankLinkEntity,
        institutionId: mockInstitution.id,
        institutionName: mockInstitution.name,
        userId: mockUserId,
      };
      mockBankLinkRepository.findOne.mockResolvedValueOnce(
        bankLinkWithSameInstitution,
      );
      mockAccountRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'account-1', externalAccountId: 'acc-1' },
          { id: 'account-2', externalAccountId: 'acc-2' },
        ]);

      await service.syncAccounts(mockBankLink.id, mockUserId);

      expect(mockBankLinkRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          institutionId: expect.anything(),
          institutionName: expect.anything(),
        }),
      );
    });

    it('should handle missing institution info from provider gracefully', async () => {
      // Mock getAccounts to return no institution info
      (mockPlaidProvider.getAccounts as jest.Mock).mockResolvedValueOnce({
        accounts: [mockApiAccount],
        institution: undefined,
      });

      const bankLinkWithInstitution = {
        ...mockBankLinkEntity,
        institutionId: 'existing-id',
        institutionName: 'Existing Bank',
        userId: mockUserId,
      };
      mockBankLinkRepository.findOne.mockResolvedValueOnce(
        bankLinkWithInstitution,
      );
      mockAccountRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'account-1', externalAccountId: 'acc-1' },
          { id: 'account-2', externalAccountId: 'acc-2' },
        ]);

      // Should not throw and should not update institution
      await service.syncAccounts(mockBankLink.id, mockUserId);

      expect(mockBankLinkRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          institutionId: expect.anything(),
          institutionName: expect.anything(),
        }),
      );
    });

    it('reconciles the accountIds cache from active relational accounts', async () => {
      const staleBankLink = {
        ...mockBankLinkEntity,
        userId: mockUserId,
        accountIds: ['archived-or-stale-account'],
      };
      mockBankLinkRepository.findOne.mockResolvedValueOnce(staleBankLink);
      mockAccountRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'active-account',
            externalAccountId: mockApiAccount.accountId,
            bankLinkId: mockBankLink.id,
            userId: mockUserId,
            archivedAt: null,
          },
        ]);

      await service.syncAccounts(mockBankLink.id, mockUserId);

      expect(mockBankLinkRepository.update).toHaveBeenCalledWith(
        { id: mockBankLink.id, userId: mockUserId },
        { accountIds: [mockApiAccount.accountId] },
      );
      expect(staleBankLink.authentication).toEqual({
        accessToken: 'test-token',
      });
    });
  });

  describe('syncAllAccounts', () => {
    beforeEach(() => {
      mockBankLinkRepository.find.mockResolvedValue([mockBankLinkEntity]);
      mockBankLinkRepository.findOne.mockResolvedValue(mockBankLinkEntity);
      mockAccountRepository.find.mockResolvedValue([]);
    });

    it('should fetch all bank links for user and sync accounts for each', async () => {
      const result = await service.syncAllAccounts(mockUserId);

      expect(mockBankLinkRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockBankLinkRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockBankLink.id, userId: mockUserId },
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when no bank links exist for user', async () => {
      mockBankLinkRepository.find.mockResolvedValueOnce([]);

      const result = await service.syncAllAccounts(mockUserId);

      expect(result).toEqual([]);
      expect(mockBankLinkRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });

    it('should continue syncing other bank links when one fails', async () => {
      const secondBankLinkEntity = {
        ...mockBankLinkEntity,
        id: 'second-bank-link-id',
        userId: mockUserId,
        toObject: jest.fn().mockReturnValue({
          ...mockBankLink,
          id: 'second-bank-link-id',
        }),
      };
      mockBankLinkRepository.find.mockResolvedValueOnce([
        mockBankLinkEntity,
        secondBankLinkEntity,
      ]);

      // First call to findOne succeeds, second throws an error
      mockBankLinkRepository.findOne
        .mockResolvedValueOnce(null) // First bank link not found (simulating error path)
        .mockResolvedValueOnce(secondBankLinkEntity);

      const result = await service.syncAllAccounts(mockUserId);

      // Should still have results from the second successful sync
      expect(result).toBeDefined();
    });
  });

  describe('syncAllInvestmentHoldings', () => {
    beforeEach(() => {
      mockBankLinkRepository.find.mockResolvedValue([mockBankLinkEntity]);
      mockBankLinkRepository.findOne.mockResolvedValue(mockBankLinkEntity);
      mockAccountRepository.findOne.mockResolvedValue({
        id: 'account-id-0',
        type: 'investment',
        userId: mockUserId,
        bankLinkId: mockBankLinkEntity.id,
      });
      mockAccountRepository.find.mockResolvedValue([
        {
          id: 'account-id-0',
          externalAccountId: 'plaid-acc-123',
          userId: mockUserId,
          bankLinkId: mockBankLinkEntity.id,
        },
      ]);
    });

    it('should sync holdings for providers that support investments', async () => {
      const result = await service.syncAllInvestmentHoldings(mockUserId);

      expect(mockPlaidProvider.syncInvestmentHoldings).toHaveBeenCalledWith(
        mockBankLinkEntity.authentication,
      );
      expect(mockInvestmentService.upsertPlaidHoldings).toHaveBeenCalled();
      expect(result).toEqual({ synced: 1, failed: 0, skipped: 0 });
    });

    it('should skip providers without holdings support', async () => {
      const originalSyncInvestmentHoldings =
        mockPlaidProvider.syncInvestmentHoldings;
      delete mockPlaidProvider.syncInvestmentHoldings;

      const result = await service.syncAllInvestmentHoldings(mockUserId);

      expect(result).toEqual({ synced: 0, failed: 0, skipped: 1 });
      mockPlaidProvider.syncInvestmentHoldings = originalSyncInvestmentHoldings;
    });

    it('should skip provider calls when the bank link has no investment accounts', async () => {
      mockAccountRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.syncAllInvestmentHoldings(mockUserId);

      expect(mockPlaidProvider.syncInvestmentHoldings).not.toHaveBeenCalled();
      expect(mockInvestmentService.upsertPlaidHoldings).not.toHaveBeenCalled();
      expect(result).toEqual({ synced: 0, failed: 0, skipped: 1 });
    });
  });

  describe('syncAllInvestmentTransactions', () => {
    beforeEach(() => {
      mockBankLinkRepository.find.mockResolvedValue([mockBankLinkEntity]);
      mockBankLinkRepository.findOne.mockResolvedValue(mockBankLinkEntity);
      mockAccountRepository.findOne.mockResolvedValue({
        id: 'account-id-0',
        type: 'investment',
        userId: mockUserId,
        bankLinkId: mockBankLinkEntity.id,
      });
      mockAccountRepository.find.mockResolvedValue([
        {
          id: 'account-id-0',
          externalAccountId: 'plaid-acc-123',
          userId: mockUserId,
          bankLinkId: mockBankLinkEntity.id,
        },
      ]);
    });

    it('should sync investment transactions for providers that support them', async () => {
      const staleBankLink = {
        ...mockBankLinkEntity,
        authentication: { accessToken: 'test-token' },
      };
      const currentBankLink = {
        ...mockBankLinkEntity,
        authentication: {
          accessToken: 'test-token',
          nextCursor: 'current-cursor',
        },
      };
      mockBankLinkRepository.find.mockResolvedValueOnce([staleBankLink]);
      mockBankLinkRepository.findOne
        .mockResolvedValueOnce(staleBankLink)
        .mockResolvedValueOnce(currentBankLink);

      const result = await service.syncAllInvestmentTransactions(mockUserId);

      expect(mockPlaidProvider.syncInvestmentTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'test-token' }),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      expect(
        mockInvestmentService.upsertPlaidInvestmentTransactions,
      ).toHaveBeenCalled();
      expect(mockBankLinkRepository.findOne).toHaveBeenCalledWith({
        where: { id: currentBankLink.id, userId: mockUserId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            nextCursor: 'current-cursor',
            investmentTransactionsSync: expect.objectContaining({
              lastSyncedAt: expect.any(String),
              lastStartDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
              lastEndDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            }),
          }),
        }),
      );
      expect(result).toEqual({ synced: 1, failed: 0, skipped: 0 });
    });

    it('should skip providers without investment transaction support', async () => {
      const originalSyncInvestmentTransactions =
        mockPlaidProvider.syncInvestmentTransactions;
      delete mockPlaidProvider.syncInvestmentTransactions;

      const result = await service.syncAllInvestmentTransactions(mockUserId);

      expect(result).toEqual({ synced: 0, failed: 0, skipped: 1 });
      mockPlaidProvider.syncInvestmentTransactions =
        originalSyncInvestmentTransactions;
    });

    it('should skip provider calls when the bank link has no investment accounts', async () => {
      mockAccountRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.syncAllInvestmentTransactions(mockUserId);

      expect(
        mockPlaidProvider.syncInvestmentTransactions,
      ).not.toHaveBeenCalled();
      expect(
        mockInvestmentService.upsertPlaidInvestmentTransactions,
      ).not.toHaveBeenCalled();
      expect(result).toEqual({ synced: 0, failed: 0, skipped: 1 });
    });
  });

  describe('backfillPlaidItemIds', () => {
    beforeEach(() => {
      mockBankLinkRepository.find.mockResolvedValue([]);
    });

    it('should backfill item IDs for bank links without them', async () => {
      const bankLinkWithoutItemId = {
        ...mockBankLinkEntity,
        authentication: { accessToken: 'test-token' }, // No itemId
      };
      mockBankLinkRepository.find.mockResolvedValueOnce([
        bankLinkWithoutItemId,
      ]);
      mockBankLinkRepository.findOne.mockResolvedValueOnce({
        ...bankLinkWithoutItemId,
        authentication: {
          accessToken: 'test-token',
          nextCursor: 'current-cursor',
        },
      });

      const result = await service.backfillPlaidItemIds(mockUserId);

      expect(mockBankLinkRepository.find).toHaveBeenCalledWith({
        where: { providerName: 'plaid', userId: mockUserId },
      });
      expect(mockPlaidProvider.getItemId).toHaveBeenCalledWith({
        accessToken: 'test-token',
      });
      expect(mockBankLinkRepository.findOne).toHaveBeenCalledWith({
        where: { id: bankLinkWithoutItemId.id, userId: mockUserId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: {
            accessToken: 'test-token',
            nextCursor: 'current-cursor',
            itemId: 'item-mock-123',
          },
        }),
      );
      expect(result).toBe(1);
    });

    it('should skip bank links that already have itemId', async () => {
      const bankLinkWithItemId = {
        ...mockBankLinkEntity,
        authentication: { accessToken: 'test-token', itemId: 'existing-item' },
      };
      mockBankLinkRepository.find.mockResolvedValueOnce([bankLinkWithItemId]);

      const result = await service.backfillPlaidItemIds(mockUserId);

      expect(mockPlaidProvider.getItemId).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should continue processing when one bank link fails', async () => {
      const bankLink1 = {
        ...mockBankLinkEntity,
        id: 'bank-link-1',
        authentication: { accessToken: 'token-1' },
      };
      const bankLink2 = {
        ...mockBankLinkEntity,
        id: 'bank-link-2',
        authentication: { accessToken: 'token-2' },
      };
      mockBankLinkRepository.find.mockResolvedValueOnce([bankLink1, bankLink2]);

      // First call fails, second succeeds
      (mockPlaidProvider.getItemId as jest.Mock)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce('item-2');

      const result = await service.backfillPlaidItemIds(mockUserId);

      // Should have processed both but only succeeded for one
      expect(mockPlaidProvider.getItemId).toHaveBeenCalledTimes(2);
      expect(result).toBe(1);
    });

    it('should return 0 when no bank links exist', async () => {
      mockBankLinkRepository.find.mockResolvedValueOnce([]);

      const result = await service.backfillPlaidItemIds(mockUserId);

      expect(result).toBe(0);
      expect(mockPlaidProvider.getItemId).not.toHaveBeenCalled();
    });
  });

  describe('upsertAccountsFromAPI', () => {
    const bankLinkId = 'bank-link-123';

    beforeEach(() => {
      mockAccountRepository.find.mockResolvedValue([]);
      mockAccountRepository.findOne.mockResolvedValue(null);
    });

    it('should return empty array when no accounts provided', async () => {
      const result = await service.upsertAccountsFromAPI(
        [],
        new Map<string, string>(),
        mockUserId,
      );

      expect(result).toEqual([]);
      expect(mockAccountRepository.find).not.toHaveBeenCalled();
      expect(mockAccountRepository.insert).not.toHaveBeenCalled();
      expect(mockAccountRepository.save).not.toHaveBeenCalled();
    });

    it('should create new accounts when none exist', async () => {
      const accountIdToBankLinkId = new Map<string, string>();
      accountIdToBankLinkId.set(mockApiAccount.accountId, bankLinkId);

      const result = await service.upsertAccountsFromAPI(
        [mockApiAccount],
        accountIdToBankLinkId,
        mockUserId,
      );

      expect(mockAccountRepository.find).toHaveBeenCalledWith({
        where: [
          {
            userId: mockUserId,
            bankLinkId,
            externalAccountId: mockApiAccount.accountId,
          },
        ],
      });
      expect(mockAccountRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: mockApiAccount.name,
          externalAccountId: mockApiAccount.accountId,
          bankLinkId,
        }),
      );
      expect(mockAccountRepository.save).not.toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        LinkedAccountEvents.CREATED,
        expect.anything(),
      );
    });

    it('should update existing accounts matched by externalAccountId', async () => {
      const existingAccountEntity = {
        id: 'existing-account-id',
        bankLinkId,
        externalAccountId: mockApiAccount.accountId,
        name: 'Old Name',
        currentBalance: { currency: 'USD', amount: 10000, sign: 'positive' },
        toObject: jest.fn().mockReturnValue({
          id: 'existing-account-id',
          name: mockApiAccount.name,
          externalAccountId: mockApiAccount.accountId,
        }),
      };
      mockAccountRepository.find.mockResolvedValueOnce([existingAccountEntity]);

      const accountIdToBankLinkId = new Map<string, string>();
      accountIdToBankLinkId.set(mockApiAccount.accountId, bankLinkId);

      await service.upsertAccountsFromAPI(
        [mockApiAccount],
        accountIdToBankLinkId,
        mockUserId,
      );

      // Should have updated the existing entity's name
      expect(existingAccountEntity.name).toBe(mockApiAccount.name);
      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-account-id',
        }),
      );
    });

    it('should handle mixed scenario with new and existing accounts', async () => {
      const existingAccountEntity = {
        id: 'existing-account-id',
        bankLinkId,
        externalAccountId: mockApiAccount.accountId,
        name: 'Old Name',
        currentBalance: { currency: 'USD', amount: 10000, sign: 'positive' },
        toObject: jest.fn().mockReturnValue({
          id: 'existing-account-id',
          name: mockApiAccount.name,
        }),
      };
      mockAccountRepository.find.mockResolvedValueOnce([existingAccountEntity]);

      const newApiAccount: typeof mockApiAccount = {
        ...mockApiAccount,
        accountId: 'new-account-456',
        name: 'New Savings Account',
      };

      const accountIdToBankLinkId = new Map<string, string>();
      accountIdToBankLinkId.set(mockApiAccount.accountId, bankLinkId);
      accountIdToBankLinkId.set(newApiAccount.accountId, bankLinkId);

      await service.upsertAccountsFromAPI(
        [mockApiAccount, newApiAccount],
        accountIdToBankLinkId,
        mockUserId,
      );

      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-account-id',
        }),
      );
      expect(mockAccountRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          externalAccountId: 'new-account-456',
          name: 'New Savings Account',
        }),
      );
    });

    it('should preserve customName when syncing existing accounts', async () => {
      const existingAccountEntity = {
        id: 'existing-account-id',
        bankLinkId,
        externalAccountId: mockApiAccount.accountId,
        name: 'Old Name',
        customName: 'My Custom Name',
        currentBalance: { currency: 'USD', amount: 10000, sign: 'positive' },
        toObject: jest.fn().mockReturnValue({
          id: 'existing-account-id',
          name: mockApiAccount.name,
          customName: 'My Custom Name',
          externalAccountId: mockApiAccount.accountId,
        }),
      };
      mockAccountRepository.find.mockResolvedValueOnce([existingAccountEntity]);

      const accountIdToBankLinkId = new Map<string, string>();
      accountIdToBankLinkId.set(mockApiAccount.accountId, bankLinkId);

      await service.upsertAccountsFromAPI(
        [mockApiAccount],
        accountIdToBankLinkId,
        mockUserId,
      );

      // customName should be preserved (applyAccountDtoToEntity doesn't touch it)
      expect(existingAccountEntity.customName).toBe('My Custom Name');
    });

    it('should reuse an account created by a concurrent sync', async () => {
      const competingAccount = {
        id: 'competing-account-id',
        userId: mockUserId,
        bankLinkId,
        externalAccountId: mockApiAccount.accountId,
        archivedAt: null,
        name: mockApiAccount.name,
        currentBalance: {
          currency: 'USD',
          amount: 10000,
          sign: 'positive',
        },
        toObject: jest.fn().mockReturnValue({
          id: 'competing-account-id',
          externalAccountId: mockApiAccount.accountId,
        }),
      };
      mockAccountRepository.findOne.mockResolvedValueOnce(competingAccount);
      mockAccountRepository.insert.mockRejectedValueOnce({
        driverError: {
          code: '23505',
          constraint: 'UQ_account_user_bank_link_external',
        },
      });

      const result = await service.upsertAccountsFromAPI(
        [mockApiAccount],
        new Map([[mockApiAccount.accountId, bankLinkId]]),
        mockUserId,
      );

      expect(result).toEqual([
        expect.objectContaining({ id: 'competing-account-id' }),
      ]);
      expect(mockAccountRepository.save).toHaveBeenCalledWith(competingAccount);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        LinkedAccountEvents.UPDATED,
        expect.anything(),
      );
      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        LinkedAccountEvents.CREATED,
        expect.anything(),
      );
    });

    it('should rethrow unrelated insert conflicts', async () => {
      mockAccountRepository.insert.mockRejectedValueOnce({
        driverError: {
          code: '23505',
          constraint: 'some_other_constraint',
        },
      });

      await expect(
        service.upsertAccountsFromAPI(
          [mockApiAccount],
          new Map([[mockApiAccount.accountId, bankLinkId]]),
          mockUserId,
        ),
      ).rejects.toEqual(
        expect.objectContaining({
          driverError: expect.objectContaining({
            constraint: 'some_other_constraint',
          }),
        }),
      );
    });

    it('should throw error when bankLinkId is missing from map', async () => {
      const emptyMap = new Map<string, string>();

      await expect(
        service.upsertAccountsFromAPI([mockApiAccount], emptyMap, mockUserId),
      ).rejects.toThrow(
        `Bank link ID not found for account ${mockApiAccount.accountId}`,
      );
    });
  });

  describe('syncTransactions', () => {
    beforeEach(() => {
      mockBankLinkRepository.findOne.mockResolvedValue({
        ...mockBankLinkEntity,
        userId: mockUserId,
      });
      mockAccountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'internal-acc-1',
            externalAccountId: 'acc-1',
            archivedAt: null,
          },
          {
            id: 'internal-acc-2',
            externalAccountId: 'acc-2',
            archivedAt: null,
          },
        ])
        .mockResolvedValueOnce([]);
      mockTransactionService.processSyncResults.mockImplementation(
        async (_userId, _accountIdMap, _syncResults, hooks) =>
          mockBankLinkRepository.manager.transaction(async (manager) => {
            await hooks?.beforeChanges?.(manager);
            await hooks?.beforeCommit?.(manager);
          }),
      );
    });

    it('should call provider syncTransactions and process results', async () => {
      await service.syncTransactions(mockBankLink.id, mockUserId);

      expect(mockPlaidProvider.syncTransactions).toHaveBeenCalledWith(
        { accessToken: 'test-token' },
        undefined,
      );
      expect(mockTransactionService.processSyncResults).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Map),
        expect.objectContaining({
          added: [],
          modified: [],
          removed: [],
          nextCursor: 'cursor-mock-123',
        }),
        expect.objectContaining({
          beforeChanges: expect.any(Function),
          beforeCommit: expect.any(Function),
        }),
      );
      expect(mockAccountRepository.find).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          bankLinkId: mockBankLink.id,
          archivedAt: expect.any(Object),
        },
      });
    });

    it('should update cursor in authentication after sync', async () => {
      await service.syncTransactions(mockBankLink.id, mockUserId);

      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            nextCursor: 'cursor-mock-123',
          }),
        }),
      );
    });

    it('should pass existing cursor to provider when available', async () => {
      mockBankLinkRepository.findOne.mockResolvedValue({
        ...mockBankLinkEntity,
        userId: mockUserId,
        authentication: {
          accessToken: 'test-token',
          nextCursor: 'existing-cursor',
        },
      });

      await service.syncTransactions(mockBankLink.id, mockUserId);

      expect(mockPlaidProvider.syncTransactions).toHaveBeenCalledWith(
        { accessToken: 'test-token', nextCursor: 'existing-cursor' },
        'existing-cursor',
      );
    });

    it('uses active relational accounts even when the accountIds cache is stale', async () => {
      mockBankLinkRepository.findOne.mockResolvedValue({
        ...mockBankLinkEntity,
        userId: mockUserId,
        accountIds: ['stale-cached-account'],
      });
      mockAccountRepository.find
        .mockReset()
        .mockResolvedValueOnce([
          {
            id: 'internal-relational-account',
            externalAccountId: 'provider-account',
            bankLinkId: mockBankLink.id,
            userId: mockUserId,
            archivedAt: null,
          },
        ])
        .mockResolvedValueOnce([]);
      mockPlaidSyncTransactions.mockResolvedValueOnce({
        added: [
          {
            accountId: 'provider-account',
            amount: {
              money: { amount: 1200, currency: 'USD' },
              sign: MoneySign.NEGATIVE,
            },
            merchantName: 'Store',
            pending: false,
            providerDate: '2026-08-15',
            externalTransactionId: 'provider-transaction',
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'next-cursor',
        hasMore: false,
      });

      await service.syncTransactions(mockBankLink.id, mockUserId);

      const accountIdMap = mockTransactionService.processSyncResults.mock
        .calls[0][1] as Map<string, string>;
      expect(accountIdMap).toEqual(
        new Map([['provider-account', 'internal-relational-account']]),
      );
    });

    it('refreshes accounts once and hard-fails without advancing the cursor when an account remains unknown', async () => {
      mockAccountRepository.find.mockResolvedValue([]);
      mockPlaidSyncTransactions.mockResolvedValueOnce({
        added: [
          {
            accountId: 'unknown-provider-account',
            amount: {
              money: { amount: 1200, currency: 'USD' },
              sign: MoneySign.NEGATIVE,
            },
            merchantName: 'Store',
            pending: false,
            providerDate: '2026-08-15',
            externalTransactionId: 'provider-transaction',
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'must-not-persist',
        hasMore: false,
      });

      await expect(
        service.syncTransactions(mockBankLink.id, mockUserId),
      ).rejects.toThrow(
        'unknown provider accounts after account refresh: unknown-provider-account',
      );

      expect(mockPlaidProvider.getAccounts).toHaveBeenCalledTimes(1);
      expect(mockTransactionService.processSyncResults).not.toHaveBeenCalled();
      expect(mockBankLinkRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            nextCursor: 'must-not-persist',
          }),
        }),
      );
    });

    it('ignores provider changes for intentionally archived accounts while advancing the cursor', async () => {
      mockAccountRepository.find
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'archived-account',
            externalAccountId: 'archived-provider-account',
            bankLinkId: mockBankLink.id,
            userId: mockUserId,
            archivedAt: new Date('2026-08-01T00:00:00Z'),
          },
        ]);
      mockPlaidSyncTransactions.mockResolvedValueOnce({
        added: [
          {
            accountId: 'archived-provider-account',
            amount: {
              money: { amount: 1200, currency: 'USD' },
              sign: MoneySign.NEGATIVE,
            },
            merchantName: 'Hidden Store',
            pending: false,
            providerDate: '2026-08-15',
            externalTransactionId: 'archived-provider-transaction',
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor-after-archived-change',
        hasMore: false,
      });

      await service.syncTransactions(mockBankLink.id, mockUserId);

      expect(mockPlaidProvider.getAccounts).not.toHaveBeenCalled();
      expect(mockTransactionService.processSyncResults).toHaveBeenCalledWith(
        mockUserId,
        new Map(),
        expect.objectContaining({ added: [], modified: [] }),
        expect.any(Object),
      );
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            nextCursor: 'cursor-after-archived-change',
          }),
        }),
      );
    });

    it('refetches from the current cursor when a concurrent sync advances it', async () => {
      const cursorA = {
        ...mockBankLinkEntity,
        authentication: { accessToken: 'test-token', nextCursor: 'cursor-a' },
      };
      const cursorB = {
        ...mockBankLinkEntity,
        authentication: { accessToken: 'test-token', nextCursor: 'cursor-b' },
      };
      mockBankLinkRepository.findOne
        .mockResolvedValueOnce(cursorA)
        .mockResolvedValueOnce(cursorB)
        .mockResolvedValueOnce(cursorB)
        .mockResolvedValueOnce(cursorB);
      mockAccountRepository.find
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPlaidSyncTransactions
        .mockResolvedValueOnce({
          added: [],
          modified: [],
          removed: [],
          nextCursor: 'stale-result-cursor',
          hasMore: false,
        })
        .mockResolvedValueOnce({
          added: [],
          modified: [],
          removed: [],
          nextCursor: 'fresh-result-cursor',
          hasMore: false,
        });

      await service.syncTransactions(mockBankLink.id, mockUserId);

      expect(mockPlaidProvider.syncTransactions).toHaveBeenNthCalledWith(
        1,
        cursorA.authentication,
        'cursor-a',
      );
      expect(mockPlaidProvider.syncTransactions).toHaveBeenNthCalledWith(
        2,
        { accessToken: 'test-token', nextCursor: 'cursor-b' },
        'cursor-b',
      );
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            nextCursor: 'fresh-result-cursor',
          }),
        }),
      );
      expect(mockBankLinkRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            nextCursor: 'stale-result-cursor',
          }),
        }),
      );
    });

    it('should throw when bank link not found', async () => {
      mockBankLinkRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.syncTransactions('non-existent', mockUserId),
      ).rejects.toThrow('Bank link not found: non-existent');
    });

    it('should skip if provider does not support syncTransactions', async () => {
      // Create a provider without syncTransactions
      const providerWithoutSync = {
        ...mockPlaidProvider,
        syncTransactions: undefined,
      };
      providerRegistry.getProvider.mockReturnValueOnce(providerWithoutSync);

      await service.syncTransactions(mockBankLink.id, mockUserId);

      expect(mockTransactionService.processSyncResults).not.toHaveBeenCalled();
    });
  });
});
