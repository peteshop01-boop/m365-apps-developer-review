import type { KpiDataQualityIssueCode, KpiDataQualityStatus } from './KpiDataQuality';
import {
  ADMIN_KPI_REMEDIATION_EVENT_TYPE,
  ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE,
  ADMIN_KPI_CONTROLLED_ISSUE_STATUSES,
  ADMIN_KPI_CONTROLLED_SOURCE_ISSUE_CODES,
  adminKpiIssueTypeForCode,
  isCanonicalUtcTimestamp,
  type AdminControlledKpiIssueType
} from './AdminControlledVocabulary';
import type { IAuthoritativeAdminKpiRemediationQueueCapability } from './IProductionDataService';

export const ADMIN_KPI_MASTER_EXPECTED_RECORD_COUNT = 109;

export const ADMIN_KPI_METRIC_TYPES: readonly string[] = [
  'Count', 'Number', 'Percentage', 'Currency', 'Rate', 'Days', 'Score', 'Milestone', 'Other', 'TextStatus'
];
export const ADMIN_KPI_SCORING_DIRECTIONS: readonly string[] = [
  'HigherIsBetter', 'LowerIsBetter', 'TargetRange', 'Milestone', 'TBC'
];
export const ADMIN_KPI_AGGREGATION_METHODS: readonly string[] = [
  'DirectMetric', 'Additive', 'WeightedContribution', 'Composite', 'Milestone', 'AccountableOwner'
];
export const ADMIN_KPI_REPORTING_STATUSES: readonly string[] = ['Included', 'ContextOnly', 'Excluded'];

export const ADMIN_KPI_MASTER_READ_PATH = {
  listTitle: 'DEMOAPP_KPIMaster' as const,
  expectedCurrentRecordCount: ADMIN_KPI_MASTER_EXPECTED_RECORD_COUNT,
  operation: 'ReadOnly' as const
};

export type AdminKpiActivityFilter = 'All' | 'Active' | 'Inactive';
export type AdminKpiScoringReadiness = 'Ready' | 'NotReady';

export interface IAdminKpiMasterRecord {
  id: number;
  kpiId: string;
  kpiVersionKey: string;
  wording: string;
  wordingSourceReference: string;
  pillar: string;
  workstream: string;
  active: boolean;
  owner: string;
  measureType: string;
  unit: string;
  direction: string;
  aggregationMethod: string;
  reportingStatus?: string;
  scoringPolicyApproved?: boolean;
  scoringPolicyReference?: string;
  scoringMetadataIssues?: readonly string[];
}

export interface IAdminKpiMasterDraft {
  kpiId: string;
  kpiVersionKey: string;
  wording: string;
  wordingSourceReference: string;
  pillar: string;
  workstream: string;
  active?: boolean;
  owner: string;
  measureType: string;
  unit: string;
  direction: string;
  aggregationMethod: string;
  reportingStatus?: string;
  scoringPolicyApproved?: boolean;
  scoringPolicyReference?: string;
  scoringMetadataIssues?: readonly string[];
}

export interface IAdminKpiMasterEdit {
  wording?: string;
  /** Required when wording changes, so source wording is never silently rewritten. */
  authoritativeWordingChangeReference?: string;
  pillar?: string;
  workstream?: string;
  owner?: string;
  measureType?: string;
  unit?: string;
  direction?: string;
  aggregationMethod?: string;
  reportingStatus?: string;
  scoringPolicyApproved?: boolean;
  scoringPolicyReference?: string;
  scoringMetadataIssues?: readonly string[];
}

export interface IAdminKpiScoringAssessment {
  status: AdminKpiScoringReadiness;
  issues: readonly string[];
}

export interface IAdminKpiMasterReadPathResult {
  sourceList: 'DEMOAPP_KPIMaster';
  expectedCurrentRecordCount: number;
  recordCount: number;
  activeCount: number;
  inactiveCount: number;
  activeReadyCount: number;
  activeNotReadyCount: number;
  matchesCurrentRecordCount: boolean;
  valid: boolean;
  issues: readonly string[];
}

export interface IAdminKpiMasterFilter {
  search?: string;
  pillars?: readonly string[];
  workstreams?: readonly string[];
  owners?: readonly string[];
  measureTypes?: readonly string[];
  units?: readonly string[];
  directions?: readonly string[];
  aggregationMethods?: readonly string[];
  activity?: AdminKpiActivityFilter;
  readiness?: 'All' | AdminKpiScoringReadiness;
}

