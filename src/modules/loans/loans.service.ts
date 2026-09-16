import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LoanEntity, computeLoanFigures } from './entities/loan.entity';
import { LoanRepaymentEntity } from './entities/loan-repayment.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { CreateLoanDto, RecordLoanRepaymentDto } from './dto/loans.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Standard flat rate per the business rule - kept as one named constant rather than scattered magic numbers, and still stored per-loan (see LoanEntity.interestRatePct) so a change here only affects loans requested after the change. */
const STANDARD_INTEREST_RATE_PCT = 25;

/** A client must have at least this many distinct months of real premium payments on file before a loan request is even accepted. */
const MIN_MONTHS_PREMIUM_PAID_FOR_ELIGIBILITY = 3;

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(LoanEntity) private readonly loansRepo: Repository<LoanEntity>,
    @InjectRepository(LoanRepaymentEntity) private readonly repaymentsRepo: Repository<LoanRepaymentEntity>,
    @InjectRepository(PaymentEntity) private readonly paymentsRepo: Repository<PaymentEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Counts distinct (policy, month) real payments for this client, across every policy they hold - not just one. */
  async checkEligibility(clientId: string): Promise<{ eligible: boolean; monthsPaid: number; monthsRequired: number }> {
    const payments = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.policy', 'policy')
      .where('policy."clientId" = :clientId', { clientId })
      .andWhere("payment.\"reversalStatus\" != 'Reversed'")
      .select(['payment.policyId', 'payment.paymentMonth'])
      .getMany();

    const distinctMonths = new Set(payments.map((p) => p.paymentMonth));
    const monthsPaid = distinctMonths.size;
    return { eligible: monthsPaid >= MIN_MONTHS_PREMIUM_PAID_FOR_ELIGIBILITY, monthsPaid, monthsRequired: MIN_MONTHS_PREMIUM_PAID_FOR_ELIGIBILITY };
  }

  async create(dto: CreateLoanDto, actor: AuthenticatedUser): Promise<LoanEntity> {
    const client = await this.clientsRepo.findOne({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found.');

    const eligibility = await this.checkEligibility(dto.clientId);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        `This client has ${eligibility.monthsPaid} month(s) of premium on record - at least ${eligibility.monthsRequired} are required before a loan can be requested.`,
      );
    }
    if (dto.loanType === 'Appliance' && !dto.applianceDescription) {
      throw new BadRequestException('Describe the appliance for an appliance loan.');
    }

    const { totalInterest, totalRepayable, monthlyPayment } = computeLoanFigures(dto.principal, dto.tenureMonths, STANDARD_INTEREST_RATE_PCT);

    return this.loansRepo.save(
      this.loansRepo.create({
        client,
        loanType: dto.loanType,
        applianceDescription: dto.loanType === 'Appliance' ? dto.applianceDescription ?? null : null,
        principal: dto.principal.toFixed(2),
        tenureMonths: dto.tenureMonths,
        interestRatePct: STANDARD_INTEREST_RATE_PCT.toFixed(2),
        totalInterest: totalInterest.toFixed(2),
        totalRepayable: totalRepayable.toFixed(2),
        monthlyPayment: monthlyPayment.toFixed(2),
        status: 'Pending Life Manager Approval',
        requestedBy: actor.id,
      }),
    );
  }

  async findAll(status?: string): Promise<LoanEntity[]> {
    return this.loansRepo.find({
      where: status ? { status: status as any } : {},
      relations: ['client'],
      order: { requestedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<LoanEntity> {
    const loan = await this.loansRepo.findOne({ where: { id }, relations: ['client'] });
    if (!loan) throw new NotFoundException('Loan not found.');
    return loan;
  }

  async lifeManagerDecide(id: string, decision: 'Approved' | 'Rejected', notes: string | undefined, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (loan.status !== 'Pending Life Manager Approval') {
      throw new ForbiddenException('This loan is not awaiting Life Manager approval.');
    }
    if (loan.requestedBy === actor.id) {
      throw new ForbiddenException('You requested this loan - it needs to be reviewed by someone else.');
    }
    await this.loansRepo.update(id, {
      lifeManagerDecision: decision,
      lifeManagerBy: actor.id,
      lifeManagerAt: new Date(),
      lifeManagerNotes: notes ?? null,
      status: decision === 'Approved' ? 'Pending Finance Director Approval' : 'Rejected',
    });
    return this.findOne(id);
  }

  async financeDirectorDecide(id: string, decision: 'Approved' | 'Rejected', notes: string | undefined, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (loan.status !== 'Pending Finance Director Approval') {
      throw new ForbiddenException('This loan is not awaiting Finance Director approval.');
    }
    if (loan.requestedBy === actor.id) {
      throw new ForbiddenException('You requested this loan - it needs to be reviewed by someone else.');
    }
    await this.loansRepo.update(id, {
      financeDirectorDecision: decision,
      financeDirectorBy: actor.id,
      financeDirectorAt: new Date(),
      financeDirectorNotes: notes ?? null,
      status: decision === 'Approved' ? 'Approved' : 'Rejected',
    });
    return this.findOne(id);
  }

  /** Marks the loan Disbursed and creates the full monthly repayment schedule in one transaction - both happen together or neither does. */
  async disburse(id: string, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (loan.status !== 'Approved') {
      throw new ForbiddenException('Only a fully-approved loan can be disbursed.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(LoanEntity, id, { status: 'Disbursed', disbursedAt: new Date(), disbursedBy: actor.id });
      const startMonth = new Date();
      for (let i = 0; i < loan.tenureMonths; i++) {
        const dueDate = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + 1 + i, 1));
        const dueMonth = `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, '0')}`;
        await manager.save(
          LoanRepaymentEntity,
          manager.create(LoanRepaymentEntity, { loan, dueMonth, amountDue: loan.monthlyPayment, status: 'Due' }),
        );
      }
    });
    return this.findOne(id);
  }

  async findRepayments(loanId: string): Promise<LoanRepaymentEntity[]> {
    return this.repaymentsRepo.find({ where: { loan: { id: loanId } }, order: { dueMonth: 'ASC' } });
  }

  /** Records a payment against one installment - supports partial payments, and marks the loan Completed once every installment is fully paid. */
  async recordRepayment(repaymentId: string, dto: RecordLoanRepaymentDto, actor: AuthenticatedUser): Promise<LoanRepaymentEntity> {
    const repayment = await this.repaymentsRepo.findOne({ where: { id: repaymentId }, relations: ['loan'] });
    if (!repayment) throw new NotFoundException('Repayment installment not found.');

    const newAmountPaid = Number(repayment.amountPaid) + dto.amount;
    const fullyPaid = newAmountPaid >= Number(repayment.amountDue) - 0.01; // small tolerance for rounding
    await this.repaymentsRepo.update(repaymentId, {
      amountPaid: newAmountPaid.toFixed(2),
      status: fullyPaid ? 'Paid' : 'Partial',
      paidAt: fullyPaid ? new Date() : repayment.paidAt,
      recordedBy: actor.id,
    });

    const allInstallments = await this.findRepayments(repayment.loan.id);
    const allInstallmentsForThisLoan = allInstallments.map((r) => (r.id === repaymentId ? { ...r, status: fullyPaid ? 'Paid' : r.status } : r));
    if (allInstallmentsForThisLoan.every((r) => r.status === 'Paid')) {
      await this.loansRepo.update(repayment.loan.id, { status: 'Completed' });
    }

    return this.repaymentsRepo.findOneOrFail({ where: { id: repaymentId } });
  }
}
