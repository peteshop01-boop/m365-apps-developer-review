/**
 * Verification is public so the pure history domain can reject forged objects. Issuance is
 * deliberately private to the production adapter that performs the signed-in People readback.
 */
import type { IAuthoritativeAdminEventHistoryCapability } from './IProductionDataService';

declare function require(name: string): {
  isAuthoritativeAdminEventHistoryCapability(value: unknown): value is IAuthoritativeAdminEventHistoryCapability;
};

/** Lazy loading keeps the pure history domain independent of SharePoint runtime initialisation. */
export const isAuthoritativeAdminEventHistoryCapability = (
  value: unknown
): value is IAuthoritativeAdminEventHistoryCapability => require('./SharePointProductionDataService')
  .isAuthoritativeAdminEventHistoryCapability(value);