export type AdminKpiMasterUatAction =
  | 'KpiAdded'
  | 'KpiEdited'
  | 'KpiDeactivated'
  | 'KpiReactivated'
  | 'KpiRemediated';

/** Uses the existing physical Active flag without inventing a separate approval lifecycle. */
export type AdminKpiDefinitionState = 'Active' | 'Inactive';

export interface IAdminKpiDefinitionIdentity {
  recordId: number;
  kpiId: string;
  kpiVersionKey: string;
  state: AdminKpiDefinitionState;
}

/**
 * Decision-independent fields that can be repaired in KPI Master. Values still have to be
 * supplied from an attributable source; this contract does not choose them or approve them.
 */
export interface IAdminKpiControlledRemediationPatch {
  owner?: string;
  measureType?: string;
  unit?: string;
  direction?: string;
  aggregationMethod?: string;
  reportingStatus?: string;
  scoringPolicyApproved?: boolean;
  scoringPolicyReference?: string;
  scoringMetadataIssues?: readonly string[];
}

export interface IAdminKpiControlledRemediationCommand {
  actionKey: string;
  issueKey: string;
  issueType: AdminControlledKpiIssueType;
  sourceIssueCode: KpiDataQualityIssueCode;
  issueKpiId: string;
  issueStatus: KpiDataQualityStatus;
  issueSourceReference: string;
  resolutionEvidenceReference: string;
  expectedDefinition: IAdminKpiDefinitionIdentity;
  patch: IAdminKpiControlledRemediationPatch;
}

export interface IAdminKpiRemediationSourceIssue {
  scope: 'KPI';
  issueKey: string;
  issueType: AdminControlledKpiIssueType;
  sourceIssueCode: KpiDataQualityIssueCode;
  kpiId: string;
  status: KpiDataQualityStatus;
  sourceReference: string;
}

export type IAuthoritativeAdminKpiRemediationIssues = readonly IAdminKpiRemediationSourceIssue[] & {
  readonly authoritativeActorEmail: string;
};

declare function require(name: string): {
  resolveAuthoritativeAdminKpiRemediationIssues(value: unknown): IAuthoritativeAdminKpiRemediationIssues;
};

const resolveAuthoritativeRemediationIssues = (
  capability: IAuthoritativeAdminKpiRemediationQueueCapability
): IAuthoritativeAdminKpiRemediationIssues => require('./SharePointProductionDataService')
  .resolveAuthoritativeAdminKpiRemediationIssues(capability);

export interface IAdminKpiMasterUatContext {
  actorEmail: string;
  occurredAt: string;
}

export interface IAdminKpiMasterUatAuditEvent {
  sequence: number;
  action: AdminKpiMasterUatAction;
  kpiId: string;
  kpiVersionKey: string;
  actorEmail: string;
  occurredAt: string;
  actionKey?: string;
  issueKey?: string;
  issueStatus?: string;
  issueSourceReference?: string;
  resolutionEvidenceReference?: string;
  expectedDefinition?: IAdminKpiDefinitionIdentity;
  beforeJson?: string;
  afterJson: string;
}

export interface IAdminKpiMasterUatState {
  mode: 'SafeLocalUat';
  sourceList: 'DEMOAPP_KPIMaster';
  persistence: 'BrowserMemoryOnly';
  records: readonly IAdminKpiMasterRecord[];
  audit: readonly IAdminKpiMasterUatAuditEvent[];
}

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();
const compact = (value: string | undefined): string => normalise(value).replace(/[\s_-]/g, '');

const isPhysicalChoice = (value: string | undefined, choices: readonly string[]): boolean => (
  choices.map(normalise).indexOf(normalise(value)) >= 0
);

const cloneRecord = (record: IAdminKpiMasterRecord): IAdminKpiMasterRecord => ({
  ...record,
  scoringMetadataIssues: (record.scoringMetadataIssues || []).slice()
});

export const getAdminKpiDefinitionIdentity = (
  record: IAdminKpiMasterRecord
): IAdminKpiDefinitionIdentity => ({
  recordId: record.id,
  kpiId: record.kpiId,
  kpiVersionKey: record.kpiVersionKey,
  state: record.active ? 'Active' : 'Inactive'
});

const cleanIssues = (issues: readonly string[] | undefined): string[] => {
  const result: string[] = [];
  (issues || []).forEach(issue => {
    const value = clean(issue);
    if (value && result.map(normalise).indexOf(normalise(value)) < 0) result.push(value);
  });
  return result;
};

const isRecognisedDirection = (direction: string): boolean => (
  isPhysicalChoice(direction, ADMIN_KPI_SCORING_DIRECTIONS) && compact(direction) !== 'tbc'
);

