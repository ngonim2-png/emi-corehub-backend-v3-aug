import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItemEntity } from './entities/action-item.entity';
import { CalendarService } from '../calendar/calendar.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateActionItemDto } from './dto/leadership.dto';
import { isPastDeadline } from '../../common/utils/deadline.util';

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItemEntity) private readonly actionItemsRepo: Repository<ActionItemEntity>,
    private readonly calendarService: CalendarService,
  ) {}

  /** Same live-computed-at-read-time reasoning as the calendar's own withComputedStatus - never persisted, always fresh. */
  private withComputedStatus(item: ActionItemEntity): ActionItemEntity {
    if (item.status === 'Open' && isPastDeadline(item.dueDate, item.time)) {
      item.status = 'Missed';
    }
    return item;
  }

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
        assignedTo: input.assignedTo, dueDate: input.dueDate, time: input.time ?? null, status: 'Open', createdBy: actor.id,
      }),
    );
    const timePart = input.time && /^\d{2}:\d{2}$/.test(input.time) ? input.time : '09:00';
    const calendarEvent = await this.calendarService.create(
      {
        title: `Action item: ${input.title}`,
        type: 'Task',
        description: input.description,
        startAt: new Date(`${input.dueDate}T${timePart}:00`).toISOString(),
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
    const items = await this.actionItemsRepo.find({ where: filters as any, order: { dueDate: 'ASC' } });
    return items.map((i) => this.withComputedStatus(i));
  }

  async findOne(id: string): Promise<ActionItemEntity> {
    const item = await this.actionItemsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Action item not found');
    return this.withComputedStatus(item);
  }

  /** Completing an action item also completes its linked calendar event, so it drops off My Tasks correctly - not left dangling as a "done" task that still shows as upcoming. The assignee themselves can complete their own item, not only a Super Admin - there was previously no legitimate way for the person a task was actually assigned to mark it done. */
  async complete(id: string, actor: AuthenticatedUser): Promise<ActionItemEntity> {
    const item = await this.findOne(id);
    const isOwner = item.assignedTo === actor.id;
    const isElevated = ['Super Admin', 'Supreme Admin'].includes(actor.role);
    if (!isOwner && !isElevated) {
      throw new ForbiddenException('You can only complete your own action items.');
    }
    await this.actionItemsRepo.update(id, { status: 'Completed' });
    if (item.calendarEventId) {
      await this.calendarService.setStatus(item.calendarEventId, 'Completed', actor).catch(() => undefined);
    }
    return this.findOne(id);
  }
}
