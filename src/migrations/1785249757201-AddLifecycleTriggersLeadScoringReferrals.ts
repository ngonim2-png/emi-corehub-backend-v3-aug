import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLifecycleTriggersLeadScoringReferrals1785249757201 implements MigrationInterface {
    name = 'AddLifecycleTriggersLeadScoringReferrals1785249757201'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "lifecycle_triggers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "triggerType" character varying NOT NULL, "channel" character varying NOT NULL DEFAULT 'sms', "messageTemplate" text NOT NULL, "active" boolean NOT NULL DEFAULT true, "daysOffset" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f87946d076079eb6eb1be449000" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "trigger_fires" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "triggerId" uuid NOT NULL, "entityType" character varying NOT NULL, "entityId" uuid NOT NULL, "firedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_540335ff6befcbacca5edb2b708" UNIQUE ("triggerId", "entityId"), CONSTRAINT "PK_7573c1a2b0ce1e56661227932e9" PRIMARY KEY ("id"))`);

        // referralCode is NOT NULL + UNIQUE in the entity, but this table
        // may already have rows (any real deployment will). Adding a NOT
        // NULL column with no default fails outright against existing
        // data, so: add nullable, backfill every existing row from its
        // already-unique clientNo, then apply the real constraints.
        await queryRunner.query(`ALTER TABLE "clients" ADD "referralCode" character varying`);
        await queryRunner.query(`UPDATE "clients" SET "referralCode" = REPLACE("clientNo", 'CL-', 'REF-') WHERE "referralCode" IS NULL`);
        await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "referralCode" SET NOT NULL`);

        await queryRunner.query(`ALTER TABLE "clients" ADD "referredByClientId" uuid`);
        await queryRunner.query(`ALTER TABLE "leads" ADD "district" character varying`);
        await queryRunner.query(`ALTER TABLE "leads" ADD "score" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "leads" ADD "assignedTo" uuid`);
        await queryRunner.query(`ALTER TABLE "leads" ADD "lastActivityAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "leads" ADD "convertedClientId" uuid`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e75bce8941c440eefdd6b9316b" ON "clients" ("referralCode") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e75bce8941c440eefdd6b9316b"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "convertedClientId"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "lastActivityAt"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "assignedTo"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "score"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "district"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "referredByClientId"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "referralCode"`);
        await queryRunner.query(`DROP TABLE "trigger_fires"`);
        await queryRunner.query(`DROP TABLE "lifecycle_triggers"`);
    }

}
