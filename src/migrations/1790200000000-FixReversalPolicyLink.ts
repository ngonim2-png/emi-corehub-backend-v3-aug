import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payment reversals used to be saved without their policy, so a reversed
 * payment still counted as paid on the client's record. This links every
 * existing reversal back to the policy of the payment it reverses.
 */
export class FixReversalPolicyLink1790200000000 implements MigrationInterface {
  name = 'FixReversalPolicyLink1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "payments" r
      SET "policyId" = o."policyId"
      FROM "payments" o
      WHERE r."reversalOfPaymentId" = o."id"
        AND r."policyId" IS NULL
        AND o."policyId" IS NOT NULL
    `);
  }

  public async down(): Promise<void> {
    // Data repair only; nothing to undo.
  }
}
