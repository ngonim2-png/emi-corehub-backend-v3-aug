import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const TRIGGER_TYPES = [
  'new_client_welcome',
  'policy_warning',
  'policy_lapsed_winback',
  'renewal_reminder',
  'policy_anniversary',
  'referral_reward',
];

export class CreateTriggerDto {
  @IsString()
  name: string;

  @IsIn(TRIGGER_TYPES)
  triggerType: string;

  @IsString()
  messageTemplate: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  daysOffset?: number;
}

export class UpdateTriggerDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  messageTemplate?: string;
}
