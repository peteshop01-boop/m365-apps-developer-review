import * as BehaviourDefinitionsApi from './AdminBehaviourDefinitionsDomain';
import {
  ADMIN_BEHAVIOUR_DEFINITION_COUNT,
  ADMIN_BEHAVIOUR_GUIDANCE_PROMPT_COUNT,
  type IAdminBehaviourDefinitionRecord,
  type IAdminBehaviourDefinitionsUatState,
  createBehaviourDefinitionsUatState,
  createBehaviourDefinitionRevisionSafeUat,
  editBehaviourDefinitionSafeUat,
  inspectBehaviourDefinitions,
  setBehaviourDefinitionActiveSafeUat
} from './AdminBehaviourDefinitionsDomain';

const context = {
  actorEmail: 'admin.uat@example.invalid',
  occurredAt: '2026-08-22T11:00:00.000Z'
};

const prompts = (behaviourNumber: number): string[] => [
  'What outcome demonstrates Behaviour ' + behaviourNumber + '?',
  'What evidence will be retained for Behaviour ' + behaviourNumber + '?',
  'Who benefits from Behaviour ' + behaviourNumber + '?',
  'When will Behaviour ' + behaviourNumber + ' be reviewed?',
  'What support is needed for Behaviour ' + behaviourNumber + '?'
];

const makeDefinitions = (): IAdminBehaviourDefinitionRecord[] => {
  const definitions: IAdminBehaviourDefinitionRecord[] = [];
  for (let index = 1; index <= 5; index += 1) {
    definitions.push({
      id: index,
      behaviourId: 'BEH-' + index,
      behaviourVersionKey: 'BEH-' + index + '-2026-v1',
      title: 'Synthetic Behaviour ' + index,
      description: 'Signed synthetic description ' + index,
      guidancePrompts: prompts(index),
      active: true,
      published: true,
      isCurrent: true,
      modifiedAt: '2026-08-01T09:00:00.000Z',
      modifiedBy: 'control@example.invalid'
    });
  }
  return definitions;
};

