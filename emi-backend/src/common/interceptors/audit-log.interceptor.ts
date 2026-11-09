import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_ACTION_KEY, AuditActionMeta } from '../decorators/audit-log.decorator';
import { AuditService } from '../../modules/audit/audit.service';

/**
 * Any route decorated with @AuditLog({ action, entityType }) gets an
 * audit_logs row written automatically once the handler completes
 * successfully. The write happens outside the handler's own DB transaction
 * by design: the audit trail is a separate, append-only concern, and a
 * failed audit write should never be able to roll back a legitimate
 * business transaction (it is instead sent to the alerting pipeline).
 *
 * Sensitive endpoints that must be atomic with their audit row (see the
 * architecture doc's "same transaction" requirement for approval-gated
 * actions) write their audit entry explicitly inside the service's
 * transaction instead of relying on this interceptor - this interceptor
 * is the safety net for everything else.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditActionMeta | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      tap((result) => {
        void this.auditService.record({
          userId: user?.id ?? null,
          action: meta.action,
          entityType: meta.entityType,
          entityId: (result && (result.id ?? result?.data?.id)) ?? null,
          before: null,
          after: result ?? null,
          ip: request.ip,
        });
      }),
    );
  }
}
