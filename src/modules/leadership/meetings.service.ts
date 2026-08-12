import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeetingEntity, MeetingType } from './entities/meeting.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { isPastDeadline } from '../../common/utils/deadline.util';

@Injectable()
export class MeetingsService {
  constructor(
    @InjectRepository(MeetingEntity) private readonly meetingsRepo: Repository<MeetingEntity>,
  ) {}

  /** Same live-computed-at-read-time reasoning as elsewhere - a meeting whose scheduled moment has passed and was never logged as Completed shows as Missed the instant anyone next looks. */
  private withComputedStatus(meeting: MeetingEntity): MeetingEntity {
    if (meeting.status === 'Scheduled' && isPastDeadline(meeting.date, meeting.time)) {
      meeting.status = 'Missed';
    }
    return meeting;
  }

  async create(
    input: { type: MeetingType; date: string; time?: string; notes?: string },
    actor: AuthenticatedUser,
  ): Promise<MeetingEntity> {
    return this.meetingsRepo.save(
      this.meetingsRepo.create({
        type: input.type, date: input.date, time: input.time ?? null, notes: input.notes ?? null,
        conductedBy: actor.id, status: 'Scheduled',
      }),
    );
  }

  async findAll(type?: string): Promise<MeetingEntity[]> {
    const meetings = await this.meetingsRepo.find({
      where: type ? { type: type as MeetingType } : {},
      order: { date: 'DESC' },
    });
    return meetings.map((m) => this.withComputedStatus(m));
  }

  async findOne(id: string): Promise<MeetingEntity> {
    const meeting = await this.meetingsRepo.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return this.withComputedStatus(meeting);
  }

  async updateNotes(id: string, notes: string): Promise<MeetingEntity> {
    await this.meetingsRepo.update(id, { notes });
    return this.findOne(id);
  }

  async complete(id: string): Promise<MeetingEntity> {
    await this.meetingsRepo.update(id, { status: 'Completed' });
    return this.findOne(id);
  }
}
