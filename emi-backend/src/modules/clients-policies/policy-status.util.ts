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
}

export interface PolicyForStatusCalc {
  commencementMonth: string; // 'YYYY-MM'
  maturityMonth: string | null; // 'YYYY-MM' | null
  monthlyPremiumMinor: number; // integer minor units
  /** month key -> amount paid that month, in integer minor units */
  paymentsByMonth: Record<string, number>;
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
 * The "as of" cutoff for arrears purposes: we can never judge a policy
 * arrears based on a future calendar month, so this clamps the reporting
 * month to whichever real calendar month has actually had its due date
 * pass. Mirrors the prototype's cutoffMonth().
 */
export function statusCutoffMonth(reportingMonth: string, rules: BusinessRules, now = new Date()): string {
  const curReal = ym(now.getFullYear(), now.getMonth() + 1);
  const due = new Date(now.getFullYear(), now.getMonth(), rules.premiumDueDay);
  const calendarCutoff = now > due ? curReal : prevMonth(curReal);
  return minMonth(reportingMonth, calendarCutoff);
}

export function computePolicyStatus(
  policy: PolicyForStatusCalc,
  reportingMonth: string,
  rules: BusinessRules,
  now = new Date(),
): PolicyStatusResult {
  const cutoff = statusCutoffMonth(reportingMonth, rules, now);
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

  const [ry, rm] = reportingMonth.split('-').map(Number);
  const dueDateReporting = new Date(ry, rm - 1, rules.premiumDueDay);
  const currentOutstanding = dueDateReporting >= now ? 0 : Math.max(currentExpected - currentPaid, 0);

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
  };
}
