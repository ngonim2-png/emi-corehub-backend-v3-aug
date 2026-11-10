import { MigrationInterface, QueryRunner } from 'typeorm';

/** Remembers the raiser's role, so a step they would normally sign themselves goes to a stand-in. */
export class RequisitionRaiserRole1790700000000 implements MigrationInterface {
  name = 'RequisitionRaiserRole1790700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "raisedByRole" character varying`);
    await q.query(`UPDATE "requisitions" r SET "raisedByRole" = ro.name FROM "users" u JOIN "roles" ro ON ro.id = u."roleId" WHERE u.id = r."raisedBy" AND r."raisedByRole" IS NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "requisitions" DROP COLUMN IF EXISTS "raisedByRole"`);
  }
}
