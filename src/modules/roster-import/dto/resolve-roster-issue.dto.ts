import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ResolveRosterIssueDto {
  @IsString()
  policyNo: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsNumber()
  @Min(0)
  premium: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sumAssured?: number;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsString()
  commencementDate: string;

  @IsOptional()
  @IsString()
  maturityDate?: string;

  @IsIn(['Active', 'Cancelled'])
  status: 'Active' | 'Cancelled';

  @IsOptional()
  @IsString()
  broker?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
