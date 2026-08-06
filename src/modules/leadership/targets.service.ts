import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TargetEntity } from './entities/target.entity';
import { TargetAssignmentEntity, TargetAssignmentStatus } from './entities/target-assignment.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateTargetDto } from './dto/leadership.dto';

@Injectable()
export class TargetsService {
  constructor(
    @InjectRepository(TargetEntity) private readonly targetsRepo: Repository<TargetEntity>,
    @InjectRepository(TargetAssignmentEntity) private readonly assignmentsRepo: Repository<TargetAssignmentEntity>,
  ) {}

  async create(input: CreateTargetDto, actor: AuthenticatedUser): Promise<TargetEntity> {
    if (!input.assignedTo || input.assignedTo.length === 0) {
      throw new BadRequestException('A target needs at least one assignee.');
    }
    const target = await this.targetsRepo.save(
      this.targetsRepo.create({
        weekStartDate: input.weekStartDate, description: input.description,
        linkedGoalId: input.linkedGoalId ?? null,
        targetValue: input.targetValue !== undefined ? input.targetValue.toFixed(2) : null,
        unit: input.unit ?? null, createdBy: actor.id,
      }),
    );
    await this.assignmentsRepo.save(
      input.assignedTo.map((userId) =>
        this.assignmentsRepo.create({ targetId: target.id, assignedTo: userId, status: 'Set' }),
      ),
    );
    return target;
  }

  async findByWeek(weekStartDate: string): Promise<(TargetEntity & { assignments: TargetAssignmentEntity[] })[]> {
    const targets = await this.targetsRepo.find({ where: { weekStartDate }, order: { createdAt: 'ASC' } });
    const results = [];
    for (const target of targets) {
      const assignments = await this.assignmentsRepo.find({ where: { targetId: target.id } });
      results.push({ ...target, assignments });
    }
    return results as (TargetEntity & { assignments: TargetAssignmentEntity[] })[];
  }

  async findOne(id: string): Promise<TargetEntity> {
    const target = await this.targetsRepo.findOne({ where: { id } });
    if (!target) throw new NotFoundException('Target not found');
    return target;
  }

  async reviewAssignment(
    assignmentId: string,
    input: { status: TargetAssignmentStatus; actualValue?: number; reviewNotes?: string },
  ): Promise<TargetAssignmentEntity> {
    const assignment = await this.assignmentsRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Target assignment not found');
    await this.assignmentsRepo.update(assignmentId, {
      status: input.status,
      actualValue: input.actualValue !== undefined ? input.actualValue.toFixed(2) : assignment.actualValue,
      reviewNotes: input.reviewNotes ?? assignment.reviewNotes,
      reviewedAt: new Date(),
    });
    return this.assignmentsRepo.findOneOrFail({ where: { id: assignmentId } });
  }

  async findAssignmentsForPerson(userId: string, fromWeek: string, toWeek: string): Promise<(TargetAssignmentEntity & { target: TargetEntity })[]> {
    const assignments = await this.assignmentsRepo.find({ where: { assignedTo: userId }, relations: ['target'] });
    return assignments.filter((a) => a.target.weekStartDate >= fromWeek && a.target.weekStartDate <= toWeek) as (TargetAssignmentEntity & { target: TargetEntity })[];
  }
}
