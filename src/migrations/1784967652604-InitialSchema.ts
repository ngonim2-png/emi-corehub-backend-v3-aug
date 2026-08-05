import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1784967652604 implements MigrationInterface {
    name = 'InitialSchema1784967652604'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Every entity's UUID primary key defaults to uuid_generate_v4(),
        // which requires this extension. TypeORM will sometimes create it
        // implicitly and silently during schema operations, but that's
        // undocumented behaviour this migration shouldn't depend on -
        // some managed Postgres roles (depending on provider) don't have
        // CREATE EXTENSION rights at all, so if this line fails, that's
        // the first thing to check with your provider.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "sms_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "toPhone" character varying NOT NULL, "relatedType" character varying NOT NULL, "relatedId" uuid, "templateCode" character varying NOT NULL, "body" text NOT NULL, "status" character varying NOT NULL DEFAULT 'Queued', "sentAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_811e3a63f5e14a50475c6e8be3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "marketer_targets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marketerId" uuid NOT NULL, "month" character varying NOT NULL, "targetAmount" numeric(18,2) NOT NULL, CONSTRAINT "PK_4fac748f98d4652b60b11d9e875" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying, "passwordHash" character varying NOT NULL, "mfaSecret" character varying, "mfaEnabled" boolean NOT NULL DEFAULT false, "branchId" uuid, "status" character varying NOT NULL DEFAULT 'Active', "lastLoginAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "roleId" uuid, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "description" character varying, CONSTRAINT "UQ_8dad765629e83229da6feda1c1d" UNIQUE ("code"), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "devices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "deviceFingerprint" character varying NOT NULL, "approved" boolean NOT NULL DEFAULT false, "lastSeenAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "employees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying NOT NULL, "department" character varying NOT NULL, "jobTitle" character varying NOT NULL, "hireDate" date NOT NULL, "status" character varying NOT NULL DEFAULT 'Active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b9535a98350d5b26e7eb0c26af4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "leave_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying NOT NULL, "fromDate" date NOT NULL, "toDate" date NOT NULL, "status" character varying NOT NULL DEFAULT 'Pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "employeeId" uuid, CONSTRAINT "PK_d3abcf9a16cef1450129e06fa9f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "chart_of_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL, "parentId" uuid, CONSTRAINT "UQ_e739f9fb242a95d501aedde46c8" UNIQUE ("code"), CONSTRAINT "PK_467c08a2efc78393c647da32bac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "journal_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entryNo" character varying NOT NULL, "date" date NOT NULL, "narration" character varying NOT NULL, "sourceModule" character varying NOT NULL, "sourceRef" uuid, "postedBy" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a70368e64230434457c8d007ab3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_bb2578b291e9d17e4df57b4788" ON "journal_entries" ("entryNo") `);
        await queryRunner.query(`CREATE TABLE "journal_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "debit" numeric(18,2) NOT NULL DEFAULT '0', "credit" numeric(18,2) NOT NULL DEFAULT '0', "journalEntryId" uuid, "accountId" uuid, CONSTRAINT "PK_70cba2da4588cee8921f73ef136" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "category" character varying NOT NULL, "minPremium" numeric(18,2) NOT NULL, "maxPremium" numeric(18,2) NOT NULL, CONSTRAINT "UQ_7cfc24d6c24f0ec91294003d6b8" UNIQUE ("code"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ifrs17_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cohortYear" integer NOT NULL, "measurementModel" character varying NOT NULL DEFAULT 'PAA', "lockedInDiscountRateAnnual" numeric(6,4) NOT NULL, "riskAdjustmentMarginPct" numeric(6,4) NOT NULL, "paaCoverageMonths" integer, "gmmCoverageUnitsTotal" bigint, "initialFcf" numeric(18,2), "initialRiskAdjustment" numeric(18,2), "productId" uuid, CONSTRAINT "PK_247e4e1dcd5e780aae231903126" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ifrs17_measurements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "period" character varying NOT NULL, "openingFcf" numeric(18,2) NOT NULL DEFAULT '0', "closingFcf" numeric(18,2) NOT NULL DEFAULT '0', "openingRiskAdjustment" numeric(18,2) NOT NULL DEFAULT '0', "closingRiskAdjustment" numeric(18,2) NOT NULL DEFAULT '0', "openingCsm" numeric(18,2) NOT NULL DEFAULT '0', "closingCsm" numeric(18,2) NOT NULL DEFAULT '0', "closingLrc" numeric(18,2) NOT NULL DEFAULT '0', "openingLicBestEstimate" numeric(18,2) NOT NULL DEFAULT '0', "closingLicBestEstimate" numeric(18,2) NOT NULL DEFAULT '0', "openingLicRiskAdjustment" numeric(18,2) NOT NULL DEFAULT '0', "closingLicRiskAdjustment" numeric(18,2) NOT NULL DEFAULT '0', "closingLic" numeric(18,2) NOT NULL DEFAULT '0', "interestAccretionOnFcf" numeric(18,2) NOT NULL DEFAULT '0', "interestAccretionOnCsm" numeric(18,2) NOT NULL DEFAULT '0', "riskAdjustmentRelease" numeric(18,2) NOT NULL DEFAULT '0', "csmRecognisedInPnl" numeric(18,2) NOT NULL DEFAULT '0', "lossRecognisedInPeriod" numeric(18,2) NOT NULL DEFAULT '0', "isOnerous" boolean NOT NULL DEFAULT false, "insuranceRevenue" numeric(18,2) NOT NULL DEFAULT '0', "insuranceServiceExpense" numeric(18,2) NOT NULL DEFAULT '0', "insuranceFinanceExpense" numeric(18,2) NOT NULL DEFAULT '0', "computedAt" TIMESTAMP NOT NULL DEFAULT now(), "groupId" uuid, CONSTRAINT "PK_8f93ebf6ba2e853c13b21a81481" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "wallet_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marketerId" uuid NOT NULL, "type" character varying NOT NULL, "amount" numeric(18,2) NOT NULL, "reference" character varying NOT NULL, "approvedBy" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5120f131bde2cda940ec1a621db" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f98d2a2a02e62207b8fdd59547" ON "wallet_transactions" ("marketerId") `);
        await queryRunner.query(`CREATE TABLE "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientNo" character varying NOT NULL, "fullName" character varying NOT NULL, "gender" character varying, "dob" date, "phone" character varying NOT NULL, "altPhone" character varying, "nationalId" character varying, "address" character varying, "district" character varying, "chiefdom" character varying, "occupation" character varying, "employerOrGroup" character varying, "clientCategory" character varying, "kycStatus" character varying NOT NULL DEFAULT 'Pending', "riskRating" character varying, "smsConsent" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'Active', "agentId" uuid, "branchId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7dd20bf3c0156837e953687408" ON "clients" ("clientNo") `);
        await queryRunner.query(`CREATE TABLE "policies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "policyNo" character varying NOT NULL, "sumAssured" numeric(18,2) NOT NULL, "monthlyPremium" numeric(18,2) NOT NULL, "commencementDate" date NOT NULL, "maturityDate" date, "paymentFrequency" character varying NOT NULL DEFAULT 'Monthly', "paymentMethod" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'Not Yet Commenced', "lapseReason" character varying, "policyNumberLocked" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "clientId" uuid, "productId" uuid, CONSTRAINT "PK_603e09f183df0108d8695c57e28" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e8c696ca6af935cdaa9a095d90" ON "policies" ("policyNo") `);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "receiptNo" character varying NOT NULL, "transactionId" character varying NOT NULL, "amount" numeric(18,2) NOT NULL, "paymentMonth" character varying NOT NULL, "paymentMethod" character varying NOT NULL, "marketerId" uuid, "gpsLat" double precision, "gpsLng" double precision, "smsStatus" character varying NOT NULL DEFAULT 'Pending', "receiptStatus" character varying NOT NULL DEFAULT 'Issued', "reversalStatus" character varying NOT NULL DEFAULT 'None', "reversalOfPaymentId" uuid, "reconciliationStatus" character varying NOT NULL DEFAULT 'Unreconciled', "idempotencyKey" character varying NOT NULL, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "policyId" uuid, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_45ea4ca71253adfe244826b9cb" ON "payments" ("receiptNo") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c39d78e8744809ece8ca95730e" ON "payments" ("transactionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_5675af6d0d59b73c0f4edf1d10" ON "payments" ("reversalOfPaymentId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_743b9fb1d2a059f2f7860418e4" ON "payments" ("idempotencyKey") `);
        await queryRunner.query(`CREATE TABLE "cash_reconciliations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marketerId" uuid NOT NULL, "period" character varying NOT NULL, "expectedCash" numeric(18,2) NOT NULL, "depositedCash" numeric(18,2) NOT NULL, "variance" numeric(18,2) NOT NULL, "status" character varying NOT NULL DEFAULT 'Open', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_367e7995e9b1f6a1d889a5ddb3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "category" character varying NOT NULL, "relatedType" character varying NOT NULL, "relatedId" uuid, "storageKey" character varying NOT NULL, "version" integer NOT NULL DEFAULT '1', "uploadedBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "leads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "phone" character varying, "source" character varying, "status" character varying NOT NULL DEFAULT 'New', "notes" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "complaints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel" character varying NOT NULL, "issue" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'Open', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "clientId" uuid, CONSTRAINT "PK_4b7566a2a489c2cc7c12ed076ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "crm_interactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel" character varying NOT NULL, "summary" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "clientId" uuid, CONSTRAINT "PK_e0a3b22fcd390e0a81c81492595" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "beneficiaries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "relationship" character varying, "phone" character varying, "sharePct" numeric(5,2) NOT NULL DEFAULT '100', "clientId" uuid, CONSTRAINT "PK_c9356d282dec80f7f12a9eef10a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "claims" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "claimNo" character varying NOT NULL, "claimType" character varying NOT NULL, "amountClaimed" numeric(18,2) NOT NULL, "amountApproved" numeric(18,2), "dateReported" date NOT NULL, "status" character varying NOT NULL DEFAULT 'Registered', "reserveAmount" numeric(18,2) NOT NULL DEFAULT '0', "decidedBy" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "policyId" uuid, CONSTRAINT "PK_96c91970c0dcb2f69fdccd0a698" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fb6f286cf1bbdd0ccca20761a0" ON "claims" ("claimNo") `);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "action" character varying NOT NULL, "entityType" character varying NOT NULL, "entityId" uuid, "before" jsonb, "after" jsonb, "ip" character varying, "ts" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cfa83f61e4d27a87fcae1e025a" ON "audit_logs" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_01993ae76b293d3b866cc3a125" ON "audit_logs" ("entityType") `);
        await queryRunner.query(`CREATE INDEX "IDX_f23279fad63453147a8efb46cf" ON "audit_logs" ("entityId") `);
        await queryRunner.query(`CREATE TABLE "assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "category" character varying NOT NULL, "assignedTo" character varying, "status" character varying NOT NULL DEFAULT 'In Use', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_da96729a8b113377cfb6a62439c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "procurement_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "item" character varying NOT NULL, "quantity" integer NOT NULL, "requestedBy" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'Pending Approval', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c0b1fa20bfe6f8231eada515e64" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "underwriting_cases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sumAssured" numeric(18,2) NOT NULL, "riskAnswers" jsonb, "decision" character varying NOT NULL DEFAULT 'Pending', "decisionReason" character varying, "decidedBy" uuid, "decidedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "clientId" uuid, "productId" uuid, CONSTRAINT "PK_79c8a4a155af24b64ed892da6fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_368e146b785b574f42ae9e53d5e" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "devices" ADD CONSTRAINT "FK_e8a5d59f0ac3040395f159507c6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_4eda1468756ca831495e308e407" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "FK_696136b16d41cbf47ff3db72f75" FOREIGN KEY ("parentId") REFERENCES "chart_of_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "journal_lines" ADD CONSTRAINT "FK_3c913ef1f691ce5b2c490116309" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "journal_lines" ADD CONSTRAINT "FK_d9eecc536593997a18359db2b47" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ifrs17_groups" ADD CONSTRAINT "FK_a962e293984747e502917241efd" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ifrs17_measurements" ADD CONSTRAINT "FK_86c6884335d0d149f2b4bb3e9a1" FOREIGN KEY ("groupId") REFERENCES "ifrs17_groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "policies" ADD CONSTRAINT "FK_69ef5ce78d4674eae70fe433316" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "policies" ADD CONSTRAINT "FK_6c10643df2991a365c297d7f283" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_373d7479a058d13a2d5ef3ea245" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_2718f13aefee8d931acf5e08f4a" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "crm_interactions" ADD CONSTRAINT "FK_7e16f44f430a99853f5c6f176ba" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "beneficiaries" ADD CONSTRAINT "FK_006cf8719b29e9cf9ebf1c9ad18" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claims" ADD CONSTRAINT "FK_cea536bf1c443b4d4c207a436fd" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "underwriting_cases" ADD CONSTRAINT "FK_bad667729bbb2162e91cfc68f10" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "underwriting_cases" ADD CONSTRAINT "FK_896d738f2868a6c1afe25aa7ead" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "underwriting_cases" DROP CONSTRAINT "FK_896d738f2868a6c1afe25aa7ead"`);
        await queryRunner.query(`ALTER TABLE "underwriting_cases" DROP CONSTRAINT "FK_bad667729bbb2162e91cfc68f10"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP CONSTRAINT "FK_cea536bf1c443b4d4c207a436fd"`);
        await queryRunner.query(`ALTER TABLE "beneficiaries" DROP CONSTRAINT "FK_006cf8719b29e9cf9ebf1c9ad18"`);
        await queryRunner.query(`ALTER TABLE "crm_interactions" DROP CONSTRAINT "FK_7e16f44f430a99853f5c6f176ba"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_2718f13aefee8d931acf5e08f4a"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_373d7479a058d13a2d5ef3ea245"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP CONSTRAINT "FK_6c10643df2991a365c297d7f283"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP CONSTRAINT "FK_69ef5ce78d4674eae70fe433316"`);
        await queryRunner.query(`ALTER TABLE "ifrs17_measurements" DROP CONSTRAINT "FK_86c6884335d0d149f2b4bb3e9a1"`);
        await queryRunner.query(`ALTER TABLE "ifrs17_groups" DROP CONSTRAINT "FK_a962e293984747e502917241efd"`);
        await queryRunner.query(`ALTER TABLE "journal_lines" DROP CONSTRAINT "FK_d9eecc536593997a18359db2b47"`);
        await queryRunner.query(`ALTER TABLE "journal_lines" DROP CONSTRAINT "FK_3c913ef1f691ce5b2c490116309"`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP CONSTRAINT "FK_696136b16d41cbf47ff3db72f75"`);
        await queryRunner.query(`ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_4eda1468756ca831495e308e407"`);
        await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT "FK_e8a5d59f0ac3040395f159507c6"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_368e146b785b574f42ae9e53d5e"`);
        await queryRunner.query(`DROP TABLE "underwriting_cases"`);
        await queryRunner.query(`DROP TABLE "procurement_requests"`);
        await queryRunner.query(`DROP TABLE "assets"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f23279fad63453147a8efb46cf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01993ae76b293d3b866cc3a125"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cfa83f61e4d27a87fcae1e025a"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fb6f286cf1bbdd0ccca20761a0"`);
        await queryRunner.query(`DROP TABLE "claims"`);
        await queryRunner.query(`DROP TABLE "beneficiaries"`);
        await queryRunner.query(`DROP TABLE "crm_interactions"`);
        await queryRunner.query(`DROP TABLE "complaints"`);
        await queryRunner.query(`DROP TABLE "leads"`);
        await queryRunner.query(`DROP TABLE "documents"`);
        await queryRunner.query(`DROP TABLE "cash_reconciliations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_743b9fb1d2a059f2f7860418e4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5675af6d0d59b73c0f4edf1d10"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c39d78e8744809ece8ca95730e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_45ea4ca71253adfe244826b9cb"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e8c696ca6af935cdaa9a095d90"`);
        await queryRunner.query(`DROP TABLE "policies"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7dd20bf3c0156837e953687408"`);
        await queryRunner.query(`DROP TABLE "clients"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f98d2a2a02e62207b8fdd59547"`);
        await queryRunner.query(`DROP TABLE "wallet_transactions"`);
        await queryRunner.query(`DROP TABLE "ifrs17_measurements"`);
        await queryRunner.query(`DROP TABLE "ifrs17_groups"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TABLE "journal_lines"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bb2578b291e9d17e4df57b4788"`);
        await queryRunner.query(`DROP TABLE "journal_entries"`);
        await queryRunner.query(`DROP TABLE "chart_of_accounts"`);
        await queryRunner.query(`DROP TABLE "leave_requests"`);
        await queryRunner.query(`DROP TABLE "employees"`);
        await queryRunner.query(`DROP TABLE "devices"`);
        await queryRunner.query(`DROP TABLE "permissions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TABLE "marketer_targets"`);
        await queryRunner.query(`DROP TABLE "sms_logs"`);
    }

}
