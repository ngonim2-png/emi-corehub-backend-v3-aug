import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Ifrs17GroupEntity } from './ifrs17-group.entity';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

const money = () =>
  Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer, default: 0 });

/**
 * One row per group per period, written once by the ifrs17-batch-close
 * job and never updated afterwards - a restated period is a new row with
 * a later `computedAt`, so historical statements never silently change.
 *
 * Field layout mirrors the CSM roll-forward disclosure table required by
 * IFRS 17.101 (opening balance, interest accretion, changes relating to
 * future/current/past service, CSM recognised in P&L, closing balance) so
 * this table can be read almost directly into the note disclosure, not
 * just the primary statements.
 *
 * Requires actuarial sign-off on the model and formulas before it feeds
 * statutory financial statements - see the architecture doc's IFRS 17
 * section and the calculators in ../actuarial/.
 */
@Entity('ifrs17_measurements')
export class Ifrs17MeasurementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ifrs17GroupEntity)
  group: Ifrs17GroupEntity;

  /** 'YYYY-MM' period this measurement covers. */
  @Column()
  period: string;

  // --- Liability for Remaining Coverage (LRC) components.
  @money() openingFcf: string;
  @money() closingFcf: string;
  @money() openingRiskAdjustment: string;
  @money() closingRiskAdjustment: string;
  @money() openingCsm: string;
  @money() closingCsm: string;
  /** = closingFcf + closingRiskAdjustment + closingCsm (GMM), or the PAA unearned-premium balance (PAA). */
  @money() closingLrc: string;

  // --- Liability for Incurred Claims (LIC) - tracked the same way for both models.
  @money() openingLicBestEstimate: string;
  @money() closingLicBestEstimate: string;
  @money() openingLicRiskAdjustment: string;
  @money() closingLicRiskAdjustment: string;
  @money() closingLic: string;

  // --- Roll-forward movement detail (the disclosure-table columns).
  @money() interestAccretionOnFcf: string;
  @money() interestAccretionOnCsm: string;
  @money() riskAdjustmentRelease: string;
  @money() csmRecognisedInPnl: string;
  @money() lossRecognisedInPeriod: string;

  @Column({ default: false })
  isOnerous: boolean;

  // --- Income statement presentation for the period.
  @money() insuranceRevenue: string;
  @money() insuranceServiceExpense: string;
  @money() insuranceFinanceExpense: string;

  @CreateDateColumn()
  computedAt: Date;
}
