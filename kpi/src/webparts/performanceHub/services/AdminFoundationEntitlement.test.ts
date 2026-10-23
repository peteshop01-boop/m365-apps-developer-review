import { getAdminFoundationEntitlement } from './AdminFoundationEntitlement';

describe('KCF-KPI-020A Admin foundation entitlement hook', () => {
  it('reuses the two exact existing application roles for Admin navigation', () => {
    expect(getAdminFoundationEntitlement(['Senior Manager Admin'])).toEqual({
      entitled: true,
      showAdminNavigation: true,
      authorisationSource: 'ExistingApplicationRoleHook'
    });
    expect(getAdminFoundationEntitlement(['SystemAdmin']).entitled).toBe(true);
  });

  it('excludes ordinary employees, managers and near-match role names', () => {
    expect(getAdminFoundationEntitlement()).toMatchObject({ entitled: false, showAdminNavigation: false });
    expect(getAdminFoundationEntitlement(['Employee'])).toMatchObject({ entitled: false, showAdminNavigation: false });
    expect(getAdminFoundationEntitlement(['Manager'])).toMatchObject({ entitled: false, showAdminNavigation: false });
    expect(getAdminFoundationEntitlement(['SystemAdministrator'])).toMatchObject({ entitled: false, showAdminNavigation: false });
  });
});
