import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Marks a route handler as requiring one of the given roles.
 * Enforced by RolesGuard. Roles are checked in addition to, never instead of,
 * row-level security at the database layer.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
