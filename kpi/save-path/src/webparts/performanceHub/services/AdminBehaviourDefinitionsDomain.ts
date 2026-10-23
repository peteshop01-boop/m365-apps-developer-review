import type {
  BehaviourV2RoleTier,
  IBehaviourFrameworkV2PublishedSet,
  IBehaviourV2RatingOption
} from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';
import { inspectPublishedBehaviourFrameworkV2 } from './BehaviourFrameworkV2Policy';

export const ADMIN_BEHAVIOUR_DEFINITION_COUNT = 5;
export const ADMIN_BEHAVIOUR_GUIDANCE_PROMPT_COUNT = 5;

export interface IAdminBehaviourDefinitionRecord {
  id: number;
  behaviourId: string;
  behaviourVersionKey: string;
  title: string;
  description: string;
  guidancePrompts: readonly string[];
  active: boolean;
  published: boolean;
  isCurrent: boolean;
  modifiedAt: string;
  modifiedBy: string;
}

export interface IAdminBehaviourDefinitionEdit {
  title?: string;
  description?: string;
  guidancePrompts?: readonly string[];
}

export interface IAdminBehaviourDefinitionInspection {
  expectedDefinitionCount: number;
  definitionCount: number;
  expectedPromptsPerDefinition: number;
  totalGuidancePromptCount: number;
  valid: boolean;
  issues: readonly string[];
}

export interface IAdminBehaviourFrameworkV2Record {
  frameworkVersion: string;
  behaviourId: string;
  title: string;
  corporateValue: string;
  tierDescriptors: Readonly<Record<BehaviourV2RoleTier, string>>;
  published: boolean;
  immutable: boolean;
}

export const inspectAdminBehaviourFrameworkV2Set = (
  records: readonly IAdminBehaviourFrameworkV2Record[],
  ratingOptions: readonly IBehaviourV2RatingOption[]
): IAdminBehaviourDefinitionInspection => {
  const published = records.filter(record => record.published);
  const set = {
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    published: true,
    immutable: true,
    ratingOptions,
    values: published.map(record => ({
      frameworkVersion: record.frameworkVersion,
      valueId: record.behaviourId,
      title: record.title,
      corporateValue: record.corporateValue,
      descriptors: record.tierDescriptors
    }))
  } as IBehaviourFrameworkV2PublishedSet;
  const inspection = inspectPublishedBehaviourFrameworkV2(set);
  const recordStateIssues = published.filter(record => !record.immutable
    || record.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION)
    .map(record => `${record.behaviourId || 'Unknown Value'} must be immutable and share DEMO-BEHAVIOUR|v02.`);
  const issues = [...inspection.errors, ...recordStateIssues];
  return { expectedDefinitionCount: 5, definitionCount: published.length,
    expectedPromptsPerDefinition: 0, totalGuidancePromptCount: 0,
    valid: issues.length === 0, issues };
};

export interface IAdminBehaviourDefinitionUatContext {
  actorEmail: string;
  occurredAt: string;
}

export interface IAdminBehaviourDefinitionUatAuditEvent {
  sequence: number;
  action: 'BehaviourDefinitionEdited' | 'BehaviourDefinitionRevisionCreated' | 'BehaviourDefinitionStateChanged';
  behaviourId: string;
  behaviourVersionKey: string;
  actorEmail: string;
  occurredAt: string;
  beforeJson: string;
  afterJson: string;
}

export interface IAdminBehaviourDefinitionsUatState {
  mode: 'SafeLocalUat';
  sourceList: 'DEMOAPP_Behaviours';
  persistence: 'BrowserMemoryOnly';
  fixedDefinitionCount: 5;
  records: readonly IAdminBehaviourDefinitionRecord[];
  audit: readonly IAdminBehaviourDefinitionUatAuditEvent[];
}

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();

const cleanPrompts = (prompts: readonly string[]): string[] => prompts.map(prompt => clean(prompt));

const cloneRecord = (record: IAdminBehaviourDefinitionRecord): IAdminBehaviourDefinitionRecord => ({
  ...record,
  guidancePrompts: record.guidancePrompts.slice()
});

