import type { IAnnualWorkplan, IBehaviourWorkplanItem } from '../models/ProductionModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import {
  getLegacySubmittedAnnualBehaviourCompatibility,
  getLegacySubmittedQuarterBehaviourCompatibility
} from './LegacySubmittedBehaviourCompatibility';

const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: 'Employee',
  employeeEmail: 'employee@example.test', performanceYear: 2026, managerPersonKey: 'manager', managerDisplayName: 'Manager',
  managerEmail: 'manager@example.test', state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
};

const annualItems = (): IBehaviourWorkplanItem[] => Array.from({ length: 5 }, (_, index) => ({
  id: index + 1, etag: '"1"', workplanItemKey: `behaviour-${index + 1}`,
  naturalKey: `${workplan.workplanKey}|Behaviour|BHV-0${index + 1}`, workplanKey: workplan.workplanKey,
  personKey: workplan.personKey, performanceYear: 2026, behaviourId: `BHV-0${index + 1}`,
  behaviourVersionKey: `BHV-0${index + 1}|v01`, behaviourItemWeight: 20, displayOrder: index + 1,
  activeInWorkplan: true
}));

const completeAnnual = (item: IBehaviourWorkplanItem): IBehaviourWorkplanItem => ({
  ...item, objectiveTitle: 'Current objective', objectiveDescription: 'Current description', measure: 'Observable delivery',
  unit: 'commitments', evidenceDefinition: 'Quarterly evidence', q1TargetText: 'Q1', q2TargetText: 'Q2',
  q3TargetText: 'Q3', q4TargetText: 'Q4', q1TargetRating: 3, q2TargetRating: 3, q3TargetRating: 3, q4TargetRating: 3
});

const quarterItems = (): IQuarterReviewItem[] => annualItems().map((item, index) => ({
  id: index + 1, etag: '"1"', quarterReviewItemKey: `review|${item.behaviourId}`,
  quarterReviewKey: 'person|2026|Q4', workplanItemKey: item.workplanItemKey, workplanKey: item.workplanKey,
  personKey: item.personKey, performanceYear: 2026, quarter: 'Q4', itemType: 'Behaviour',
  wording: item.behaviourId, calculatedRag: 'NotRated', evidenceCount: 0, behaviourId: item.behaviourId,
  behaviourVersionKey: item.behaviourVersionKey, managerApproved: false, locked: false
}));

describe('legacy Submitted Behaviour compatibility', () => {
  it('classifies five assigned legacy headings without treating them as complete or inferring data', () => {
    const items = annualItems();
    const before = JSON.stringify(items);
    const result = getLegacySubmittedAnnualBehaviourCompatibility(workplan, items);

    expect(result).toEqual(expect.objectContaining({
      activeHeadingCount: 5,
      completeObjectiveCount: 0,
      headingStatus: '5 of 5 headings assigned · 0 of 5 current objectives complete',
      completionSummary: 'Submitted legacy framework · update required'
    }));
    expect(result?.annualNotice).toContain('no missing objective, target or approval evidence has been inferred');
    expect(result?.managerAction).toContain('Only the genuinely authenticated assigned manager may use Request Changes');
    expect(JSON.stringify(items)).toBe(before);
  });

  it('does not apply to editable or complete current-framework Workplans', () => {
    expect(getLegacySubmittedAnnualBehaviourCompatibility({ ...workplan, state: 'Draft' }, annualItems())).toBeUndefined();
    expect(getLegacySubmittedAnnualBehaviourCompatibility(workplan, annualItems().map(completeAnnual))).toBeUndefined();
  });

  it('classifies an incomplete quarterly snapshot without changing readiness or inventing assessments', () => {
    const items = quarterItems();
    const result = getLegacySubmittedQuarterBehaviourCompatibility(workplan, items);
    expect(result?.quarterlyNotice).toContain('Quarterly Behaviour readiness remains blocked');
    expect(result?.quarterlyNotice).toContain('No missing target or assessment has been inferred');
    expect(items.every(item => item.employeeBehaviourRating === undefined)).toBe(true);
  });
});
