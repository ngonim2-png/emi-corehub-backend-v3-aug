import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLoans1789501010322 implements MigrationInterface {
    name = 'AddLoans1789501010322'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "loans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "loanType" character varying NOT NULL, "applianceDescription" text, "principal" numeric(12,2) NOT NULL, "tenureMonths" integer NOT NULL, "interestRatePct" numeric(5,2) NOT NULL DEFAULT '25', "totalInterest" numeric(12,2) NOT NULL, "totalRepayable" numeric(12,2) NOT NULL, "monthlyPayment" numeric(12,2) NOT NULL, "status" character varying NOT NULL DEFAULT 'Pending Life Manager Approval', "requestedBy" uuid NOT NULL, "requestedAt" TIMESTAMP NOT NULL DEFAULT now(), "lifeManagerDecision" character varying, "lifeManagerBy" uuid, "lifeManagerAt" TIMESTAMP WITH TIME ZONE, "lifeManagerNotes" text, "financeDirectorDecision" character varying, "financeDirectorBy" uuid, "financeDirectorAt" TIMESTAMP WITH TIME ZONE, "financeDirectorNotes" text, "disbursedAt" TIMESTAMP WITH TIME ZONE, "disbursedBy" uuid, "clientId" uuid, CONSTRAINT "PK_5c6942c1e13e4de135c5203ee61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "loan_repayments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dueMonth" character varying NOT NULL, "amountDue" numeric(12,2) NOT NULL, "amountPaid" numeric(12,2) NOT NULL DEFAULT '0', "paidAt" TIMESTAMP WITH TIME ZONE, "status" character varying NOT NULL DEFAULT 'Due', "recordedBy" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "loanId" uuid, CONSTRAINT "PK_a37968e2dcfb72f910f5480cc16" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_a04f985bb1203a1e90a89ee9c6b" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_repayments" ADD CONSTRAINT "FK_a2f0da4f5cd58b196e6db2d58e3" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // The seed script only runs against a brand-new database, so on an
        // already-seeded live database these two roles need to be added
        // here instead - ON CONFLICT DO NOTHING makes this safe to run
        // whether or not they already exist.
        await queryRunner.query(`INSERT INTO "roles" ("name") VALUES ('Life Manager') ON CONFLICT ("name") DO NOTHING`);
        await queryRunner.query(`INSERT INTO "roles" ("name") VALUES ('Finance Director') ON CONFLICT ("name") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "loan_repayments" DROP CONSTRAINT "FK_a2f0da4f5cd58b196e6db2d58e3"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_a04f985bb1203a1e90a89ee9c6b"`);
        await queryRunner.query(`DROP TABLE "loan_repayments"`);
        await queryRunner.query(`DROP TABLE "loans"`);
    }

}