const recordIssues = (record: IAdminBehaviourDefinitionRecord): string[] => {
  const issues: string[] = [];
  if (!clean(record.behaviourId)) issues.push('Behaviour ID is required.');
  if (!clean(record.behaviourVersionKey)) issues.push('Behaviour Version Key is required.');
  if (!clean(record.title)) issues.push('Behaviour title is required.');
  if (!clean(record.description)) issues.push('Behaviour description is required.');
  if (record.guidancePrompts.length !== ADMIN_BEHAVIOUR_GUIDANCE_PROMPT_COUNT) {
    issues.push('Exactly five guidance prompts are required.');
  }
  const seenPrompts: { [key: string]: boolean } = {};
  record.guidancePrompts.forEach((prompt, index) => {
    const value = normalise(prompt);
    if (!value) issues.push('Guidance prompt ' + (index + 1) + ' is blank.');
    else if (seenPrompts[value]) issues.push('Guidance prompts must be distinct within a Behaviour.');
    seenPrompts[value] = true;
  });
  if (record.isCurrent && record.published && !record.active) {
    issues.push('A current published Behaviour definition must be active.');
  }
  if (record.isCurrent && !record.published) {
    issues.push('An unpublished Behaviour draft cannot be marked as current.');
  }
  return issues;
};

export const inspectBehaviourDefinitions = (
  records: readonly IAdminBehaviourDefinitionRecord[]
): IAdminBehaviourDefinitionInspection => {
  const issues: string[] = [];
  const seenCurrentIds: { [key: string]: boolean } = {};
  const seenVersions: { [key: string]: boolean } = {};
  let totalGuidancePromptCount = 0;
  const currentRecords = records.filter(record => record.isCurrent && record.published);

  if (currentRecords.length !== ADMIN_BEHAVIOUR_DEFINITION_COUNT) {
    issues.push('Current published Behaviour definition count is ' + currentRecords.length
      + '; exactly five fixed definitions are required.');
  }
  records.forEach((record, index) => {
    recordIssues(record).forEach(issue => {
      issues.push('Behaviour row ' + (index + 1) + ': ' + issue);
    });
    const id = normalise(record.behaviourId);
    const version = normalise(record.behaviourVersionKey);
    if (record.isCurrent && record.published && seenCurrentIds[id]) {
      issues.push('Behaviour ID ' + record.behaviourId + ' has more than one current published version.');
    }
    if (seenVersions[version]) issues.push('Behaviour Version Key ' + record.behaviourVersionKey + ' is duplicated.');
    if (record.isCurrent && record.published) seenCurrentIds[id] = true;
    seenVersions[version] = true;
    if (record.isCurrent && record.published) totalGuidancePromptCount += record.guidancePrompts.length;
  });

  return {
    expectedDefinitionCount: ADMIN_BEHAVIOUR_DEFINITION_COUNT,
    definitionCount: currentRecords.length,
    expectedPromptsPerDefinition: ADMIN_BEHAVIOUR_GUIDANCE_PROMPT_COUNT,
    totalGuidancePromptCount,
    valid: issues.length === 0,
    issues
  };
};

const assertSafeState = (state: IAdminBehaviourDefinitionsUatState): void => {
  if (state.mode !== 'SafeLocalUat' || state.persistence !== 'BrowserMemoryOnly') {
    throw new Error('Behaviour Definition mutation was blocked outside the safe local UAT boundary.');
  }
};

const assertContext = (context: IAdminBehaviourDefinitionUatContext): void => {
  if (!clean(context.actorEmail) || !clean(context.occurredAt)) {
    throw new Error('Safe Admin UAT mutations require an actor email and timestamp.');
  }
};

const requireRecord = (
  records: readonly IAdminBehaviourDefinitionRecord[],
  behaviourId: string
): IAdminBehaviourDefinitionRecord => {
  const record = records.filter(candidate => candidate.isCurrent
    && candidate.published
    && normalise(candidate.behaviourId) === normalise(behaviourId))[0];
  if (!record) throw new Error('Current published Behaviour definition was not found in safe Admin UAT.');
  return record;
};

const replaceRecord = (
  records: readonly IAdminBehaviourDefinitionRecord[],
  replacement: IAdminBehaviourDefinitionRecord
): IAdminBehaviourDefinitionRecord[] => records.map(record => (
  record.id === replacement.id
    ? cloneRecord(replacement)
    : cloneRecord(record)
));

const appendAudit = (
  state: IAdminBehaviourDefinitionsUatState,
  action: 'BehaviourDefinitionEdited' | 'BehaviourDefinitionRevisionCreated' | 'BehaviourDefinitionStateChanged',
  before: IAdminBehaviourDefinitionRecord,
  after: IAdminBehaviourDefinitionRecord,
  context: IAdminBehaviourDefinitionUatContext,
  records: readonly IAdminBehaviourDefinitionRecord[] = replaceRecord(state.records, after)
): IAdminBehaviourDefinitionsUatState => ({
  ...state,
  records,
  audit: state.audit.concat([{
    sequence: state.audit.length + 1,
    action,
    behaviourId: after.behaviourId,
    behaviourVersionKey: after.behaviourVersionKey,
    actorEmail: clean(context.actorEmail),
    occurredAt: clean(context.occurredAt),
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after)
  }])
});

