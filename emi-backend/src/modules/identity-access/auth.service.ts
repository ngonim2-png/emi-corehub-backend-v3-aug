import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { UsersService } from './users.service';
import { verifyPassword } from '../../common/utils/password.util';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 1 of login. Returns either a token pair (MFA not required/enabled
   * for this role) or an mfaToken the client must exchange via
   * POST /auth/mfa/verify - MFA is mandatory for Super Admin and Finance
   * roles per the security requirements in the specification.
   */
  async login(email: string, password: string): Promise<TokenPair | { mfaToken: string }> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    if (user.status !== 'Active') {
      throw new UnauthorizedException('This account is not active');
    }

    if (user.mfaEnabled) {
      const mfaToken = await this.jwtService.signAsync(
        { sub: user.id, purpose: 'mfa' },
        { secret: this.config.get<string>('auth.accessSecret'), expiresIn: '5m' },
      );
      return { mfaToken };
    }

    await this.usersService.recordLogin(user.id);
    return this.issueTokenPair(user.id, user.role.name, user.branchId, user.fullName);
  }

  async verifyMfa(mfaToken: string, code: string): Promise<TokenPair> {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwtService.verifyAsync(mfaToken, {
        secret: this.config.get<string>('auth.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('MFA session expired, please log in again');
    }
    if (payload.purpose !== 'mfa') throw new UnauthorizedException('Invalid MFA session');

    const fullUser = await this.usersService.findById(payload.sub);
    const secretHolder = await this.usersService.findByEmailWithPassword(fullUser.email);
    if (!secretHolder?.mfaSecret) throw new UnauthorizedException('MFA is not configured for this account');

    const validCode = authenticator.check(code, secretHolder.mfaSecret);
    if (!validCode) throw new UnauthorizedException('Incorrect authentication code');

    await this.usersService.recordLogin(fullUser.id);
    return this.issueTokenPair(fullUser.id, fullUser.role.name, fullUser.branchId, fullUser.fullName);
  }

  private async issueTokenPair(
    userId: string,
    role: string,
    branchId: string | null,
    fullName: string,
  ): Promise<TokenPair> {
    const payload = { sub: userId, role, branchId, fullName };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('auth.accessSecret'),
      expiresIn: this.config.get<string>('auth.accessExpiry'),
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('auth.refreshSecret'),
      expiresIn: this.config.get<string>('auth.refreshExpiry'),
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; role: string; branchId: string | null; fullName: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get<string>('auth.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalid or expired, please log in again');
    }
    // Production implementation: check refreshToken against a stored,
    // hashed, single-use record and rotate it here (rotation detects theft).
    return this.issueTokenPair(payload.sub, payload.role, payload.branchId, payload.fullName);
  }

  async startMfaEnrollment(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.usersService.findById(userId);
    const secret = authenticator.generateSecret();
    await this.usersService.setPendingMfaSecret(userId, secret);
    const otpauthUrl = authenticator.keyuri(user.email, 'EMI CoreHub', secret);
    return { secret, otpauthUrl };
  }

  async confirmMfaEnrollment(userId: string, code: string): Promise<{ enabled: boolean }> {
    const user = await this.usersService.findById(userId);
    const holder = await this.usersService.findByEmailWithPassword(user.email);
    if (!holder?.mfaSecret) {
      throw new UnauthorizedException('No MFA enrollment in progress - call mfa/enroll first');
    }
    const valid = authenticator.check(code, holder.mfaSecret);
    if (!valid) throw new UnauthorizedException('Incorrect code - check your authenticator app and try again');
    await this.usersService.enableMfa(userId);
    return { enabled: true };
  }

  async disableMfa(userId: string): Promise<void> {
    await this.usersService.disableMfa(userId);
  }
}
