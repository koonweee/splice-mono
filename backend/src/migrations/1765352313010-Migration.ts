import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1765352313010 implements MigrationInterface {
    name = 'Migration1765352313010'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency":"USD","timezone":"UTC"}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency": "USD", "timezone": "UTC"}'`);
    }

}