const directionRequiresApprovedPolicy = (direction: string): boolean => [
  'lowerisbetter',
  'milestone',
  'score',
  'targetrange'
].indexOf(compact(direction)) >= 0;

export const assessAdminKpiScoringReadiness = (
  record: IAdminKpiMasterRecord
): IAdminKpiScoringAssessment => {
  const issues = cleanIssues(record.scoringMetadataIssues);
  if (!clean(record.owner)) issues.push('Owner is blank.');
  if (!clean(record.measureType)) issues.push('Measure Type is blank.');
  else if (!isPhysicalChoice(record.measureType, ADMIN_KPI_METRIC_TYPES)) {
    issues.push('Measure Type is not an approved physical choice.');
  }
  if (!clean(record.unit)) issues.push('Unit is blank.');
  if (!clean(record.direction)) issues.push('Direction is blank.');
  else if (!isRecognisedDirection(record.direction)) issues.push('Direction is unresolved or unsupported.');
  if (!clean(record.aggregationMethod)) issues.push('Aggregation Method is blank.');
  else if (!isPhysicalChoice(record.aggregationMethod, ADMIN_KPI_AGGREGATION_METHODS)) {
    issues.push('Aggregation Method is not an approved physical choice.');
  }
  if (!isPhysicalChoice(record.reportingStatus, ADMIN_KPI_REPORTING_STATUSES)) {
    issues.push('Reporting Status is blank or not an approved physical choice.');
  }
  if (directionRequiresApprovedPolicy(record.direction)
    && (!record.scoringPolicyApproved || !clean(record.scoringPolicyReference))) {
    issues.push('Direction requires an approved, auditable scoring policy.');
  }
  return { status: issues.length ? 'NotReady' : 'Ready', issues };
};

const identity = (kpiId: string, versionKey: string): string => (
  normalise(kpiId) + '|' + normalise(versionKey)
);

const validateRecordIdentity = (record: IAdminKpiMasterRecord): string[] => {
  const issues: string[] = [];
  if (!clean(record.kpiId)) issues.push('KPI ID is required.');
  if (!clean(record.kpiVersionKey)) issues.push('KPI Version Key is required.');
  if (!clean(record.wording)) issues.push('KPI wording is required.');
  if (!clean(record.wordingSourceReference)) issues.push('KPI wording source reference is required.');
  if (!clean(record.pillar)) issues.push('Pillar is required.');
  if (!clean(record.workstream)) issues.push('Workstream is required.');
  if (!isPhysicalChoice(record.measureType, ADMIN_KPI_METRIC_TYPES)) {
    issues.push('Measure Type must use an approved physical choice.');
  }
  if (!isPhysicalChoice(record.direction, ADMIN_KPI_SCORING_DIRECTIONS)) {
    issues.push('Scoring Direction must use an approved physical choice.');
  }
  if (!isPhysicalChoice(record.aggregationMethod, ADMIN_KPI_AGGREGATION_METHODS)) {
    issues.push('Aggregation Method must use an approved physical choice.');
  }
  if (!isPhysicalChoice(record.reportingStatus, ADMIN_KPI_REPORTING_STATUSES)) {
    issues.push('Reporting Status must use an approved physical choice.');
  }
  return issues;
};

export const inspectAdminKpiMasterReadPath = (
  records: readonly IAdminKpiMasterRecord[],
  expectedCurrentRecordCount: number = ADMIN_KPI_MASTER_EXPECTED_RECORD_COUNT
): IAdminKpiMasterReadPathResult => {
  const issues: string[] = [];
  const seenIdentities: { [key: string]: boolean } = {};
  const activeKpis: { [key: string]: boolean } = {};
  let activeCount = 0;
  let activeReadyCount = 0;

  if (records.length !== expectedCurrentRecordCount) {
    issues.push('KPI Master record-count drift: read ' + records.length
      + '; the signed baseline is ' + expectedCurrentRecordCount + '.');
  }

  records.forEach((record, index) => {
    validateRecordIdentity(record).forEach(issue => {
      issues.push('KPI Master row ' + (index + 1) + ': ' + issue);
    });
    const rowIdentity = identity(record.kpiId, record.kpiVersionKey);
    if (seenIdentities[rowIdentity]) {
      issues.push('KPI Master contains duplicate KPI/version ' + record.kpiId + ' / ' + record.kpiVersionKey + '.');
    }
    seenIdentities[rowIdentity] = true;
    if (record.active) {
      const kpiKey = normalise(record.kpiId);
      if (activeKpis[kpiKey]) issues.push('KPI Master contains more than one active version of ' + record.kpiId + '.');
      activeKpis[kpiKey] = true;
      activeCount += 1;
      if (assessAdminKpiScoringReadiness(record).status === 'Ready') activeReadyCount += 1;
    }
  });

  return {
    sourceList: 'DEMOAPP_KPIMaster',
    expectedCurrentRecordCount,
    recordCount: records.length,
    activeCount,
    inactiveCount: records.length - activeCount,
    activeReadyCount,
    activeNotReadyCount: activeCount - activeReadyCount,
    matchesCurrentRecordCount: records.length === expectedCurrentRecordCount,
    valid: issues.length === 0,
    issues
  };
};

