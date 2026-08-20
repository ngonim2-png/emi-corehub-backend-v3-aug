import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateClientDto {
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  placeOfBirth?: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  altPhone?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  employerOrGroup?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  clientCategory?: string;

  @IsOptional()
  @IsBoolean()
  smsConsent?: boolean;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  referredByCode?: string;
}
