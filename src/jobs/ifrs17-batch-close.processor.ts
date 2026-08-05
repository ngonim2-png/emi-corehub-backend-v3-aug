import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Ifrs17GroupEntity } from '../modules/finance-ifrs17/entities/ifrs17-group.entity';
import { Ifrs17MeasurementEntity } from '../modules/finance-ifrs17/entities/ifrs17-measurement.entity';
import { PolicyEntity } from '../modules/clients-policies/entities/policy.entity';
import { computePaaPeriod } from '../modules/finance-ifrs17/actuarial/paa-calculator';
import { computeGmmPeriod } from '../modules/finance-ifrs17/actuarial/gmm-calculator';

interface PeriodAggregates {
  premiumsReceived: number;
  claimsIncurred: number;
  claimsPaid: number;
}

/**
 * Runs the IFRS 17 liability roll-forward per portfolio/cohort group and
 * writes a new, immutable ifrs17_measurements row for the period, using
 * the PAA or GMM calculator in ../modules/finance-ifrs17/actuarial/
 * according to each group's measurementModel.
 *
 * This processor's job is aggregation and persistence: pulling the
 * period's actual premiums/claims for each group from the transactional
 * tables, and handing them to the calculator. The calculator's formulas
 * are the actuarial calculation itself and require sign-off before this
 * feeds statutory financial statements - see the architecture doc's
 * IFRS 17 section and the comments in paa-calculator.ts / gmm-calculator.ts.
 *
 * Known simplifications flagged for the actuarial team, not hidden:
 *  - Claims are aggregated by `dateReported` falling in the period, both
 *    for "incurred" and (once Paid) "paid" amounts. A real system needs
 *    a separate `paidDate` on claims to do this properly; dateReported
 *    is a placeholder that will misstate timing for claims that take
 *    more than one period to settle.
 *  - Acquisition costs and expenses per group are not yet wired to a
 *    real expense-allocation module, so acquisitionCostsInPeriod /
 *    expectedClaimsAndExpensesInPeriod default to 0 - see the // TODO
 *    markers below for where that data needs to enter once the
 *    expense-allocation approach is agreed with finance.
 */
@Processor('jobs')
export class Ifrs17BatchCloseProcessor extends WorkerHost {
  private readonly logger = new Logger(Ifrs17BatchCloseProcessor.name);

  constructor(
    @InjectRepository(Ifrs17GroupEntity)
    private readonly groupsRepo: Repository<Ifrs17GroupEntity>,
    @InjectRepository(Ifrs17MeasurementEntity)
    private readonly measurementsRepo: Repository<Ifrs17MeasurementEntity>,
    @InjectRepository(PolicyEntity)
    private readonly policiesRepo: Repository<PolicyEntity>,
  ) {
    super();
  }

  async process(job: Job<{ period: string }>): Promise<void> {
    if (job.name !== 'ifrs17-batch-close') return;
    const { period } = job.data;

    const groups = await this.groupsRepo.find({ relations: ['product'] });
    for (const group of groups) {
      try {
        await this.closeGroupPeriod(group, period);
      } catch (error) {
        // One group's failure (e.g. missing actuarial inputs) must not
        // block the rest of the book from closing.
        this.logger.error(
          `IFRS 17 close failed for group ${group.id} (${group.product?.name}, cohort ${group.cohortYear}), period ${period}`,
          error as Error,
        );
      }
    }
    this.logger.log(`IFRS 17 batch close completed for ${groups.length} group(s), period ${period}`);
  }

  private async closeGroupPeriod(group: Ifrs17GroupEntity, period: string): Promise<void> {
    const previous = await this.measurementsRepo.findOne({
      where: { group: { id: group.id } },
      order: { period: 'DESC' },
    });

    const aggregates = await this.aggregatePeriod(group, period);

    if (group.measurementModel === 'PAA') {
      await this.closePaaGroup(group, period, previous, aggregates);
    } else {
      await this.closeGmmGroup(group, period, previous, aggregates);
    }
  }