const matchesSelections = (value: string, selected: readonly string[] | undefined): boolean => {
  if (!selected || !selected.length) return true;
  const wanted = normalise(value);
  return selected.map(normalise).indexOf(wanted) >= 0;
};

export const filterAdminKpis = (
  records: readonly IAdminKpiMasterRecord[],
  filter: IAdminKpiMasterFilter = {}
): IAdminKpiMasterRecord[] => {
  const search = normalise(filter.search);
  return records.filter(record => {
    if (filter.activity === 'Active' && !record.active) return false;
    if (filter.activity === 'Inactive' && record.active) return false;
    if (!matchesSelections(record.pillar, filter.pillars)) return false;
    if (!matchesSelections(record.workstream, filter.workstreams)) return false;
    if (!matchesSelections(record.owner, filter.owners)) return false;
    if (!matchesSelections(record.measureType, filter.measureTypes)) return false;
    if (!matchesSelections(record.unit, filter.units)) return false;
    if (!matchesSelections(record.direction, filter.directions)) return false;
    if (!matchesSelections(record.aggregationMethod, filter.aggregationMethods)) return false;
    if (filter.readiness && filter.readiness !== 'All'
      && assessAdminKpiScoringReadiness(record).status !== filter.readiness) return false;
    if (search) {
      const searchable = [record.kpiId, record.wording, record.pillar, record.workstream, record.owner,
        record.measureType, record.unit, record.direction, record.aggregationMethod].join(' ').toLowerCase();
      if (searchable.indexOf(search) < 0) return false;
    }
    return true;
  }).map(cloneRecord).sort((left, right) => left.kpiId.localeCompare(right.kpiId));
};

const assertSafeState = (state: IAdminKpiMasterUatState): void => {
  if (state.mode !== 'SafeLocalUat' || state.persistence !== 'BrowserMemoryOnly') {
    throw new Error('KPI Master mutation was blocked outside the safe local UAT boundary.');
  }
};

const assertContext = (context: IAdminKpiMasterUatContext): void => {
  if (!clean(context.actorEmail) || !isCanonicalUtcTimestamp(context.occurredAt)) {
    throw new Error('Safe Admin UAT mutations require an actor email and canonical UTC timestamp.');
  }
};

const requireRecord = (
  records: readonly IAdminKpiMasterRecord[],
  kpiId: string,
  versionKey: string
): IAdminKpiMasterRecord => {
  const wanted = identity(kpiId, versionKey);
  const record = records.filter(candidate => identity(candidate.kpiId, candidate.kpiVersionKey) === wanted)[0];
  if (!record) throw new Error('KPI/version was not found in safe Admin UAT.');
  return record;
};

const nextId = (records: readonly IAdminKpiMasterRecord[]): number => {
  let maximum = 0;
  records.forEach(record => { if (record.id > maximum) maximum = record.id; });
  return maximum + 1;
};

const appendAudit = (
  state: IAdminKpiMasterUatState,
  action: AdminKpiMasterUatAction,
  before: IAdminKpiMasterRecord | undefined,
  after: IAdminKpiMasterRecord,
  context: IAdminKpiMasterUatContext,
  records: readonly IAdminKpiMasterRecord[]
): IAdminKpiMasterUatState => ({
  ...state,
  records,
  audit: state.audit.concat([{
    sequence: state.audit.length + 1,
    action,
    kpiId: after.kpiId,
    kpiVersionKey: after.kpiVersionKey,
    actorEmail: clean(context.actorEmail),
    occurredAt: clean(context.occurredAt),
    beforeJson: before ? JSON.stringify(before) : undefined,
    afterJson: JSON.stringify(after)
  }])
});

const replaceRecord = (
  records: readonly IAdminKpiMasterRecord[],
  replacement: IAdminKpiMasterRecord
): IAdminKpiMasterRecord[] => records.map(record => (
  identity(record.kpiId, record.kpiVersionKey) === identity(replacement.kpiId, replacement.kpiVersionKey)
    ? cloneRecord(replacement)
    : cloneRecord(record)
));

