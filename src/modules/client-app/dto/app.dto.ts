import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min, Max, IsBoolean, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ActivateStartDto {
  @IsString() @Length(2, 40) policyNo: string;
  @IsString() @Length(6, 20) phone: string;
}

export class ActivateDirectDto {
  @IsString() @Length(2, 40) policyNo: string;
  @IsString() @Length(6, 20) phone: string;
  @IsString() @Length(4, 6) pin: string;
  @IsString() @Length(4, 6) pinConfirm: string;
}

export class ActivateCompleteDto {
  @IsString() @Length(2, 40) policyNo: string;
  @IsString() @Length(4, 10) code: string;
  @IsString() @Length(4, 6) pin: string;
}

export class AppLoginDto {
  @IsString() @Length(2, 40) policyNo: string;
  @IsString() @Length(4, 6) pin: string;
}

export class ApplicantRegisterDto {
  @IsString() @Length(2, 120) fullName: string;
  @IsString() @Length(6, 20) phone: string;
  @IsString() @Length(4, 6) pin: string;
}

export class ApplicantLoginDto {
  @IsString() @Length(6, 20) phone: string;
  @IsString() @Length(4, 6) pin: string;
}

export class ChangePinDto {
  @IsString() @Length(4, 6) oldPin: string;
  @IsString() @Length(4, 6) newPin: string;
}

export class LoanRequestDto {
  @IsIn(['Cash', 'Appliance']) loanType: 'Cash' | 'Appliance';
  @IsOptional() @IsString() @MaxLength(300) applianceDescription?: string;
  @Type(() => Number) @IsNumber() @Min(1) principal: number;
  @Type(() => Number) @IsNumber() @Min(1) @Max(60) tenureMonths: number;
  @IsOptional() @IsIn(['Commercial / Income Generation', 'Personal Use', 'Other']) purpose?: 'Commercial / Income Generation' | 'Personal Use' | 'Other';
  @IsOptional() @IsString() @MaxLength(500) purposeDetail?: string;
  @IsOptional() @IsString() @MaxLength(150) occupation?: string;
  @IsOptional() @IsString() @MaxLength(50) staffPinCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) existingMonthlyDebt?: number;
  @IsOptional() @IsIn(['National ID Card', "Driver's Licence", 'Passport', 'Voter ID', 'Other approved identification']) idType?: string;
  @IsOptional() @IsString() @MaxLength(60) idNumber?: string;
  @IsOptional() @IsDateString() idExpiry?: string;
  /** Full name typed to accept the declaration. Required for requests from the app. */
  @IsString() @Length(3, 150) declarationName: string;
}

export class RequestDto {
  @IsString() type: string;
  @IsString() @Length(5, 2000) message: string;
  @IsOptional() @IsString() policyNo?: string;
}

class PushKeysDto {
  @IsString() p256dh: string;
  @IsString() auth: string;
}
export class PushSubscribeDto {
  @IsString() @MaxLength(1000) endpoint: string;
  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
}
export class PushUnsubscribeDto {
  @IsString() @MaxLength(1000) endpoint: string;
}

// ------------------------------------------------ staff (app-admin) DTOs

export class ConvertApplicationDto {
  @IsString() @Length(2, 40) policyNo: string;
  @IsNumber() @Min(0) sumAssured: number;
  @IsNumber() @Min(0) monthlyPremium: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) commencementDate: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) maturityDate?: string;
  @IsString() paymentMethod: string;
  @IsOptional() @IsString() existingClientId?: string;
}

export class RejectApplicationDto {
  @IsString() @Length(3, 500) reason: string;
}

export class IssueCodeDto {
  @IsString() @Length(2, 40) policyNo: string;
}

export class HandleRequestDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class UpdateAppProductDto {
  @IsOptional() @IsBoolean() appVisible?: boolean;
  @IsOptional() @IsString() @MaxLength(600) appDescription?: string;
  @IsOptional() @IsString() appFormType?: string;
}

export class ResetApplicantPinDto {
  @IsString() @Length(4, 6) newPin: string;
}

export class BulkPushDto {
  @IsIn(['all', 'pendingPremium', 'lapsed', 'renewal', 'selected']) segment: 'all' | 'pendingPremium' | 'lapsed' | 'renewal' | 'selected';
  @IsString() @Length(2, 80) title: string;
  @IsString() @Length(2, 300) message: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) clientIds?: string[];
}
