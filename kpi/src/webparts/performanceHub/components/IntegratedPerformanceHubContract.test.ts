import { resolveIntegratedComponentLayout } from './IntegratedPerformanceHub';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;

describe('KCF-KPI-026 integrated product contract', () => {
  const component = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'components', 'IntegratedPerformanceHub.tsx'), 'utf8');
  const webpart = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'PerformanceHubWebPart.ts'), 'utf8');
  const r2Contract = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'services', 'IntegratedPerformanceHubR2Contract.ts'), 'utf8');

  test('contains the one-shell navigation and employee builder contract', () => {
    ['Employee', 'Build My Workplan', 'My Workplan', 'My Team', 'Reviews Awaiting Me', 'Employee Review', 'Quarterly Review',
      'People', 'Teams', 'KPI Master', 'Annual Targets', 'Behaviour Library', 'Config', 'Reporting Map', 'Output Definitions',
      'Strategic Core Coverage', 'History & Audit', 'Data Quality', 'Reporting Readiness', 'GOLD / organisation reporting', 'CWOP / CWSP',
      'Core KPIs', 'Personal KPIs', 'Behaviours', 'Review & Weight'].forEach(label => expect(component).toContain(label));
  });

  test('uses the three plain-language Core roles and omits technical contribution controls', () => {
    expect(component).toContain('I OWN THIS');
    expect(component).toContain('I DELIVER THIS');
    expect(component).toContain('I SUPPORT / OVERSEE THIS');
    expect(component).toContain('I ALSO DIRECTLY CONTRIBUTE');
    expect(component).not.toContain('Contribution method');
    expect(component).not.toContain('basis points');
  });

  test('wires accepted non-Behaviour Employee and Manager services without preview callbacks', () => {
    ['getEmployeeWorkplanV2', 'saveEmployeeWorkplanDraftV2', 'upsertCoreContributionV2',
      'upsertPersonalItemV2', 'setCoreWeightingV2', 'submitEmployeeWorkplanV2',
      'requestEmployeeWorkplanChangesV2', 'approveAndLockEmployeeWorkplanV2', 'saveEmployeeQuarterUpdateV2', 'submitEmployeeQuarterV2',
      'requestQuarterReviewChanges', 'approveAndLockQuarterReview'].forEach(method => expect(component).toContain(`.${method}(`));
    // Start remains unavailable until physical private Draft/protected Workplan admission is evidenced.
    expect(component).not.toContain('.createEmployeeWorkplanDraftV2(');
    ['getOrCreateDraftWorkplan', 'saveCoreWorkplanItem', 'savePersonalWorkplanItem', 'saveBehaviourWorkplanItem', 'submitWorkplan',
      'requestWorkplanChanges', 'approveAndLockWorkplan', 'saveQuarterReviewItem', 'submitQuarterReview']
      .forEach(method => expect(component).not.toContain(`.${method}(`));
    expect(component).toContain('.upsertBehaviourCommitmentV2(');
    expect(component).toContain('getBehaviourV2SavePreflightIssues(behaviours, user, true)');
    expect(component).not.toContain('in this preview');
    expect(component).not.toContain('peterView');
    expect(component).not.toContain("currentUserEmail.trim().toLowerCase() === 'person003@example.invalid'");
    expect(component).toContain('getDirectReports');
    expect(component).toContain('getAdminFoundationEntitlement');
    expect(component).toContain('hasExistingWorkplan(overview.workplanStatus)');
    expect(component).not.toContain('if (!noWorkplan(overview.workplanStatus)');
  });

  test('uses the integrated SPFx entry without a hidden candidate parameter', () => {
    expect(webpart).toContain('React.createElement<IIntegratedPerformanceHubProps>(IntegratedPerformanceHub');
    expect(webpart).not.toContain("import PerformanceHub from './components/PerformanceHub'");
    expect(webpart).not.toContain("parameters.get('kcfKpi026Integrated')");
    expect(webpart).not.toContain("parameters.get('kcfKpi026Candidate')");
  });

  test('does not claim placeholder readiness or hard-code 109 NOT_READY coverage rows', () => {
    expect(component).not.toContain('You can choose up to 40');
    expect(component).toContain('configuredBehaviours');
    expect(component).toContain('<StrategicCoreCoveragePage');
    expect(component).not.toContain("state: row.annualTarget === undefined ? 'NOT READY' : 'NOT READY'");
    expect(r2Contract).toContain('No confirmed current Reporting Map memberships are configured.');
    expect(r2Contract).toContain('No approved or published Official Actuals are available.');
  });

  test('classifies actual SharePoint component widths without treating static CSS as rendered acceptance', () => {
    expect(resolveIntegratedComponentLayout(1280)).toBe('wide');
    expect(resolveIntegratedComponentLayout(785)).toBe('compact');
    expect(resolveIntegratedComponentLayout(390)).toBe('phone');
    expect(resolveIntegratedComponentLayout(320)).toBe('small-phone');
  });
});
