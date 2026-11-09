import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRosterImportAndBrokerName1786441336934 implements MigrationInterface {
    name = 'AddRosterImportAndBrokerName1786441336934'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "roster_import_issues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "productId" uuid NOT NULL, "rawData" jsonb NOT NULL, "issueTypes" jsonb NOT NULL, "issueDetails" text NOT NULL, "status" character varying NOT NULL DEFAULT 'Pending', "resolvedPolicyId" uuid, "resolvedBy" uuid, "resolvedAt" TIMESTAMP WITH TIME ZONE, "sourceFileName" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c40d404d3a75158995b0f2d8ef4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "brokerName" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "brokerName"`);
        await queryRunner.query(`DROP TABLE "roster_import_issues"`);
    }

}
