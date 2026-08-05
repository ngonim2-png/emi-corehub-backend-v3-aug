import { IsIn, IsOptional, IsString } from 'class-validator';

export class DecideUnderwritingDto {
  @IsIn(['Approved', 'Declined', 'Counter-offer'])
  decision: 'Approved' | 'Declined' | 'Counter-offer';

  @IsOptional()
  @IsString()
  reason?: string;
}