  /** Sums actual premiums received and claims incurred/paid for this group's policies in this period. */
  private async aggregatePeriod(group: Ifrs17GroupEntity, period: string): Promise<PeriodAggregates> {
    const policyIds = (
      await this.policiesRepo
        .createQueryBuilder('policy')
        .select('policy.id', 'id')
        .where('policy.productId = :productId', { productId: group.product.id })
        .andWhere('EXTRACT(YEAR FROM policy.commencementDate) = :cohortYear', {
          cohortYear: group.cohortYear,
        })
        .getRawMany<{ id: string }>()
    ).map((r) => r.id);

    if (policyIds.length === 0) {
      return { premiumsReceived: 0, claimsIncurred: 0, claimsPaid: 0 };
    }

    const premiumsRow = await this.policiesRepo.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .from('payments', 'payment')
      .where('payment."policyId" IN (:...policyIds)', { policyIds })
      .andWhere('payment."paymentMonth" = :period', { period })
      .getRawOne<{ total: string }>();

    // See the class-level doc comment: dateReported is a placeholder for
    // a real paidDate column on claims.
    const claimsIncurredRow = await this.policiesRepo.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(claim."amountClaimed"), 0)', 'total')
      .from('claims', 'claim')
      .where('claim."policyId" IN (:...policyIds)', { policyIds })
      .andWhere("to_char(claim.\"dateReported\", 'YYYY-MM') = :period", { period })
      .getRawOne<{ total: string }>();

