import { ReplaceAppearanceSettings1788728000000 } from '../../src/migrations/1788728000000-ReplaceAppearanceSettings';
import { UserEntity } from '../../src/user/user.entity';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';

postgresSuite('appearance settings migration', () => {
  let fixture: Awaited<ReturnType<typeof isolatedPostgres>>;
  beforeAll(async () => {
    fixture = await isolatedPostgres('appearance_reset', 1788728000000);
  }, 60_000);
  afterAll(async () => fixture?.close());
  it('resets appearance only and removes old theme keys', async () => {
    const repository = fixture.database.getRepository(UserEntity);
    const user = await repository.save(
      UserEntity.fromGoogleIdentity({
        email: 'appearance@fixture.test',
        googleSubject: 'appearance',
      }),
    );
    const settings = {
      currency: 'SGD',
      timezone: 'Asia/Singapore',
      hideZeroBalanceAccounts: true,
      theme: 'dracula',
      notifications: {
        transactions: { newSyncedTransactions: false },
        bankLinks: { needsAttention: true },
      },
      futureSetting: { untouched: [1, 'two', null] },
    };
    await fixture.database.query(
      'UPDATE user_entity SET settings=$1::jsonb WHERE id=$2',
      [JSON.stringify(settings), user.id],
    );
    await fixture.database.runMigrations({ transaction: 'all' });
    const [saved] = await fixture.database.query(
      'SELECT settings FROM user_entity WHERE id=$1',
      [user.id],
    );
    const preserved = Object.fromEntries(
      Object.entries(settings).filter(([key]) => key !== 'theme'),
    );
    expect(saved.settings).toEqual({
      ...preserved,
      appearance: { mode: 'dark', accent: '#83b59b' },
    });
    const [column] = await fixture.database.query(
      "SELECT column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='user_entity' AND column_name='settings'",
      [fixture.schema],
    );
    expect(column.column_default).not.toContain('theme');
    expect(column.column_default).toContain('appearance');
  });
  it('initializes empty and JSON-null settings without retaining malformed data', async () => {
    const repository = fixture.database.getRepository(UserEntity);
    for (const [index, initial] of [null, {}].entries()) {
      const user = await repository.save(
        UserEntity.fromGoogleIdentity({
          email: `empty-${index}@fixture.test`,
          googleSubject: `empty-${index}`,
        }),
      );
      await fixture.database.query(
        'UPDATE user_entity SET settings=$1::jsonb WHERE id=$2',
        [JSON.stringify(initial), user.id],
      );
      const runner = fixture.database.createQueryRunner();
      try {
        await new ReplaceAppearanceSettings1788728000000().up(runner);
      } finally {
        await runner.release();
      }
      const [saved] = await fixture.database.query(
        'SELECT settings FROM user_entity WHERE id=$1',
        [user.id],
      );
      expect(saved.settings).toEqual({
        appearance: { mode: 'dark', accent: '#83b59b' },
      });
    }
  });
  it('refuses a misleading automatic rollback', async () => {
    await expect(
      new ReplaceAppearanceSettings1788728000000().down(),
    ).rejects.toThrow('irreversible');
  });
});
