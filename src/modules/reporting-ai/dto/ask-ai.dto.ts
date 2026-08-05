import { IsString, MinLength } from 'class-validator';

export class AskAiDto {
  @IsString()
  @MinLength(3)
  question: string;
}
