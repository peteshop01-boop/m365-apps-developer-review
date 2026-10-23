import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem, ICoreWorkplanItem, IPersonalWorkplanItem } from '../models/ProductionModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_PLANNING_LEVELS_VERSION,
  type BehaviourV2ValueId } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { encodeBehaviourSelectionSnapshotsV2, BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA }
  from './BehaviourSelectionSnapshotsV2';
import {
  evaluateAnnualSubmissionReadiness,
  evaluateControlledSubmissionReadiness,
  type ISlice02AnnualWorkplan,
  validateBehaviourAssignments,
  validatePersonalItems,
  validateSlice02CoreControls
} from './AnnualWorkplanValidation';

const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: 'Synthetic Person 02',
  employeeEmail: 'person003@example.invalid', performanceYear: 2026, state: 'Draft', accessState: 'EmployeeEdit',
  transitionStatus: 'Ready', coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
};

const personal = (weight = 100): IPersonalWorkplanItem => ({
  id: 2, etag: '"1"', workplanItemKey: 'personal-1', naturalKey: 'person|2026|LocalPersonal|personal-1',
  workplanKey: 'person|2026', personKey: 'person', performanceYear: 2026, wording: 'Deliver annual programme',
  description: 'Deliver four documented programme milestones during the performance year.',
  measure: 'Completed milestones', measureType: 'Count', scoringDirection: 'HigherIsBetter',
  yearEndTargetValue: 4, q1TargetValue: 1, q2TargetValue: 2, q3TargetValue: 3, q4TargetValue: 4,
  unitLabel: 'milestones', personalItemWeight: weight,
  displayOrder: 1, activeInWorkplan: true
});

const definitions: IBehaviourSummary[] = Array.from({ length: 5 }, (_, index) => ({
  behaviourId: `BHV-0${index + 1}`, behaviourVersionKey: `BHV-0${index + 1}|v01`, title: `Behaviour ${index + 1}`,
  description: 'Approved wording', defaultWorkplanWeight: 20, displayOrder: index + 1
}));

const behaviourItems: IBehaviourWorkplanItem[] = definitions.map((definition, index) => ({
  id: index + 10, etag: '"1"', workplanItemKey: `behaviour-${index + 1}`,
  naturalKey: `person|2026|Behaviour|${definition.behaviourId}`, workplanKey: 'person|2026', personKey: 'person',
  performanceYear: 2026, behaviourId: definition.behaviourId, behaviourVersionKey: definition.behaviourVersionKey,
  objectiveSource: 'Library', sourceObjectiveKey: `${definition.behaviourId}-OBJ-01`,
  objectiveTitle: `Objective for ${definition.behaviourId}`,
  objectiveDescription: 'A complete observable objective copied into this annual Workplan.',
  measure: 'Completed agreed actions to the required standard and date.', unit: 'actions',
  evidenceDefinition: 'Action plan, completed output and confirmation from a relevant colleague.',
  q1TargetText: 'Complete the agreed Q1 commitment.', q2TargetText: 'Complete the agreed Q2 commitment.',
  q3TargetText: 'Complete the agreed Q3 commitment.', q4TargetText: 'Complete the agreed Q4 commitment.',
  targetRating: 3, q1TargetRating: 3, q2TargetRating: 3, q3TargetRating: 3, q4TargetRating: 3,
  behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
}));

const emptySelectionProvenance = (valueId: BehaviourV2ValueId): Pick<IBehaviourWorkplanItem,
  'behaviourSelectionSnapshotsV2' | 'behaviourSelectionSnapshotsSha256' | 'behaviourSelectionSnapshotsUtf8ByteLength'> => {
  const envelope = { schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA,
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId, selections: [] };
  const encoded = encodeBehaviourSelectionSnapshotsV2(envelope);
  return { behaviourSelectionSnapshotsV2: envelope,
    behaviourSelectionSnapshotsSha256: encoded.sha256,
    behaviourSelectionSnapshotsUtf8ByteLength: encoded.utf8ByteLength };
};
const behaviourItemsV2: IBehaviourWorkplanItem[] = definitions.map((definition, index) => ({
  id: index + 20, etag: '"v2"', workplanItemKey: `behaviour-v2-${index + 1}`,
  naturalKey: `person|2026|Behaviour|${definition.behaviourId}`, workplanKey: 'person|2026', personKey: 'person',
  performanceYear: 2026, behaviourId: definition.behaviourId,
  behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourSnapshotV2: { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    valueId: definition.behaviourId as BehaviourV2ValueId, valueTitle: definition.title,
    corporateValue: `Corporate ${index + 1}`, roleTier: 'IC_OFFICER', descriptor: `Descriptor ${index + 1}`,
    cadence: 'Quarterly', periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'], ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS },
  behaviourCommitmentV2: `Annual commitment ${index + 1}`,
  behaviourPeriodCommitmentsV2: { Q1: 'Q1 commitment', Q2: 'Q2 commitment', Q3: 'Q3 commitment', Q4: 'Q4 commitment' },
  ...emptySelectionProvenance(definition.behaviourId as BehaviourV2ValueId),
  selectedSuggestionKeys: [], displayOrder: index + 1, activeInWorkplan: true
}));

const core: ICoreWorkplanItem = {
  id: 1, etag: '"1"', workplanItemKey: 'core-1', naturalKey: 'person|2026|CoreGold|SO1-001', workplanKey: 'person|2026',
  personKey: 'person', performanceYear: 2026, kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01',
  targetVersionKey: 'SO1-001|2026|v01', coreWorkplanWeight: 100, employeeKpiRole: 'Contributor', displayOrder: 1,
  activeInWorkplan: true
};

const employee = {
  id: 1, personKey: 'person', displayName: 'Synthetic Person 02', email: 'person003@example.invalid',
  managerPersonKey: 'manager', managerEmail: 'person002@example.invalid', appRoles: ['Employee'], active: true
};

const manager = {
  id: 2, personKey: 'manager', displayName: 'Synthetic Person 01', email: 'person002@example.invalid', appRoles: ['Employee'], active: true
};

const config = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
  quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: ['DirectMetric'], retentionStatus: 'TBC'
};

