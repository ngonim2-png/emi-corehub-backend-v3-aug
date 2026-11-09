import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RegisterDocumentDto {
  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsString()
  relatedType: string;

  @IsOptional()
  @IsUUID()
  relatedId?: string;

  @IsString()
  storageKey: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
