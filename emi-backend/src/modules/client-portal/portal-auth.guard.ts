import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PortalAuthService } from './portal-auth.service';

/**
 * Not a variant of the staff JwtAuthGuard - genuinely separate,
 * checking a token that can only ever have come from
 * PortalAuthService.login, never from staff /auth/login.
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(private readonly portalAuthService: PortalAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Please log in to the client portal.');
    }
    const token = authHeader.slice('Bearer '.length);
    request.portalClientId = this.portalAuthService.verifyToken(token);
    return true;
  }
}