const coreCatalogue = [{
  kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01',
  wording: 'Increase participation', pillar: 'Pillar', workstream: 'Workstream', scoringDirection: 'TBC', unitLabel: 'TBC'
}];

describe('Annual Workplan validation', () => {
  it('validates complete Personal fields and their separate 100% weighting', () => {
    expect(validatePersonalItems([personal()])).toEqual(expect.objectContaining({ state: 'complete', total: 100 }));
    expect(validatePersonalItems([personal(80)])).toEqual(expect.objectContaining({ state: 'incomplete', total: 80 }));
    expect(validatePersonalItems([{ ...personal(), measure: '', yearEndTargetValue: undefined }]).state).toBe('invalid');
    const sixItems = Array.from({ length: 6 }, (_, index) => ({ ...personal(100 / 6), id: index + 1, naturalKey: `person|2026|LocalPersonal|${index + 1}` }));
    expect(validatePersonalItems(sixItems).messages).toContain('A maximum of 5 Personal KPIs is allowed.');
  });

  it('requires five current Behaviour versions at a total of 100%', () => {
    expect(validateBehaviourAssignments(definitions, behaviourItems)).toEqual(expect.objectContaining({ state: 'complete', total: 100 }));
    expect(validateBehaviourAssignments(definitions, behaviourItems.slice(0, 4)).state).toBe('invalid');
    expect(validateBehaviourAssignments(definitions, [{ ...behaviourItems[0], behaviourVersionKey: 'retired|v01' }, ...behaviourItems.slice(1)]).state).toBe('invalid');
  });

  it('accepts exactly five unweighted v02 snapshots and applies PD-01 Delivery weights without Behaviour arithmetic', () => {
    expect(validateBehaviourAssignments(definitions, behaviourItemsV2))
      .toEqual(expect.objectContaining({ state: 'complete', total: 0 }));
    const mixedLabels = behaviourItemsV2.map((item, index) => index === 0 ? {
      ...item, behaviourSnapshotV2: { ...item.behaviourSnapshotV2!, ratingOptions: [] }
    } : item);
    expect(validateBehaviourAssignments(definitions, mixedLabels).state).toBe('invalid');
    expect(validateBehaviourAssignments(definitions, [{ ...behaviourItemsV2[0], behaviourItemWeight: 20 },
      ...behaviourItemsV2.slice(1)]).state).toBe('invalid');
    const v2Employee = { ...employee, behaviourFrameworkVersionV2: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      behaviourRoleTierV2: 'IC_OFFICER' as const, behaviourCadenceV2: 'Quarterly' as const };
    const controlled = evaluateControlledSubmissionReadiness({ workplan: {
      ...workplan, managerPersonKey: manager.personKey, managerEmail: manager.email,
      deliveryCategoryWeights: { core: 70, impact: 30 }
    } as ISlice02AnnualWorkplan, employee: v2Employee, manager, config, coreCatalogue, coreItems: [core], personalItems: [personal()],
    behaviours: definitions, behaviourItems: behaviourItemsV2 });
    expect(controlled.ready).toBe(true);
    expect(controlled.blockers.join(' ')).not.toMatch(/Behaviour category weight|70\/20\/10/);
    expect(evaluateControlledSubmissionReadiness({ workplan: {
      ...workplan, managerPersonKey: manager.personKey, managerEmail: manager.email
    }, employee: v2Employee, manager, config, coreCatalogue, coreItems: [core], personalItems: [personal()],
    behaviours: definitions, behaviourItems: behaviourItemsV2 }).blockers)
      .toContain('The current governed Core/Impact Delivery configuration is missing.');
  });

  it('retains empty AWP-030 levels and rejects crossed saved v02 selection provenance', () => {
    expect(validateBehaviourAssignments(definitions, behaviourItemsV2).state).toBe('complete');
    const withLevels = behaviourItemsV2.map((item, index) => index === 0
      ? { ...item, behaviourPlanningLevelsV1: { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
        currentLevel: 'Developing' as const, targetLevel: 'Effective' as const } } : item);
    expect(validateBehaviourAssignments(definitions, withLevels).state).toBe('complete');
    const wrongDigest = withLevels.map((item, index) => index === 0
      ? { ...item, behaviourSelectionSnapshotsSha256: 'F'.repeat(64) } : item);
    expect(validateBehaviourAssignments(definitions, wrongDigest).state).toBe('invalid');
  });

  it('requires deliberate Equal or Custom Core weighting and separate role/method selections for slice 02', () => {
    const sliceItem = {
      ...core,
      contributionMethod: 'SharedTarget' as const
    };
    expect(validateSlice02CoreControls([sliceItem], 'Equal')).toEqual(expect.objectContaining({
      state: 'complete', total: 100, messages: []
    }));
    expect(validateSlice02CoreControls([
      { ...sliceItem, kpiId: 'SO1-001', coreWorkplanWeight: 60, displayOrder: 1 },
      { ...sliceItem, id: 2, kpiId: 'SO1-002', naturalKey: 'person|2026|CoreGold|SO1-002', coreWorkplanWeight: 40, displayOrder: 2 }
    ], 'Equal').messages).toContain('Equal weighting must use the deterministic equal split for every selected Core KPI.');
    expect(validateSlice02CoreControls([{ ...sliceItem, contributionMethod: undefined }], 'Custom').messages)
      .toContain('SO1-001 needs an approved contribution method selected separately from role.');
  });

  it('reports cross-section blockers without submitting or changing the Draft', () => {
    expect(evaluateAnnualSubmissionReadiness(workplan, [core], [personal()], definitions, behaviourItems)).toEqual(expect.objectContaining({ ready: true, core: 'complete', personal: 'complete', behaviours: 'complete' }));
    const blocked = evaluateAnnualSubmissionReadiness(workplan, [], [personal(50)], definitions, []);
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toEqual(expect.arrayContaining(['Select at least one Core Strategy KPI.', 'Personal KPI weights must total 100% before submission.', 'Assign all 5 Behaviours before submission.']));
  });

  it('requires validated employee, manager, year, category and referenced Core data for controlled submission', () => {
    const context = { workplan: { ...workplan, managerPersonKey: manager.personKey, managerEmail: manager.email }, employee, manager, config, coreCatalogue, coreItems: [core], personalItems: [personal()], behaviours: definitions, behaviourItems };
    expect(evaluateControlledSubmissionReadiness(context)).toEqual(expect.objectContaining({ ready: true }));
    expect(evaluateControlledSubmissionReadiness({ ...context, manager: undefined }).ready).toBe(false);
    expect(evaluateControlledSubmissionReadiness({ ...context, coreItems: [{ ...core, employeeKpiRole: undefined }] }).blockers).toContain('SO1-001 needs an approved KPI relationship role.');
  });

  it('uses a captured configurable Core/Impact snapshot and rejects invalid totals without changing inputs', () => {
    const sliceCore = Object.freeze({ ...core, contributionMethod: 'AdditiveDirect' as const });
    const sliceWorkplan: ISlice02AnnualWorkplan = Object.freeze({
      ...workplan,
      managerPersonKey: manager.personKey,
      managerEmail: manager.email,
      coreWeightingMode: 'Custom' as const,
      deliveryCategoryWeights: Object.freeze({ core: 65, impact: 35 }),
      categoryWeightReason: 'Approved governed configuration.'
    });
    const sliceEmployee = { ...employee, behaviourFrameworkVersionV2: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      behaviourRoleTierV2: 'IC_OFFICER' as const, behaviourCadenceV2: 'Quarterly' as const };
    const context = { workplan: sliceWorkplan, employee: sliceEmployee, manager, config, coreCatalogue, coreItems: [sliceCore],
      personalItems: [personal()], behaviours: definitions, behaviourItems: behaviourItemsV2 };
    const before = JSON.stringify(context);
    expect(evaluateControlledSubmissionReadiness(context).ready).toBe(true);
    expect(JSON.stringify(context)).toBe(before);
    const invalid = evaluateControlledSubmissionReadiness({
      ...context,
      workplan: { ...sliceWorkplan, deliveryCategoryWeights: { core: 65, impact: 34 } } as ISlice02AnnualWorkplan
    });
    expect(invalid.ready).toBe(false);
    expect(invalid.blockers).toContain('Core and Impact category weights must total exactly 100%.');
  });
});
