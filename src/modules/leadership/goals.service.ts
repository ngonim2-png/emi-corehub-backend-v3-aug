import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoalEntity, GoalStatus } from './entities/goal.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(GoalEntity) private readonly goalsRepo: Repository<GoalEntity>,
  ) {}

  /** True when the goal's month has fully ended and nobody has reviewed it yet. Computed live, never persisted. */
  private withReviewOverdue(goal: GoalEntity): GoalEntity {
    if (goal.status === 'Active') {
      const [year, monthNum] = goal.month.split('-').map(Number);
      const monthEnd = new Date(Date.UTC(year, monthNum, 1)); // first moment of the following month
      goal.reviewOverdue = monthEnd.getTime() < Date.now();
    } else {
      goal.reviewOverdue = false;
    }
    return goal;
  }

  async create(input: { month: string; description: string }, actor: AuthenticatedUser): Promise<GoalEntity> {
    return this.goalsRepo.save(
      this.goalsRepo.create({ month: input.month, description: input.description, status: 'Active', createdBy: actor.id }),
    );
  }

  async findByMonth(month: string): Promise<GoalEntity[]> {
    const goals = await this.goalsRepo.find({ where: { month }, order: { createdAt: 'ASC' } });
    return goals.map((g) => this.withReviewOverdue(g));
  }

  async findOne(id: string): Promise<GoalEntity> {
    const goal = await this.goalsRepo.findOne({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.withReviewOverdue(goal);
  }

  async setStatus(id: string, status: GoalStatus): Promise<GoalEntity> {
    await this.goalsRepo.update(id, { status });
    return this.findOne(id);
  }
}
