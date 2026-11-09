import { MigrationInterface, QueryRunner } from 'typeorm';

/** Groups the lines of one AG deduction upload, so the dashboard can compare a file's total with what was recorded. */
export class AddDeductionImportBatch1790300000000 implements MigrationInterface {
  name = 'AddDeductionImportBatch1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deduction_import_records" ADD COLUMN IF NOT EXISTS "importBatch" uuid`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deduction_import_records_period_batch" ON "deduction_import_records" ("period", "importBatch")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_deduction_import_records_period_batch"`);
    await queryRunner.query(`ALTER TABLE "deduction_import_records" DROP COLUMN IF EXISTS "importBatch"`);
  }
}
