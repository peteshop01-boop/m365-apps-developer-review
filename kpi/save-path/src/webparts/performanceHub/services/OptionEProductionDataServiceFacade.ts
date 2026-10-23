import type { IV5SubmittedHistoryLoader } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import { loadOptionEWorkplanSubmittedHistoryV5 } from './OptionEWorkplanSubmittedHistoryV5Loader';
import type { IProductionDataService } from './IProductionDataService';
import {
  createOptionEDraftCreateIntegration,
  readOptionEDraftCreateAdmission,
  type IOptionEDraftCreateIntegration
} from './OptionEDraftCreateIntegration';

/** Explicit public surface; the adapter stays reachable only by these closures. */
export function createOptionEProductionDataServiceFacade(
  adapter: IProductionDataService,
  draftCreate: IOptionEDraftCreateIntegration = createOptionEDraftCreateIntegration(),
  historyPort?: IV5SubmittedHistoryLoader,
  nativeWritesHeld = false
): IProductionDataService {
  const facade = Object.create(null) as IProductionDataService;
  const denyTestWrite = (): Promise<never> => Promise.reject(new Error(
    'DEMO_TEST_VIEW_ONLY: native changes are held pending governed TEST admission.'
  ));
  const denyAnnual = (): Promise<never> => Promise.reject(new Error(
    'OPTION_E_TRUSTED_ROUTE_ABSENT: annual writes require the approved Option E binding.'
  ));
  const createAdmission = readOptionEDraftCreateAdmission(draftCreate);
  const denyDraftCreate = (): Promise<never> => Promise.reject(new Error(
    `OPTION_E_TRUSTED_ROUTE_ABSENT: Draft Create admission is ${createAdmission.code}; ` +
    'the private Draft result is not a protected Workplan result.'
  ));

  facade.getSubmittedWorkplanHistoryV5 = coordinates => loadOptionEWorkplanSubmittedHistoryV5(coordinates, historyPort);

  // Read-only People/Core/annual views, approved Admin reference data and Quarterly routes.
  facade.getPersonByEmail = (...args) => adapter.getPersonByEmail(...args);
  facade.getDirectReports = (...args) => adapter.getDirectReports(...args);
  facade.getAdminPeople = (...args) => adapter.getAdminPeople(...args);
  facade.getAdminTeams = (...args) => adapter.getAdminTeams(...args);
  facade.getAdminConfigRecords = (...args) => adapter.getAdminConfigRecords(...args);
  facade.getAuthoritativeAdminEventHistoryCapability = (...args) => adapter.getAuthoritativeAdminEventHistoryCapability(...args);
  facade.getAuthoritativeAdminEventHistoryView = (...args) => adapter.getAuthoritativeAdminEventHistoryView
    ? adapter.getAuthoritativeAdminEventHistoryView(...args)
    : Promise.reject(new Error('Controlled Admin event history read is unavailable.'));
  facade.getAuthoritativeAdminKpiRemediationQueueCapability = (...args) => adapter.getAuthoritativeAdminKpiRemediationQueueCapability(...args);
  facade.getProductionConfig = (...args) => adapter.getProductionConfig(...args);
  facade.getReferenceCounts = (...args) => adapter.getReferenceCounts(...args);
  facade.getWorkplanStatus = (...args) => adapter.getWorkplanStatus(...args);
  facade.getCoreKpiCatalogue = (...args) => adapter.getCoreKpiCatalogue(...args);
  facade.getCoreWorkplanItems = (...args) => adapter.getCoreWorkplanItems(...args);
  facade.getPublishedBehaviours = (...args) => adapter.getPublishedBehaviours(...args);
  facade.getPersonalWorkplanItems = (...args) => adapter.getPersonalWorkplanItems(...args);
  facade.getBehaviourWorkplanItems = (...args) => adapter.getBehaviourWorkplanItems(...args);
  facade.getBehaviourObjectiveLibrary = (...args) => adapter.getBehaviourObjectiveLibrary(...args);
  facade.saveBehaviourObjective = (...args) => adapter.saveBehaviourObjective(...args);
  facade.setBehaviourObjectiveActive = (...args) => adapter.setBehaviourObjectiveActive(...args);
  facade.getManagerReviewContexts = (...args) => adapter.getManagerReviewContexts(...args);
  facade.getQuarterTimingConfig = (...args) => adapter.getQuarterTimingConfig(...args);
  facade.getManagerQuarterReviewContexts = (...args) => adapter.getManagerQuarterReviewContexts(...args);
  facade.getQuarterReviewContext = (...args) => adapter.getQuarterReviewContext(...args);
  facade.prepareQuarterReview = (...args) => adapter.prepareQuarterReview(...args);
  facade.saveQuarterReviewItem = (...args) => adapter.saveQuarterReviewItem(...args);
  facade.saveProgressEntry = (...args) => adapter.saveProgressEntry(...args);
  facade.submitQuarterReview = (...args) => adapter.submitQuarterReview(...args);
  facade.requestQuarterReviewChanges = (...args) => adapter.requestQuarterReviewChanges(...args);
  facade.approveAndLockQuarterReview = (...args) => adapter.approveAndLockQuarterReview(...args);
  facade.saveQuarterManagerOverride = (...args) => adapter.saveQuarterManagerOverride(...args);
  facade.saveQuarterBehaviourAssessment = (...args) => adapter.saveQuarterBehaviourAssessment(...args);
  facade.getEmployeeWorkplanV2 = (...args) => adapter.getEmployeeWorkplanV2(...args);
  facade.getEmployeeQuarterV2 = (...args) => adapter.getEmployeeQuarterV2(...args);
  facade.saveEmployeeQuarterUpdateV2 = (...args) => adapter.saveEmployeeQuarterUpdateV2(...args);
  facade.registerEmployeeQuarterEvidenceV2 = (...args) => adapter.registerEmployeeQuarterEvidenceV2(...args);
  facade.submitEmployeeQuarterV2 = (...args) => adapter.submitEmployeeQuarterV2(...args);

  // Every annual mutation remains unavailable until its trusted replacement is proved.
  facade.getOrCreateDraftWorkplan = (..._args) => denyAnnual();
  facade.saveWorkplanCategoryWeights = (..._args) => denyAnnual();
  facade.saveCoreWorkplanItem = (..._args) => denyAnnual();
  facade.removeCoreWorkplanItem = (..._args) => denyAnnual();
  facade.savePersonalWorkplanItem = (..._args) => denyAnnual();
  facade.removePersonalWorkplanItem = (..._args) => denyAnnual();
  facade.saveBehaviourWorkplanItem = (..._args) => denyAnnual();
  facade.removeBehaviourWorkplanItem = (..._args) => denyAnnual();
  facade.submitWorkplan = (..._args) => denyAnnual();
  facade.requestWorkplanChanges = (..._args) => denyAnnual();
  facade.approveWorkplan = (..._args) => denyAnnual();
  facade.approveAndLockWorkplan = (..._args) => denyAnnual();
  facade.lockApprovedWorkplan = (..._args) => denyAnnual();
  facade.reopenLockedWorkplan = (..._args) => denyAnnual();
  facade.openApprovedWorkplanAmendment = (..._args) => denyAnnual();
  facade.createEmployeeWorkplanDraftV2 = (..._args) => denyDraftCreate();
  facade.saveEmployeeWorkplanDraftV2 = (..._args) => denyAnnual();
  facade.upsertCoreContributionV2 = (..._args) => denyAnnual();
  facade.upsertPersonalItemV2 = (..._args) => denyAnnual();
  facade.upsertBehaviourCommitmentV2 = (..._args) => denyAnnual();
  facade.setCoreWeightingV2 = (..._args) => denyAnnual();
  facade.submitEmployeeWorkplanV2 = (..._args) => denyAnnual();
  facade.requestEmployeeWorkplanChangesV2 = (..._args) => denyAnnual();
  facade.createEmployeeWorkplanAmendmentV2 = (..._args) => denyAnnual();
  facade.approveAndLockEmployeeWorkplanV2 = (..._args) => denyAnnual();

  if (nativeWritesHeld) {
    // Explicit typed write surface, including already-held annual routes. No adapter escapes.
    facade.saveBehaviourObjective = denyTestWrite;
    facade.setBehaviourObjectiveActive = denyTestWrite;
    facade.prepareQuarterReview = denyTestWrite;
    facade.saveQuarterReviewItem = denyTestWrite;
    facade.saveProgressEntry = denyTestWrite;
    facade.submitQuarterReview = denyTestWrite;
    facade.requestQuarterReviewChanges = denyTestWrite;
    facade.approveAndLockQuarterReview = denyTestWrite;
    facade.saveQuarterManagerOverride = denyTestWrite;
    facade.saveQuarterBehaviourAssessment = denyTestWrite;
    facade.saveEmployeeQuarterUpdateV2 = denyTestWrite;
    facade.registerEmployeeQuarterEvidenceV2 = denyTestWrite;
    facade.submitEmployeeQuarterV2 = denyTestWrite;
    facade.getOrCreateDraftWorkplan = denyTestWrite;
    facade.saveWorkplanCategoryWeights = denyTestWrite;
    facade.saveCoreWorkplanItem = denyTestWrite;
    facade.removeCoreWorkplanItem = denyTestWrite;
    facade.savePersonalWorkplanItem = denyTestWrite;
    facade.removePersonalWorkplanItem = denyTestWrite;
    facade.saveBehaviourWorkplanItem = denyTestWrite;
    facade.removeBehaviourWorkplanItem = denyTestWrite;
    facade.submitWorkplan = denyTestWrite;
    facade.requestWorkplanChanges = denyTestWrite;
    facade.approveWorkplan = denyTestWrite;
    facade.approveAndLockWorkplan = denyTestWrite;
    facade.lockApprovedWorkplan = denyTestWrite;
    facade.reopenLockedWorkplan = denyTestWrite;
    facade.openApprovedWorkplanAmendment = denyTestWrite;
    facade.createEmployeeWorkplanDraftV2 = denyTestWrite;
    facade.saveEmployeeWorkplanDraftV2 = denyTestWrite;
    facade.upsertCoreContributionV2 = denyTestWrite;
    facade.upsertPersonalItemV2 = denyTestWrite;
    facade.upsertBehaviourCommitmentV2 = denyTestWrite;
    facade.setCoreWeightingV2 = denyTestWrite;
    facade.submitEmployeeWorkplanV2 = denyTestWrite;
    facade.requestEmployeeWorkplanChangesV2 = denyTestWrite;
    facade.createEmployeeWorkplanAmendmentV2 = denyTestWrite;
    facade.approveAndLockEmployeeWorkplanV2 = denyTestWrite;
  }
  return Object.freeze(facade);
}
