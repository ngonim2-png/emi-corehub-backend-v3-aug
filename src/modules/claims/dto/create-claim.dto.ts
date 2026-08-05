import { IsDateString, IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class CreateClaimDto {
  @IsUUID()
  policyId: string;

  @IsString()
  claimType: string;

  @IsNumber()
  @Min(0)
  amountClaimed: number;

  @IsDateString()
  dateReported: string;
}