export const createAdminKpiMasterUatState = (
  productionReadRecords: readonly IAdminKpiMasterRecord[]
): IAdminKpiMasterUatState => ({
  mode: 'SafeLocalUat',
  sourceList: 'DEMOAPP_KPIMaster',
  persistence: 'BrowserMemoryOnly',
  records: productionReadRecords.map(cloneRecord),
  audit: []
});

export const addKpiSafeUat = (
  state: IAdminKpiMasterUatState,
  draft: IAdminKpiMasterDraft,
  context: IAdminKpiMasterUatContext
): IAdminKpiMasterUatState => {
  assertSafeState(state);
  assertContext(context);
  if (state.records.some(record => identity(record.kpiId, record.kpiVersionKey)
    === identity(draft.kpiId, draft.kpiVersionKey))) throw new Error('KPI/version already exists.');
  if (draft.active !== false && state.records.some(record => record.active
    && normalise(record.kpiId) === normalise(draft.kpiId))) {
    throw new Error('Deactivate the existing KPI version before adding a new active version.');
  }
  const record: IAdminKpiMasterRecord = {
    id: nextId(state.records),
    kpiId: clean(draft.kpiId),
    kpiVersionKey: clean(draft.kpiVersionKey),
    wording: clean(draft.wording),
    wordingSourceReference: clean(draft.wordingSourceReference),
    pillar: clean(draft.pillar),
    workstream: clean(draft.workstream),
    active: draft.active !== false,
    owner: clean(draft.owner),
    measureType: clean(draft.measureType),
    unit: clean(draft.unit),
    direction: clean(draft.direction),
    aggregationMethod: clean(draft.aggregationMethod),
    reportingStatus: clean(draft.reportingStatus) || undefined,
    scoringPolicyApproved: draft.scoringPolicyApproved,
    scoringPolicyReference: clean(draft.scoringPolicyReference) || undefined,
    scoringMetadataIssues: cleanIssues(draft.scoringMetadataIssues)
  };
  const recordIssues = validateRecordIdentity(record);
  if (recordIssues.length) throw new Error(recordIssues.join(' '));
  return appendAudit(state, 'KpiAdded', undefined, record, context,
    state.records.map(cloneRecord).concat([record]));
};

export const editKpiSafeUat = (
  state: IAdminKpiMasterUatState,
  kpiId: string,
  versionKey: string,
  patch: IAdminKpiMasterEdit,
  context: IAdminKpiMasterUatContext
): IAdminKpiMasterUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requireRecord(state.records, kpiId, versionKey);
  const wording = patch.wording === undefined ? current.wording : clean(patch.wording);
  if (wording !== current.wording && !clean(patch.authoritativeWordingChangeReference)) {
    throw new Error('KPI wording changes require an authoritative source reference.');
  }
  const next: IAdminKpiMasterRecord = {
    ...cloneRecord(current),
    wording,
    wordingSourceReference: wording !== current.wording
      ? clean(patch.authoritativeWordingChangeReference)
      : current.wordingSourceReference,
    pillar: patch.pillar === undefined ? current.pillar : clean(patch.pillar),
    workstream: patch.workstream === undefined ? current.workstream : clean(patch.workstream),
    owner: patch.owner === undefined ? current.owner : clean(patch.owner),
    measureType: patch.measureType === undefined ? current.measureType : clean(patch.measureType),
    unit: patch.unit === undefined ? current.unit : clean(patch.unit),
    direction: patch.direction === undefined ? current.direction : clean(patch.direction),
    aggregationMethod: patch.aggregationMethod === undefined
      ? current.aggregationMethod : clean(patch.aggregationMethod),
    reportingStatus: patch.reportingStatus === undefined
      ? current.reportingStatus : clean(patch.reportingStatus) || undefined,
    scoringPolicyApproved: patch.scoringPolicyApproved === undefined
      ? current.scoringPolicyApproved : patch.scoringPolicyApproved,
    scoringPolicyReference: patch.scoringPolicyReference === undefined
      ? current.scoringPolicyReference : clean(patch.scoringPolicyReference) || undefined,
    scoringMetadataIssues: patch.scoringMetadataIssues === undefined
      ? (current.scoringMetadataIssues || []).slice() : cleanIssues(patch.scoringMetadataIssues)
  };
  const recordIssues = validateRecordIdentity(next);
  if (recordIssues.length) throw new Error(recordIssues.join(' '));
  if (JSON.stringify(next) === JSON.stringify(current)) return state;
  return appendAudit(state, 'KpiEdited', current, next, context, replaceRecord(state.records, next));
};

