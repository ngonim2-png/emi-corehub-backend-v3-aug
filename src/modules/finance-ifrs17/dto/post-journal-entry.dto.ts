import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

export class JournalLineDto {
  @IsString()
  accountCode: string;

  @IsNumber()
  @Min(0)
  debit: number;

  @IsNumber()
  @Min(0)
  credit: number;
}

export class PostJournalEntryDto {
  @IsDateString()
  date: string;

  @IsString()
  narration: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
