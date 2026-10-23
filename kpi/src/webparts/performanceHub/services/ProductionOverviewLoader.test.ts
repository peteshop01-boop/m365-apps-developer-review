import type { IProductionDataService } from './IProductionDataService';
import type { IEmployeeWorkplanV2PersistenceService } from './IEmployeeWorkplanV2PersistenceService';
import type { IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import { loadProductionOverview } from './ProductionOverviewLoader';

const syntheticUser: IProductionPerson = {
  id: 1,
  personKey: 'de8fc527-fa58-4b8a-ae63-818822015746',
  displayName: 'Synthetic Person 02',
  email: 'person003@example.invalid',
  managerEmail: 'person002@example.invalid',
  appRoles: ['Employee'],
  active: true
};

const config: IProductionConfig = {
  performanceYear: '2025/26',
  performanceYearStart: '2025-11-01T00:00:00Z',
  performanceYearEnd: '2026-10-31T00:00:00Z',
  performanceYearNumber: 2026,
  quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 },
  rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: ['DirectMetric', 'Additive', 'WeightedContribution', 'Composite', 'Milestone', 'AccountableOwner'],
  retentionStatus: 'TBC'
};

describe('Production Overview loader', () => {
  it('resolves signed-in syntheticUser and evaluates live-shape reference results without any write method', async () => {
    const requestedEmails: string[] = [];
    const service: IProductionDataService = {
      ...({} as IEmployeeWorkplanV2PersistenceService),
      getPersonByEmail: async email => {
        requestedEmails.push(email);
        return email === syntheticUser.email ? syntheticUser : undefined;
      },
      getDirectReports: async () => [],
      getAdminPeople: async () => [],
      getAdminTeams: async () => [],
      getAdminConfigRecords: async () => [],
      getAuthoritativeAdminEventHistoryCapability: async () => ({
        actorEmail: 'admin@example.invalid',
        personKey: 'ADMIN-001',
        authorisationSource: 'AuthoritativePeopleReadback'
      }),
      getAuthoritativeAdminKpiRemediationQueueCapability: async performanceYear => ({
        actorEmail: 'admin@example.invalid',
        personKey: 'ADMIN-001',
        performanceYear,
        issueCount: 0,
        sourceList: 'KCFKPI_KPIMaster',
        authorisationSource: 'AuthoritativeKpiDataQualityReadback'
      }),
      getProductionConfig: async () => config,
      getReferenceCounts: async year => {
        expect(year).toBe(2026);
        return { activeKpis: 0, approvedAnnualTargets: 0, publishedBehaviours: 0 };
      },
      getWorkplanStatus: async (personKey, year) => {
        expect(personKey).toBe(syntheticUser.personKey);
        expect(year).toBe(2026);
        return 'Not started';
      },
      getOrCreateDraftWorkplan: async () => { throw new Error('Not used by the Overview loader'); },
      saveWorkplanCategoryWeights: async () => { throw new Error('Not used by the Overview loader'); },
      getCoreKpiCatalogue: async () => [],
      getCoreWorkplanItems: async () => [],
      saveCoreWorkplanItem: async () => { throw new Error('Not used by the Overview loader'); },
      removeCoreWorkplanItem: async () => undefined,
      getPublishedBehaviours: async () => [],
      getPersonalWorkplanItems: async () => [],
      savePersonalWorkplanItem: async () => { throw new Error('Not used by the Overview loader'); },
      removePersonalWorkplanItem: async () => undefined,
      getBehaviourWorkplanItems: async () => [],
      saveBehaviourWorkplanItem: async () => { throw new Error('Not used by the Overview loader'); },
      removeBehaviourWorkplanItem: async () => undefined,
      getBehaviourObjectiveLibrary: async () => [],
      saveBehaviourObjective: async () => { throw new Error('Not used by the Overview loader'); },
      setBehaviourObjectiveActive: async () => { throw new Error('Not used by the Overview loader'); },
      submitWorkplan: async () => { throw new Error('Not used by the Overview loader'); },
      getManagerReviewContexts: async () => [],
      requestWorkplanChanges: async () => { throw new Error('Not used by the Overview loader'); },
      approveWorkplan: async () => { throw new Error('Not used by the Overview loader'); },
      approveAndLockWorkplan: async () => { throw new Error('Not used by the Overview loader'); },
      getQuarterTimingConfig: async () => { throw new Error('Not used by the Overview loader'); },
      getManagerQuarterReviewContexts: async () => { throw new Error('Not used by the Overview loader'); },
      getQuarterReviewContext: async () => { throw new Error('Not used by the Overview loader'); },
      prepareQuarterReview: async () => { throw new Error('Not used by the Overview loader'); },
      saveQuarterReviewItem: async () => { throw new Error('Not used by the Overview loader'); },
      saveProgressEntry: async () => { throw new Error('Not used by the Overview loader'); },
      submitQuarterReview: async () => { throw new Error('Not used by the Overview loader'); },
      requestQuarterReviewChanges: async () => { throw new Error('Not used by the Overview loader'); },
      approveAndLockQuarterReview: async () => { throw new Error('Not used by the Overview loader'); },
      saveQuarterManagerOverride: async () => { throw new Error('Not used by the Overview loader'); },
      saveQuarterBehaviourAssessment: async () => { throw new Error('Not used by the Overview loader'); }
    };

    const overview = await loadProductionOverview(service, syntheticUser.email);
    expect(requestedEmails).toEqual([syntheticUser.email, syntheticUser.managerEmail]);
    expect(overview.employee?.displayName).toBe('Synthetic Person 02');
    expect(overview.manager).toBeUndefined();
    expect(overview.config?.performanceYear).toBe('2025/26');
    expect(overview.workplanStatus).toBe('Not started');
    expect(overview.readiness.ready).toBe(false);
  });
});
