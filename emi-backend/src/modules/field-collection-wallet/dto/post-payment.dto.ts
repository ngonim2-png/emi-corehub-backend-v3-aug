import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

const PAYMENT_METHODS = [
  'Token Field Collection',
  'Mobile Money',
  'Bank Transfer',
  'Cash Office Payment',
  'Payroll Deduction',
  'Direct Debit',
  'Standing Order',
  'Employer Payroll Deduction',
];

export class PostPaymentDto {
  @IsUUID()
  policyId: string;

  @Matches(/^\d{4}-\d{2}$/, { message: 'paymentMonth must be in YYYY-MM format' })
  paymentMonth: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn(PAYMENT_METHODS)
  paymentMethod: string;

  @IsOptional()
  @IsUUID()
  marketerId?: string;

  @IsOptional()
  @IsNumber()
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  gpsLng?: number;

  @IsOptional()
  @IsString()
  devicePin?: string;
}
