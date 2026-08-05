import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountingControlsAndProcurementCost1785148984841 implements MigrationInterface {
    name = 'AddAccountingControlsAndProcurementCost1785148984841'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "accounting_periods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "period" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'Closed', "closedBy" uuid NOT NULL, "closedAt" TIMESTAMP NOT NULL DEFAULT now(), "notes" character varying, CONSTRAINT "UQ_5dcc57f1b308f6ecf0cdf82a14c" UNIQUE ("period"), CONSTRAINT "PK_a574217de733282cf1ea1c1970f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "journal_entries" ADD "status" character varying NOT NULL DEFAULT 'Posted'`);
        await queryRunner.query(`ALTER TABLE "journal_entries" ADD "approvedBy" uuid`);
        await queryRunner.query(`ALTER TABLE "journal_entries" ADD "reversalStatus" character varying NOT NULL DEFAULT 'None'`);
        await queryRunner.query(`ALTER TABLE "journal_entries" ADD "reversalOfEntryId" uuid`);
        await queryRunner.query(`ALTER TABLE "procurement_requests" ADD "unitCost" numeric(18,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "procurement_requests" ADD "journalEntryId" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "procurement_requests" DROP COLUMN "journalEntryId"`);
        await queryRunner.query(`ALTER TABLE "procurement_requests" DROP COLUMN "unitCost"`);
        await queryRunner.query(`ALTER TABLE "journal_entries" DROP COLUMN "reversalOfEntryId"`);
        await queryRunner.query(`ALTER TABLE "journal_entries" DROP COLUMN "reversalStatus"`);
        await queryRunner.query(`ALTER TABLE "journal_entries" DROP COLUMN "approvedBy"`);
        await queryRunner.query(`ALTER TABLE "journal_entries" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TABLE "accounting_periods"`);
    }

}
