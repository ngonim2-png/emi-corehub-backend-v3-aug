import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppAuthContext, AppAuthService } from './app-auth.service';

export const APP_AUTH_KEY = 'appAuthType';
/** Which kind of app user may call this route: a client (policy + PIN), an applicant (phone + PIN), or either. */
export const AppAuth = (type: 'client' | 'applicant' | 'any') => SetMetadata(APP_AUTH_KEY, type);

export const CurrentApp = createParamDecorator((_data: unknown, ctx: ExecutionContext): AppAuthContext => {
  return ctx.switchToHttp().getRequest().appAuth;
});

/** Separate from the staff JwtAuthGuard on purpose: it only accepts tokens issued by AppAuthService. */
@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(private readonly auth: AppAuthService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw new UnauthorizedException('Please log in.');
    const ctx = await this.auth.verifyToken(header.slice(7));
    const required = this.reflector.getAllAndOverride<'client' | 'applicant' | 'any'>(APP_AUTH_KEY, [context.getHandler(), context.getClass()]) ?? 'any';
    if (required !== 'any' && required !== ctx.type) throw new ForbiddenException('This part of the app is not available for your account type.');
    req.appAuth = ctx;
    return true;
  }
}