export const setKpiActiveSafeUat = (
  state: IAdminKpiMasterUatState,
  kpiId: string,
  versionKey: string,
  active: boolean,
  context: IAdminKpiMasterUatContext
): IAdminKpiMasterUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requireRecord(state.records, kpiId, versionKey);
  if (current.active === active) return state;
  if (active && state.records.some(record => record.active
    && normalise(record.kpiId) === normalise(current.kpiId)
    && identity(record.kpiId, record.kpiVersionKey) !== identity(current.kpiId, current.kpiVersionKey))) {
    throw new Error('Another version of this KPI is already active.');
  }
  const next = { ...cloneRecord(current), active };
  return appendAudit(
    state,
    active ? 'KpiReactivated' : 'KpiDeactivated',
    current,
    next,
    context,
    replaceRecord(state.records, next)
  );
};

const sameDefinitionIdentity = (
  actual: IAdminKpiDefinitionIdentity,
  expected: IAdminKpiDefinitionIdentity
): boolean => actual.recordId === expected.recordId
  && normalise(actual.kpiId) === normalise(expected.kpiId)
  && normalise(actual.kpiVersionKey) === normalise(expected.kpiVersionKey)
  && actual.state === expected.state;

const hasExactKeys = (value: object, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected.slice().sort()[index]);
};

type OwnDataSnapshot = Readonly<{ [key: string]: unknown }>;

const inspectPlainOwnDataOnce = (
  value: unknown,
  expectedKeys: readonly string[] | undefined,
  errorMessage: string
): OwnDataSnapshot => {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(errorMessage);
  }

  let descriptors: { [key: string]: PropertyDescriptor };
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new Error(errorMessage);
  }
  const names = Object.getOwnPropertyNames(descriptors);
  const symbols = Object.getOwnPropertySymbols(descriptors);
  if (symbols.length > 0
    || (expectedKeys && (names.length !== expectedKeys.length
      || names.some(name => expectedKeys.indexOf(name) < 0)))) {
    throw new Error(errorMessage);
  }

  names.forEach(name => {
    const descriptor = descriptors[name];
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true) {
      throw new Error(errorMessage);
    }
  });

  const snapshot = Object.create(null) as { [key: string]: unknown };
  names.forEach(name => {
    Object.defineProperty(snapshot, name, {
      value: descriptors[name].value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  });
  return Object.freeze(snapshot);
};

const snapshotStringArray = (value: unknown, errorMessage: string): readonly string[] => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(errorMessage);
  }

  let descriptors: { [key: string]: PropertyDescriptor };
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new Error(errorMessage);
  }
  const names = Object.getOwnPropertyNames(descriptors);
  const symbols = Object.getOwnPropertySymbols(descriptors);
  const lengthDescriptor = descriptors.length;
  if (symbols.length > 0
    || !lengthDescriptor
    || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || (lengthDescriptor.value as number) < 0) {
    throw new Error(errorMessage);
  }

  const length = lengthDescriptor.value as number;
  const expectedNames = ['length'].concat(Array.from({ length }, (_unused, index) => String(index)));
  if (names.length !== expectedNames.length || names.some(name => expectedNames.indexOf(name) < 0)) {
    throw new Error(errorMessage);
  }

  const result: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true
      || typeof descriptor.value !== 'string') {
      throw new Error(errorMessage);
    }
    result.push(descriptor.value);
  }
  return Object.freeze(result);
};

