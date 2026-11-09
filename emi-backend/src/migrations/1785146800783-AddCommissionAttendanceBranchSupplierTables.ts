import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommissionAttendanceBranchSupplierTables1785146800783 implements MigrationInterface {
    name = 'AddCommissionAttendanceBranchSupplierTables1785146800783'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "commission_rates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marketerId" uuid NOT NULL, "ratePct" numeric(5,2) NOT NULL, CONSTRAINT "UQ_a0fa140082cef75c36d8c16fe5d" UNIQUE ("marketerId"), CONSTRAINT "PK_36e3db4b02381d014a663adbf1b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "commission_payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marketerId" uuid NOT NULL, "period" character varying NOT NULL, "amount" numeric(18,2) NOT NULL, "paidBy" uuid NOT NULL, "paidAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5ab2e1f7982ac213a3838c2944a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "attendance_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "date" date NOT NULL, "status" character varying NOT NULL DEFAULT 'Present', "checkInTime" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "employeeId" uuid, CONSTRAINT "PK_946920332f5bc9efad3f3023b96" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "district" character varying, "address" character varying, "phone" character varying, "managerId" uuid, "status" character varying NOT NULL DEFAULT 'Active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7f37d3b42defea97f1df0d19535" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "contactPerson" character varying, "phone" character varying, "email" character varying, "category" character varying, "status" character varying NOT NULL DEFAULT 'Active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "attendance_records" ADD CONSTRAINT "FK_2f86d1ade33d4dbc029e216904a" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "attendance_records" DROP CONSTRAINT "FK_2f86d1ade33d4dbc029e216904a"`);
        await queryRunner.query(`DROP TABLE "suppliers"`);
        await queryRunner.query(`DROP TABLE "branches"`);
        await queryRunner.query(`DROP TABLE "attendance_records"`);
        await queryRunner.query(`DROP TABLE "commission_payouts"`);
        await queryRunner.query(`DROP TABLE "commission_rates"`);
    }

}
