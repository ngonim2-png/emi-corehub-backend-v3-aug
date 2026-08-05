import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ProductEntity } from '../../clients-policies/entities/product.entity';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

/**
 * A "group" here is IFRS 17's unit of account: contracts of similar
 * product and issue-year (cohort), never mixed across cohorts and never
 * mixed onerous with non-onerous contracts (the standard forbids both -
 * that grouping decision belongs in this table, one row per product per
 * cohortYear, not decided ad hoc in code).
 *
 * measurementModel and the assumption fields below must be set by an
 * actuary before ifrs17-batch-close.processor.ts can run for this group -
 * see the "Not yet done" section in the README.
 */
@Entity('ifrs17_groups')
export class Ifrs17GroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductEntity)
  product: ProductEntity;

  @Column()
  cohortYear: number;

  @Column({ default: 'PAA' })
  measurementModel: 'PAA' | 'GMM';

  /**
   * Set once at initial recognition of the group and never changed - CSM
   * accretes at this rate for the group's entire life, which is what
   * distinguishes it from a simple current-rate reserve. Ignored for PAA
   * groups (PAA generally doesn't discount the LRC).
   */
  @Column('numeric', { precision: 6, scale: 4, transformer: DecimalTransformer })
  lockedInDiscountRateAnnual: string;

  /**
   * Simplified risk-adjustment margin (% loading on the best-estimate
   * liability) - see RiskAdjustmentAssumptions in ifrs17-types.ts for why
   * this is a placeholder for a real cost-of-capital or confidence-level
   * calibration.
   */
  @Column('numeric', { precision: 6, scale: 4, transformer: DecimalTransformer })
  riskAdjustmentMarginPct: string;

  /** Total coverage months per contract in a PAA group (e.g. 12). Null for GMM. */
  @Column({ type: 'int', nullable: true })
  paaCoverageMonths: number | null;

  /**
   * Coverage units for a GMM group = a measure of the insurance service
   * expected to be delivered over the contract's life (commonly
   * sum-at-risk × expected in-force months). Set by the actuary at
   * initial recognition and reduced as the group runs off.
   */
  @Column({ type: 'bigint', nullable: true })
  gmmCoverageUnitsTotal: number | null;

  /**
   * Actuary-provided initial recognition inputs for a GMM group: the
   * fulfilment cash flows and risk adjustment as at the group's
   * inception, BEFORE any period has run. Required to seed the very
   * first ifrs17-batch-close run for this group - see
   * Ifrs17BatchCloseProcessor.seedInitialGmmState(). Null/unused for PAA
   * groups, which start both LRC and LIC at zero by construction.
   */
  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer, nullable: true })
  initialFcf: string | null;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer, nullable: true })
  initialRiskAdjustment: string | null;
}
