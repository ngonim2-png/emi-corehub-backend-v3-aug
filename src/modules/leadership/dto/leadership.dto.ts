import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateTargetDto {
  @IsString()
  weekStartDate: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsUUID()
  linkedGoalId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetValue?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  assignedTo: string[];
}

export class ReviewTargetAssignmentDto {
  @IsIn(['Achieved', 'Missed'])
  status: 'Achieved' | 'Missed';

  @IsOptional()
  @IsNumber()
  actualValue?: number;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class CreateActionItemDto {
  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  assignedTo: string;

  @IsString()
  dueDate: string;
}
