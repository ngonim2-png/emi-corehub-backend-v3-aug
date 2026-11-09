import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTimeToMeetingsAndActionItems1786479051776 implements MigrationInterface {
    name = 'AddTimeToMeetingsAndActionItems1786479051776'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leadership_meetings" ADD "time" character varying`);
        await queryRunner.query(`ALTER TABLE "leadership_action_items" ADD "time" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leadership_action_items" DROP COLUMN "time"`);
        await queryRunner.query(`ALTER TABLE "leadership_meetings" DROP COLUMN "time"`);
    }

}
