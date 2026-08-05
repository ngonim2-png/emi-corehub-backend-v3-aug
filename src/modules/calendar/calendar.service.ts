import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { CalendarEventEntity, CalendarEventStatus } from './entities/calendar-event.entity';
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
  ) {}

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
    return this.eventsRepo.find({
      where: { startAt: Between(from, to) },
      order: { startAt: 'ASC' },
    });
  }

  /**
   * For My Tasks: this user's own scheduled events that are either
   * overdue (start already passed, never marked done) or coming up
   * within the window - the "don't let me miss this" view, not the
   * full shared calendar.
   */
  async findUpcomingForUser(userId: string, withinDays = 14): Promise<CalendarEventEntity[]> {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + withinDays);
    return this.eventsRepo.find({
      where: { assignedTo: userId, status: 'Scheduled', startAt: LessThan(horizon) },
      order: { startAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CalendarEventEntity> {
    const event = await this.eventsRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async update(id: string, input: Partial<CreateCalendarEventInput>): Promise<CalendarEventEntity> {
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

  async setStatus(id: string, status: CalendarEventStatus): Promise<CalendarEventEntity> {
    await this.eventsRepo.update(id, { status });
    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    await this.eventsRepo.delete(id);
  }
}
