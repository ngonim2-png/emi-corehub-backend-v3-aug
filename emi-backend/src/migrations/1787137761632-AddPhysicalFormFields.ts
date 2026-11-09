import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPhysicalFormFields1787137761632 implements MigrationInterface {
    name = 'AddPhysicalFormFields1787137761632'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" ADD "maritalStatus" character varying`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "nationality" character varying`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "placeOfBirth" character varying`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "insuredSex" character varying`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "insuredRelationship" character varying`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "insuredSchool" character varying`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "applicationFormStorageKey" character varying`);
        await queryRunner.query(`ALTER TABLE "policies" ADD "applicationFormMimeType" character varying`);
        await queryRunner.query(`ALTER TABLE "beneficiaries" ADD "dateOfBirth" date`);
        await queryRunner.query(`ALTER TABLE "beneficiaries" ADD "address" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "beneficiaries" DROP COLUMN "address"`);
        await queryRunner.query(`ALTER TABLE "beneficiaries" DROP COLUMN "dateOfBirth"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "applicationFormMimeType"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "applicationFormStorageKey"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "insuredSchool"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "insuredRelationship"`);
        await queryRunner.query(`ALTER TABLE "policies" DROP COLUMN "insuredSex"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "placeOfBirth"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "nationality"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "maritalStatus"`);
    }

}
