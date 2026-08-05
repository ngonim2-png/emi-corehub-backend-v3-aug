import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCalendarEvents1785857179600 implements MigrationInterface {
    name = 'AddCalendarEvents1785857179600'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "calendar_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'Meeting', "description" text, "startAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endAt" TIMESTAMP WITH TIME ZONE, "relatedType" character varying, "relatedId" uuid, "assignedTo" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'Scheduled', "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_faf5391d232322a87cdd1c6f30c" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "calendar_events"`);
    }

}
