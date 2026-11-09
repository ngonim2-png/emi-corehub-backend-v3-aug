import { computePaaPeriod, PaaGroupState, PaaPeriodInputs } from '../paa-calculator';
import { computeGmmPeriod, GmmGroupState, GmmPeriodInputs } from '../gmm-calculator';

function approxEqual(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= tol;
}
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok - ${message}`);
  }
}

// ===================== PAA =====================
// 12-month Credit Life group, NLe 500/month premium, 10% annual discount,
// 5% risk adjustment margin, no claims yet in month 1.
{
  const state: PaaGroupState = {
    openingLrc: 0,
    openingLicBestEstimate: 0,
    openingLicRiskAdjustment: 0,
    totalCoverageMonths: 12,
    coverageMonthsElapsedAtOpen: 0,
  };
  const inputs: PaaPeriodInputs = {
    premiumsReceivedInPeriod: 500,
    acquisitionCostsInPeriod: 50,
    newClaimsIncurredInPeriod: 0,
    claimsPaidInPeriod: 0,
    monthsElapsedInPeriod: 1,
    discountRateAnnual: 0.1,
    riskAdjustment: { marginPct: 0.05 },
  };
  const result = computePaaPeriod(state, inputs);

  // Revenue = 500 * (1/12) = 41.666...
  assert(approxEqual(result.insuranceRevenue, 41.6667), `PAA month-1 revenue is 1/12 of premium (got ${result.insuranceRevenue.toFixed(2)})`);
  // Closing LRC = 500 - 41.67 = 458.33
  assert(approxEqual(result.closingLrc, 458.3333), `PAA month-1 closing LRC (got ${result.closingLrc.toFixed(2)})`);
  assert(result.closingLic === 0, 'PAA closing LIC is zero with no claims incurred');
  assert(result.acquisitionCostsExpensed === 50, 'PAA acquisition costs expensed immediately (≤1yr election)');

  // Month 2: a claim of 1000 is incurred but not yet paid.
  const state2: PaaGroupState = {
    openingLrc: result.closingLrc,
    openingLicBestEstimate: 0,
    openingLicRiskAdjustment: 0,
    totalCoverageMonths: 12,
    coverageMonthsElapsedAtOpen: 1,
  };
  const inputs2: PaaPeriodInputs = {
    premiumsReceivedInPeriod: 500,
    acquisitionCostsInPeriod: 0,
    newClaimsIncurredInPeriod: 1000,
    claimsPaidInPeriod: 0,
    monthsElapsedInPeriod: 1,
    discountRateAnnual: 0.1,
    riskAdjustment: { marginPct: 0.05 },
  };
  const result2 = computePaaPeriod(state2, inputs2);
  // LIC best estimate = 0 + 1000 - 0, plus interest on a same-month new
  // claim is negligible-ish but present since we accrete after adding:
  // 1000 * monthlyRate(10%) ≈ 1000 * 0.007974 ≈ 7.97
  assert(approxEqual(result2.closingLicBestEstimate, 1007.97, 0.5), `PAA month-2 LIC best estimate accretes interest (got ${result2.closingLicBestEstimate.toFixed(2)})`);
  // Risk adjustment = 5% of best estimate
  assert(approxEqual(result2.closingLicRiskAdjustment, result2.closingLicBestEstimate * 0.05), 'PAA LIC risk adjustment is 5% margin on best estimate');
  assert(approxEqual(result2.closingLic, result2.closingLicBestEstimate + result2.closingLicRiskAdjustment), 'PAA closing LIC = best estimate + risk adjustment');
}

// ===================== GMM =====================
// 10-year Endowment group, initial recognition already performed:
// FCF = -10,000 (net future inflow expected), RA = 1,000, so CSM was set
// to 9,000 so that FCF + RA + CSM = 0 at initial recognition.
{
  const initialFcf = -10000;
  const initialRa = 1000;
  const initialCsm = -(initialFcf + initialRa); // = 9000, by construction
  assert(approxEqual(initialFcf + initialRa + initialCsm, 0), 'GMM initial recognition: LRC = FCF + RA + CSM = 0');

  const state: GmmGroupState = {
    openingFcf: initialFcf,
    openingRiskAdjustment: initialRa,
    openingCsm: initialCsm,
    lockedInDiscountRateAnnual: 0.08,
    coverageUnitsRemainingAtOpen: 120, // e.g. 10 years * 12 months
  };
  const inputs: GmmPeriodInputs = {
    currentDiscountRateAnnual: 0.08,
    premiumsReceivedInPeriod: 500,
    claimsAndExpensesPaidInPeriod: 0,
    expectedClaimsAndExpensesInPeriod: 50,
    changeInFcfForFutureService: 0,
    experienceAdjustmentPastService: 0,
    coverageUnitsProvidedInPeriod: 1,
    acquisitionCostsAmortisedInPeriod: 10,
  };
  const result = computeGmmPeriod(state, inputs);

  // Structural invariant that must ALWAYS hold: LRC = FCF + RA + CSM.
  assert(
    approxEqual(result.closingLrc, result.closingFcf + result.closingRiskAdjustment + result.closingCsm),
    'GMM closing LRC = closing FCF + closing RA + closing CSM (structural invariant)',
  );
  // CSM only released 1/120th this period, so most of it should remain.
  assert(result.closingCsm > initialCsm * 0.9, `GMM CSM releases gradually, not all at once (closing ${result.closingCsm.toFixed(2)} vs opening ${initialCsm})`);
  assert(result.csmRecognisedInPnl > 0 && result.csmRecognisedInPnl < initialCsm, 'GMM CSM recognised in P&L is a small positive slice of the opening balance');
  assert(!result.lossComponent.isOnerous, 'GMM group is not onerous under normal assumptions');
  assert(result.lossComponent.lossRecognisedInPeriod === 0, 'GMM no loss recognised when not onerous');
  // Revenue should be well above raw premium since it includes CSM release + RA release + claims + acquisition.
  assert(result.insuranceRevenue > 0, `GMM revenue is positive (got ${result.insuranceRevenue.toFixed(2)})`);

  // --- Onerous scenario: a severe adverse assumption change (e.g. a big
  // upward mortality revision) wipes out more than the entire CSM,
  // including the interest it accretes this period first.
  const csmAfterAccretion = initialCsm + initialCsm * (Math.pow(1.08, 1 / 12) - 1);
  const deliberateShortfall = 5000;
  const adverseInputs: GmmPeriodInputs = {
    ...inputs,
    changeInFcfForFutureService: csmAfterAccretion + deliberateShortfall,
  };
  const adverseResult = computeGmmPeriod(state, adverseInputs);
  assert(adverseResult.lossComponent.isOnerous, 'GMM: adverse change exceeding CSM correctly flags the group as onerous');
  assert(adverseResult.closingCsm === 0, 'GMM: CSM floors at exactly zero, never negative');
  assert(
    approxEqual(adverseResult.lossComponent.lossRecognisedInPeriod, deliberateShortfall, 1),
    `GMM: loss recognised immediately equals the shortfall beyond CSM (got ${adverseResult.lossComponent.lossRecognisedInPeriod.toFixed(2)})`,
  );
}

console.log(process.exitCode === 1 ? '\nSOME TESTS FAILED' : '\nALL IFRS17 CALCULATOR TESTS PASSED');