describe('KCF-KPI-020B Behaviour Definition Admin pure domain', () => {
  it('requires exactly five fixed Behaviours with exactly five prompts each', () => {
    const result = inspectBehaviourDefinitions(makeDefinitions());

    expect(ADMIN_BEHAVIOUR_DEFINITION_COUNT).toBe(5);
    expect(ADMIN_BEHAVIOUR_GUIDANCE_PROMPT_COUNT).toBe(5);
    expect(result).toEqual({
      expectedDefinitionCount: 5,
      definitionCount: 5,
      expectedPromptsPerDefinition: 5,
      totalGuidancePromptCount: 25,
      valid: true,
      issues: []
    });
  });

  it('rejects missing definitions, prompt count drift, blank/duplicate prompts and duplicate identities', () => {
    const records = makeDefinitions().slice(0, 4);
    records[1] = {
      ...records[1],
      behaviourId: records[0].behaviourId,
      behaviourVersionKey: records[0].behaviourVersionKey,
      guidancePrompts: ['One', 'One', '', 'Four']
    };

    const result = inspectBehaviourDefinitions(records);

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('exactly five fixed definitions');
    expect(result.issues.join(' ')).toContain('Exactly five guidance prompts');
    expect(result.issues.join(' ')).toContain('must be distinct');
    expect(result.issues.join(' ')).toContain('is blank');
    expect(result.issues.join(' ')).toContain('is duplicated');
  });

  it('loads empty or invalid live baselines for fail-closed diagnostics while keeping mutations strict', () => {
    const emptyState = createBehaviourDefinitionsUatState([]);
    const invalidSource: IAdminBehaviourDefinitionRecord[] = [{
      ...makeDefinitions()[0],
      guidancePrompts: ['Only one prompt']
    }];
    const before = JSON.stringify(invalidSource);
    const invalidState = createBehaviourDefinitionsUatState(invalidSource);

    expect(emptyState.records).toEqual([]);
    expect(inspectBehaviourDefinitions(emptyState.records)).toMatchObject({
      definitionCount: 0,
      valid: false
    });
    expect(invalidState.records).toHaveLength(1);
    expect(inspectBehaviourDefinitions(invalidState.records).valid).toBe(false);
    expect(() => createBehaviourDefinitionRevisionSafeUat(
      invalidState,
      'BEH-1',
      'BEH-1-2026-v2',
      {},
      context
    )).toThrow('Exactly five guidance prompts');
    expect(JSON.stringify(invalidSource)).toBe(before);
  });

  it('creates a non-current draft revision while retaining the current published definition unchanged', () => {
    const source = makeDefinitions();
    const before = JSON.stringify(source);
    const state = createBehaviourDefinitionsUatState(source);
    const replacementPrompts = [
      'Updated prompt 1',
      'Updated prompt 2',
      'Updated prompt 3',
      'Updated prompt 4',
      'Updated prompt 5'
    ];

    const changed = createBehaviourDefinitionRevisionSafeUat(state, 'BEH-1', 'BEH-1-2026-v2', {
      title: 'Controlled Behaviour wording',
      description: 'Controlled Behaviour description',
      guidancePrompts: replacementPrompts
    }, context);

    const publishedCurrent = changed.records.filter(record => record.behaviourId === 'BEH-1'
      && record.isCurrent && record.published)[0];
    const revision = changed.records.filter(record => record.behaviourVersionKey === 'BEH-1-2026-v2')[0];
    expect(publishedCurrent).toEqual(source[0]);
    expect(publishedCurrent).toMatchObject({
      behaviourVersionKey: 'BEH-1-2026-v1',
      title: 'Synthetic Behaviour 1',
      active: true,
      published: true,
      isCurrent: true
    });
    expect(revision).toMatchObject({
      behaviourId: 'BEH-1',
      behaviourVersionKey: 'BEH-1-2026-v2',
      title: 'Controlled Behaviour wording',
      description: 'Controlled Behaviour description',
      guidancePrompts: replacementPrompts,
      active: false,
      published: false,
      isCurrent: false,
      modifiedBy: context.actorEmail,
      modifiedAt: context.occurredAt
    });
    expect(changed.audit[0]).toMatchObject({
      action: 'BehaviourDefinitionRevisionCreated',
      behaviourId: 'BEH-1',
      actorEmail: context.actorEmail
    });
    expect(changed.records).toHaveLength(6);
    expect(inspectBehaviourDefinitions(changed.records)).toMatchObject({
      definitionCount: 5,
      totalGuidancePromptCount: 25,
      valid: true,
      issues: []
    });
    expect(JSON.stringify(source)).toBe(before);
  });

  it('does not treat the general state control as a draft publish transition', () => {
    const original = makeDefinitions();
    const state = createBehaviourDefinitionRevisionSafeUat(
      createBehaviourDefinitionsUatState(original),
      'BEH-1',
      'BEH-1-2026-v2',
      {},
      context
    );

    expect(state.records).toHaveLength(6);
    expect(state.audit.map(event => event.action)).toEqual(['BehaviourDefinitionRevisionCreated']);
    expect(() => setBehaviourDefinitionActiveSafeUat(state, 'BEH-1', false, false, context))
      .toThrow('Published Behaviour state is immutable');
    expect(state.records.filter(record => record.behaviourVersionKey === 'BEH-1-2026-v2')[0])
      .toMatchObject({ active: false, published: false, isCurrent: false });
    expect(state.records.filter(record => record.behaviourVersionKey === 'BEH-1-2026-v1')[0])
      .toEqual(original[0]);
  });

  it('rejects an unpublished draft that attempts to masquerade as current', () => {
    const records = makeDefinitions().concat([{
      ...makeDefinitions()[0],
      id: 6,
      behaviourVersionKey: 'BEH-1-2026-v2',
      active: false,
      published: false,
      isCurrent: true
    }]);

    const result = inspectBehaviourDefinitions(records);

    expect(result.definitionCount).toBe(5);
    expect(result.totalGuidancePromptCount).toBe(25);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('unpublished Behaviour draft cannot be marked as current');
  });

  it('blocks in-place published edits and rejects draft revisions that break the five-prompt contract', () => {
    const state = createBehaviourDefinitionsUatState(makeDefinitions());

    expect(() => editBehaviourDefinitionSafeUat(state, 'BEH-2', {
      title: 'Attempted in-place published edit'
    }, context)).toThrow('Published Behaviour wording is immutable');
    expect(() => createBehaviourDefinitionRevisionSafeUat(state, 'BEH-2', 'BEH-2-2026-v2', {
      guidancePrompts: ['Only one prompt']
    }, context)).toThrow('Exactly five guidance prompts');
  });

  it('offers no add/delete history-rewriting API and blocks a forged persistence boundary', () => {
    const exported = Object.keys(BehaviourDefinitionsApi).map(key => key.toLowerCase());
    expect(exported.filter(key => key.indexOf('delete') >= 0 || key.indexOf('addbehaviour') >= 0)).toEqual([]);
    const safe = createBehaviourDefinitionsUatState(makeDefinitions());
    const forged = { ...safe, persistence: 'SharePoint' } as unknown as IAdminBehaviourDefinitionsUatState;

    expect(() => setBehaviourDefinitionActiveSafeUat(forged, 'BEH-1', false, false, context))
      .toThrow('safe local UAT boundary');
  });
});
