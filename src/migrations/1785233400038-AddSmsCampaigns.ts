import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSmsCampaigns1785233400038 implements MigrationInterface {
    name = 'AddSmsCampaigns1785233400038'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "sms_campaigns" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "message" text NOT NULL, "audienceType" character varying NOT NULL, "audienceFilters" jsonb, "recipientCount" integer NOT NULL DEFAULT '0', "sentCount" integer NOT NULL DEFAULT '0', "failedCount" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'Queued', "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1a04905875495d037325f561250" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "sms_campaigns"`);
    }

}
