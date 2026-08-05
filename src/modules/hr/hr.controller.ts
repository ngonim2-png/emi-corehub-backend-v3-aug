import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { HrService } from './hr.service';
import { CreateEmployeeDto, CreateLeaveRequestDto, DecideLeaveRequestDto, MarkAttendanceDto } from './dto/hr.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

@Controller('hr')
@Roles('Super Admin', 'HR Manager')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Post('employees')
  @AuditLog({ action: 'employee.created', entityType: 'employee' })
  async createEmployee(@Body() dto: CreateEmployeeDto) {
    return this.hrService.createEmployee(dto);
  }

  @Get('employees/export')
  async exportEmployees(@Res() res: Response) {
    const employees = await this.hrService.findEmployees();
    const buffer = await buildExcelExport(
      'Employees',
      [
        { header: 'Name', key: 'fullName', width: 24 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Job Title', key: 'jobTitle', width: 22 },
        { header: 'Hire Date', key: 'hireDate', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      employees.map((e) => ({ fullName: e.fullName, department: e.department, jobTitle: e.jobTitle, hireDate: e.hireDate, status: e.status })),
      'Employee Register',
    );
    sendExcelFile(res, buffer, 'employees.xlsx');
  }

  @Get('employees')
  async findEmployees() {
    return this.hrService.findEmployees();
  }

  @Post('leave-requests')
  async requestLeave(@Body() dto: CreateLeaveRequestDto) {
    return this.hrService.requestLeave(dto);
  }

  @Get('leave-requests')
  async findLeaveRequests() {
    return this.hrService.findLeaveRequests();
  }

  @Post('leave-requests/:id/decision')
  @AuditLog({ action: 'leave.decided', entityType: 'leave_request' })
  async decideLeave(@Param('id') id: string, @Body() dto: DecideLeaveRequestDto) {
    return this.hrService.decideLeave(id, dto);
  }

  @Post('attendance')
  async markAttendance(@Body() dto: MarkAttendanceDto) {
    return this.hrService.markAttendance(dto);
  }

  @Get('attendance')
  async findAttendance(@Query('month') month?: string, @Query('employeeId') employeeId?: string) {
    return this.hrService.findAttendance(month, employeeId);
  }
}
