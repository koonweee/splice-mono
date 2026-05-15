import { AddRefreshTokenRotationMetadata1776800000000 } from '../../src/migrations/1776800000000-AddRefreshTokenRotationMetadata';

describe('AddRefreshTokenRotationMetadata1776800000000', () => {
  it('adds refresh token rotation metadata and marks legacy revoked rows', async () => {
    const migration = new AddRefreshTokenRotationMetadata1776800000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `ALTER TABLE "refresh_token" ADD "revokedAt" TIMESTAMP`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `ALTER TABLE "refresh_token" ADD "revocationReason" character varying`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      `ALTER TABLE "refresh_token" ADD "rotationGraceExpiresAt" TIMESTAMP`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      `ALTER TABLE "refresh_token" ADD "replacedByTokenId" uuid`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining(`"revocationReason" = 'legacy'`),
    );
  });

  it('drops refresh token rotation metadata on rollback', async () => {
    const migration = new AddRefreshTokenRotationMetadata1776800000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      `ALTER TABLE "refresh_token" DROP COLUMN "replacedByTokenId"`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      `ALTER TABLE "refresh_token" DROP COLUMN "rotationGraceExpiresAt"`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      `ALTER TABLE "refresh_token" DROP COLUMN "revocationReason"`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      `ALTER TABLE "refresh_token" DROP COLUMN "revokedAt"`,
    );
  });
});
