import SharePointProductionDataService from './SharePointProductionDataService';

/**
 * The integrated screen still exposes C2b annual commands. Until its serial
 * Option E hook is installed, those commands must not mutate the protected
 * annual store or be mistaken for a trusted Submit/manager processor.
 * Aggregate Draft Save uses the separate employee-context Draft gateway.
 */
export default class OptionEGuardedProductionDataService extends SharePointProductionDataService {
  private blocked(): Promise<never> {
    return Promise.reject(new Error(
      'OPTION_E_TRUSTED_ROUTE_ABSENT: annual create, item writes and transitions require the approved Option E binding.'
    ));
  }

  public override createEmployeeWorkplanDraftV2(): Promise<never> { return this.blocked(); }
  public override saveEmployeeWorkplanDraftV2(): Promise<never> { return this.blocked(); }
  public override upsertCoreContributionV2(): Promise<never> { return this.blocked(); }
  public override upsertPersonalItemV2(): Promise<never> { return this.blocked(); }
  public override upsertBehaviourCommitmentV2(): Promise<never> { return this.blocked(); }
  public override setCoreWeightingV2(): Promise<never> { return this.blocked(); }
  public override submitEmployeeWorkplanV2(): Promise<never> { return this.blocked(); }
  public override requestEmployeeWorkplanChangesV2(): Promise<never> { return this.blocked(); }
  public override createEmployeeWorkplanAmendmentV2(): Promise<never> { return this.blocked(); }
  public override approveAndLockEmployeeWorkplanV2(): Promise<never> { return this.blocked(); }

  // The older annual API remains callable through IProductionDataService even
  // when the integrated screen hides it. Reject at this boundary before any
  // inherited read, write, audit, or derived-state operation can run.
  public override getOrCreateDraftWorkplan(..._args: Parameters<SharePointProductionDataService['getOrCreateDraftWorkplan']>): Promise<never> { return this.blocked(); }
  public override saveWorkplanCategoryWeights(..._args: Parameters<SharePointProductionDataService['saveWorkplanCategoryWeights']>): Promise<never> { return this.blocked(); }
  public override saveCoreWorkplanItem(..._args: Parameters<SharePointProductionDataService['saveCoreWorkplanItem']>): Promise<never> { return this.blocked(); }
  public override removeCoreWorkplanItem(..._args: Parameters<SharePointProductionDataService['removeCoreWorkplanItem']>): Promise<never> { return this.blocked(); }
  public override savePersonalWorkplanItem(..._args: Parameters<SharePointProductionDataService['savePersonalWorkplanItem']>): Promise<never> { return this.blocked(); }
  public override removePersonalWorkplanItem(..._args: Parameters<SharePointProductionDataService['removePersonalWorkplanItem']>): Promise<never> { return this.blocked(); }
  public override saveBehaviourWorkplanItem(..._args: Parameters<SharePointProductionDataService['saveBehaviourWorkplanItem']>): Promise<never> { return this.blocked(); }
  public override removeBehaviourWorkplanItem(..._args: Parameters<SharePointProductionDataService['removeBehaviourWorkplanItem']>): Promise<never> { return this.blocked(); }
  public override submitWorkplan(..._args: Parameters<SharePointProductionDataService['submitWorkplan']>): Promise<never> { return this.blocked(); }
  public override requestWorkplanChanges(..._args: Parameters<SharePointProductionDataService['requestWorkplanChanges']>): Promise<never> { return this.blocked(); }
  public override approveWorkplan(..._args: Parameters<SharePointProductionDataService['approveWorkplan']>): Promise<never> { return this.blocked(); }
  public override approveAndLockWorkplan(..._args: Parameters<SharePointProductionDataService['approveAndLockWorkplan']>): Promise<never> { return this.blocked(); }
  public override lockApprovedWorkplan(..._args: Parameters<SharePointProductionDataService['lockApprovedWorkplan']>): Promise<never> { return this.blocked(); }
  public override reopenLockedWorkplan(..._args: Parameters<SharePointProductionDataService['reopenLockedWorkplan']>): Promise<never> { return this.blocked(); }
  public override openApprovedWorkplanAmendment(..._args: Parameters<SharePointProductionDataService['openApprovedWorkplanAmendment']>): Promise<never> { return this.blocked(); }
}
