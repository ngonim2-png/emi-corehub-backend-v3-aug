import { periodRateFromAnnual, LossComponentResult } from './ifrs17-types';

/**
 * GMM is the default IFRS 17 model, required for anything PAA isn't
 * eligible for - at EMI that's Super Savings, Endowment, Retirement Plan
 * and Group Life, since these run for years and their profitability
 * depends on long-term persistency and investment assumptions, which is
 * exactly what GMM's CSM mechanism is built to track.
 *
 * The core idea: at initial recognition, any expected future profit on
 * the contract is NOT recognised immediately. It's stored in the CSM
 * (Contractual Service Margin) and released to the income statement
 * gradually, in line with the insurance service actually delivered
 * (coverage units). If a contract is expected to be loss-making, that
 * loss IS recognised immediately (it can never be deferred) - this is
 * the "no day-one profit, but immediate day-one loss" asymmetry that is
 * the single most-tested rule of IFRS 17 in practice.
 *
 * Three liabilities roll forward together each period:
 *  - FCF  (Fulfilment Cash Flows): PV of future outflows minus inflows,
 *          remeasured every period at the CURRENT discount rate.
 *  - Risk Adjustment: compensation for bearing non-financial risk.
 *  - CSM  (Contractual Service Margin): unearned profit, accreted at the
 *          discount rate LOCKED IN at initial recognition (not current),
 *          which is precisely what makes CSM different from a simple
 *          reserve - see lockedInDiscountRateAnnual below.
 */

export interface GmmGroupState {
  openingFcf: number;
  openingRiskAdjustment: number;
  openingCsm: number;
  /** Set once at initial recognition of the group/cohort, never changed afterwards. */
  lockedInDiscountRateAnnual: number;
  /** Coverage units (e.g. sum-at-risk × expected in-force months) remaining at the start of the period, including this period's. */
  coverageUnitsRemainingAtOpen: number;
}

export interface GmmPeriodInputs {
  currentDiscountRateAnnual: number;
  /** Actual premiums received this period - reduces the net outflow the FCF represents. */
  premiumsReceivedInPeriod: number;
  /** Actual claims and expenses paid this period. */
  claimsAndExpensesPaidInPeriod: number;
  /**
   * Best-estimate claims/expenses expected to be incurred THIS period
   * (i.e. the insurance service actually delivered) - this drives
   * revenue, and is normally close to but not identical to cash paid.
   */
  expectedClaimsAndExpensesInPeriod: number;
  /**
   * Re-estimate of future cash flows attributable to FUTURE service
   * (e.g. updated lapse or mortality assumptions). Positive = the
   * liability got worse (adverse) = CSM absorbs it and shrinks first.
   * This is the "unlocking" adjustment; 0 if assumptions are unchanged
   * this period.
   */
  changeInFcfForFutureService: number;
  /**
   * Re-estimate relating to PAST/current service (an experience
   * variance on claims already incurred) - this hits P&L directly and
   * does NOT adjust the CSM, per IFRS 17.B96-B97.
   */
  experienceAdjustmentPastService: number;
  /** Coverage units the group delivered THIS period (drives CSM and RA release). */
  coverageUnitsProvidedInPeriod: number;
  /** Acquisition cash flows amortised into this period's revenue. */
  acquisitionCostsAmortisedInPeriod: number;
}

export interface GmmPeriodResult {
  closingFcf: number;
  closingRiskAdjustment: number;
  closingCsm: number;
  closingLrc: number; // = closingFcf + closingRiskAdjustment + closingCsm

  interestAccretionOnCsm: number;
  interestAccretionOnFcf: number;
  riskAdjustmentRelease: number;
  csmRecognisedInPnl: number;

  insuranceRevenue: number;
  insuranceServiceExpense: number;
  insuranceFinanceExpense: number;

  lossComponent: LossComponentResult;
}

export function computeGmmPeriod(state: GmmGroupState, inputs: GmmPeriodInputs): GmmPeriodResult {
  const lockedInMonthlyRate = periodRateFromAnnual(state.lockedInDiscountRateAnnual, 12);
  const currentMonthlyRate = periodRateFromAnnual(inputs.currentDiscountRateAnnual, 12);

  // --- 1. FCF roll-forward, at the CURRENT rate (FCF is remeasured every period).
  const interestAccretionOnFcf = state.openingFcf * currentMonthlyRate;
  const fcfBeforeUnlock =
    state.openingFcf +
    interestAccretionOnFcf -
    inputs.premiumsReceivedInPeriod +
    inputs.claimsAndExpensesPaidInPeriod +
    inputs.experienceAdjustmentPastService;
  const closingFcf = fcfBeforeUnlock + inputs.changeInFcfForFutureService;

  // --- 2. Risk adjustment roll-forward: releases in proportion to
  // coverage delivered, then accretes interest on what's left.
  const totalCoverageUnitsIncludingThisPeriod = Math.max(state.coverageUnitsRemainingAtOpen, 1);
  const riskAdjustmentRelease =
    state.openingRiskAdjustment *
    (inputs.coverageUnitsProvidedInPeriod / totalCoverageUnitsIncludingThisPeriod);
  const raAfterRelease = state.openingRiskAdjustment - riskAdjustmentRelease;
  const closingRiskAdjustment = raAfterRelease + raAfterRelease * currentMonthlyRate;

  // --- 3. CSM roll-forward, at the LOCKED-IN rate, absorbing the
  // future-service unlock before it releases anything to P&L.
  const interestAccretionOnCsm = state.openingCsm * lockedInMonthlyRate;
  const csmAfterAccretion = state.openingCsm + interestAccretionOnCsm;

  // A favourable change in FCF (negative changeInFcfForFutureService)
  // increases the CSM; an adverse change decreases it. If the adverse
  // change exceeds the CSM available, the CSM floors at zero and the
  // excess becomes an immediate loss - contracts can never carry a
  // negative CSM, per IFRS 17.48-49.
  const csmAfterUnlockRaw = csmAfterAccretion - inputs.changeInFcfForFutureService;
  const isOnerous = csmAfterUnlockRaw < 0;
  const lossRecognisedInPeriod = isOnerous ? -csmAfterUnlockRaw : 0;
  const csmAfterUnlock = Math.max(csmAfterUnlockRaw, 0);

  const csmRecognisedInPnl =
    csmAfterUnlock *
    (inputs.coverageUnitsProvidedInPeriod / totalCoverageUnitsIncludingThisPeriod);
  const closingCsm = csmAfterUnlock - csmRecognisedInPnl;

  // --- 4. Revenue and expense presentation.
  // GMM revenue is NOT premium received - it's the value of the
  // insurance service actually delivered this period.
  const insuranceRevenue =
    inputs.expectedClaimsAndExpensesInPeriod +
    riskAdjustmentRelease +
    csmRecognisedInPnl +
    inputs.acquisitionCostsAmortisedInPeriod;

  const insuranceServiceExpense =
    inputs.expectedClaimsAndExpensesInPeriod +
    inputs.experienceAdjustmentPastService +
    lossRecognisedInPeriod;

  const insuranceFinanceExpense = interestAccretionOnFcf + interestAccretionOnCsm;

  const closingLrc = closingFcf + closingRiskAdjustment + closingCsm;

  return {
    closingFcf,
    closingRiskAdjustment,
    closingCsm,
    closingLrc,
    interestAccretionOnCsm,
    interestAccretionOnFcf,
    riskAdjustmentRelease,
    csmRecognisedInPnl,
    insuranceRevenue,
    insuranceServiceExpense,
    insuranceFinanceExpense,
    lossComponent: { isOnerous, lossRecognisedInPeriod },
  };
}
