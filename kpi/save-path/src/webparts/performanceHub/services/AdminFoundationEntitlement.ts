import { isKpiDataQualityAdmin } from './KpiDataQuality';

export interface IAdminFoundationEntitlement {
  entitled: boolean;
  showAdminNavigation: boolean;
  authorisationSource: 'ExistingApplicationRoleHook';
}

/**
 * Release-D deliberately reuses the existing application-role hook. This helper
 * does not alter SharePoint permissions and does not grant access because a UAT
 * query-string flag is present.
 */
export const getAdminFoundationEntitlement = (
  appRoles: readonly string[] = []
): IAdminFoundationEntitlement => {
  const entitled = isKpiDataQualityAdmin(appRoles);
  return {
    entitled,
    showAdminNavigation: entitled,
    authorisationSource: 'ExistingApplicationRoleHook'
  };
};
