import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPolicyDocumentTemplates1786366070266 implements MigrationInterface {
    name = 'AddPolicyDocumentTemplates1786366070266'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "policy_document_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "storageKey" character varying NOT NULL, "productId" uuid, "uploadedBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e5eb3b9447a6a03b1d93ba31eb3" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "policy_document_templates"`);
    }

}
