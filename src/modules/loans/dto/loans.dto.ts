import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateLoanDto {
  @IsUUID()
  clientId: string;

  @IsIn(['Cash', 'Appliance'])
  loanType: 'Cash' | 'Appliance';

  @IsOptional()
  @IsString()
  applianceDescription?: string;

  @IsNumber()
  @Min(1)
  principal: number;

  @IsNumber()
  @Min(1)
  @Max(12)
  tenureMonths: number;
}

export class LoanApprovalDecisionDto {
  @IsIn(['Approved', 'Rejected'])
  decision: 'Approved' | 'Rejected';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordLoanRepaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;
}
