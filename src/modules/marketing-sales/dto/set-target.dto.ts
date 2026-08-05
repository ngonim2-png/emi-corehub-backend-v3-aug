import { IsNumber, IsString, IsUUID, Matches, Min } from 'class-validator';

export class SetTargetDto {
  @IsUUID()
  marketerId: string;

  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  @IsNumber()
  @Min(0)
  targetAmount: number;
}
