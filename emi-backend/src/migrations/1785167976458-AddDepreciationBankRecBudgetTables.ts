import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDepreciationBankRecBudgetTables1785167976458 implements MigrationInterface {
    name = 'AddDepreciationBankRecBudgetTables1785167976458'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "budget_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountCode" character varying NOT NULL, "year" character varying NOT NULL, "budgetedAmount" numeric(18,2) NOT NULL, "setBy" uuid NOT NULL, CONSTRAINT "UQ_62c876875825cfe4035c6e5bd4d" UNIQUE ("accountCode", "year"), CONSTRAINT "PK_4eabf9c9d7c8edc9ad302270c94" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bank_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "accountNumber" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "glAccountId" uuid, CONSTRAINT "PK_c872de764f2038224a013ff25ed" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bank_statement_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "date" date NOT NULL, "description" character varying NOT NULL, "amount" numeric(18,2) NOT NULL, "matched" boolean NOT NULL DEFAULT false, "matchedJournalLineId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "bankAccountId" uuid, CONSTRAINT "PK_f22e7c99c4dca5224741e09f7ae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "assets" ADD "purchaseCost" numeric(18,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "assets" ADD "purchaseDate" date`);
        await queryRunner.query(`ALTER TABLE "assets" ADD "usefulLifeYears" integer NOT NULL DEFAULT '5'`);
        await queryRunner.query(`ALTER TABLE "assets" ADD "accumulatedDepreciation" numeric(18,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "procurement_requests" ADD "paidAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "bank_accounts" ADD CONSTRAINT "FK_aeab42300c9066f0ee11be2b7ed" FOREIGN KEY ("glAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "FK_dfe881f15a764e7a25f6b08b534" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bank_statement_lines" DROP CONSTRAINT "FK_dfe881f15a764e7a25f6b08b534"`);
        await queryRunner.query(`ALTER TABLE "bank_accounts" DROP CONSTRAINT "FK_aeab42300c9066f0ee11be2b7ed"`);
        await queryRunner.query(`ALTER TABLE "procurement_requests" DROP COLUMN "paidAt"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "accumulatedDepreciation"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "usefulLifeYears"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "purchaseDate"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "purchaseCost"`);
        await queryRunner.query(`DROP TABLE "bank_statement_lines"`);
        await queryRunner.query(`DROP TABLE "bank_accounts"`);
        await queryRunner.query(`DROP TABLE "budget_lines"`);
    }

}
