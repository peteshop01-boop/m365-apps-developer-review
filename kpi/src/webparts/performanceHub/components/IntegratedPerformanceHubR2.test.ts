import { buildIntegratedKpis, integratedReferenceCounts } from '../services/IntegratedReferenceData';
import {
  getConfirmedCoverageMembershipOptions,
  getIntegratedReportingReadinessReasons,
  integratedEmployeeCommandKey,
  resolveIntegratedContributionMethod
} from '../services/IntegratedPerformanceHubR2Contract';
import type { IAdminReportingControlSnapshot } from '../services/AdminReportingControlDataService';
import type { IAdminConfigSourceRecord } from '../services/AdminConfigDomain';
import { auditIntegratedRenderedLayout, resolveIntegratedComponentLayout } from './IntegratedPerformanceHub';

export {};

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;
const component = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'components', 'IntegratedPerformanceHub.tsx'), 'utf8');
const webpart = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'PerformanceHubWebPart.ts'), 'utf8');
const employeeV2Service = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'services', 'SharePointEmployeeWorkplanV2PersistenceService.ts'), 'utf8');

const reporting = (overrides: Partial<IAdminReportingControlSnapshot> = {}): IAdminReportingControlSnapshot => ({
  mode: 'ProductionReadOnly', performanceYear: 2026, loadedAt: '2026-08-24T10:00:00Z', kpis: [], annualTargets: [],
  behaviourDefinitions: [], organisationalWeights: [], reportingMaps: [], outputDefinitions: [], officialResults: [],
  auditEvents: [], auditReadRequest: {} as IAdminReportingControlSnapshot['auditReadRequest'], warnings: [], ...overrides
});

describe('KCF-KPI-026-R2 focused unified P1 repairs', () => {
  test('P1-1 retains the exact canonical 109 / 7 / 28 catalogue baseline; mounted R3 tests own interaction acceptance', () => {
    expect(integratedReferenceCounts(buildIntegratedKpis(2026))).toMatchObject({ kpis: 109, pillars: 7, workstreams: 28 });
  });

  test('P1-2 binds settled Employee save, submit, approved readback and quarter updates to 027A', () => {
    ['getEmployeeWorkplanV2', 'saveEmployeeWorkplanDraftV2', 'upsertCoreContributionV2',
      'upsertPersonalItemV2', 'setCoreWeightingV2',
      'submitEmployeeWorkplanV2', 'getEmployeeQuarterV2', 'saveEmployeeQuarterUpdateV2',
      'submitEmployeeQuarterV2'].forEach(method => expect(component).toContain(`dataService.${method}(`));
    ['saveCoreWorkplanItem', 'savePersonalWorkplanItem', 'saveBehaviourWorkplanItem',
      'submitWorkplan', 'saveQuarterReviewItem', 'submitQuarterReview']
      .forEach(method => expect(component).not.toContain(`dataService.${method}(`));
    expect(component).toContain('dataService.upsertBehaviourCommitmentV2(');
    expect(component).toContain('Behaviour preflight failed before the first command');
    expect(component).toContain('canonical Employee V2 readback');
  });

  test('P1-2 command identity is deterministic for retry and changes at a new canonical version', () => {
    const first = integratedEmployeeCommandKey('person011@example.invalid', 'wp-1', 4, 'save', '{"value":1}');
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(integratedEmployeeCommandKey('person011@example.invalid', 'wp-1', 4, 'save', '{"value":1}')).toBe(first);
    expect(integratedEmployeeCommandKey('person011@example.invalid', 'wp-1', 5, 'save', '{"value":1}')).not.toBe(first);
  });

  test('P1-2 preserves governed Shared/Weighted methods and derives plain-language roles safely', () => {
    expect(resolveIntegratedContributionMethod('Delivery', undefined)).toBe('AdditiveDirect');
    expect(resolveIntegratedContributionMethod('Owner', false)).toBe('AccountableOwner');
    expect(resolveIntegratedContributionMethod('Owner', true)).toBe('AdditiveDirect');
    expect(resolveIntegratedContributionMethod('Delivery', undefined, 'SharedTarget')).toBe('SharedTarget');
    expect(resolveIntegratedContributionMethod('Support', undefined, 'WeightedDenominator')).toBe('WeightedDenominator');
  });

  test('P1-2 reads back contribution governance needed for lossless amendment', () => {
    ['SharedTargetRule', 'SharedApportionmentPercent', 'ContributionGovernanceReference',
      'DenominatorNumerator', 'DenominatorValue', 'DenominatorUnit',
      'DenominatorRuleReference', 'DenominatorSourceReference']
      .forEach(field => expect(employeeV2Service).toContain(`'${field}'`));
    expect(employeeV2Service).toContain('sharedTargetRule: row.SharedTargetRule');
    expect(employeeV2Service).toContain('denominatorSourceReference: row.DenominatorSourceReference');
  });

  test('P1-3 uses real Manager annual services and has no Synthetic User/navigation preview override', () => {
    expect(component).toContain('requestEmployeeWorkplanChangesV2');
    expect(component).toContain('approveAndLockEmployeeWorkplanV2');
    expect(component).toContain('getDirectReports');
    expect(component).not.toMatch(/peterView|Synthetic User\.Synthetic User|in this preview/i);
  });

  test('P1-4 gates Admin reads and navigation through the governed role entitlement', () => {
    expect(component).toContain('getAdminFoundationEntitlement(employee.appRoles).entitled');
    expect(component).toContain('adminEntitlement.showAdminNavigation');
    expect(component).not.toMatch(/currentUserEmail[^\n]+Synthetic User/i);
  });

  test('P1-5 remains fail-closed without a server-authorised RPT-005 projection', () => {
    expect(component).toContain('the authorised server-side RPT-005 contribution projection is not available');
    expect(component).toContain('<StrategicCoreCoveragePage');
    expect(component).not.toMatch(/<StrategicCoreCoveragePage[\s\S]{0,150}\sfeed=/);
    expect(component).not.toContain("state: row.annualTarget === undefined ? 'NOT READY' : 'NOT READY'");
  });

  test('P1-5 exposes only confirmed current memberships and never activates future EDI', () => {
    const snapshot = reporting({ reportingMaps: [
      { outputCode: 'CORE_CWOP', active: true, approvalStatus: 'Approved' },
      { outputCode: 'CWSP', active: true, approvalStatus: 'Draft' },
      { outputCode: 'EDI_CWOP', active: true, approvalStatus: 'Approved' }
    ] as unknown as IAdminReportingControlSnapshot['reportingMaps'] });
    expect(getConfirmedCoverageMembershipOptions(snapshot)).toEqual([{ key: 'CORE_CWOP', label: 'CORE CWOP', enabled: true }]);
  });
});

