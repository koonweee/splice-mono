import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLinkedAccountIdentityConstraint1777400000000
  implements MigrationInterface
{
  name = 'AddLinkedAccountIdentityConstraint1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_account_user_bank_link_external" ON "account_entity" ("userId", "bankLinkId", "externalAccountId") WHERE "bankLinkId" IS NOT NULL AND "externalAccountId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_account_user_bank_link_external"`,
    );
  }
}
