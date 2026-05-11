import { ForbiddenException } from '@nestjs/common';

type ManagerUser = { role: string; managedCompanyId: string | null };

/**
 * Throws ForbiddenException if a COMPANY_MANAGER user tries to manage
 * a resource that belongs to a different company.
 */
export function assertCompanyAccess(user: ManagerUser, resourceCompanyId: string | null | undefined, message?: string): void {
  if (user.role === 'COMPANY_MANAGER' && resourceCompanyId !== user.managedCompanyId) {
    throw new ForbiddenException(message ?? 'You can only manage resources for your own company');
  }
}
