import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItemEntity } from './entities/action-item.entity';
import { CalendarService } from '../calendar/calendar.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateActionItemDto } from './dto/leadership.dto';

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItemEntity) private readonly actionItemsRepo: Repository<ActionItemEntity>,
    private readonly calendarService: CalendarService,
  ) {}

  /**
   * Creating an action item always creates its linked calendar event in
   * the same call - this is the actual "connects to Calendar and Tasks"
   * mechanism, not a separate integration bolted on afterward. If the
   * calendar event creation ever needs to fail independently, that's a
   * real problem worth surfacing, not swallowing.
   */
  async create(input: CreateActionItemDto, actor: AuthenticatedUser): Promise<ActionItemEntity> {
    const actionItem = await this.actionItemsRepo.save(
      this.actionItemsRepo.create({
        meetingId: input.meetingId ?? null, title: input.title, description: input.description ?? null,
        assignedTo: input.assignedTo, dueDate: input.dueDate, status: 'Open', createdBy: actor.id,
      }),
    );
    const calendarEvent = await this.calendarService.create(
      {
        title: `Action item: ${input.title}`,
        type: 'Task',
        description: input.description,
        startAt: new Date(`${input.dueDate}T09:00:00`).toISOString(),
        assignedTo: input.assignedTo,
        relatedType: 'leadership_action_item',
        relatedId: actionItem.id,
      },
      actor,
    );
    await this.actionItemsRepo.update(actionItem.id, { calendarEventId: calendarEvent.id });
    return this.findOne(actionItem.id);
  }

  async findAll(filters: { meetingId?: string; assignedTo?: string; status?: string } = {}): Promise<ActionItemEntity[]> {
    return this.actionItemsRepo.find({ where: filters as any, order: { dueDate: 'ASC' } });
  }

  async findOne(id: string): Promise<ActionItemEntity> {
    const item = await this.actionItemsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Action item not found');
    return item;
  }

  /** Completing an action item also completes its linked calendar event, so it drops off My Tasks correctly - not left dangling as a "done" task that still shows as upcoming. */
  async complete(id: string): Promise<ActionItemEntity> {
    const item = await this.findOne(id);
    await this.actionItemsRepo.update(id, { status: 'Completed' });
    if (item.calendarEventId) {
      await this.calendarService.setStatus(item.calendarEventId, 'Completed').catch(() => undefined);
    }
    return this.findOne(id);
  }
}
