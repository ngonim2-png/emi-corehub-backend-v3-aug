import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLeadershipModule1785942764980 implements MigrationInterface {
    name = 'AddLeadershipModule1785942764980'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "leadership_targets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "weekStartDate" date NOT NULL, "description" text NOT NULL, "linkedGoalId" uuid, "targetValue" numeric(18,2), "unit" character varying, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3e0e234eb2f9b02ea26ffb648b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "leadership_target_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "targetId" uuid NOT NULL, "assignedTo" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'Set', "actualValue" numeric(18,2), "reviewedAt" TIMESTAMP WITH TIME ZONE, "reviewNotes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5d4e8b282b33d578ff2ea64a52d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "leadership_meetings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying NOT NULL, "date" date NOT NULL, "notes" text, "conductedBy" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'Scheduled', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ab0522706ea371c016389d36355" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "leadership_goals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "month" character varying NOT NULL, "description" text NOT NULL, "status" character varying NOT NULL DEFAULT 'Active', "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3d23d66d76aa9b23d08d3f79cd5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "leadership_action_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "meetingId" uuid, "title" character varying NOT NULL, "description" text, "assignedTo" uuid NOT NULL, "dueDate" date NOT NULL, "status" character varying NOT NULL DEFAULT 'Open', "calendarEventId" uuid, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9e361c8d147d3fe7d552dd04b83" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "leadership_target_assignments" ADD CONSTRAINT "FK_164efb9d670776f4740ff8ff4bd" FOREIGN KEY ("targetId") REFERENCES "leadership_targets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leadership_target_assignments" DROP CONSTRAINT "FK_164efb9d670776f4740ff8ff4bd"`);
        await queryRunner.query(`DROP TABLE "leadership_action_items"`);
        await queryRunner.query(`DROP TABLE "leadership_goals"`);
        await queryRunner.query(`DROP TABLE "leadership_meetings"`);
        await queryRunner.query(`DROP TABLE "leadership_target_assignments"`);
        await queryRunner.query(`DROP TABLE "leadership_targets"`);
    }

}