const canonicaliseControlledRemediationCommand = (
  supplied: IAdminKpiControlledRemediationCommand
): Readonly<IAdminKpiControlledRemediationCommand> => {
  const integrityError = 'Controlled KPI remediation command integrity is invalid.';
  const command = inspectPlainOwnDataOnce(supplied, [
    'actionKey', 'issueKey', 'issueType', 'sourceIssueCode', 'issueKpiId', 'issueStatus',
    'issueSourceReference', 'resolutionEvidenceReference', 'expectedDefinition', 'patch'
  ], integrityError);
  const primitiveKeys = [
    'actionKey', 'issueKey', 'issueType', 'sourceIssueCode', 'issueKpiId', 'issueStatus',
    'issueSourceReference', 'resolutionEvidenceReference'
  ];
  if (primitiveKeys.some(key => typeof command[key] !== 'string')) {
    throw new Error(integrityError);
  }

  const expected = inspectPlainOwnDataOnce(
    command.expectedDefinition,
    ['recordId', 'kpiId', 'kpiVersionKey', 'state'],
    integrityError
  );
  if (typeof expected.recordId !== 'number'
    || typeof expected.kpiId !== 'string'
    || typeof expected.kpiVersionKey !== 'string'
    || typeof expected.state !== 'string') {
    throw new Error(integrityError);
  }
  const expectedDefinition = Object.freeze({
    recordId: expected.recordId,
    kpiId: expected.kpiId,
    kpiVersionKey: expected.kpiVersionKey,
    state: expected.state
  }) as IAdminKpiDefinitionIdentity;

  const patchData = inspectPlainOwnDataOnce(command.patch, undefined, integrityError);
  const patchFields = Object.keys(patchData);
  const patch = Object.create(null) as { [key: string]: unknown };
  patchFields.forEach(field => {
    const fieldValue = patchData[field];
    let canonicalValue: unknown;
    if (field === 'scoringMetadataIssues') {
      canonicalValue = snapshotStringArray(fieldValue, integrityError);
    } else if (field === 'scoringPolicyApproved') {
      if (typeof fieldValue !== 'boolean') throw new Error(integrityError);
      canonicalValue = fieldValue;
    } else {
      if (typeof fieldValue !== 'string') throw new Error(integrityError);
      canonicalValue = fieldValue;
    }
    Object.defineProperty(patch, field, {
      value: canonicalValue,
      enumerable: true,
      configurable: false,
      writable: false
    });
  });
  const immutablePatch = Object.freeze(patch) as IAdminKpiControlledRemediationPatch;

  return Object.freeze({
    actionKey: command.actionKey,
    issueKey: command.issueKey,
    issueType: command.issueType,
    sourceIssueCode: command.sourceIssueCode,
    issueKpiId: command.issueKpiId,
    issueStatus: command.issueStatus,
    issueSourceReference: command.issueSourceReference,
    resolutionEvidenceReference: command.resolutionEvidenceReference,
    expectedDefinition,
    patch: immutablePatch
  }) as IAdminKpiControlledRemediationCommand;
};

const assertControlledRemediationCommand = (
  command: IAdminKpiControlledRemediationCommand,
  knownIssues: readonly IAdminKpiRemediationSourceIssue[]
): void => {
  if (!command || typeof command !== 'object' || !hasExactKeys(command, [
    'actionKey', 'issueKey', 'issueType', 'sourceIssueCode', 'issueKpiId', 'issueStatus',
    'issueSourceReference', 'resolutionEvidenceReference', 'expectedDefinition', 'patch'
  ])) {
    throw new Error('Controlled KPI remediation command integrity is invalid.');
  }
  if (!clean(command.actionKey)
    || !clean(command.issueKey)
    || !clean(command.issueStatus)
    || !clean(command.issueSourceReference)
    || !clean(command.resolutionEvidenceReference)
    || !clean(command.issueKpiId)
    || command.actionKey !== clean(command.actionKey)
    || command.issueKey !== clean(command.issueKey)
    || command.issueSourceReference !== clean(command.issueSourceReference)
    || command.resolutionEvidenceReference !== clean(command.resolutionEvidenceReference)
    || command.issueKpiId !== clean(command.issueKpiId)
    || !ADMIN_KPI_CONTROLLED_SOURCE_ISSUE_CODES.includes(command.sourceIssueCode)
    || !ADMIN_KPI_CONTROLLED_ISSUE_STATUSES.includes(command.issueStatus)) {
    throw new Error('Controlled KPI remediation requires action, issue, status, source and resolution evidence provenance.');
  }
  if (!command.expectedDefinition
    || typeof command.expectedDefinition !== 'object'
    || !hasExactKeys(command.expectedDefinition, ['recordId', 'kpiId', 'kpiVersionKey', 'state'])
    || !Number.isSafeInteger(command.expectedDefinition.recordId)
    || command.expectedDefinition.recordId < 1
    || !clean(command.expectedDefinition.kpiId)
    || !clean(command.expectedDefinition.kpiVersionKey)
    || command.expectedDefinition.kpiId !== clean(command.expectedDefinition.kpiId)
    || command.expectedDefinition.kpiVersionKey !== clean(command.expectedDefinition.kpiVersionKey)
    || (command.expectedDefinition.state !== 'Active' && command.expectedDefinition.state !== 'Inactive')) {
    throw new Error('Controlled KPI remediation requires an explicit valid KPI version/state identity.');
  }
  if (!command.patch || Object.keys(command.patch).length === 0) {
    throw new Error('Controlled KPI remediation requires an explicit non-empty patch.');
  }
  const expectedIssueType = adminKpiIssueTypeForCode(command.sourceIssueCode);
  if (command.issueType !== expectedIssueType
    || command.issueKey !== `KPI|${command.issueKpiId}|${command.sourceIssueCode}`
    || normalise(command.issueKpiId) !== normalise(command.expectedDefinition.kpiId)) {
    throw new Error('Controlled KPI remediation issue/KPI/definition identity is inconsistent.');
  }
  const allowedFields = ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE[command.issueType];
  const patchFields = Object.keys(command.patch);
  if (!allowedFields || patchFields.some(field => allowedFields.indexOf(field) < 0)
    || patchFields.some(field => command.patch[field as keyof IAdminKpiControlledRemediationPatch] === undefined)) {
    throw new Error('Controlled KPI remediation patch violates the issue-type field allow-list.');
  }
  if (!Array.isArray(knownIssues)) {
    throw new Error('Controlled KPI remediation requires an authoritative known-issue set.');
  }
  const exactKnown = knownIssues.filter(issue => issue
    && issue.scope === 'KPI'
    && issue.issueKey === command.issueKey
    && issue.issueType === command.issueType
    && issue.sourceIssueCode === command.sourceIssueCode
    && issue.kpiId === command.issueKpiId
    && issue.status === command.issueStatus
    && issue.sourceReference === command.issueSourceReference);
  if (exactKnown.length !== 1) {
    throw new Error('Controlled KPI remediation command does not match exactly one authoritative known source issue.');
  }
};

