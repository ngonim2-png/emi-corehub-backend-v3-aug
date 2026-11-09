import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  district?: string;
}

export class CreateComplaintDto {
  @IsUUID()
  clientId: string;

  @IsString()
  channel: string;

  @IsString()
  issue: string;
}

export class LogInteractionDto {
  @IsUUID()
  clientId: string;

  @IsString()
  channel: string;

  @IsString()
  summary: string;
}