describe('KCF-KPI-026-R2 focused unified P2 repairs', () => {
  test('P2-1 classifies the exact desktop-component, 390px and 320px widths', () => {
    expect([785, 390, 320].map(resolveIntegratedComponentLayout)).toEqual(['compact', 'phone', 'small-phone']);
  });

  test('P2-2 audits rendered containment and target rectangles rather than accepting CSS source text', () => {
    const root = document.createElement('div');
    const button = document.createElement('button');
    root.appendChild(button);
    Object.defineProperty(root, 'clientWidth', { value: 390 });
    Object.defineProperty(root, 'scrollWidth', { value: 390 });
    jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({ width: 44, height: 44 } as DOMRect);
    expect(auditIntegratedRenderedLayout(root)).toMatchObject({ horizontalOverflow: 0, interactiveTargets: 1, undersizedTargets: 0 });
  });

  test('P2-3 reporting readiness fails truthfully on memberships, Actuals and configuration', () => {
    const reasons = getIntegratedReportingReadinessReasons({ kpis: 109, targets: 5, memberships: 0, officialActuals: 0 }, reporting(), []);
    expect(reasons).toContain('No confirmed current Reporting Map memberships are configured.');
    expect(reasons).toContain('No approved or published Official Actuals are available.');
    expect(reasons).toContain('No approved reporting output definitions are configured.');
    expect(reasons).toContain('Required current-year application configuration could not be confirmed.');
  });

  test('P2-3 can report ready only when every governed readiness source is present', () => {
    const complete = reporting({ outputDefinitions: [{}] as unknown as IAdminReportingControlSnapshot['outputDefinitions'] });
    expect(getIntegratedReportingReadinessReasons(
      { kpis: 109, targets: 5, memberships: 4, officialActuals: 3 }, complete, [{}] as IAdminConfigSourceRecord[]
    )).toEqual([]);
  });

  test('P2-4 uses the integrated SPFx entry without a hidden candidate parameter', () => {
    expect(webpart).toContain('React.createElement<IIntegratedPerformanceHubProps>(IntegratedPerformanceHub');
    expect(webpart).not.toContain("import PerformanceHub from './components/PerformanceHub'");
    expect(webpart).not.toMatch(/parameters\.get\('kcfKpi026/i);
    expect(component).toContain('KCF-KPI-026-R3-RENDERED-DEFECT-REPAIR');
  });
});
