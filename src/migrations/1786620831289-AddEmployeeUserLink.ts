import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmployeeUserLink1786620831289 implements MigrationInterface {
    name = 'AddEmployeeUserLink1786620831289'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "UQ_737991e10350d9626f592894cef" UNIQUE ("userId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "UQ_737991e10350d9626f592894cef"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "userId"`);
    }

}
