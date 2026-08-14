import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity, LeaveRequestEntity, AttendanceEntity } from './entities/employee.entity';
import { PayrollRunEntity, PayrollLineEntity } from './entities/payroll.entity';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeEntity, LeaveRequestEntity, AttendanceEntity, PayrollRunEntity, PayrollLineEntity])],
  providers: [HrService, PayrollService],
  controllers: [HrController, PayrollController],
  exports: [HrService, PayrollService],
})
export class HrModule {}
