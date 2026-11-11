import { MigrationInterface, QueryRunner } from 'typeorm';

/** When and why an employee left, and the departments list shared by HR and requisitions. */
export class EmployeeExitDetails1790900000000 implements MigrationInterface {
  name = 'EmployeeExitDetails1790900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "exitDate" date`);
    await q.query(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "exitReason" text`);
    await q.query(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
    // Every department used on a staff record appears in the shared list.
    await q.query(`INSERT INTO "departments" ("name")
      SELECT DISTINCT trim("department") FROM "employees" WHERE coalesce(trim("department"), '') <> '' AND trim("department") <> 'Unassigned'
      ON CONFLICT ("name") DO NOTHING`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "employees" DROP COLUMN IF EXISTS "updatedAt"`);
    await q.query(`ALTER TABLE "employees" DROP COLUMN IF EXISTS "exitReason"`);
    await q.query(`ALTER TABLE "employees" DROP COLUMN IF EXISTS "exitDate"`);
  }
}
