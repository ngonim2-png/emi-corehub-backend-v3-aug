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

  async create(input: { month: string; description: string }, actor: AuthenticatedUser): Promise<GoalEntity> {
    return this.goalsRepo.save(
      this.goalsRepo.create({ month: input.month, description: input.description, status: 'Active', createdBy: actor.id }),
    );
  }

  async findByMonth(month: string): Promise<GoalEntity[]> {
    return this.goalsRepo.find({ where: { month }, order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<GoalEntity> {
    const goal = await this.goalsRepo.findOne({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  async setStatus(id: string, status: GoalStatus): Promise<GoalEntity> {
    await this.goalsRepo.update(id, { status });
    return this.findOne(id);
  }
}
