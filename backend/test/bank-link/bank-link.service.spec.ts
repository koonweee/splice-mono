import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { ProviderRegistry } from '../../src/bank-link/providers/provider.registry';
import { UserService } from '../../src/user/user.service';
import { WebhookEventService } from '../../src/webhook-event/webhook-event.service';
import { mockProviderRegistry } from '../mocks/bank-link/provider-registry.mock';
import {
  mockApiAccount,
  mockInstitution,
  mockLinkInitiationResponse,
  mockPlaidProvider,
} from '../mocks/bank-link/provider.mock';
import { mockUserService } from '../mocks/user/user-service.mock';
import { mockWebhookEventService } from '../mocks/webhook-event/webhook-event-service.mock';

const mockEventEmitter = {
  emit: jest.fn(),
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

const mockBankLinkEntity = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  providerName: 'plaid',
  authentication: { accessToken: 'test-token' },
  accountIds: ['acc-1', 'acc-2'],
  toObject: jest.fn().mockReturnValue(mockBankLink),
};

const mockBankLinkRepository = {
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
    return Promise.resolve(mockBankLinkEntity);
  }),
  findOne: jest.fn().mockResolvedValue(mockBankLinkEntity),
  find: jest.fn().mockResolvedValue([mockBankLinkEntity]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mockBankLinkEntity),
  }),
};

