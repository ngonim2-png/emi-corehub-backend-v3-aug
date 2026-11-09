import { IsString } from 'class-validator';

export class EditPolicyNumberDto {
  @IsString()
  policyNo: string;
}
