import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity, LeaveRequestEntity, AttendanceEntity } from './entities/employee.entity';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeEntity, LeaveRequestEntity, AttendanceEntity])],
  providers: [HrService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}
