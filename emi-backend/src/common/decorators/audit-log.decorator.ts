import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';

export interface AuditActionMeta {
  /** Short machine-readable action code, e.g. "payment.reverse" */
  action: string;
  /** Entity type this action mutates, e.g. "payment" */
  entityType: string;
}

/**
 * Marks a route handler as a sensitive action that must be written to the
 * immutable audit trail. Combine with @Roles() for anything the original
 * specification lists as "requires approval" (reversal, token allocation,
 * journal posting, claim approval, policy number edit, role change).
 */
export const AuditLog = (meta: AuditActionMeta) => SetMetadata(AUDIT_ACTION_KEY, meta);
