import { IsNumber, IsObject, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateUnderwritingCaseDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  sumAssured: number;

  @IsOptional()
  @IsObject()
  riskAnswers?: Record<string, unknown>;
}