const mockAccountRepository = {
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
      id: 'account-id-0',
      toObject: () => ({ ...(entities as object), id: 'account-id-0' }),
    });
  }),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
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
    mockBankLinkEntity.toObject.mockReturnValue(mockBankLink);

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

      expect(result).toEqual(mockBankLink);
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

      expect(result).toEqual(mockBankLink);
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri: undefined,
        providerUserDetails: undefined,
      });
      // Should create pending webhook event
      expect(mockWebhookEventService.createPending).toHaveBeenCalledWith(
        'webhook-mock-123', // webhookId from mock provider response
        providerName,
        mockUserId,
        expect.any(Date),
      );
    });

    it('should pass redirectUri to provider', async () => {
      const providerName = 'plaid';
      const redirectUri = 'https://myapp.com/callback';

      await service.initiateLinking(providerName, mockUserId, redirectUri);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri,
        providerUserDetails: undefined,
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPlaidProvider.initiateLinking).toHaveBeenCalledWith({
        userId: mockUserId,
        redirectUri: undefined,
        providerUserDetails: existingDetails,
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPlaidProvider.processWebhook).not.toHaveBeenCalled();
    });

    it('should skip processing when shouldProcessWebhook returns undefined', async () => {
      const providerName = 'plaid';

      (mockPlaidProvider.shouldProcessWebhook as jest.Mock).mockReturnValueOnce(
        undefined,
      );

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

    it('should create accounts with rawApiAccount from provider response', async () => {
      const providerName = 'plaid';

      await service.handleWebhook(
        providerName,
        mockRawBody,
        mockHeaders,
        mockParsedPayload,
      );

      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: mockApiAccount.name,
            externalAccountId: mockApiAccount.accountId,
            rawApiAccount: mockApiAccount,
          }),
        ]),
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
        expect.arrayContaining([
          expect.objectContaining({
            institutionId: mockInstitution.id,
            institutionName: mockInstitution.name,
          }),
        ]),
      );
    });

    it('should mark webhook as failed when processing throws error', async () => {
      const providerName = 'plaid';
      const errorMessage = 'Provider error';

      (mockPlaidProvider.processWebhook as jest.Mock).mockRejectedValueOnce(
        new Error(errorMessage),
      );

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
        "bankLink.authentication->>'itemId' = :itemId",
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

    it('should handle ERROR status webhook and update bank link status', async () => {
      const providerName = 'plaid';
      const errorPayload = {
        webhook_type: 'ITEM',
        webhook_code: 'ERROR',
        item_id: 'item-mock-123',
        error: {
          error_type: 'ITEM_ERROR',
          error_code: 'ITEM_LOGIN_REQUIRED',
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
        JSON.stringify(errorPayload),
        mockHeaders,
        errorPayload,
      );

      // Should have called parseStatusWebhook
      expect(mockPlaidProvider.parseStatusWebhook).toHaveBeenCalledWith(
        errorPayload,
      );
      // Should have updated the bank link status
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ERROR',
          statusBody: errorPayload.error,
        }),
      );
      // Should NOT have synced accounts
      expect(mockPlaidProvider.getAccounts).not.toHaveBeenCalled();
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
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'OK',
          statusBody: null,
        }),
      );
      // Should have triggered account sync
      expect(mockPlaidProvider.getAccounts).toHaveBeenCalled();
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

      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING_REAUTH',
        }),
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPlaidProvider.getAccounts).toHaveBeenCalledWith({
        accessToken: 'test-token',
      });
      expect(mockAccountRepository.save).toHaveBeenCalled();
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
        expect.arrayContaining([
          expect.objectContaining({
            id: 'existing-account-id',
          }),
        ]),
      );
    });

    it('should create new accounts when no match found', async () => {
      await service.syncAccounts(mockBankLink.id, mockUserId);

      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            externalAccountId: mockApiAccount.accountId,
            name: mockApiAccount.name,
          }),
        ]),
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
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: mockInstitution.id,
          institutionName: mockInstitution.name,
        }),
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

      await service.syncAccounts(mockBankLink.id, mockUserId);

      // Bank link repository save should only be called for accounts, not for the bank link itself
      // The bank link save would be called with the entity object (not an array)
      const saveCallsWithBankLink =
        mockBankLinkRepository.save.mock.calls.filter(
          (call: unknown[]) =>
            !Array.isArray(call[0]) && call[0] === bankLinkWithSameInstitution,
        );
      expect(saveCallsWithBankLink.length).toBe(0);
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

      // Should not throw and should not update institution
      await service.syncAccounts(mockBankLink.id, mockUserId);

      // Verify no bank link save was called for institution update
      const saveCallsWithBankLink =
        mockBankLinkRepository.save.mock.calls.filter(
          (call: unknown[]) =>
            !Array.isArray(call[0]) && call[0] === bankLinkWithInstitution,
        );
      expect(saveCallsWithBankLink.length).toBe(0);
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

      const result = await service.backfillPlaidItemIds(mockUserId);

      expect(mockBankLinkRepository.find).toHaveBeenCalledWith({
        where: { providerName: 'plaid', userId: mockUserId },
      });
      expect(mockPlaidProvider.getItemId).toHaveBeenCalledWith({
        accessToken: 'test-token',
      });
      expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: {
            accessToken: 'test-token',
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
      mockAccountRepository.find = jest.fn().mockResolvedValue([]);
    });

    it('should return empty array when no accounts provided', async () => {
      const result = await service.upsertAccountsFromAPI(
        [],
        new Map<string, string>(),
        mockUserId,
      );

      expect(result).toEqual([]);
      expect(mockAccountRepository.find).not.toHaveBeenCalled();
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

      expect(mockAccountRepository.find).toHaveBeenCalled();
      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: mockApiAccount.name,
            externalAccountId: mockApiAccount.accountId,
            bankLinkId,
          }),
        ]),
      );
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });

    it('should update existing accounts matched by externalAccountId', async () => {
      const existingAccountEntity = {
        id: 'existing-account-id',
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
        expect.arrayContaining([
          expect.objectContaining({
            id: 'existing-account-id',
          }),
        ]),
      );
    });

    it('should handle mixed scenario with new and existing accounts', async () => {
      const existingAccountEntity = {
        id: 'existing-account-id',
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
        expect.arrayContaining([
          // Existing account (updated)
          expect.objectContaining({
            id: 'existing-account-id',
          }),
          // New account (created)
          expect.objectContaining({
            externalAccountId: 'new-account-456',
            name: 'New Savings Account',
          }),
        ]),
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
});
