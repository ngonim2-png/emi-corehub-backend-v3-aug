import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPolicyInsuredLifeAndPayrollPin1786367909102 implements MigrationInterface {
    name = 'AddPolicyInsuredLifeAndPayrollPin1786367909102'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "policies" ADD "insuredName" character varying`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "insuredDob" date`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "payrollPinCode" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "payrollPinCode"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "insuredDob"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "insuredName"`);
    }

}
