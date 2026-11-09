import { IsDateString, IsIn, IsString, IsUUID } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  fullName: string;

  @IsString()
  department: string;

  @IsString()
  jobTitle: string;

  @IsDateString()
  hireDate: string;
}

export class CreateLeaveRequestDto {
  @IsUUID()
  employeeId: string;

  @IsString()
  type: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;
}

export class DecideLeaveRequestDto {
  @IsIn(['Approved', 'Declined'])
  status: 'Approved' | 'Declined';
}

export class MarkAttendanceDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsIn(['Present', 'Absent', 'Late', 'On Leave'])
  status: 'Present' | 'Absent' | 'Late' | 'On Leave';
}

export class CreateOwnLeaveRequestDto {
  @IsString()
  type: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;
}
