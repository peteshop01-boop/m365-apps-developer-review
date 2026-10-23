jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'workplan-018-test-guid' }) }
}));

import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem, IPersonalWorkplanItem } from '../models/ProductionModels';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import PersonalWorkplanPage from './PersonalWorkplanPage';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import CategoryWeightingPanel from './CategoryWeightingPanel';
import BehaviourObjectiveLibraryAdminPage from './BehaviourObjectiveLibraryAdminPage';

declare function require(name: string): {
  readFileSync?: (path: string, encoding: string) => string;
  resolve?: (...parts: string[]) => string;
};

const readFileSync = require('fs').readFileSync as (path: string, encoding: string) => string;
const resolve = require('path').resolve as (...parts: string[]) => string;

const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: 'Employee',
  employeeEmail: 'employee@example.test', performanceYear: 2026, managerPersonKey: 'manager', managerDisplayName: 'Manager',
  managerEmail: 'manager@example.test', state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
};

const personal: IPersonalWorkplanItem = {
  id: 1, etag: '"1"', workplanItemKey: 'personal-1', naturalKey: 'person|2026|LocalPersonal|personal-1',
  workplanKey: workplan.workplanKey, personKey: workplan.personKey, performanceYear: 2026,
  wording: 'Deliver role objective', description: 'A clear result', measure: 'Completed outcomes', measureType: 'Number',
  scoringDirection: 'HigherIsBetter', unitLabel: 'outcomes', yearEndTargetValue: 4,
  q1TargetValue: 1, q2TargetValue: 2, q3TargetValue: 3, q4TargetValue: 4,
  personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true
};

const behaviourDefinitions: IBehaviourSummary[] = [
  ['BHV-01', 'Work as One Team'], ['BHV-02', 'Improve and Move Forward'], ['BHV-03', 'Show Respect and Listen'],
  ['BHV-04', 'Bring Energy and Commitment'], ['BHV-05', 'Own It and Put It Right']
].map(([behaviourId, title], index) => ({
  behaviourId, title, behaviourVersionKey: `${behaviourId}|v01`, description: `${title} description`,
  assessmentGuidance: `CorporateValue: ${title}\nPrompt1: One\nPrompt2: Two\nPrompt3: Three\nPrompt4: Four\nPrompt5: Five`,
  defaultWorkplanWeight: 20, displayOrder: index + 1
}));

const library: IBehaviourObjectiveLibraryRecord[] = behaviourDefinitions.reduce<IBehaviourObjectiveLibraryRecord[]>((rows, definition, behaviourIndex) => [
  ...rows,
  ...Array.from({ length: 5 }, (_unused, objectiveIndex) => ({
    behaviourObjectiveKey: `${definition.behaviourId}-OBJ-0${objectiveIndex + 1}`,
    behaviourKey: definition.behaviourId as IBehaviourObjectiveLibraryRecord['behaviourKey'],
    objectiveTitle: `Observable objective ${behaviourIndex + 1}.${objectiveIndex + 1}`,
    objectiveDescription: 'Observable description', suggestedMeasure: 'Completed commitments', suggestedUnit: 'commitments',
    suggestedEvidence: 'Completion record', active: true, sortOrder: (objectiveIndex + 1) * 10
  }))
], []);

const behaviourItems: IBehaviourWorkplanItem[] = behaviourDefinitions.map((definition, index) => ({
  id: index + 1, etag: '"1"', workplanItemKey: `behaviour-${index + 1}`,
  naturalKey: `${workplan.workplanKey}|Behaviour|${definition.behaviourId}`, workplanKey: workplan.workplanKey,
  personKey: workplan.personKey, performanceYear: 2026, behaviourId: definition.behaviourId,
  behaviourVersionKey: definition.behaviourVersionKey, objectiveSource: 'Library',
  sourceObjectiveKey: library[index * 5].behaviourObjectiveKey, objectiveTitle: library[index * 5].objectiveTitle,
  objectiveDescription: library[index * 5].objectiveDescription, measure: library[index * 5].suggestedMeasure,
  unit: library[index * 5].suggestedUnit, evidenceDefinition: library[index * 5].suggestedEvidence,
  q1TargetText: 'Q1 commitment', q2TargetText: 'Q2 commitment', q3TargetText: 'Q3 commitment', q4TargetText: 'Q4 commitment',
  targetRating: 3, q1TargetRating: 3, q2TargetRating: 3, q3TargetRating: 3, q4TargetRating: 3,
  behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
}));

