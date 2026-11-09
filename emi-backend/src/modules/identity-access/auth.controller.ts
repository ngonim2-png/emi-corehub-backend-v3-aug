import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Post('mfa/verify')
  async verifyMfa(@Body() dto: VerifyMfaDto) {
    return this.authService.verifyMfa(dto.mfaToken, dto.code);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  /**
   * Step 1 of self-service MFA enrollment: generates a new TOTP secret
   * and returns it (plus the otpauth:// URI for a QR code) - NOT yet
   * enabled. The user must prove they captured it correctly via
   * mfa/confirm-enroll before it takes effect on future logins.
   */
  @Post('mfa/enroll')
  async enrollMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.startMfaEnrollment(user.id);
  }

  @Post('mfa/confirm-enroll')
  @AuditLog({ action: 'user.mfa_enabled', entityType: 'user' })
  async confirmEnrollMfa(@CurrentUser() user: AuthenticatedUser, @Body('code') code: string) {
    return this.authService.confirmMfaEnrollment(user.id, code);
  }

  @Post('mfa/disable')
  @AuditLog({ action: 'user.mfa_disabled', entityType: 'user' })
  async disableMfa(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.disableMfa(user.id);
    return { disabled: true };
  }
}
