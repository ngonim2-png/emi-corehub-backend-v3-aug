import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateBeneficiaryDto {
  @IsUUID()
  clientId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sharePct?: number;
}
