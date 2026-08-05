import { periodRateFromAnnual, RiskAdjustmentAssumptions } from './ifrs17-types';

/**
 * PAA is the simplified model IFRS 17 permits when either (a) the coverage
 * period of each contract in the group is one year or less, or (b) using
 * PAA would produce a measurement that reasonably approximates GMM. At
 * EMI this fits Credit Life and Personal Accident, which are written on
 * short, fixed terms tied to a loan or a single period of cover.
 *
 * PAA has two separate liabilities that roll forward independently:
 *  - LRC (Liability for Remaining Coverage): unearned premium, released
 *    to revenue as the coverage period passes.
 *  - LIC (Liability for Incurred Claims): claims that have happened but
 *    are not yet paid, discounted unless expected to settle within a
 *    year (the standard's practical expedient, which EMI's short-tail
 *    products will usually qualify for).
 */

export interface PaaGroupState {
  openingLrc: number;
  openingLicBestEstimate: number;
  openingLicRiskAdjustment: number;
  /** Total coverage months for the cohort (e.g. 12 for a 1-year credit life group). */
  totalCoverageMonths: number;
  /** Coverage months already elapsed BEFORE this period. */
  coverageMonthsElapsedAtOpen: number;
}

export interface PaaPeriodInputs {
  premiumsReceivedInPeriod: number;
  /** Acquisition costs (commission etc.) incurred this period, expensed immediately per the PAA election for ≤1yr coverage. */
  acquisitionCostsInPeriod: number;
  /** Best-estimate value of claims newly reported/incurred this period, undiscounted. */
  newClaimsIncurredInPeriod: number;
  /** Cash actually paid out against previously incurred claims this period. */
  claimsPaidInPeriod: number;
  /** Months of coverage that elapsed during this period (normally 1). */
  monthsElapsedInPeriod: number;
  discountRateAnnual: number;
  riskAdjustment: RiskAdjustmentAssumptions;
}

export interface PaaPeriodResult {
  closingLrc: number;
  closingLicBestEstimate: number;
  closingLicRiskAdjustment: number;
  closingLic: number;
  /** Revenue recognised this period — the portion of premium "earned" by passage of time. */
  insuranceRevenue: number;
  /** Best-estimate claims/expense incurred this period (the service expense, not the cash paid). */
  insuranceServiceExpense: number;
  /** Interest unwind on the discounted LIC balance. */
  insuranceFinanceExpense: number;
  acquisitionCostsExpensed: number;
}

export function computePaaPeriod(state: PaaGroupState, inputs: PaaPeriodInputs): PaaPeriodResult {
  const monthlyDiscountRate = periodRateFromAnnual(inputs.discountRateAnnual, 12);

  // --- LRC: straight-line release over remaining coverage months.
  // Revenue for the period = (opening LRC + premiums received this period)
  // spread evenly over the coverage still remaining at the start of the
  // period, including the current period itself.
  const remainingMonthsAtOpen = Math.max(
    state.totalCoverageMonths - state.coverageMonthsElapsedAtOpen,
    inputs.monthsElapsedInPeriod,
  );
  const lrcAvailableForRelease = state.openingLrc + inputs.premiumsReceivedInPeriod;
  const insuranceRevenue =
    lrcAvailableForRelease * (inputs.monthsElapsedInPeriod / remainingMonthsAtOpen);
  const closingLrc = Math.max(lrcAvailableForRelease - insuranceRevenue, 0);

  // Acquisition costs: PAA permits immediate expensing for ≤1yr coverage
  // (the election EMI's short-tail products would typically take), so
  // they reduce the period's result directly rather than building an
  // asset that amortises over the coverage period.
  const acquisitionCostsExpensed = inputs.acquisitionCostsInPeriod;

  // --- LIC: best estimate rolls forward with new claims in, payments out,
  // then the balance accretes interest at the current discount rate.
  const licBestEstimateBeforeInterest =
    state.openingLicBestEstimate + inputs.newClaimsIncurredInPeriod - inputs.claimsPaidInPeriod;
  const licInterestAccretion = Math.max(licBestEstimateBeforeInterest, 0) * monthlyDiscountRate;
  const closingLicBestEstimate = Math.max(licBestEstimateBeforeInterest + licInterestAccretion, 0);

  // Risk adjustment for non-financial risk on the LIC, simplified as a
  // margin on the best-estimate balance - see RiskAdjustmentAssumptions.
  const closingLicRiskAdjustment = closingLicBestEstimate * inputs.riskAdjustment.marginPct;

  return {
    closingLrc,
    closingLicBestEstimate,
    closingLicRiskAdjustment,
    closingLic: closingLicBestEstimate + closingLicRiskAdjustment,
    insuranceRevenue,
    insuranceServiceExpense: inputs.newClaimsIncurredInPeriod,
    insuranceFinanceExpense: licInterestAccretion,
    acquisitionCostsExpensed,
  };
}
