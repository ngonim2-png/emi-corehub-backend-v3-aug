/**
 * IFRS 17 calculation engine — shared types.
 *
 * All monetary inputs/outputs are plain numbers in major currency units
 * (not minor units) for readability against actuarial workpapers; the
 * caller (ifrs17-batch-close.processor.ts) converts to/from the
 * NUMERIC(18,2) string columns on Ifrs17MeasurementEntity.
 *
 * Sign convention throughout: a LIABILITY amount is positive. Cash
 * inflows to the insurer (premiums) REDUCE a liability; cash outflows
 * (claims, expenses) INCREASE it. This matches how actuaries usually
 * present fulfilment cash flows and keeps closingLrc = closingFcf +
 * closingRiskAdjustment + closingCsm meaningful as "amount owed".
 */

/** Which IFRS 17 measurement model a product/cohort group uses. */
export type MeasurementModel = 'PAA' | 'GMM';

/**
 * Converts an annual effective rate to the equivalent rate for a shorter
 * period (e.g. monthly), compounding correctly rather than dividing by 12.
 */
export function periodRateFromAnnual(annualRate: number, periodsPerYear = 12): number {
  return Math.pow(1 + annualRate, 1 / periodsPerYear) - 1;
}

export interface RiskAdjustmentAssumptions {
  /**
   * Simplified confidence-level margin approach: risk adjustment is
   * expressed as a percentage loading on the best-estimate liability.
   * A real implementation would use a cost-of-capital or explicit
   * confidence-level (e.g. 75th percentile) method calibrated by an
   * actuary — this percentage is the placeholder for that calibration.
   */
  marginPct: number;
}

export interface LossComponentResult {
  /** True if the group is onerous this period (CSM would have gone negative). */
  isOnerous: boolean;
  /** Loss recognised immediately in P&L this period (0 if not onerous). */
  lossRecognisedInPeriod: number;
}
