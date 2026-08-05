import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateBeneficiaryDto {
  @IsUUID()
  clientId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sharePct?: number;
}