/**
 * Applies only an already-attributed, issue-bound repair to the exact expected KPI version/state.
 * It never selects a value, changes version identity/activity or persists outside browser memory.
 */
export const applyAdminKpiControlledRemediationSafeUat = (
  state: IAdminKpiMasterUatState,
  command: IAdminKpiControlledRemediationCommand,
  context: IAdminKpiMasterUatContext,
  queueCapability: IAuthoritativeAdminKpiRemediationQueueCapability
): IAdminKpiMasterUatState => {
  const canonicalCommand = canonicaliseControlledRemediationCommand(command);
  const knownIssues = resolveAuthoritativeRemediationIssues(queueCapability);
  const authoritativeActorEmail = clean(knownIssues.authoritativeActorEmail);
  if (!authoritativeActorEmail
    || normalise(context.actorEmail) !== normalise(authoritativeActorEmail)) {
    throw new Error('Controlled KPI remediation actor must match the authoritative queue identity.');
  }
  const authoritativeContext: IAdminKpiMasterUatContext = {
    ...context,
    actorEmail: authoritativeActorEmail
  };
  assertContext(authoritativeContext);
  assertControlledRemediationCommand(canonicalCommand, knownIssues);
  assertSafeState(state);
  if (state.audit.some(event => normalise(event.actionKey) === normalise(canonicalCommand.actionKey))) {
    throw new Error('Controlled KPI remediation action key has already been used.');
  }

  const current = requireRecord(
    state.records,
    canonicalCommand.expectedDefinition.kpiId,
    canonicalCommand.expectedDefinition.kpiVersionKey
  );
  const actualIdentity = getAdminKpiDefinitionIdentity(current);
  if (!sameDefinitionIdentity(actualIdentity, canonicalCommand.expectedDefinition)) {
    throw new Error('Controlled KPI remediation was blocked because the KPI version/state identity is stale or mismatched.');
  }

  const edited = editKpiSafeUat(
    state,
    current.kpiId,
    current.kpiVersionKey,
    canonicalCommand.patch,
    authoritativeContext
  );
  if (edited === state) {
    throw new Error('Controlled KPI remediation must change the exact bound KPI version.');
  }
  const editAudit = edited.audit[edited.audit.length - 1];
  const remediationAudit: IAdminKpiMasterUatAuditEvent = {
    ...editAudit,
    action: ADMIN_KPI_REMEDIATION_EVENT_TYPE,
    actionKey: clean(canonicalCommand.actionKey),
    issueKey: clean(canonicalCommand.issueKey),
    issueStatus: clean(canonicalCommand.issueStatus),
    issueSourceReference: clean(canonicalCommand.issueSourceReference),
    resolutionEvidenceReference: clean(canonicalCommand.resolutionEvidenceReference),
    expectedDefinition: { ...canonicalCommand.expectedDefinition }
  };
  return {
    ...edited,
    audit: edited.audit.slice(0, edited.audit.length - 1).concat([remediationAudit])
  };
};
