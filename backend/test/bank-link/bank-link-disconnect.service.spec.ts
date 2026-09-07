import { BankLinkDisconnectService } from '../../src/bank-link/bank-link-disconnect.service';

describe('BankLinkDisconnectService', () => {
  let link: any;
  const provider = { disconnect: jest.fn() };
  const links = { findOne: jest.fn(), save: jest.fn() };
  const manager = { query: jest.fn(), getRepository: () => links };
  const repository = {
    manager: { transaction: jest.fn(async (fn) => fn(manager)) },
  };
  const service = new BankLinkDisconnectService(
    repository as never,
    provider as never,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    repository.manager.transaction.mockImplementation(async (fn) =>
      fn(manager),
    );
    link = {
      id: 'link',
      providerName: 'plaid',
      archivedAt: new Date(),
      disconnectRequestedAt: new Date(),
      disconnectNextAttemptAt: new Date(0),
      disconnectedAt: null,
      disconnectAttempts: 0,
      authentication: {
        itemId: 'item',
        accessToken: 'keep-until-success',
        nextCursor: 'cursor',
      },
    };
    links.findOne.mockResolvedValue(link);
    links.save.mockResolvedValue(link);
    manager.query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValue([{ blocked: false }]);
    provider.disconnect.mockResolvedValue(undefined);
  });
  it('clears credentials only after removal and records completion', async () => {
    await service.disconnect('link');
    expect(provider.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'keep-until-success' }),
    );
    expect(link.authentication).toEqual({ itemId: 'item' });
    expect(link.disconnectedAt).toBeInstanceOf(Date);
    expect(link.disconnectNextAttemptAt).toBeNull();
    expect(links.save).toHaveBeenCalledWith(link);
  });
  it('retains credentials and schedules a retry on failure', async () => {
    provider.disconnect.mockRejectedValue(new Error('network failed'));
    await service.disconnect('link');
    expect(link.authentication.accessToken).toBe('keep-until-success');
    expect(link.disconnectedAt).toBeNull();
    expect(link.disconnectAttempts).toBe(1);
    expect(link.disconnectNextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });
  it.each(['active accounts', 'shared active Item'])(
    'does not remove when blocked by %s',
    async () => {
      manager.query
        .mockReset()
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValue([{ blocked: true }]);
      await service.disconnect('link');
      expect(provider.disconnect).not.toHaveBeenCalled();
      expect(link.authentication.accessToken).toBe('keep-until-success');
    },
  );
  it('skips work claimed by another process', async () => {
    manager.query.mockReset().mockResolvedValue([{ acquired: false }]);
    await service.disconnect('link');
    expect(links.findOne).not.toHaveBeenCalled();
    expect(provider.disconnect).not.toHaveBeenCalled();
  });
  it.each(['completed', 'reactivated', 'not due'])(
    'skips %s links',
    async (state) => {
      if (state === 'completed') link.disconnectedAt = new Date();
      if (state === 'reactivated') link.archivedAt = null;
      if (state === 'not due')
        link.disconnectNextAttemptAt = new Date(Date.now() + 60_000);
      await service.disconnect('link');
      expect(provider.disconnect).not.toHaveBeenCalled();
    },
  );
});
