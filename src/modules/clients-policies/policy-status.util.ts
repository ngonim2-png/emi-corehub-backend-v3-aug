/**
 * Server-side port of the prototype's computeClient() logic. This is the
 * single authoritative implementation of the grace/warning/lapse rules -
 * the frontend never recomputes status itself, it only displays whatever
 * this function (via PoliciesService) last wrote to policies.status.
 *
 * Month keys are 'YYYY-MM' strings throughout, which compare correctly
 * with plain string comparison - no date-library dependency needed for
 * the comparisons themselves.
 */

export interface BusinessRules {
  premiumDueDay: number;
  warningThresholdMonths: number;
  lapseThresholdMonths: number;
  /**
   * Accountant General (AG) payroll deductions for month M reach EMI by
   * this day of month M+1. A payroll-deduction policy's premium for M is
   * therefore not overdue until that day has passed. Defaults to 10.
   */
  payrollReceiptDay?: number;
}

const DEFAULT_PAYROLL_RECEIPT_DAY = 10;

/** Reads the business rules from configuration, so every caller uses the same values. */
export function businessRulesFromConfig(config: { get<T = any>(key: string): T | undefined }): Required<BusinessRules> {
  return {
    premiumDueDay: config.get<number>('businessRules.premiumDueDay') ?? 5,
    warningThresholdMonths: config.get<number>('businessRules.warningThresholdMonths') ?? 2,
    lapseThresholdMonths: config.get<number>('businessRules.lapseThresholdMonths') ?? 3,
    payrollReceiptDay: config.get<number>('businessRules.payrollReceiptDay') ?? DEFAULT_PAYROLL_RECEIPT_DAY,
  };
}

/**
 * True when the premium is collected through an AG pincode payroll
 * deduction: the policy's payment method is "Payroll Deduction", or it
 * carries an AG payroll pincode.
 */
export function isPayrollDeductionPolicy(policy: { paymentMethod?: string | null; payrollPinCode?: string | null }): boolean {
  return policy.paymentMethod === 'Payroll Deduction' || !!(policy.payrollPinCode && String(policy.payrollPinCode).trim());
}

export interface PolicyForStatusCalc {
  commencementMonth: string; // 'YYYY-MM'
  maturityMonth: string | null; // 'YYYY-MM' | null
  monthlyPremiumMinor: number; // integer minor units
  /** month key -> amount paid that month, in integer minor units */
  paymentsByMonth: Record<string, number>;
  /** AG payroll deduction: month M is collected by payrollReceiptDay of M+1. */
  payrollDeduction?: boolean;
}

