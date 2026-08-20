import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBankAccountDeletionRequests1787136596162 implements MigrationInterface {
    name = 'AddBankAccountDeletionRequests1787136596162'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "bank_account_deletion_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "bankAccountName" character varying NOT NULL, "reason" text, "status" character varying NOT NULL DEFAULT 'Pending', "requestedBy" uuid NOT NULL, "requestedAt" TIMESTAMP NOT NULL DEFAULT now(), "decidedBy" uuid, "decidedAt" TIMESTAMP WITH TIME ZONE, "bankAccountId" uuid, CONSTRAINT "PK_f80551602302911d8c2e5bfb038" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "bank_account_deletion_requests" ADD CONSTRAINT "FK_3902c851ad99d53d2a6eee60583" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bank_account_deletion_requests" DROP CONSTRAINT "FK_3902c851ad99d53d2a6eee60583"`);
        await queryRunner.query(`DROP TABLE "bank_account_deletion_requests"`);
    }

}
