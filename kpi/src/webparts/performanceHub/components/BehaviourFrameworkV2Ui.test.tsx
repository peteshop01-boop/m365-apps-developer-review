import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMServer from 'react-dom/server';
import { act } from 'react-dom/test-utils';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION,
  type BehaviourLibraryV2SourceRoleLevel, type IBehaviourAnnualSnapshotV2,
  type IBehaviourLibraryV2SourceRow } from '../models/BehaviourFrameworkV2Models';
import type { IAnnualWorkplan, IBehaviourWorkplanItem, IManagerWorkplanReviewContext,
  IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import type { IManagerQuarterReviewContext, IQuarterLifecycle, IQuarterReview,
  IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import { BEHAVIOUR_V2_RATING_OPTIONS, createBehaviourPeriodSnapshotV2 } from '../services/BehaviourFrameworkV2Policy';
import { mapBehaviourLibraryV2SourceRow } from '../services/BehaviourLibraryV2Catalogue';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import { BehaviourBuilder, type IBehaviourChoice } from './IntegratedPerformanceHub';
import ManagerQuarterReviewPanel from './ManagerQuarterReviewPanel';
import ManagerReviewPage from './ManagerReviewPage';
import QuarterlyReviewPage from './QuarterlyReviewPage';
import { behaviourFrameworkV2TestCatalogue as focusCatalogue } from '../testing/BehaviourFrameworkV2TestData';

const valueIds = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const;
const annualSnapshot = (index: number): IBehaviourAnnualSnapshotV2 => ({
  frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId: valueIds[index],
  valueTitle: `Synthetic Value ${index + 1}`, corporateValue: `Synthetic Corporate Value ${index + 1}`,
  roleTier: 'IC_OFFICER', descriptor: `SYNTHETIC TEST ONLY descriptor ${index + 1}`,
  cadence: 'Quarterly', periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'],
  ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS
});
const workplan: IAnnualWorkplan = {
  id: 1, etag: '"workplan-1"', workplanKey: 'PERSON-001|2027', personKey: 'PERSON-001',
  employeeDisplayName: 'Synthetic Employee', employeeEmail: 'employee@example.invalid', performanceYear: 2027,
  managerPersonKey: 'PERSON-002', managerDisplayName: 'Synthetic Manager', managerEmail: 'manager@example.invalid',
  state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'Ready', transitionCorrelationKey: 'approval-2027-1', coreCategoryWeight: 70,
  personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 5
};
const annualItems: IBehaviourWorkplanItem[] = valueIds.map((valueId, index) => ({
  id: index + 1, etag: `"behaviour-${index + 1}"`, workplanItemKey: `BEHAVIOUR-${index + 1}`,
  naturalKey: `${workplan.workplanKey}|Behaviour|${valueId}`, workplanKey: workplan.workplanKey,
  personKey: workplan.personKey, performanceYear: workplan.performanceYear, behaviourId: valueId,
  behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION, behaviourSnapshotV2: annualSnapshot(index),
  behaviourCommitmentV2: `Synthetic annual commitment ${index + 1}`,
  behaviourPeriodCommitmentsV2: { Q1: 'Synthetic Q1', Q2: 'Synthetic Q2', Q3: 'Synthetic Q3', Q4: 'Synthetic Q4' },
  displayOrder: index + 1, activeInWorkplan: true
}));
const person: IProductionPerson = {
  id: 1, personKey: workplan.personKey, displayName: workplan.employeeDisplayName, email: workplan.employeeEmail,
  managerPersonKey: workplan.managerPersonKey, managerEmail: workplan.managerEmail,
  appRoles: ['Employee'], active: true, behaviourFrameworkVersionV2: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourRoleTierV2: 'IC_OFFICER', behaviourCadenceV2: 'Quarterly'
};
const manager: IProductionPerson = { id: 2, personKey: 'PERSON-002', displayName: 'Synthetic Manager',
  email: 'manager@example.invalid', appRoles: ['Employee', 'Manager'], active: true };
const choices: IBehaviourChoice[] = annualItems.map(item => ({
  behaviourId: item.behaviourId, selectedSuggestionKeys: [], commitment: item.behaviourCommitmentV2 || '',
  q1: 'Synthetic Q1', q2: 'Synthetic Q2', q3: 'Synthetic Q3', q4: 'Synthetic Q4', h1: '', h2: '',
  frameworkVersion: item.behaviourSnapshotV2?.frameworkVersion, roleTier: item.behaviourSnapshotV2?.roleTier,
  cadence: item.behaviourSnapshotV2?.cadence, descriptor: item.behaviourSnapshotV2?.descriptor
}));
const lifecycle = { performanceYearNumber: 2027, quarterKey: 'Q1', quarterName: 'Quarter 1', quarterStart: '2027-01-01',
  quarterEnd: '2027-03-31', employeeSubmissionDeadline: '2027-04-07', managerReviewDeadline: '2027-04-14',
  status: 'Finalising', isOpenForProgressUpdates: true } as unknown as IQuarterLifecycle;
const review = (managerMode = false): IQuarterReview => ({
  id: 1, etag: '"review-1"', quarterReviewKey: 'PERSON-001|2027|Q1', workplanKey: workplan.workplanKey,
  personKey: person.personKey, employeeDisplayName: person.displayName, employeeEmail: person.email,
  performanceYear: 2027, quarter: 'Q1', managerPersonKey: manager.personKey,
  managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: managerMode ? 'Submitted' : 'Draft', accessState: managerMode ? 'ManagerDecision' : 'EmployeeEdit',
  transitionStatus: 'Ready', rowVersionToken: 2, behaviourFrameworkVersionV2: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourRoleTierV2: 'IC_OFFICER', behaviourCadenceV2: 'Quarterly'
});
const quarterItems: IQuarterReviewItem[] = annualItems.map((item, index) => ({
  id: index + 1, etag: `"quarter-item-${index + 1}"`, quarterReviewItemKey: `Q1|${item.workplanItemKey}`,
  quarterReviewKey: 'PERSON-001|2027|Q1', workplanItemKey: item.workplanItemKey,
  workplanKey: workplan.workplanKey, personKey: person.personKey, performanceYear: 2027, quarter: 'Q1',
  itemType: 'Behaviour', wording: item.behaviourSnapshotV2!.valueTitle,
  quarterTargetText: item.behaviourPeriodCommitmentsV2?.Q1,
  behaviourId: item.behaviourId, behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourSnapshotV2: createBehaviourPeriodSnapshotV2(item.behaviourSnapshotV2!, 'Q1'),
  employeeBehaviourEvidenceV2: 'Synthetic employee evidence', employeeBehaviourAssessmentV2: 2,
  evidenceCount: 0, calculatedRag: 'NotRated', managerApproved: false, locked: false
}));
const config = { performanceYearNumber: 2027, rag: { greenThreshold: 1, amberThreshold: 0.8 } } as IProductionConfig;

const librarySourceRow = (role: BehaviourLibraryV2SourceRoleLevel): IBehaviourLibraryV2SourceRow => {
  const roleName = role === 'L1' ? 'Synthetic IC officer'
    : role === 'L2' ? 'Synthetic people manager' : 'Synthetic senior leader';
  const objectiveTitle = `Synthetic BHV-01 ${role} suggestion 01`;
  return {
    BehaviourObjectiveKey: `BHV-01-${role}-01`, BehaviourKey: 'BHV-01',
    BehaviourTitle: 'Synthetic Value 1', CorporateValue: 'SYNTHETIC TEST ONLY',
    RoleLevelCode: role, RoleLevelName: roleName, DropdownLabel: `[${roleName}] ${objectiveTitle}`,
    ObjectiveTitle: objectiveTitle, ObjectiveDescription: 'SYNTHETIC TEST ONLY suggestion.',
    SuggestedMeasure: 'Synthetic measure', SuggestedUnit: 'Synthetic unit',
    SuggestedEvidence: 'Synthetic evidence', Active: true, SortOrder: 1,
    EffectiveFrom: '2099-01-01', EffectiveTo: null
  };
};
const libraryMetadata = { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  published: true, productionSafe: true, synthetic: false } as const;

describe('mounted KCCC Behaviour v02 surfaces', () => {
  it('renders annual categorical choices and quarter read-only approved Annual Target provenance', () => {
    const plannedItems: IBehaviourWorkplanItem[] = annualItems.map((item, index) => index === 0 ? { ...item,
      behaviourPlanningLevelsV1: { contractVersion: 'BHV-LEVELS|v01' as const,
        currentLevel: 'Developing' as const, targetLevel: 'Exceptional' as const,
        targetJustification: 'Agreed full-year stretch' } } : item);
    const plannedChoices = choices.map((choice, index) => index === 0 ? { ...choice,
      planningLevels: plannedItems[0].behaviourPlanningLevelsV1 } : choice);
    const annualHtml = ReactDOMServer.renderToStaticMarkup(<BehaviourBuilder choices={plannedChoices}
      objectives={[]} person={person} focusCatalogue={focusCatalogue}
      behaviourLibraryAsOf={new Date('2026-11-01T12:00:00Z')} onChange={() => undefined} />);
    expect((annualHtml.match(/data-behaviour-planning=/g) || [])).toHaveLength(5);
    expect(annualHtml).toContain('Current Level');
    expect(annualHtml).toContain('Target Level justification');
    const quarterContext: IQuarterReviewContext = { lifecycle, review: review(), employee: person, manager,
      coreCatalogue: [], behaviours: [], items: quarterItems.map((item, index) => index === 0 ? {
        ...item, behaviourAnnualTargetLevelV2: 'Exceptional',
        behaviourAnnualTargetJustificationV2: 'Agreed full-year stretch',
        behaviourAnnualTargetSourceWorkplanItemKeyV2: item.workplanItemKey,
        behaviourAnnualTargetSourceEtagV2: '"annual-approved"',
        behaviourAnnualTargetSourceWorkplanVersionV2: workplan.rowVersionToken,
        behaviourAnnualTargetSourceApprovalKeyV2: workplan.transitionCorrelationKey
      } : item), progressLedgers: [], evidence: [], auditEvents: [],
      readiness: { ready: false, blockers: [], warnings: [], coreComplete: 0, personalComplete: 0, behavioursComplete: 5 },
      dataFoundationReady: true, messages: [] };
    const quarterHtml = ReactDOMServer.renderToStaticMarkup(<QuarterlyReviewPage workplan={workplan}
      annualBehaviourItems={plannedItems} config={config} lifecycles={[lifecycle]} selectedQuarter="Q1"
      context={quarterContext} loading={false} saving={false} onSelectQuarter={async () => undefined}
      onPrepare={async () => undefined} onSaveItem={async () => undefined}
      onAddProgress={async () => undefined} onSubmit={async () => undefined} />);
    expect(quarterHtml).toContain('full-year Target Level Exceptional');
    expect(quarterHtml).toContain('source ETag');
    expect(quarterHtml).toContain('unavailable for this historic row');
    expect(quarterHtml).toContain('Quarterly Current/Actual: Effective');
    expect(quarterHtml).toContain('Below the full-year Annual Target Level');
    expect(quarterHtml).not.toContain('Quarterly Target Level');
    for (const patch of [
      { behaviourAnnualTargetSourceEtagV2: undefined },
      { behaviourAnnualTargetSourceWorkplanItemKeyV2: 'crossed' },
      { behaviourAnnualTargetSourceWorkplanVersionV2: -1 },
      { behaviourAnnualTargetLevelV2: 'Unknown' },
      { behaviourAnnualTargetSourceApprovalKeyV2: ' ' }
    ]) {
      const unavailableContext = { ...quarterContext, items: quarterContext.items.map((item, index) =>
        index === 0 ? { ...item, ...patch } as IQuarterReviewItem : item) };
      const html = ReactDOMServer.renderToStaticMarkup(<QuarterlyReviewPage workplan={workplan}
        config={config} lifecycles={[lifecycle]} selectedQuarter="Q1" context={unavailableContext}
        loading={false} saving={false} onSelectQuarter={async () => undefined} onPrepare={async () => undefined}
        onSaveItem={async () => undefined} onAddProgress={async () => undefined} onSubmit={async () => undefined} />);
      expect(html).toContain('unavailable for this historic row');
      expect(html).not.toContain('Frozen approved Workplan');
      expect(html).not.toContain('Below the full-year Annual Target Level');
      expect(html).not.toContain('At or above the full-year Annual Target Level');
      expect(html).toContain('progress cannot be compared');
    }
  });
  it('fails closed when only the superseded objective library is supplied without a receipted focus catalogue', () => {
    const library = (['L1', 'L2', 'L3'] as const).map(role => mapBehaviourLibraryV2SourceRow(
      librarySourceRow(role), libraryMetadata));
    const currentChoices = choices.map((choice, index) => index === 0 ? {
      ...choice, selectedSuggestionKeys: ['BHV-01-L2-01'], commitment: 'Synthetic custom commitment',
      descriptor: 'SYNTHETIC TEST ONLY governed descriptor'
    } : choice);
    let changed: IBehaviourChoice[] | undefined;
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      act(() => { ReactDOM.render(<BehaviourBuilder choices={currentChoices} objectives={library}
        person={person} behaviourLibraryAsOf={new Date('2099-01-01T12:00:00.000Z')}
        onChange={next => { changed = next; }} />, host); });
      expect(host.querySelector('[data-behaviour-v2-unavailable="true"]')).not.toBeNull();
      expect(host.querySelectorAll('[data-behaviour-suggestion], [data-focus-choice]')).toHaveLength(0);
      expect(changed).toBeUndefined();
    } finally {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      host.remove();
    }
  });

  it('does not allow an objective-library synthetic contradiction to stand in for a focus publication', () => {
    const contradictory = { ...libraryMetadata, synthetic: true };
    const library = (['L1', 'L2', 'L3'] as const).map(role => mapBehaviourLibraryV2SourceRow(
      librarySourceRow(role), contradictory));
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      act(() => { ReactDOM.render(<BehaviourBuilder choices={choices} objectives={library}
        person={person} behaviourLibraryAsOf={new Date('2099-01-01T12:00:00.000Z')}
        onChange={() => undefined} />, host); });
      expect(host.querySelector('[data-behaviour-v2-unavailable="true"]')).not.toBeNull();
      expect(host.querySelectorAll('[data-behaviour-suggestion], [data-focus-choice]')).toHaveLength(0);
      expect(host.textContent).not.toContain('Synthetic BHV-01 L1 suggestion 01');
    } finally {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      host.remove();
    }
  });

  it('renders five employee Value cards with governed descriptors and label-first no-score guidance', () => {
    const builder = ReactDOMServer.renderToStaticMarkup(<BehaviourBuilder choices={choices} objectives={[]}
      person={person} focusCatalogue={focusCatalogue} behaviourLibraryAsOf={new Date('2026-11-01T12:00:00Z')}
      onChange={() => undefined} />);
    expect((builder.match(/data-headline-behaviour=/g) || [])).toHaveLength(5);
    expect((builder.match(/data-focus-choice=/g) || [])).toHaveLength(25);
    expect(builder).not.toContain('data-focus-choice="BHV-01-L2-01"');
    expect(builder).toContain('Normally about 3–5 overall. This is guidance, not a hard cap.');
    expect(builder).toContain('WRITE MY OWN BEHAVIOUR COMMITMENT');
    expect(builder).not.toMatch(/Target rating|Behaviour weight|Behaviour RAG|normalised score/i);

    const annual = ReactDOMServer.renderToStaticMarkup(<BehaviourWorkplanPage workplan={workplan}
      behaviours={[]} library={[]} items={annualItems} saving={false} onSave={async () => undefined} />);
    expect((annual.match(/data-behaviour-v2-value=/g) || [])).toHaveLength(5);
    expect(annual).toContain('Stored immutable framework KCCC-BEHAVIOUR|v02');
    expect(annual).not.toMatch(/Target rating|Behaviour weight|Behaviour RAG|normalised score/i);

    const managerContext: IManagerWorkplanReviewContext = { workplan, employee: person, manager,
      coreCatalogue: [], coreItems: [], personalItems: [], behaviours: [], behaviourItems: annualItems,
      readiness: { ready: false, core: 'complete', personal: 'complete', behaviours: 'complete', blockers: [] },
      auditEvents: [] };
    const managerAnnual = ReactDOMServer.renderToStaticMarkup(<ManagerReviewPage contexts={[managerContext]}
      quarterContexts={[]} saving={false} onRequestChanges={async () => undefined}
      onApproveAndLock={async () => undefined} onRequestQuarterChanges={async () => undefined}
      onApproveAndLockQuarter={async () => undefined} onOverrideQuarterRag={async () => undefined}
      onAssessQuarterBehaviour={async () => undefined} />);
    expect(managerAnnual).toContain('Unweighted in KCCC-BEHAVIOUR|v02');
    expect(managerAnnual).not.toContain('70% Core · 20% Personal · 10% Behaviours');
  });

  it('renders five quarterly employee and manager cards with separate owner evidence/assessments', () => {
    const context: IQuarterReviewContext = { lifecycle, review: review(), employee: person, manager,
      coreCatalogue: [], behaviours: [], items: quarterItems, progressLedgers: [], evidence: [], auditEvents: [],
      readiness: { ready: false, blockers: [], warnings: [], coreComplete: 0, personalComplete: 0, behavioursComplete: 5 },
      dataFoundationReady: true, messages: [] };
    const employeeHtml = ReactDOMServer.renderToStaticMarkup(<QuarterlyReviewPage workplan={workplan} config={config}
      lifecycles={[lifecycle]} selectedQuarter="Q1" context={context} loading={false} saving={false}
      onSelectQuarter={async () => undefined} onPrepare={async () => undefined} onSaveItem={async () => undefined}
      onAddProgress={async () => undefined} onSubmit={async () => undefined} />);
    expect((employeeHtml.match(/data-behaviour-v2-value=/g) || [])).toHaveLength(5);
    expect(employeeHtml).toContain('Employee evidence');
    expect(employeeHtml).toContain('2 Effective');
    expect(employeeHtml).not.toMatch(/Employee Behaviour RAG|Target rating|normalised score/i);

    const managerContext: IManagerQuarterReviewContext = { lifecycle, review: review(true), employee: person,
      manager, items: quarterItems, evidence: [], auditEvents: [], readiness: context.readiness,
      dataFoundationReady: true, messages: [] };
    const managerHtml = ReactDOMServer.renderToStaticMarkup(<ManagerQuarterReviewPanel contexts={[managerContext]}
      saving={false} onRequestChanges={async () => undefined} onApproveAndLock={async () => undefined}
      onOverrideRag={async () => undefined} onAssessBehaviour={async () => undefined} />);
    expect((managerHtml.match(/data-behaviour-v2-value=/g) || [])).toHaveLength(5);
    expect(managerHtml).toContain('Manager evidence');
    expect(managerHtml).toContain('Agreed/final evidence');
    expect(managerHtml).not.toMatch(/Target rating|Behaviour RAG|normalised score/i);
  });
});