export interface PolicyStatusResult {
  status:
    | 'Not Yet Commenced'
    | 'Active'
    | 'One Month Outstanding'
    | 'Warning'
    | 'Lapsed'
    | 'Matured'
    | 'Cancelled'; // never derived here - only ever set explicitly (e.g. a bulk roster import marking a stopped policy). See PolicyEntity.status for the full literal type.
  totalExpectedMinor: number;
  totalPaidMinor: number;
  totalOutstandingMinor: number;
  currentExpectedMinor: number;
  currentPaidMinor: number;
  currentOutstandingMinor: number;
  consecutiveUnpaidMonths: number;
  lastPaidMonth: string | null;
  /** 'Payroll' for AG payroll deduction policies, 'Direct' otherwise. */
  collectionChannel: 'Payroll' | 'Direct';
  /** The date (YYYY-MM-DD) the reporting month's premium becomes overdue if unpaid. */
  currentDueDate: string;
  /** Unpaid premium for the reporting month that is not yet overdue (e.g. waiting for the AG deduction). */
  currentAwaitingMinor: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function ym(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function prevMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? ym(y - 1, 12) : ym(y, m - 1);
}

function minMonth(a: string, b: string): string {
  return a < b ? a : b;
}

/** All month keys from `start` to `end`, inclusive, ascending. */
function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [endY, endM] = end.split('-').map(Number);
  while (y < endY || (y === endY && m <= endM)) {
    out.push(ym(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * The moment month `monthKey`'s premium becomes overdue if unpaid.
 * Direct payers: the premium due day of the same month (unchanged
 * behaviour). AG payroll deductions: the start of the day after
 * payrollReceiptDay in the following month, so a deduction that arrives
 * on the 10th is never counted as late.
 */
export function premiumOverdueFrom(monthKey: string, rules: BusinessRules, payrollDeduction = false): Date {
  const [y, m] = monthKey.split('-').map(Number);
  if (payrollDeduction) {
    const day = rules.payrollReceiptDay ?? DEFAULT_PAYROLL_RECEIPT_DAY;
    return new Date(y, m, day + 1); // month index m = the following month
  }
  return new Date(y, m - 1, rules.premiumDueDay);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * The "as of" cutoff for arrears purposes: the latest month whose premium
 * is already overdue, clamped to the reporting month. A policy is never
 * judged in arrears for a month whose premium could still arrive on time.
 * Mirrors the prototype's cutoffMonth(), extended for AG payroll timing.
 */
export function statusCutoffMonth(reportingMonth: string, rules: BusinessRules, now = new Date(), payrollDeduction = false): string {
  let m = ym(now.getFullYear(), now.getMonth() + 1);
  // At most two steps back: a payroll month is overdue in the month after next at the latest.
  for (let i = 0; i < 3 && premiumOverdueFrom(m, rules, payrollDeduction) > now; i++) m = prevMonth(m);
  return minMonth(reportingMonth, m);
}

export function computePolicyStatus(
  policy: PolicyForStatusCalc,
  reportingMonth: string,
  rules: BusinessRules,
  now = new Date(),
): PolicyStatusResult {
  const payroll = !!policy.payrollDeduction;
  const cutoff = statusCutoffMonth(reportingMonth, rules, now, payroll);
  const maturity = policy.maturityMonth ?? '2099-12';
  const endMonth = minMonth(cutoff, maturity);

  let totalExpected = 0;
  let totalPaid = 0;
  let consecutive = 0;
  let lastPaidMonth: string | null = null;

  if (policy.commencementMonth <= cutoff) {
    for (const m of monthRange(policy.commencementMonth, endMonth)) {
      totalExpected += policy.monthlyPremiumMinor;
      const paid = policy.paymentsByMonth[m] ?? 0;
      totalPaid += paid;
      if (paid < policy.monthlyPremiumMinor) {
        consecutive += 1;
      } else {
        consecutive = 0;
      }
      if (paid > 0) lastPaidMonth = m;
    }
  }

  const totalOutstanding = Math.max(totalExpected - totalPaid, 0);

  const reportingInRange =
    reportingMonth >= policy.commencementMonth &&
    (!policy.maturityMonth || reportingMonth <= policy.maturityMonth);
  const currentExpected = reportingInRange ? policy.monthlyPremiumMinor : 0;
  const currentPaid = policy.paymentsByMonth[reportingMonth] ?? 0;

  const overdueFrom = premiumOverdueFrom(reportingMonth, rules, payroll);
  const notYetDue = overdueFrom > now;
  const currentUnpaid = Math.max(currentExpected - currentPaid, 0);
  const currentOutstanding = notYetDue ? 0 : currentUnpaid;
  const currentAwaiting = notYetDue ? currentUnpaid : 0;
  // Last day on which the premium still counts as on time.
  const currentDueDate = dateKey(payroll ? new Date(overdueFrom.getFullYear(), overdueFrom.getMonth(), overdueFrom.getDate() - 1) : overdueFrom);

  let status: PolicyStatusResult['status'];
  if (reportingMonth < policy.commencementMonth) status = 'Not Yet Commenced';
  else if (policy.maturityMonth && reportingMonth > policy.maturityMonth) status = 'Matured';
  else if (cutoff < policy.commencementMonth) status = 'Active';
  else if (consecutive >= rules.lapseThresholdMonths) status = 'Lapsed';
  else if (consecutive >= rules.warningThresholdMonths) status = 'Warning';
  else if (consecutive === 1) status = 'One Month Outstanding';
  else status = 'Active';

  return {
    status,
    totalExpectedMinor: totalExpected,
    totalPaidMinor: totalPaid,
    totalOutstandingMinor: totalOutstanding,
    currentExpectedMinor: currentExpected,
    currentPaidMinor: currentPaid,
    currentOutstandingMinor: currentOutstanding,
    consecutiveUnpaidMonths: consecutive,
    lastPaidMonth,
    collectionChannel: payroll ? 'Payroll' : 'Direct',
    currentDueDate,
    currentAwaitingMinor: currentAwaiting,
  };
}
