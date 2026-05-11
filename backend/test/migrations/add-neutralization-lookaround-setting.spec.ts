import { AddNeutralizationLookaroundSetting1776400000000 } from '../../src/migrations/1776400000000-AddNeutralizationLookaroundSetting';

describe('AddNeutralizationLookaroundSetting1776400000000', () => {
  it('adds the lookaround setting to existing users and updates the settings default', async () => {
    const migration = new AddNeutralizationLookaroundSetting1776400000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        `SET "settings" = "settings" || '{"neutralizationLookaroundDays":60}'::jsonb`,
      ),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"neutralizationLookaroundDays":60'),
    );
  });
});