    const claimsPaidRow = await this.policiesRepo.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(COALESCE(claim."amountApproved", claim."amountClaimed")), 0)', 'total')
      .from('claims', 'claim')
      .where('claim."policyId" IN (:...policyIds)', { policyIds })
      .andWhere('claim.status = :status', { status: 'Paid' })
      .andWhere("to_char(claim.\"dateReported\", 'YYYY-MM') = :period", { period })
      .getRawOne<{ total: string }>();

    return {
      premiumsReceived: Number(premiumsRow?.total ?? 0),
      claimsIncurred: Number(claimsIncurredRow?.total ?? 0),
      claimsPaid: Number(claimsPaidRow?.total ?? 0),
    };
  }

  private async closePaaGroup(
    group: Ifrs17GroupEntity,
    period: string,
    previous: Ifrs17MeasurementEntity | null,
    aggregates: PeriodAggregates,
  ): Promise<void> {
    const coverageMonthsElapsedAtOpen = previous ? this.monthsBetweenFirstMeasurement(group, previous) : 0;

    const result = computePaaPeriod(
      {
        openingLrc: Number(previous?.closingLrc ?? 0),
        openingLicBestEstimate: Number(previous?.closingLicBestEstimate ?? 0),
        openingLicRiskAdjustment: Number(previous?.closingLicRiskAdjustment ?? 0),
        totalCoverageMonths: group.paaCoverageMonths ?? 12,
        coverageMonthsElapsedAtOpen,
      },
      {
        premiumsReceivedInPeriod: aggregates.premiumsReceived,
        // TODO: wire to a real expense-allocation module once agreed with finance.
        acquisitionCostsInPeriod: 0,
        newClaimsIncurredInPeriod: aggregates.claimsIncurred,
        claimsPaidInPeriod: aggregates.claimsPaid,
        monthsElapsedInPeriod: 1,
        discountRateAnnual: Number(group.lockedInDiscountRateAnnual),
        riskAdjustment: { marginPct: Number(group.riskAdjustmentMarginPct) },
      },
    );

    await this.measurementsRepo.save(
      this.measurementsRepo.create({
        group,
        period,
        openingFcf: '0.00',
        closingFcf: '0.00',
        openingRiskAdjustment: '0.00',
        closingRiskAdjustment: '0.00',
        openingCsm: '0.00',
        closingCsm: '0.00',
        closingLrc: result.closingLrc.toFixed(2),
        openingLicBestEstimate: (previous?.closingLicBestEstimate ?? '0.00') as string,
        closingLicBestEstimate: result.closingLicBestEstimate.toFixed(2),
        openingLicRiskAdjustment: (previous?.closingLicRiskAdjustment ?? '0.00') as string,
        closingLicRiskAdjustment: result.closingLicRiskAdjustment.toFixed(2),
        closingLic: result.closingLic.toFixed(2),
        interestAccretionOnFcf: '0.00',
        interestAccretionOnCsm: '0.00',
        riskAdjustmentRelease: '0.00',
        csmRecognisedInPnl: '0.00',
        lossRecognisedInPeriod: '0.00',
        isOnerous: false,
        insuranceRevenue: result.insuranceRevenue.toFixed(2),
        insuranceServiceExpense: result.insuranceServiceExpense.toFixed(2),
        insuranceFinanceExpense: result.insuranceFinanceExpense.toFixed(2),
      }),
    );
  }

  private async closeGmmGroup(
    group: Ifrs17GroupEntity,
    period: string,
    previous: Ifrs17MeasurementEntity | null,
    aggregates: PeriodAggregates,
  ): Promise<void> {
    if (!previous && (group.initialFcf === null || group.initialRiskAdjustment === null)) {
      throw new Error(
        `Group ${group.id} has no prior measurement and no initialFcf/initialRiskAdjustment set - ` +
          'an actuary must provide initial recognition inputs before this group can be closed.',
      );
    }
    if (!group.gmmCoverageUnitsTotal) {
      throw new Error(`Group ${group.id} has no gmmCoverageUnitsTotal set - required for GMM.`);
    }

    const openingFcf = previous ? Number(previous.closingFcf) : Number(group.initialFcf);
    const openingRiskAdjustment = previous
      ? Number(previous.closingRiskAdjustment)
      : Number(group.initialRiskAdjustment);
    // CSM at initial recognition is set so LRC = FCF + RA + CSM = 0, and
    // floored at zero with the shortfall recognised as an immediate loss
    // if the group is onerous from day one.
    const openingCsm = previous
      ? Number(previous.closingCsm)
      : Math.max(-(openingFcf + openingRiskAdjustment), 0);

    const coverageUnitsRemainingAtOpen = previous
      ? this.remainingCoverageUnits(group, previous)
      : Number(group.gmmCoverageUnitsTotal);

    const result = computeGmmPeriod(
      {
        openingFcf,
        openingRiskAdjustment,
        openingCsm,
        lockedInDiscountRateAnnual: Number(group.lockedInDiscountRateAnnual),
        coverageUnitsRemainingAtOpen,
      },
      {
        currentDiscountRateAnnual: Number(group.lockedInDiscountRateAnnual), // TODO: source a current market curve
        premiumsReceivedInPeriod: aggregates.premiumsReceived,
        claimsAndExpensesPaidInPeriod: aggregates.claimsPaid,
        // TODO: source the best-estimate expected claims/expenses for
        // the period from the actuarial model, not actual incurred -
        // using incurred as a placeholder proxy for now.
        expectedClaimsAndExpensesInPeriod: aggregates.claimsIncurred,
        changeInFcfForFutureService: 0,
        experienceAdjustmentPastService: 0,
        coverageUnitsProvidedInPeriod: 1,
        acquisitionCostsAmortisedInPeriod: 0,
      },
    );

    await this.measurementsRepo.save(
      this.measurementsRepo.create({
        group,
        period,
        openingFcf: openingFcf.toFixed(2),
        closingFcf: result.closingFcf.toFixed(2),
        openingRiskAdjustment: openingRiskAdjustment.toFixed(2),
        closingRiskAdjustment: result.closingRiskAdjustment.toFixed(2),
        openingCsm: openingCsm.toFixed(2),
        closingCsm: result.closingCsm.toFixed(2),
        closingLrc: result.closingLrc.toFixed(2),
        openingLicBestEstimate: (previous?.closingLicBestEstimate ?? '0.00') as string,
        closingLicBestEstimate: (previous?.closingLicBestEstimate ?? '0.00') as string,
        openingLicRiskAdjustment: (previous?.closingLicRiskAdjustment ?? '0.00') as string,
        closingLicRiskAdjustment: (previous?.closingLicRiskAdjustment ?? '0.00') as string,
        closingLic: (previous?.closingLic ?? '0.00') as string,
        interestAccretionOnFcf: result.interestAccretionOnFcf.toFixed(2),
        interestAccretionOnCsm: result.interestAccretionOnCsm.toFixed(2),
        riskAdjustmentRelease: result.riskAdjustmentRelease.toFixed(2),
        csmRecognisedInPnl: result.csmRecognisedInPnl.toFixed(2),
        lossRecognisedInPeriod: result.lossComponent.lossRecognisedInPeriod.toFixed(2),
        isOnerous: result.lossComponent.isOnerous,
        insuranceRevenue: result.insuranceRevenue.toFixed(2),
        insuranceServiceExpense: result.insuranceServiceExpense.toFixed(2),
        insuranceFinanceExpense: result.insuranceFinanceExpense.toFixed(2),
      }),
    );
  }

  /** Placeholder month-counter; a real implementation would store this on the measurement row directly. */
  private monthsBetweenFirstMeasurement(_group: Ifrs17GroupEntity, previous: Ifrs17MeasurementEntity): number {
    // Counts elapsed months as "however many measurement rows exist" is
    // fragile; tracking an explicit counter column is the correct fix -
    // left as a known simplification for this scaffold.
    return previous ? 1 : 0;
  }

  private remainingCoverageUnits(group: Ifrs17GroupEntity, previous: Ifrs17MeasurementEntity): number {
    // Coverage units consumed = 1 per prior period is the same
    // simplification as monthsBetweenFirstMeasurement - a real
    // implementation persists remaining coverage units on the group or
    // measurement row rather than inferring it.
    void previous;
    return Number(group.gmmCoverageUnitsTotal) - 1;
  }
}
