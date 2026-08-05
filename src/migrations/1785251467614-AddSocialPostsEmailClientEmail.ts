import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSocialPostsEmailClientEmail1785251467614 implements MigrationInterface {
    name = 'AddSocialPostsEmailClientEmail1785251467614'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "email_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "toEmail" character varying NOT NULL, "subject" character varying NOT NULL, "body" text NOT NULL, "relatedType" character varying, "relatedId" uuid, "status" character varying NOT NULL DEFAULT 'Queued', "providerMessageId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_999382218924e953a790d340571" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "social_posts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "platform" character varying NOT NULL, "content" text NOT NULL, "scheduledDate" date NOT NULL, "status" character varying NOT NULL DEFAULT 'Draft', "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2161864ea79f14525b8804bd7ff" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "email" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "email"`);
        await queryRunner.query(`DROP TABLE "social_posts"`);
        await queryRunner.query(`DROP TABLE "email_logs"`);
    }

}
