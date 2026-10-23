import * as React from 'react';
import * as ReactDOM from 'react-dom';
import IntegratedPerformanceHub from '../components/IntegratedPerformanceHub';
import { localMethods, localLibrary, localDefinitions, integratedConfig, integratedTiming } from './BehaviourLibraryLocalHarness';
import type { IProductionPerson } from '../models/ProductionModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import { buildDecisionReportingDataset } from '../test/ReportingDecisionFixtures';

// This entry exists only in the synthetic local preview bundle. It is never imported by the production webpart.
const previewRole = new URLSearchParams(window.location.search).get('role');
const previewRoles = previewRole === 'board' ? ['BoardReadOnly']
  : previewRole === 'employee' ? ['Employee']
    : previewRole === 'invalid' ? ['UnexpectedRole']
      : ['Employee', 'Manager', 'SeniorManagerAdmin'];
const previewActor: IProductionPerson = {
  id: -40, personKey: 'synthetic', displayName: `Synthetic ${previewRole || 'Admin'} Actor`, email: 'employee@example.invalid',
  managerPersonKey: 'synthetic-manager', managerEmail: 'manager@example.invalid', active: true,
  appRoles: previewRoles
};
const previewManager: IProductionPerson = {
  id: -41, personKey: 'synthetic-manager', displayName: 'Synthetic Manager', email: 'manager@example.invalid',
  active: true, appRoles: ['Manager']
};
const previewReport: IProductionPerson = {
  id: -42, personKey: 'synthetic-report', displayName: 'Synthetic Direct Report', email: 'report@example.invalid',
  managerPersonKey: previewActor.personKey, managerEmail: previewActor.email, active: true, appRoles: ['Employee']
};

const previewMethods = {
  ...localMethods,
  getWorkplanStatus: async () => 'NotStarted',
  getEmployeeWorkplanV2: async () => undefined,
  getPersonByEmail: async (email: string) => email === previewActor.email ? previewActor
    : email === previewManager.email ? previewManager : email === previewReport.email ? previewReport : undefined,
  getDirectReports: async () => [previewReport],
  getAdminPeople: async () => [previewActor, previewManager, previewReport],
  getAdminTeams: async () => [],
  getAdminConfigRecords: async () => [],
  getManagerReviewContexts: async () => [],
  getManagerQuarterReviewContexts: async () => [],
  getQuarterTimingConfig: async () => integratedTiming,
  getProductionConfig: async () => integratedConfig,
  getBehaviourObjectiveLibrary: async () => localLibrary,
  getPublishedBehaviours: async () => localDefinitions,
  saveEmployeeWorkplanDraftV2: async () => { throw new Error('LOCAL PREVIEW: writes are disabled'); }
};

const dataService = new Proxy(previewMethods, { get(target, key: string) {
  // The local fixture has synthetic receipt methods. Never expose them as successful writes.
  if (/^(create|save|set|upsert|remove|submit|approve|request|register|lock|reopen|openApproved)/.test(key)) {
    return async () => { throw new Error('LOCAL PREVIEW: writes are disabled'); };
  }
  if (key in target) return target[key as keyof typeof target];
  return async () => { throw new Error(`NOT YET INTEGRATED: local preview adapter has no ${key} contract`); };
} }) as unknown as IProductionDataService;
const reportingService = {
  getAdminReportingControlSnapshot: async () => { throw new Error('NOT YET INTEGRATED: governed reporting snapshot is unavailable locally'); }
} as IAdminReportingControlDataService;

export function mountUnifiedLocalPreview(host: HTMLElement): void {
  const reportingUnavailable = new URLSearchParams(window.location.search).get('reporting') === 'unavailable';
  const roleLabel = document.getElementById('preview-role');
  if (roleLabel) roleLabel.textContent = `Synthetic actor roles: ${previewRoles.join(', ')}`;
  ReactDOM.render(<IntegratedPerformanceHub dataService={dataService} adminReportingDataService={reportingService}
    currentUserEmail={previewActor.email} userDisplayName={previewActor.displayName}
    localSyntheticReportingDataset={reportingUnavailable ? undefined : buildDecisionReportingDataset()}
    behaviourLibraryAsOf={new Date('2026-11-01T12:00:00Z')} />, host);
}
