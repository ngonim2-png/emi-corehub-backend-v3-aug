import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class RequisitionItemDto {
  @IsString() @Length(1, 500) description: string;
  @Type(() => Number) @IsNumber() @Min(0.01) quantity: number;
  /** The raiser may leave this at 0; the Procurement Manager prices it. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
}

export class CreateRequisitionDto {
  @IsString() @Length(3, 1000) purpose: string;
  @IsUUID() departmentId: string;
  @IsOptional() @IsString() @MaxLength(120) designation?: string;
  @IsOptional() @IsDateString() neededBy?: string;
  @IsOptional() @IsIn(['Normal', 'Urgent']) urgency?: 'Normal' | 'Urgent';
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RequisitionItemDto)
  items: RequisitionItemDto[];
}

export class RequisitionDecisionDto {
  @IsIn(['Approved', 'Returned', 'Rejected']) decision: 'Approved' | 'Returned' | 'Rejected';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  /** The Procurement Manager or Finance Manager may set or change the account it will be charged to. */
  @IsOptional() @IsString() @Length(4, 10) chargeAccount?: string;
}

export class PriceItemDto {
  @IsUUID() id: string;
  @Type(() => Number) @IsNumber() @Min(0) unitCost: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) quantity?: number;
}

export class PriceRequisitionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceItemDto) items: PriceItemDto[];
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  /** The account it will be charged to; used for the budget check and as the default at payment. */
  @IsOptional() @IsString() @Length(4, 10) chargeAccount?: string;
}

export class ReceiveRequisitionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class PayRequisitionDto {
  @IsDateString() paidOn: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @IsIn(['Cash', 'Bank', 'Mobile Money']) paymentMethod: 'Cash' | 'Bank' | 'Mobile Money';
  @IsString() @Length(4, 10) expenseAccount: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
}

export class DepartmentDto {
  @IsString() @Length(2, 100) name: string;
  @IsOptional() @IsUUID() headUserId?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CancelRequisitionDto {
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
