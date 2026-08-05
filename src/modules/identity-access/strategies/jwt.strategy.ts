import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

interface AccessTokenPayload {
  sub: string;
  role: string;
  branchId: string | null;
  fullName: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.accessSecret'),
    });
  }

  // Whatever this returns becomes `request.user`.
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      role: payload.role,
      branchId: payload.branchId,
      fullName: payload.fullName,
    };
  }
}
