import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentFileFieldsClientPhoto1785836380510 implements MigrationInterface {
    name = 'AddDocumentFileFieldsClientPhoto1785836380510'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" ADD "photoStorageKey" character varying`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "photoMimeType" character varying`);
        await queryRunner.query(`ALTER TABLE "documents" ADD "mimeType" character varying`);
        await queryRunner.query(`ALTER TABLE "documents" ADD "sizeBytes" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "sizeBytes"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "mimeType"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "photoMimeType"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "photoStorageKey"`);
    }

}
