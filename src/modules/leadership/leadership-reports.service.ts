import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoalEntity } from './entities/goal.entity';
import { TargetEntity } from './entities/target.entity';
import { TargetAssignmentEntity } from './entities/target-assignment.entity';
import { ActionItemEntity } from './entities/action-item.entity';
import { TargetsService } from './targets.service';
import { ReportingService } from '../reporting-ai/reporting.service';
import { PoliciesService } from '../clients-policies/policies.service';
import { PaymentsService } from '../field-collection-wallet/payments.service';

@Injectable()
export class LeadershipReportsService {
  constructor(
    @InjectRepository(GoalEntity) private readonly goalsRepo: Repository<GoalEntity>,
    @InjectRepository(TargetEntity) private readonly targetsRepo: Repository<TargetEntity>,
    @InjectRepository(TargetAssignmentEntity) private readonly assignmentsRepo: Repository<TargetAssignmentEntity>,
    @InjectRepository(ActionItemEntity) private readonly actionItemsRepo: Repository<ActionItemEntity>,
    private readonly targetsService: TargetsService,
    private readonly reportingService: ReportingService,
    private readonly policiesService: PoliciesService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async weeklyReport(weekStartDate: string) {
    const targets = await this.targetsService.findByWeek(weekStartDate);
    const allAssignments = targets.flatMap((t) => t.assignments);
    const reviewed = allAssignments.filter((a) => a.status !== 'Set');
    const achieved = allAssignments.filter((a) => a.status === 'Achieved');
    const actionItems = await this.actionItemsRepo.find({ order: { dueDate: 'ASC' } });
    const weekActionItems = actionItems.filter((ai) => {
      const due = new Date(ai.dueDate);
      const start = new Date(weekStartDate);
      const end = new Date(weekStartDate); end.setDate(end.getDate() + 6);
      return due >= start && due <= end;
    });
    return {
      weekStartDate,
      targetsSet: targets.length,
      assignmentsTotal: allAssignments.length,
      assignmentsReviewed: reviewed.length,
      assignmentsAchieved: achieved.length,
      completionRate: allAssignments.length > 0 ? achieved.length / allAssignments.length : 0,
      targets,
      actionItemsThisWeek: weekActionItems.length,
      actionItemsCompleted: weekActionItems.filter((ai) => ai.status === 'Completed').length,
    };
  }

  async monthlyReport(month: string) {
    const goals = await this.goalsRepo.find({ where: { month } });
    const targets = await this.targetsRepo
      .createQueryBuilder('target')
      .where("to_char(target.\"weekStartDate\", 'YYYY-MM') = :month", { month })
      .getMany();
    const targetIds = targets.map((t) => t.id);
    const assignments = targetIds.length
      ? await this.assignmentsRepo.createQueryBuilder('a').where('a."targetId" IN (:...ids)', { ids: targetIds }).getMany()
      : [];
    const achieved = assignments.filter((a) => a.status === 'Achieved');
    return {
      month,
      goals,
      goalsAchieved: goals.filter((g) => g.status === 'Achieved').length,
      goalsMissed: goals.filter((g) => g.status === 'Missed').length,
      targetsSetThisMonth: targets.length,
      assignmentsTotal: assignments.length,
      assignmentsAchieved: achieved.length,
      completionRate: assignments.length > 0 ? achieved.length / assignments.length : 0,
    };
  }

  async appraisalReport(userId: string, month: string) {
    const monthStart = `${month}-01`;
    const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
    const assignments = await this.targetsService.findAssignmentsForPerson(userId, monthStart, monthEnd);
    const achieved = assignments.filter((a) => a.status === 'Achieved');
    const missed = assignments.filter((a) => a.status === 'Missed');
    const stillOpen = assignments.filter((a) => a.status === 'Set');
    return {
      userId, month,
      assignmentsTotal: assignments.length,
      achieved: achieved.length,
      missed: missed.length,
      stillOpen: stillOpen.length,
      kpiPercent: assignments.length > 0 ? achieved.length / assignments.length : null,
      assignments: assignments.map((a) => ({
        targetDescription: a.target.description, weekStartDate: a.target.weekStartDate,
        status: a.status, targetValue: a.target.targetValue, actualValue: a.actualValue, unit: a.target.unit,
      })),
    };
  }

  async productionReport(period: string) {
    const regulatorySummary = await this.reportingService.regulatorySummary(period);
    const allPolicies = await this.policiesService.findAllWithClientAndProduct();
    const newPoliciesThisPeriod = allPolicies.filter((p) => p.createdAt.toISOString().slice(0, 7) === period).length;
    const payments = await this.paymentsService.findRecent(5000);
    const premiumCollected = payments
      .filter((p) => p.createdAt.toISOString().slice(0, 7) === period && p.reversalStatus !== 'Reversed' && Number(p.amount) > 0)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      period,
      policiesInForce: regulatorySummary.policiesInForce,
      newPoliciesWritten: newPoliciesThisPeriod,
      premiumCollected,
      premiumIncomeAccrued: regulatorySummary.premiumIncomeThisPeriod,
      claimsPaid: regulatorySummary.claimsPaidThisPeriod,
      claimsRegistered: regulatorySummary.claimsRegisteredThisPeriod,
      claimsReserved: regulatorySummary.claimsReservedOutstanding,
      lapseRatio: regulatorySummary.lapseRatio,
      statusBreakdown: regulatorySummary.statusCounts,
    };
  }
}
