import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LifecycleTriggersService } from './lifecycle-triggers.service';
import { CreateTriggerDto, UpdateTriggerDto } from './dto/trigger.dto';
import { SocialPostEntity } from './entities/social-post.entity';

@Controller('marketing/triggers')
@Roles('Super Admin', 'Branch Manager')
export class LifecycleTriggersController {
  constructor(private readonly triggersService: LifecycleTriggersService) {}

  @Post()
  async create(@Body() dto: CreateTriggerDto) {
    return this.triggersService.create(dto);
  }

  @Get()
  async findAll() {
    return this.triggersService.findAll();
  }

  @Get('fires/history')
  async fireHistory(@Query('triggerId') triggerId?: string) {
    return this.triggersService.fireHistory(triggerId);
  }

  /** Manual "run now" - safe to call any time, the fire-log dedupe means it never double-sends. Useful for testing a new trigger without waiting for the nightly job. */
  @Post('run-now')
  async runNow() {
    return this.triggersService.runAllTriggers();
  }

  // Must come after 'run-now' above - both are single-segment POST routes,
  // so :id would otherwise greedily match "run-now" as an id parameter.
  @Post(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTriggerDto) {
    return this.triggersService.update(id, dto);
  }
}

@Controller('marketing/social-posts')
@Roles('Super Admin', 'Branch Manager')
export class SocialPostsController {
  constructor(@InjectRepository(SocialPostEntity) private readonly postsRepo: Repository<SocialPostEntity>) {}

  @Post()
  async create(
    @Body('platform') platform: string,
    @Body('content') content: string,
    @Body('scheduledDate') scheduledDate: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.postsRepo.save(
      this.postsRepo.create({ platform, content, scheduledDate, status: 'Draft', createdBy: user.id }),
    );
  }

  @Get()
  async findAll(@Query('status') status?: string) {
    return this.postsRepo.find({
      where: status ? { status: status as SocialPostEntity['status'] } : {},
      order: { scheduledDate: 'ASC' },
    });
  }

  @Post(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    await this.postsRepo.update(id, { status: status as SocialPostEntity['status'] });
    return this.postsRepo.findOneOrFail({ where: { id } });
  }
}
