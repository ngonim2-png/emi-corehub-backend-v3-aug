import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeductionImportRecords1786455280425 implements MigrationInterface {
    name = 'AddDeductionImportRecords1786455280425'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "deduction_import_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "period" character varying NOT NULL, "mdaCode" character varying, "mdaName" character varying, "pincode" character varying NOT NULL, "employeeName" character varying NOT NULL, "amount" numeric(18,2) NOT NULL, "matchedPolicyId" uuid, "matchedPaymentId" uuid, "status" character varying NOT NULL, "sourceFileName" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a41a6d16c131d74df9025143565" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "deduction_import_records"`);
    }

}
