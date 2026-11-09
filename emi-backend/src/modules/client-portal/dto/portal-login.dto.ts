import { IsString, MinLength } from 'class-validator';

export class PortalLoginDto {
  @IsString()
  @MinLength(3)
  policyNo: string;

  @IsString()
  @MinLength(6)
  phone: string;
}
