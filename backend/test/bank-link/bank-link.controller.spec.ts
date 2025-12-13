import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { JwtUser } from '../../src/auth/decorators/current-user.decorator';
import { BankLinkController } from '../../src/bank-link/bank-link.controller';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { mockBankLinkService } from '../mocks/bank-link/bank-link-service.mock';

const mockUserId = 'user-uuid-123';
const mockCurrentUser: JwtUser = {
  userId: mockUserId,
  email: 'test@example.com',
};

describe('BankLinkController', () => {
  let controller: BankLinkController;
  let service: typeof mockBankLinkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankLinkController],
      providers: [
        {
          provide: BankLinkService,
          useValue: mockBankLinkService,
        },
      ],
    }).compile();

    controller = module.get<BankLinkController>(BankLinkController);
    service = module.get(BankLinkService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateLinking', () => {
    it('should initiate linking and return link info', async () => {
      const provider = 'plaid';
      const requestBody = {
        redirectUri: 'https://myapp.com/callback',
      };

      const result = await controller.initiateLinking(
        provider,
        requestBody,
        mockCurrentUser,
      );

      expect(service.initiateLinking).toHaveBeenCalledWith(
        provider,
        mockUserId,
        requestBody.redirectUri,
        undefined, // walletAddress
        undefined, // network
      );

      expect(result).toEqual({
        linkUrl: 'https://plaid.com/link/mock-123',
        expiresAt: expect.any(Date) as Date,
      });
    });

    it('should work without redirectUri', async () => {
      const provider = 'simplefin';
      const requestBody = {};

      await controller.initiateLinking(provider, requestBody, mockCurrentUser);

      expect(service.initiateLinking).toHaveBeenCalledWith(
        provider,
        mockUserId,
        undefined,
        undefined, // walletAddress
        undefined, // network
      );
    });
  });

  describe('handleWebhook', () => {
    it('should process webhook and return received confirmation', async () => {
      const provider = 'plaid';
      const rawBodyContent =
        '{"webhook_type":"ITEM","webhook_code":"SUCCESS","link_request_id":"req-123"}';
      const req = {
        body: {
          webhook_type: 'ITEM',
          webhook_code: 'SUCCESS',
          link_request_id: 'req-123',
        },
        rawBody: Buffer.from(rawBodyContent),
        headers: {
          'content-type': 'application/json',
          'plaid-verification': 'mock-jwt-token',
        },
      } as unknown as Request;

      const result = await controller.handleWebhook(provider, req);

      expect(service.handleWebhook).toHaveBeenCalledWith(
        provider,
        rawBodyContent,
        expect.objectContaining({
          'content-type': 'application/json',
          'plaid-verification': 'mock-jwt-token',
        }),
        req.body,
      );

      expect(result).toEqual({ received: true });
    });

    it('should work with different payload types', async () => {
      const provider = 'simplefin';
      const rawBodyContent = '{"event_type":"account.linked"}';
      const req = {
        body: { event_type: 'account.linked' },
        rawBody: Buffer.from(rawBodyContent),
        headers: {
          'content-type': 'application/json',
        },
      } as unknown as Request;

      await controller.handleWebhook(provider, req);

      expect(service.handleWebhook).toHaveBeenCalledWith(
        provider,
        rawBodyContent,
        expect.objectContaining({
          'content-type': 'application/json',
        }),
        req.body,
      );
    });

    it('should handle missing rawBody gracefully', async () => {
      const provider = 'plaid';
      const req = {
        body: { webhook_type: 'TEST' },
        rawBody: undefined,
        headers: {},
      } as unknown as Request;

      const result = await controller.handleWebhook(provider, req);

      expect(service.handleWebhook).toHaveBeenCalledWith(
        provider,
        '', // Empty string when rawBody is undefined
        {},
        req.body,
      );

      expect(result).toEqual({ received: true });
    });
  });

  describe('syncAllAccounts', () => {
    it('should sync all accounts for user and return results', async () => {
      const result = await controller.syncAllAccounts(mockCurrentUser);

      expect(service.syncAllAccounts).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual([]);
    });
  });
});
