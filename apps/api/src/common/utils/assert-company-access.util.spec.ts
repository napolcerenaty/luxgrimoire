import { ForbiddenException } from '@nestjs/common';
import { assertCompanyAccess } from './assert-company-access.util';

const manager = (companyId: string | null) => ({ role: 'COMPANY_MANAGER', managedCompanyId: companyId });

describe('assertCompanyAccess', () => {
  it('allows a COMPANY_MANAGER to act on their own company resource', () => {
    expect(() => assertCompanyAccess(manager('co-1'), 'co-1')).not.toThrow();
  });

  it('blocks a COMPANY_MANAGER from another company resource', () => {
    expect(() => assertCompanyAccess(manager('co-1'), 'co-2')).toThrow(ForbiddenException);
  });

  it('blocks a COMPANY_MANAGER whose managedCompanyId is null against any concrete resource', () => {
    expect(() => assertCompanyAccess(manager(null), 'co-1')).toThrow(ForbiddenException);
  });

  it('never restricts a non-manager role, whatever the resource company', () => {
    expect(() => assertCompanyAccess({ role: 'ADMIN', managedCompanyId: null }, 'co-9')).not.toThrow();
    expect(() => assertCompanyAccess({ role: 'MODERATOR', managedCompanyId: 'co-1' }, 'co-9')).not.toThrow();
  });

  it('uses a custom message when supplied', () => {
    expect(() => assertCompanyAccess(manager('co-1'), 'co-2', 'nope')).toThrow('nope');
  });
});
