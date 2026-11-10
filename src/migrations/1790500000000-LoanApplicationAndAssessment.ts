import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loans step 2: the rest of the EMI Loan Application Form.
 *  - application details (sections 1 to 4 and 6): branch, premium payment method, occupation,
 *    staff PIN, income, existing debts, identification, declaration
 *  - the document checklist (section 5)
 *  - verification and credit assessment (section 7 A and B)
 *  - the decision (section 7 C): approved, approved with conditions, deferred or declined,
 *    with the amount and tenure actually approved
 */
export class LoanApplicationAndAssessment1790500000000 implements MigrationInterface {
  name = 'LoanApplicationAndAssessment1790500000000';

  public async up(q: QueryRunner): Promise<void> {
    const cols: [string, string][] = [
      ['branch', 'varchar'],
      ['premiumPaymentMethod', 'varchar'],
      ['occupation', 'varchar'],
      ['staffPinCode', 'varchar'],
      ['monthlyIncome', 'numeric(12,2)'],
      ['existingMonthlyDebt', 'numeric(12,2)'],
      ['idType', 'varchar'],
      ['idNumber', 'varchar'],
      ['idExpiry', 'date'],
      ['declarationName', 'varchar'],
      ['declarationAcceptedAt', 'timestamptz'],
      ['checklist', `jsonb NOT NULL DEFAULT '{}'::jsonb`],
      ['requestedPrincipal', 'numeric(12,2)'],
      ['requestedTenureMonths', 'int'],
      ['policyVerified', 'boolean'],
      ['verifiedPolicyNo', 'varchar'],
      ['paymentPerformance', 'varchar'],
      ['monthsAsClient', 'int'],
      ['outstandingPremium', 'numeric(12,2)'],
      ['verifiedMonthlyIncome', 'numeric(12,2)'],
      ['verifiedExistingDebt', 'numeric(12,2)'],
      ['dtiPct', 'numeric(6,2)'],
      ['recommendedAmount', 'numeric(12,2)'],
      ['recommendedTenureMonths', 'int'],
      ['downPayment', 'numeric(12,2)'],
      ['creditAssessment', 'varchar'],
      ['assessmentComments', 'text'],
      ['assessedBy', 'uuid'],
      ['assessedAt', 'timestamptz'],
      ['decisionOutcome', 'varchar'],
      ['conditions', 'text'],
    ];
    for (const [name, type] of cols) await q.query(`ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "${name}" ${type}`);
    // What was asked for, kept separately from what is finally approved.
    await q.query(`UPDATE "loans" SET "requestedPrincipal" = "principal", "requestedTenureMonths" = "tenureMonths" WHERE "requestedPrincipal" IS NULL`);
    await q.query(`UPDATE "loans" SET "decisionOutcome" = CASE WHEN "financeDirectorDecision" = 'Approved' THEN 'Approved' WHEN status = 'Rejected' THEN 'Declined' END WHERE "decisionOutcome" IS NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const c of ['branch', 'premiumPaymentMethod', 'occupation', 'staffPinCode', 'monthlyIncome', 'existingMonthlyDebt', 'idType', 'idNumber', 'idExpiry', 'declarationName', 'declarationAcceptedAt', 'checklist', 'requestedPrincipal', 'requestedTenureMonths', 'policyVerified', 'verifiedPolicyNo', 'paymentPerformance', 'monthsAsClient', 'outstandingPremium', 'verifiedMonthlyIncome', 'verifiedExistingDebt', 'dtiPct', 'recommendedAmount', 'recommendedTenureMonths', 'downPayment', 'creditAssessment', 'assessmentComments', 'assessedBy', 'assessedAt', 'decisionOutcome', 'conditions']) {
      await q.query(`ALTER TABLE "loans" DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
