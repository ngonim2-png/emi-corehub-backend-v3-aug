import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClientApp1790100000000 implements MigrationInterface {
    name = 'AddClientApp1790100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "client_app_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "pinHash" character varying NOT NULL, "failedAttempts" integer NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMP WITH TIME ZONE, "tokenVersion" integer NOT NULL DEFAULT 0, "origin" character varying NOT NULL DEFAULT 'existing', "lastLoginAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_client_app_accounts" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_client_app_accounts_client" ON "client_app_accounts" ("clientId")`);
        await queryRunner.query(`ALTER TABLE "client_app_accounts" ADD CONSTRAINT "FK_client_app_accounts_client" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE`);

        await queryRunner.query(`CREATE TABLE "app_applicants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phone" character varying NOT NULL, "fullName" character varying NOT NULL, "pinHash" character varying NOT NULL, "failedAttempts" integer NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMP WITH TIME ZONE, "tokenVersion" integer NOT NULL DEFAULT 0, "clientId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_applicants" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_app_applicants_phone" ON "app_applicants" ("phone")`);

        await queryRunner.query(`CREATE TABLE "app_verification_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "codeHash" character varying NOT NULL, "source" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "attempts" integer NOT NULL DEFAULT 0, "usedAt" TIMESTAMP WITH TIME ZONE, "createdBy" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_verification_codes" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_app_verification_codes_client" ON "app_verification_codes" ("clientId")`);

        await queryRunner.query(`CREATE TABLE "app_applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "applicationNo" character varying NOT NULL, "applicantId" uuid NOT NULL, "productId" uuid NOT NULL, "productName" character varying NOT NULL, "formData" jsonb NOT NULL, "premiumAmount" numeric(18,2) NOT NULL, "durationYears" integer, "commencementDate" date, "isCivilServant" boolean NOT NULL DEFAULT false, "payrollPin" character varying, "status" character varying NOT NULL DEFAULT 'Submitted', "statusNote" text, "reviewedBy" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "clientId" uuid, "policyId" uuid, "policyNo" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_applications" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_app_applications_no" ON "app_applications" ("applicationNo")`);
        await queryRunner.query(`CREATE INDEX "IDX_app_applications_applicant" ON "app_applications" ("applicantId")`);
        await queryRunner.query(`ALTER TABLE "app_applications" ADD CONSTRAINT "FK_app_applications_applicant" FOREIGN KEY ("applicantId") REFERENCES "app_applicants"("id") ON DELETE CASCADE`);

        await queryRunner.query(`CREATE TABLE "app_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerType" character varying NOT NULL, "ownerId" uuid NOT NULL, "kind" character varying NOT NULL, "filename" character varying NOT NULL, "mimeType" character varying NOT NULL, "sizeBytes" integer NOT NULL, "data" bytea NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_files" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_app_files_owner_type" ON "app_files" ("ownerType")`);
        await queryRunner.query(`CREATE INDEX "IDX_app_files_owner_id" ON "app_files" ("ownerId")`);

        await queryRunner.query(`CREATE TABLE "app_push_subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subjectType" character varying NOT NULL, "subjectId" uuid NOT NULL, "endpoint" text NOT NULL, "p256dh" text NOT NULL, "auth" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_push_subscriptions" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_app_push_subscriptions_subject" ON "app_push_subscriptions" ("subjectId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_app_push_subscriptions_endpoint" ON "app_push_subscriptions" ("endpoint")`);

        await queryRunner.query(`CREATE TABLE "app_notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subjectType" character varying NOT NULL, "subjectId" uuid NOT NULL, "title" character varying NOT NULL, "body" text NOT NULL, "readAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_notifications" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_app_notifications_subject" ON "app_notifications" ("subjectId")`);

        await queryRunner.query(`CREATE TABLE "app_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "policyNo" character varying, "type" character varying NOT NULL, "message" text NOT NULL, "status" character varying NOT NULL DEFAULT 'Open', "staffNote" text, "handledBy" uuid, "handledAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_requests" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_app_requests_client" ON "app_requests" ("clientId")`);

        await queryRunner.query(`ALTER TABLE "claims" ADD "source" character varying NOT NULL DEFAULT 'Staff'`);
        await queryRunner.query(`ALTER TABLE "claims" ADD "description" text`);
        await queryRunner.query(`ALTER TABLE "claims" ADD "incidentDate" date`);
        await queryRunner.query(`ALTER TABLE "loans" ADD "requestedVia" character varying NOT NULL DEFAULT 'Staff'`);

        await queryRunner.query(`ALTER TABLE "products" ADD "appVisible" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "products" ADD "appDescription" text`);
        await queryRunner.query(`ALTER TABLE "products" ADD "appFormType" character varying NOT NULL DEFAULT 'standard'`);
        // Sensible starting point: the individual savings/education plans are offered
        // to applicants, everything else stays hidden until an admin turns it on.
        await queryRunner.query(`UPDATE "products" SET "appVisible" = true WHERE "name" ILIKE '%pikin%' OR "name" ILIKE '%super savings%' OR "name" ILIKE '%endowment%'`);
        await queryRunner.query(`UPDATE "products" SET "appFormType" = 'education' WHERE "name" ILIKE '%pikin%' OR "name" ILIKE '%education%'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "appFormType"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "appDescription"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "appVisible"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "requestedVia"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP COLUMN "incidentDate"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP COLUMN "source"`);
        await queryRunner.query(`DROP TABLE "app_requests"`);
        await queryRunner.query(`DROP TABLE "app_notifications"`);
        await queryRunner.query(`DROP TABLE "app_push_subscriptions"`);
        await queryRunner.query(`DROP TABLE "app_files"`);
        await queryRunner.query(`DROP TABLE "app_applications"`);
        await queryRunner.query(`DROP TABLE "app_verification_codes"`);
        await queryRunner.query(`DROP TABLE "app_applicants"`);
        await queryRunner.query(`DROP TABLE "client_app_accounts"`);
    }
}
