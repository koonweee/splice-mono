import { AddAnalysisSankeySetting1776500000000 } from '../../src/migrations/1776500000000-AddAnalysisSankeySetting';

describe('AddAnalysisSankeySetting1776500000000', () => {
  it('adds the Sankey setting to existing users and updates the settings default', async () => {
    const migration = new AddAnalysisSankeySetting1776500000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        `SET "settings" = "settings" || '{"analysisSankeyEnabled":false}'::jsonb`,
      ),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"analysisSankeyEnabled":false'),
    );
  });

  it('removes the Sankey setting and restores the previous settings default on rollback', async () => {
    const migration = new AddAnalysisSankeySetting1776500000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('"neutralizationLookaroundDays":60'),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining('analysisSankeyEnabled'),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`"settings" - 'analysisSankeyEnabled'`),
    );
  });
});
