import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChartOfAccountDescription1787135933641 implements MigrationInterface {
    name = 'AddChartOfAccountDescription1787135933641'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ADD "description" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP COLUMN "description"`);
    }

}
