import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

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

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @Length(2, 150) fullName?: string;
  @IsOptional() @IsString() @Length(2, 100) department?: string;
  @IsOptional() @IsString() @Length(1, 120) jobTitle?: string;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsIn(['Active', 'On Leave']) status?: 'Active' | 'On Leave';
  /** Link (or unlink with null) the CoreHub login this person uses. */
  @IsOptional() @IsUUID() userId?: string | null;
}

export class ReassignEmployeesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) employeeIds: string[];
  @IsString() @Length(2, 100) department: string;
}

export class ExitEmployeeDto {
  @IsDateString() exitDate: string;
  @IsIn(['Resigned', 'Contract ended', 'Dismissed', 'Retired', 'Deceased', 'Other']) reason: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Also switch off their CoreHub login. */
  @IsOptional() @IsBoolean() disableLogin?: boolean;
}

export class DepartmentRenameDto {
  @IsString() @Length(2, 100) name: string;
}
