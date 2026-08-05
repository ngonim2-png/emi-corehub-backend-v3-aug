import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AudienceFiltersDto {
  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class SendBulkSmsDto {
  @IsString()
  name: string;

  @IsString()
  @MaxLength(459) // 3 concatenated SMS segments' worth (153 chars x 3) - a sane upper bound, not a hard protocol limit
  message: string;

  @IsIn(['clients', 'marketers', 'custom'])
  audienceType: 'clients' | 'marketers' | 'custom';

  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceFiltersDto)
  filters?: AudienceFiltersDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  customPhones?: string[];
}
