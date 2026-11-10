import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loans step 1:
 *  - a readable reference (LN-YYYY-0001) and the purpose of the loan, as on the paper form
 *  - three accounts so loans reach the books: loans receivable, unearned loan interest, loan interest income
 * Existing loans get references in the order they were requested.
 */
export class LoansReferenceAndAccounts1790400000000 implements MigrationInterface {
  name = 'LoansReferenceAndAccounts1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "loanRef" varchar`);
    await queryRunner.query(`ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "purpose" varchar`);
    await queryRunner.query(`ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "purposeDetail" text`);
    await queryRunner.query(`
      UPDATE "loans" l SET "loanRef" = x.ref FROM (
        SELECT id, 'LN-' || to_char("requestedAt", 'YYYY') || '-' ||
               lpad((row_number() OVER (PARTITION BY to_char("requestedAt", 'YYYY') ORDER BY "requestedAt", id))::text, 4, '0') AS ref
        FROM "loans"
      ) x WHERE l.id = x.id AND l."loanRef" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_loans_loanRef" ON "loans" ("loanRef")`);

    const accounts: [string, string, string, string][] = [
      ['1400', 'Policy loans receivable', 'Asset', 'Amount clients still owe on loans (principal plus interest).'],
      ['2500', 'Unearned loan interest', 'Liability', 'Loan interest not yet earned; moves to income as repayments come in.'],
      ['4200', 'Loan interest income', 'Income', 'Interest earned on client loans.'],
    ];
    for (const [code, name, type, description] of accounts) {
      await queryRunner.query(
        `INSERT INTO "chart_of_accounts" ("code", "name", "type", "description")
         SELECT $1::varchar, $2::varchar, $3::varchar, $4::text WHERE NOT EXISTS (SELECT 1 FROM "chart_of_accounts" WHERE "code" = $1::varchar)`,
        [code, name, type, description],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_loans_loanRef"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN IF EXISTS "purposeDetail"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN IF EXISTS "purpose"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN IF EXISTS "loanRef"`);
  }
}
