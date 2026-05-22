import { EventEmitter2 } from '@nestjs/event-emitter';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { LinkedAccountEvents } from '../../src/events/account.events';
import { mockApiAccount } from '../mocks/bank-link/provider.mock';

describe('BankLinkService archived account sync', () => {
  it('freezes archived existing accounts during provider sync', async () => {
    const mockAccountRepository = {
      find: jest.fn(),
      save: jest.fn(),
    };
    const mockEventEmitter = {
      emit: jest.fn(),
    };
    const service = new BankLinkService(
      {} as never,
      {} as never,
      {} as never,
      mockAccountRepository as never,
      mockEventEmitter as unknown as EventEmitter2,
      {} as never,
      {} as never,
      {} as never,
    );
    const archivedAccount = {
      id: 'archived-account-id',
      externalAccountId: mockApiAccount.accountId,
      name: 'Archived Name',
      currentBalance: { currency: 'USD', amount: 0, sign: 'positive' },
      archivedAt: new Date('2026-04-05T12:00:00Z'),
    };
    mockAccountRepository.find.mockResolvedValueOnce([archivedAccount]);

    const result = await service.upsertAccountsFromAPI(
      [mockApiAccount],
      new Map([[mockApiAccount.accountId, 'bank-link-id']]),
      'user-id',
    );

    expect(archivedAccount.name).toBe('Archived Name');
    expect(archivedAccount.currentBalance.amount).toBe(0);
    expect(mockAccountRepository.save).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
      LinkedAccountEvents.UPDATED,
      expect.anything(),
    );
    expect(result).toEqual([]);
  });
});
