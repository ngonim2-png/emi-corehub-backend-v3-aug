import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePolicyDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  productId: string;

  @IsString()
  policyNo: string;

  @IsNumber()
  @Min(0)
  sumAssured: number;

  @IsNumber()
  @Min(0)
  monthlyPremium: number;

  @IsDateString()
  commencementDate: string;

  @IsOptional()
  @IsDateString()
  maturityDate?: string;

  @IsString()
  paymentMethod: string;
}