describe('KCF-KPI-018 employee Workplan UI', () => {
  it('renders the complete persistent Personal definition and Q1-Q4 fields', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(PersonalWorkplanPage, {
      workplan, items: [personal], saving: false, localUat: true, onSave: async () => undefined
    }));
    ['Description / objective', 'Measurement format', 'How progress improves', 'Annual Target', 'Q1 Target', 'Q2 Target', 'Q3 Target', 'Q4 Target', 'Impact item planning weight', 'Local delivery preview quarter'].forEach(label => expect(html).toContain(label));
    expect(html).toContain('Impact planning weights are not delivery scores');
    expect(html).toContain('Behaviour ratings remain standalone assessments');
  });

  it('renders five fixed Behaviour banners, hybrid selection, quarterly targets and rating/RAG preview', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(BehaviourWorkplanPage, {
      workplan, behaviours: behaviourDefinitions, library, items: behaviourItems, saving: false, localUat: true,
      onSave: async () => undefined
    }));
    behaviourDefinitions.forEach(definition => expect(html).toContain(definition.title));
    expect((html.match(/Five observable prompts \/ help/g) || [])).toHaveLength(5);
    expect((html.match(/Controlled suggestions — choose one or more/g) || [])).toHaveLength(5);
    expect((html.match(/type="checkbox"/g) || [])).toHaveLength(25);
    expect(html).toContain('My additional or alternative wording');
    expect(html).toContain('Q1 measurable commitment');
    expect(html).toContain('Q4 measurable commitment');
    expect(html).toContain('Q1 rating target');
    expect(html).toContain('Q4 rating target');
    expect(html).toContain('Not demonstrated / insufficient evidence');
    expect(html).toContain('Behaviour RAG');
  });

  it('reuses an inactive Behaviour history row when the fixed banner is restored', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(BehaviourWorkplanPage, {
      workplan, behaviours: behaviourDefinitions, library,
      items: [{ ...behaviourItems[0], activeInWorkplan: false }], saving: false, localUat: true,
      onSave: async () => undefined
    }));
    expect(html).toContain('<strong>OBJ-01</strong>Observable objective 1.1');
    expect(html).toMatch(/data-behaviour-suggestion="BHV-01-OBJ-01"[^>]*checked=""/);
  });

  it('does not hard-code or import the Behaviour Objective seed in React', () => {
    const source = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'components', 'BehaviourWorkplanPage.tsx'), 'utf8');
    expect(source).not.toMatch(/BehaviourObjectiveLibrarySeed|BEHAVIOUR_OBJECTIVE_LIBRARY_SEED/);
    expect(source).toContain('<BehaviourLibrarySelector');
    expect(source).toContain('library={library}');
  });

  it('shows category guardrails, zero-Personal dependency and manager-approval readiness', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(CategoryWeightingPanel, {
      weights: { core: 85, personal: 0, behaviours: 15 }, workplanState: 'Draft', editable: true, localUat: true,
      activePersonalKpiCount: 0, reason: 'No Personal objectives this year.', simulatedApproval: false
    }));
    expect(html).toContain('Core');
    expect(html).toContain('permitted 60–90%');
    expect(html).toContain('No active Impact KPIs');
    expect(html).toContain('Manager approval is still required');
    expect(html).toContain('Simulate manager/Admin approval locally');
  });

  it('provides usable local Admin library CRUD without raw SharePoint editing', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(BehaviourObjectiveLibraryAdminPage, {
      records: library, localUat: true, onChange: () => undefined
    }));
    ['Add objective', 'Objective title', 'Suggested measure', 'Suggested evidence', 'Save objective', 'Move up', 'Move down', 'Deactivate'].forEach(label => expect(html).toContain(label));
    expect(html).toContain('NO SHAREPOINT WRITES');
  });

  it('keeps the KCF-KPI-018 local UAT harness disconnected from SharePoint services', () => {
    const source = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'components', 'LocalWorkplanUatHarness.tsx'), 'utf8');
    expect(source).toContain('NO LIVE CHANGES');
    expect(source).toContain('Admin library');
    expect(source).not.toMatch(/SharePointProductionDataService|SPHttpClient|postJson|mergeJson/);
  });
});
