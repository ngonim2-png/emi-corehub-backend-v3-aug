import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { CalendarEventEntity, CalendarEventStatus } from './entities/calendar-event.entity';
import { ActionItemEntity } from '../leadership/entities/action-item.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface CreateCalendarEventInput {
  title: string;
  type: string;
  description?: string;
  startAt: string;
  endAt?: string;
  relatedType?: string;
  relatedId?: string;
  assignedTo: string;
}

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEventEntity) private readonly eventsRepo: Repository<CalendarEventEntity>,
    @InjectRepository(ActionItemEntity) private readonly actionItemsRepo: Repository<ActionItemEntity>,
  ) {}

  /**
   * Overrides the displayed status to 'Missed' the moment startAt has
   * passed while the event is still 'Scheduled' - computed live at
   * read time, never written to the database, so it's reflected
   * instantly rather than lagging behind a nightly job. The stored
   * column stays 'Scheduled' until someone actually completes or
   * cancels it; only what callers see here changes.
   */
  private withComputedStatus(event: CalendarEventEntity): CalendarEventEntity {
    if (event.status === 'Scheduled' && event.startAt.getTime() < Date.now()) {
      event.status = 'Missed';
    }
    return event;
  }

  async create(input: CreateCalendarEventInput, actor: AuthenticatedUser): Promise<CalendarEventEntity> {
    return this.eventsRepo.save(
      this.eventsRepo.create({
        title: input.title,
        type: input.type as CalendarEventEntity['type'],
        description: input.description ?? null,
        startAt: new Date(input.startAt),
        endAt: input.endAt ? new Date(input.endAt) : null,
        relatedType: input.relatedType,
        relatedId: input.relatedId ?? null,
        assignedTo: input.assignedTo,
        status: 'Scheduled',
        createdBy: actor.id,
      }),
    );
  }

  /** For the month-grid calendar view - every event whose start falls within the given range, regardless of who it's assigned to (a shared calendar, not a private one). */
  async findInRange(from: Date, to: Date): Promise<CalendarEventEntity[]> {
    const events = await this.eventsRepo.find({
      where: { startAt: Between(from, to) },
      order: { startAt: 'ASC' },
    });
    return events.map((e) => this.withComputedStatus(e));
  }

  /**
   * For My Tasks: this user's own scheduled events that are either
   * missed (start already passed, never marked done) or coming up
   * within the window - the "don't let me miss this" view, not the
   * full shared calendar. Missed ones are sorted first, since they're
   * the most urgent thing to notice.
   */
  async findUpcomingForUser(userId: string, withinDays = 14): Promise<CalendarEventEntity[]> {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + withinDays);
    const events = await this.eventsRepo.find({
      where: { assignedTo: userId, status: 'Scheduled', startAt: LessThan(horizon) },
      order: { startAt: 'ASC' },
    });
    const withStatus = events.map((e) => this.withComputedStatus(e));
    return withStatus.sort((a, b) => {
      if (a.status === 'Missed' && b.status !== 'Missed') return -1;
      if (b.status === 'Missed' && a.status !== 'Missed') return 1;
      return a.startAt.getTime() - b.startAt.getTime();
    });
  }

  async findOne(id: string): Promise<CalendarEventEntity> {
    const event = await this.eventsRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Calendar event not found');
    return this.withComputedStatus(event);
  }

  private assertCanModify(event: CalendarEventEntity, actor: AuthenticatedUser): void {
    const isOwner = event.assignedTo === actor.id;
    const isElevated = ['Super Admin', 'Supreme Admin'].includes(actor.role);
    if (!isOwner && !isElevated) {
      throw new ForbiddenException('You can only modify your own calendar events.');
    }
  }

  async update(id: string, input: Partial<CreateCalendarEventInput>, actor: AuthenticatedUser): Promise<CalendarEventEntity> {
    const existing = await this.eventsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Calendar event not found');
    this.assertCanModify(existing, actor);
    const update: Partial<CalendarEventEntity> = {};
    if (input.title !== undefined) update.title = input.title;
    if (input.type !== undefined) update.type = input.type as CalendarEventEntity['type'];
    if (input.description !== undefined) update.description = input.description;
    if (input.startAt !== undefined) update.startAt = new Date(input.startAt);
    if (input.endAt !== undefined) update.endAt = input.endAt ? new Date(input.endAt) : null;
    if (input.assignedTo !== undefined) update.assignedTo = input.assignedTo;
    await this.eventsRepo.update(id, update);
    return this.findOne(id);
  }

  async setStatus(id: string, status: CalendarEventStatus, actor: AuthenticatedUser): Promise<CalendarEventEntity> {
    const existing = await this.eventsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Calendar event not found');
    this.assertCanModify(existing, actor);
    await this.eventsRepo.update(id, { status });
    if (existing.relatedType === 'leadership_action_item' && existing.relatedId && (status === 'Completed' || status === 'Cancelled')) {
      // Keep the linked action item in sync - completing a task's
      // calendar reminder should complete the task itself too, not
      // just make it silently disappear from one side while the
      // Leadership tab still shows it as Open or Missed forever.
      await this.actionItemsRepo.update(existing.relatedId, { status: 'Completed' }).catch(() => undefined);
    }
    return this.findOne(id);
  }

  async delete(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.eventsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Calendar event not found');
    this.assertCanModify(existing, actor);
    await this.eventsRepo.delete(id);
  }
}
