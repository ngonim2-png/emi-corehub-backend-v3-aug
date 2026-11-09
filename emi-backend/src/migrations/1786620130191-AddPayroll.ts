import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPayroll1786620130191 implements MigrationInterface {
    name = 'AddPayroll1786620130191'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "payroll_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "month" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'Draft', "sourceFileName" character varying, "finalizedAt" TIMESTAMP WITH TIME ZONE, "finalizedBy" uuid, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_906ffb71db72f011cc118bc706a" UNIQUE ("month"), CONSTRAINT "PK_6049f42c972640c0eb99ba8035e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "payroll_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "payrollRunId" uuid NOT NULL, "itemNumber" integer, "daysWorked" numeric(10,2) NOT NULL, "ratePerDay" numeric(12,2) NOT NULL, "basicSalary" numeric(12,2) NOT NULL, "transportation" numeric(12,2) NOT NULL DEFAULT '0', "rentAllowance" numeric(12,2) NOT NULL DEFAULT '0', "medicalAllowance" numeric(12,2) NOT NULL DEFAULT '0', "mobileAllowance" numeric(12,2) NOT NULL DEFAULT '0', "nassitEmployee" numeric(12,2) NOT NULL DEFAULT '0', "nassitEmployer" numeric(12,2) NOT NULL DEFAULT '0', "paye" numeric(12,2) NOT NULL DEFAULT '0', "totalCostToCompany" numeric(12,2) NOT NULL, "paySmolSmolPremium" numeric(12,2) NOT NULL DEFAULT '0', "endowmentCredit" numeric(12,2) NOT NULL DEFAULT '0', "riceCredit" numeric(12,2) NOT NULL DEFAULT '0', "penalty" numeric(12,2) NOT NULL DEFAULT '0', "debtSalaryAdvances" numeric(12,2) NOT NULL DEFAULT '0', "absenceDaysCount" integer NOT NULL DEFAULT '0', "absenceDeduction" numeric(12,2) NOT NULL DEFAULT '0', "originalBankTransferFromFile" numeric(12,2), "notes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "employeeId" uuid, CONSTRAINT "PK_3108929e5baed091559aa5b039c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "payroll_lines" ADD CONSTRAINT "FK_b375a978d8041ec009afa7591a8" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payroll_lines" DROP CONSTRAINT "FK_b375a978d8041ec009afa7591a8"`);
        await queryRunner.query(`DROP TABLE "payroll_lines"`);
        await queryRunner.query(`DROP TABLE "payroll_runs"`);
    }

}
