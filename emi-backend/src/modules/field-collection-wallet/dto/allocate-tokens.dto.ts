import { IsNumber, IsUUID, Min } from 'class-validator';

export class AllocateTokensDto {
  @IsUUID()
  marketerId: string;

  @IsNumber()
  @Min(1)
  amount: number;
}