export const createBehaviourDefinitionsUatState = (
  productionReadRecords: readonly IAdminBehaviourDefinitionRecord[]
): IAdminBehaviourDefinitionsUatState => {
  return {
    mode: 'SafeLocalUat',
    sourceList: 'DEMOAPP_Behaviours',
    persistence: 'BrowserMemoryOnly',
    fixedDefinitionCount: 5,
    records: productionReadRecords.map(cloneRecord),
    audit: []
  };
};

export const editBehaviourDefinitionSafeUat = (
  state: IAdminBehaviourDefinitionsUatState,
  behaviourId: string,
  patch: IAdminBehaviourDefinitionEdit,
  context: IAdminBehaviourDefinitionUatContext
): IAdminBehaviourDefinitionsUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requireRecord(state.records, behaviourId);
  if (current.published) {
    throw new Error('Published Behaviour wording is immutable; create a new draft revision.');
  }
  const next: IAdminBehaviourDefinitionRecord = {
    ...cloneRecord(current),
    title: patch.title === undefined ? current.title : clean(patch.title),
    description: patch.description === undefined ? current.description : clean(patch.description),
    guidancePrompts: patch.guidancePrompts === undefined
      ? current.guidancePrompts.slice()
      : cleanPrompts(patch.guidancePrompts),
    modifiedAt: clean(context.occurredAt),
    modifiedBy: clean(context.actorEmail)
  };
  const issues = recordIssues(next);
  if (issues.length) throw new Error(issues.join(' '));
  const comparableCurrent = { ...cloneRecord(current), modifiedAt: next.modifiedAt, modifiedBy: next.modifiedBy };
  if (JSON.stringify(next) === JSON.stringify(comparableCurrent)) return state;
  return appendAudit(state, 'BehaviourDefinitionEdited', current, next, context);
};

const nextId = (records: readonly IAdminBehaviourDefinitionRecord[]): number => {
  let maximum = 0;
  records.forEach(record => { if (record.id > maximum) maximum = record.id; });
  return maximum + 1;
};

export const createBehaviourDefinitionRevisionSafeUat = (
  state: IAdminBehaviourDefinitionsUatState,
  behaviourId: string,
  newBehaviourVersionKey: string,
  patch: IAdminBehaviourDefinitionEdit,
  context: IAdminBehaviourDefinitionUatContext
): IAdminBehaviourDefinitionsUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requireRecord(state.records, behaviourId);
  const versionKey = clean(newBehaviourVersionKey);
  if (!versionKey) throw new Error('A new Behaviour Version Key is required.');
  if (state.records.some(record => normalise(record.behaviourVersionKey) === normalise(versionKey))) {
    throw new Error('Behaviour Version Key already exists.');
  }
  const revision: IAdminBehaviourDefinitionRecord = {
    ...cloneRecord(current),
    id: nextId(state.records),
    behaviourVersionKey: versionKey,
    title: patch.title === undefined ? current.title : clean(patch.title),
    description: patch.description === undefined ? current.description : clean(patch.description),
    guidancePrompts: patch.guidancePrompts === undefined
      ? current.guidancePrompts.slice()
      : cleanPrompts(patch.guidancePrompts),
    active: false,
    published: false,
    isCurrent: false,
    modifiedAt: clean(context.occurredAt),
    modifiedBy: clean(context.actorEmail)
  };
  const issues = recordIssues(revision);
  if (issues.length) throw new Error(issues.join(' '));
  const records = state.records.map(cloneRecord).concat([revision]);
  return appendAudit(state, 'BehaviourDefinitionRevisionCreated', current, revision, context, records);
};

export const setBehaviourDefinitionActiveSafeUat = (
  state: IAdminBehaviourDefinitionsUatState,
  behaviourId: string,
  active: boolean,
  published: boolean,
  context: IAdminBehaviourDefinitionUatContext
): IAdminBehaviourDefinitionsUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requireRecord(state.records, behaviourId);
  if (current.published && (current.active !== active || current.published !== published)) {
    throw new Error('Published Behaviour state is immutable; create a new draft revision.');
  }
  if (published && !active) throw new Error('An inactive Behaviour definition cannot be published.');
  if (current.active === active && current.published === published) return state;
  const next: IAdminBehaviourDefinitionRecord = {
    ...cloneRecord(current),
    active,
    published,
    modifiedAt: clean(context.occurredAt),
    modifiedBy: clean(context.actorEmail)
  };
  return appendAudit(state, 'BehaviourDefinitionStateChanged', current, next, context);
};
