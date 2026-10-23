import type { IAnnualWorkplan, IBehaviourWorkplanItem, ICoreWorkplanItem } from '../models/ProductionModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import { buildEmployeePerformanceSummary } from './EmployeePerformanceSummary';

const config = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
  quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' }, weights: { core: 70, personal: 20, behaviours: 10 },
  rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: ['DirectMetric'], retentionStatus: 'Controlled'
};

const core: ICoreWorkplanItem = {
  id: 1, etag: '"1"', workplanItemKey: 'core-1', naturalKey: 'wp|CoreGold|SO1-001', workplanKey: 'wp', personKey: 'person',
  performanceYear: 2026, kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01',
  coreWorkplanWeight: 100, employeeKpiRole: 'Contributor', displayOrder: 1, activeInWorkplan: true
};

const quarter: IQuarterReviewItem = {
  id: 1, etag: '"1"', quarterReviewItemKey: 'review|core-1', quarterReviewKey: 'review', workplanItemKey: 'core-1',
  workplanKey: 'wp', personKey: 'person', performanceYear: 2026, quarter: 'Q4', itemType: 'CoreGold', kpiId: 'SO1-001',
  wording: 'Programmes delivered', quarterTargetValue: 200, employeeActualValue: 130, progressPct: 65, scoredProgressPct: 65,
  calculatedRag: 'Amber', evidenceCount: 0, managerApproved: false, locked: false
};

const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'wp', personKey: 'person', employeeDisplayName: 'Employee',
  employeeEmail: 'employee@example.invalid', performanceYear: 2026, state: 'Locked', accessState: 'ReadOnly',
  transitionStatus: 'Ready', coreCategoryWeight: 85, personalCategoryWeight: 0,
  behaviourCategoryWeight: 15, rowVersionToken: 1
};

const behaviours: IBehaviourWorkplanItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: 10 + index, etag: '"1"', workplanItemKey: `behaviour-${index + 1}`,
  naturalKey: `wp|Behaviour|BHV-0${index + 1}`, workplanKey: 'wp', personKey: 'person',
  performanceYear: 2026, behaviourId: `BHV-0${index + 1}`,
  behaviourVersionKey: `BHV-0${index + 1}|v01`, behaviourItemWeight: 20,
  displayOrder: index + 1, activeInWorkplan: true
}));

const behaviourResults: IQuarterReviewItem[] = behaviours.map((item, index) => ({
  ...quarter, id: 10 + index, quarterReviewItemKey: `review|${item.workplanItemKey}`,
  workplanItemKey: item.workplanItemKey, itemType: 'Behaviour', wording: item.behaviourId,
  behaviourTargetRating: 3, finalBehaviourRating: index === 0 ? 4 : 3,
  progressPct: index === 0 ? 133.33 : 100, scoredProgressPct: 100, calculatedRag: 'Green'
}));

describe('employee performance summary', () => {
  it('uses employee Core Workplan weights for the rated current-quarter section result', () => {
    const result = buildEmployeePerformanceSummary([core], [], [quarter], config);
    expect(result.core).toEqual(expect.objectContaining({ state: 'Rated', progressPct: 65, rag: 'Amber' }));
    expect(result.core.explanation).toContain('employee Core Workplan');
    expect(result.core.explanation).toContain('Organisational GOLD weights are not used');
  });

  it('shows blank/unresolved section data as NotRated rather than zero', () => {
    const result = buildEmployeePerformanceSummary([core], [], [{ ...quarter, progressPct: undefined, scoredProgressPct: undefined, calculatedRag: 'NotRated' }], config);
    expect(result.core).toEqual(expect.objectContaining({ state: 'NotRated', rag: 'NotRated' }));
    expect(result.core.progressPct).toBeUndefined();
    expect(result.personal.rag).toBe('NotRated');
  });

  it('keeps Behaviour and Overall provisional when final assessments are missing', () => {
    const result = buildEmployeePerformanceSummary([core], [], [quarter], config, behaviours, workplan);
    expect(result.behaviours).toEqual(expect.objectContaining({ state: 'NotRated', rag: 'NotRated' }));
    expect(result.overall).toEqual(expect.objectContaining({ state: 'Provisional', rag: 'NotRated' }));
    expect(result.overall.progressPct).toBeUndefined();
  });

  it('does not treat Submitted category-weight proposals as approved Overall weights', () => {
    const result = buildEmployeePerformanceSummary([core], [], [quarter, ...behaviourResults], config, behaviours, {
      ...workplan, state: 'Submitted', accessState: 'ManagerDecision'
    });
    expect(result.overall).toEqual(expect.objectContaining({ state: 'NotAvailable', rag: 'NotRated' }));
    expect(result.overall.explanation).toContain('Submitted proposals are not treated as approved');
  });

  it('calculates five final Behaviour ratings and the approved category-weighted Overall result', () => {
    const result = buildEmployeePerformanceSummary([core], [], [quarter, ...behaviourResults], config, behaviours, workplan);
    expect(result.behaviours).toEqual(expect.objectContaining({ state: 'Rated', progressPct: 100, rag: 'Green' }));
    expect(result.overall).toEqual(expect.objectContaining({ state: 'Rated', progressPct: 70.25, rag: 'Amber' }));
    expect(result.overall.explanation).toContain('85/0/15');
    expect(result.overall.explanation).toContain('never enter organisational GOLD');
  });
});
