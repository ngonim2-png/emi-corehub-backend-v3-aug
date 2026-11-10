import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Office requisitions: the paper requisition form with its approval chain
 * (department head, procurement manager, finance manager, managing director, CEO).
 */
export class OfficeRequisitions1790600000000 implements MigrationInterface {
  name = 'OfficeRequisitions1790600000000';

  public async up(q: QueryRunner): Promise<void> {
    for (const role of ['Procurement Manager', 'Managing Director', 'CEO']) {
      await q.query(`INSERT INTO "roles" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`, [role]);
    }
    await q.query(`CREATE TABLE IF NOT EXISTS "departments" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "headUserId" uuid,
      "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_departments" PRIMARY KEY ("id"))`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_departments_name" ON "departments" ("name")`);
    // Start the list from the departments already used on staff records.
    await q.query(`INSERT INTO "departments" ("name")
      SELECT DISTINCT trim("department") FROM "employees" WHERE coalesce(trim("department"), '') <> ''
      ON CONFLICT ("name") DO NOTHING`);

    await q.query(`CREATE TABLE IF NOT EXISTS "requisitions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ref" character varying NOT NULL, "purpose" text NOT NULL,
      "departmentId" uuid, "departmentName" character varying NOT NULL, "raisedBy" uuid NOT NULL, "raisedByName" character varying NOT NULL,
      "designation" character varying, "neededBy" date, "urgency" character varying NOT NULL DEFAULT 'Normal', "supplier" character varying,
      "total" numeric(14,2) NOT NULL DEFAULT 0, "status" character varying NOT NULL DEFAULT 'Pending Department Head',
      "lastActionStage" character varying, "submittedAt" TIMESTAMP WITH TIME ZONE,
      "paidOn" date, "amountPaid" numeric(14,2), "paymentMethod" character varying, "paymentReference" character varying,
      "expenseAccount" character varying, "paidBy" uuid, "journalEntryId" uuid,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_requisitions" PRIMARY KEY ("id"))`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_requisitions_ref" ON "requisitions" ("ref")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_requisitions_status" ON "requisitions" ("status")`);

    await q.query(`CREATE TABLE IF NOT EXISTS "requisition_items" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "lineNo" integer NOT NULL, "description" text NOT NULL,
      "quantity" numeric(12,2) NOT NULL, "unitCost" numeric(14,2) NOT NULL DEFAULT 0, "totalCost" numeric(14,2) NOT NULL DEFAULT 0,
      "requisitionId" uuid, CONSTRAINT "PK_requisition_items" PRIMARY KEY ("id"),
      CONSTRAINT "FK_requisition_items_req" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE TABLE IF NOT EXISTS "requisition_approvals" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "stage" character varying NOT NULL, "decision" character varying NOT NULL,
      "userId" uuid NOT NULL, "userName" character varying NOT NULL, "designation" character varying, "comment" text,
      "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requisitionId" uuid,
      CONSTRAINT "PK_requisition_approvals" PRIMARY KEY ("id"),
      CONSTRAINT "FK_requisition_approvals_req" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE CASCADE)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "requisition_approvals"`);
    await q.query(`DROP TABLE IF EXISTS "requisition_items"`);
    await q.query(`DROP TABLE IF EXISTS "requisitions"`);
    await q.query(`DROP TABLE IF EXISTS "departments"`);
  }
}
