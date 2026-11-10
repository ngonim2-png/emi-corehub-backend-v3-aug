import { MigrationInterface, QueryRunner } from 'typeorm';

/** Goods received on requisitions, and the account a requisition will be charged to (for the budget check). */
export class RequisitionReceiptAndBudget1790800000000 implements MigrationInterface {
  name = 'RequisitionReceiptAndBudget1790800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "receivedBy" uuid`);
    await q.query(`ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "receivedByName" character varying`);
    await q.query(`ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "receivedNote" text`);
    await q.query(`ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "assetsCreated" integer NOT NULL DEFAULT 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const c of ['receivedAt', 'receivedBy', 'receivedByName', 'receivedNote', 'assetsCreated']) await q.query(`ALTER TABLE "requisitions" DROP COLUMN IF EXISTS "${c}"`);
  }
}
