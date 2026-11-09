import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmailService } from './email.service';

@Controller('notifications/email')
@Roles('Super Admin', 'Branch Manager', 'Finance Manager')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post()
  async send(
    @Body('toEmail') toEmail: string,
    @Body('subject') subject: string,
    @Body('body') body: string,
  ) {
    return this.emailService.queueEmail({ toEmail, subject, body });
  }

  @Post('group')
  async sendToGroup(
    @Body('employerOrGroup') employerOrGroup: string,
    @Body('subject') subject: string,
    @Body('body') body: string,
  ) {
    return this.emailService.sendToGroup(employerOrGroup, subject, body);
  }

  @Get('logs')
  async findLogs(@Query('limit') limit?: string) {
    return this.emailService.findLogs(limit ? parseInt(limit, 10) : undefined);
  }
}
