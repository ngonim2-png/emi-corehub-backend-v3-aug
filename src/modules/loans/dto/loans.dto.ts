import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import {
  CREDIT_ASSESSMENTS, DECISION_OUTCOMES, ID_TYPES, LOAN_PURPOSES, LoanPurpose, PAYMENT_PERFORMANCE, PREMIUM_PAYMENT_METHODS,
} from '../entities/loan.entity';

export const LOAN_REPAYMENT_METHODS = ['Cash Office Payment', 'Mobile Money', 'Bank Transfer', 'Payroll Deduction', 'Direct Debit'] as const;

/** Application details from the paper form (sections 1 to 4). All optional so older callers keep working. */
export class LoanApplicationFieldsDto {
  @IsOptional() @IsString() @MaxLength(100) branch?: string;
  @IsOptional() @IsIn(PREMIUM_PAYMENT_METHODS as unknown as string[]) premiumPaymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(150) occupation?: string;
  @IsOptional() @IsString() @MaxLength(50) staffPinCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) existingMonthlyDebt?: number;
  @IsOptional() @IsIn(ID_TYPES as unknown as string[]) idType?: string;
  @IsOptional() @IsString() @MaxLength(60) idNumber?: string;
  @IsOptional() @IsDateString() idExpiry?: string;
}

export class CreateLoanDto extends LoanApplicationFieldsDto {
  @IsUUID()
  clientId: string;

  @IsIn(['Cash', 'Appliance'])
  loanType: 'Cash' | 'Appliance';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  applianceDescription?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  principal: number;

  /** Allowed values come from LOAN_TENURE_OPTIONS (default 6 or 12); checked in the service. */
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(60)
  tenureMonths: number;

  @IsOptional()
  @IsIn(LOAN_PURPOSES as unknown as string[])
  purpose?: LoanPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purposeDetail?: string;

  /** Name typed by the applicant to accept the declaration (client app). Staff record the signed paper form instead. */
  @IsOptional() @IsString() @MaxLength(150) declarationName?: string;
}

export class UpdateLoanApplicationDto extends LoanApplicationFieldsDto {
  @IsOptional() @IsObject() checklist?: Record<string, boolean>;
  /** Staff confirm the applicant signed the declaration on the paper form. */
  @IsOptional() @IsBoolean() declarationSigned?: boolean;
  @IsOptional() @IsString() @MaxLength(150) declarationName?: string;
}

export class LoanAssessmentDto {
  @IsOptional() @IsBoolean() policyVerified?: boolean;
  @IsOptional() @IsString() @MaxLength(50) verifiedPolicyNo?: string;
  @IsOptional() @IsIn(PAYMENT_PERFORMANCE as unknown as string[]) paymentPerformance?: string;
  @Type(() => Number) @IsNumber() @Min(0) verifiedMonthlyIncome: number;
  @Type(() => Number) @IsNumber() @Min(0) verifiedExistingDebt: number;
  @Type(() => Number) @IsNumber() @Min(1) recommendedAmount: number;
  @Type(() => Number) @IsNumber() @Min(1) @Max(60) recommendedTenureMonths: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) downPayment?: number;
  @IsIn(CREDIT_ASSESSMENTS as unknown as string[]) creditAssessment: string;
  @IsOptional() @IsString() @MaxLength(2000) assessmentComments?: string;
}

/** Life Manager: recommend (Approved), reject, or defer for more information. */
export class LoanApprovalDecisionDto {
  @IsIn(['Approved', 'Rejected', 'Deferred'])
  decision: 'Approved' | 'Rejected' | 'Deferred';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Finance Director: the decision in section 7 C of the form. */
export class LoanFinalDecisionDto {
  /** 'Rejected' is accepted as the older name for 'Declined'. */
  @IsIn([...DECISION_OUTCOMES, 'Rejected'] as string[])
  decision: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) approvedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(60) approvedTenureMonths?: number;
  @IsOptional() @IsString() @MaxLength(2000) conditions?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RecordLoanRepaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  /** How the money came in; decides which cash or bank account is debited. */
  @IsOptional()
  @IsIn(LOAN_REPAYMENT_METHODS as unknown as string[])
  paymentMethod?: (typeof LOAN_REPAYMENT_METHODS)[number];
}
