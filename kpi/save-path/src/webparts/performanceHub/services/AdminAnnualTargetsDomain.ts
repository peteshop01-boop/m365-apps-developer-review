export type AdminAnnualTargetStatus = 'Draft' | 'Submitted' | 'Approved' | 'Superseded' | 'Retired';
export type AdminAnnualTargetValue = number | string;

export interface IAdminAnnualTargetRecord {
  id: number;
  kpiId: string;
  performanceYear: string;
  targetVersionKey: string;
  annualTarget?: AdminAnnualTargetValue;
  q1Target?: AdminAnnualTargetValue;
  q2Target?: AdminAnnualTargetValue;
  q3Target?: AdminAnnualTargetValue;
  q4Target?: AdminAnnualTargetValue;
  status: AdminAnnualTargetStatus;
  owner: string;
  modifiedAt: string;
  modifiedBy: string;
}

export interface IAdminAnnualTargetDraft {
  kpiId: string;
  performanceYear: string;
  targetVersionKey: string;
  annualTarget?: AdminAnnualTargetValue;
  q1Target?: AdminAnnualTargetValue;
  q2Target?: AdminAnnualTargetValue;
  q3Target?: AdminAnnualTargetValue;
  q4Target?: AdminAnnualTargetValue;
  status: AdminAnnualTargetStatus;
  owner: string;
}

export interface IAdminAnnualTargetEdit {
  annualTarget?: AdminAnnualTargetValue;
  q1Target?: AdminAnnualTargetValue;
  q2Target?: AdminAnnualTargetValue;
  q3Target?: AdminAnnualTargetValue;
  q4Target?: AdminAnnualTargetValue;
  clearAnnualTarget?: boolean;
  clearQ1Target?: boolean;
  clearQ2Target?: boolean;
  clearQ3Target?: boolean;
  clearQ4Target?: boolean;
  status?: AdminAnnualTargetStatus;
  owner?: string;
}

export interface IAdminAnnualTargetUatContext {
  actorEmail: string;
  occurredAt: string;
}

export interface IAdminAnnualTargetUatAuditEvent {
  sequence: number;
  action: 'AnnualTargetAdded' | 'AnnualTargetEdited';
  kpiId: string;
  performanceYear: string;
  targetVersionKey: string;
  actorEmail: string;
  occurredAt: string;
  beforeJson?: string;
  afterJson: string;
}

export interface IAdminAnnualTargetsUatState {
  mode: 'SafeLocalUat';
  sourceList: 'DEMOAPP_AnnualTargets';
  persistence: 'BrowserMemoryOnly';
  editablePerformanceYear: string;
  records: readonly IAdminAnnualTargetRecord[];
  audit: readonly IAdminAnnualTargetUatAuditEvent[];
}

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();

const cloneRecord = (record: IAdminAnnualTargetRecord): IAdminAnnualTargetRecord => ({ ...record });

const identity = (kpiId: string, performanceYear: string, targetVersionKey: string): string => (
  normalise(kpiId) + '|' + normalise(performanceYear) + '|' + normalise(targetVersionKey)
);

const validTargetValue = (value: AdminAnnualTargetValue | undefined): boolean => {
  if (value === undefined) return true;
  if (typeof value === 'number') return isFinite(value);
  return clean(value).length > 0;
};

export const validateAdminAnnualTarget = (record: IAdminAnnualTargetRecord): readonly string[] => {
  const issues: string[] = [];
  if (!clean(record.kpiId)) issues.push('KPI ID is required.');
  if (!clean(record.performanceYear)) issues.push('Performance Year is required.');
  if (!clean(record.targetVersionKey)) issues.push('Target Version Key is required.');
  if (!clean(record.owner)) issues.push('Target owner is required.');
  if (['Draft', 'Submitted', 'Approved', 'Superseded', 'Retired'].indexOf(record.status) < 0) {
    issues.push('Target approval/status is invalid.');
  }
  if (!clean(record.modifiedAt) || !clean(record.modifiedBy)) issues.push('Target last-update audit is required.');
  const values: { label: string; value: AdminAnnualTargetValue | undefined }[] = [
    { label: 'Annual Target', value: record.annualTarget },
    { label: 'Q1 Target', value: record.q1Target },
    { label: 'Q2 Target', value: record.q2Target },
    { label: 'Q3 Target', value: record.q3Target },
    { label: 'Q4 Target', value: record.q4Target }
  ];
  values.forEach(candidate => {
    if (!validTargetValue(candidate.value)) issues.push(candidate.label + ' is invalid.');
  });
  return issues;
};

const assertSafeState = (state: IAdminAnnualTargetsUatState): void => {
  if (state.mode !== 'SafeLocalUat' || state.persistence !== 'BrowserMemoryOnly') {
    throw new Error('Annual Target mutation was blocked outside the safe local UAT boundary.');
  }
};

const assertContext = (context: IAdminAnnualTargetUatContext): void => {
  if (!clean(context.actorEmail) || !clean(context.occurredAt)) {
    throw new Error('Safe Admin UAT mutations require an actor email and timestamp.');
  }
};

const assertEditableYear = (state: IAdminAnnualTargetsUatState, performanceYear: string): void => {
  if (normalise(performanceYear) !== normalise(state.editablePerformanceYear)) {
    throw new Error('Historic Performance Year targets are read-only in this safe Admin UAT state.');
  }
};

const requireRecord = (
  records: readonly IAdminAnnualTargetRecord[],
  kpiId: string,
  performanceYear: string,
  targetVersionKey: string
): IAdminAnnualTargetRecord => {
  const wanted = identity(kpiId, performanceYear, targetVersionKey);
  const record = records.filter(candidate => identity(
    candidate.kpiId,
    candidate.performanceYear,
    candidate.targetVersionKey
  ) === wanted)[0];
  if (!record) throw new Error('Annual Target version was not found in safe Admin UAT.');
  return record;
};

const nextId = (records: readonly IAdminAnnualTargetRecord[]): number => {
  let maximum = 0;
  records.forEach(record => { if (record.id > maximum) maximum = record.id; });
  return maximum + 1;
};

const replaceRecord = (
  records: readonly IAdminAnnualTargetRecord[],
  replacement: IAdminAnnualTargetRecord
): IAdminAnnualTargetRecord[] => records.map(record => identity(
  record.kpiId,
  record.performanceYear,
  record.targetVersionKey
) === identity(replacement.kpiId, replacement.performanceYear, replacement.targetVersionKey)
  ? cloneRecord(replacement)
  : cloneRecord(record));

const appendAudit = (
  state: IAdminAnnualTargetsUatState,
  action: 'AnnualTargetAdded' | 'AnnualTargetEdited',
  before: IAdminAnnualTargetRecord | undefined,
  after: IAdminAnnualTargetRecord,
  context: IAdminAnnualTargetUatContext,
  records: readonly IAdminAnnualTargetRecord[]
): IAdminAnnualTargetsUatState => ({
  ...state,
  records,
  audit: state.audit.concat([{
    sequence: state.audit.length + 1,
    action,
    kpiId: after.kpiId,
    performanceYear: after.performanceYear,
    targetVersionKey: after.targetVersionKey,
    actorEmail: clean(context.actorEmail),
    occurredAt: clean(context.occurredAt),
    beforeJson: before ? JSON.stringify(before) : undefined,
    afterJson: JSON.stringify(after)
  }])
});

export const createAnnualTargetsUatState = (
  productionReadRecords: readonly IAdminAnnualTargetRecord[],
  editablePerformanceYear: string
): IAdminAnnualTargetsUatState => {
  if (!clean(editablePerformanceYear)) throw new Error('Editable Performance Year is required.');
  return {
    mode: 'SafeLocalUat',
    sourceList: 'DEMOAPP_AnnualTargets',
    persistence: 'BrowserMemoryOnly',
    editablePerformanceYear: clean(editablePerformanceYear),
    records: productionReadRecords.map(cloneRecord),
    audit: []
  };
};

export const filterAnnualTargetsByYear = (
  records: readonly IAdminAnnualTargetRecord[],
  performanceYear: string
): IAdminAnnualTargetRecord[] => records.filter(record => (
  normalise(record.performanceYear) === normalise(performanceYear)
)).map(cloneRecord).sort((left, right) => {
  const byKpi = left.kpiId.localeCompare(right.kpiId);
  return byKpi || left.targetVersionKey.localeCompare(right.targetVersionKey);
});

export const addAnnualTargetSafeUat = (
  state: IAdminAnnualTargetsUatState,
  draft: IAdminAnnualTargetDraft,
  context: IAdminAnnualTargetUatContext
): IAdminAnnualTargetsUatState => {
  assertSafeState(state);
  assertContext(context);
  assertEditableYear(state, draft.performanceYear);
  if (state.records.some(record => identity(record.kpiId, record.performanceYear, record.targetVersionKey)
    === identity(draft.kpiId, draft.performanceYear, draft.targetVersionKey))) {
    throw new Error('Annual Target version already exists; historic target rows cannot be replaced.');
  }
  const record: IAdminAnnualTargetRecord = {
    id: nextId(state.records),
    kpiId: clean(draft.kpiId),
    performanceYear: clean(draft.performanceYear),
    targetVersionKey: clean(draft.targetVersionKey),
    annualTarget: draft.annualTarget,
    q1Target: draft.q1Target,
    q2Target: draft.q2Target,
    q3Target: draft.q3Target,
    q4Target: draft.q4Target,
    status: draft.status,
    owner: clean(draft.owner),
    modifiedAt: clean(context.occurredAt),
    modifiedBy: clean(context.actorEmail)
  };
  const issues = validateAdminAnnualTarget(record);
  if (issues.length) throw new Error(issues.join(' '));
  return appendAudit(state, 'AnnualTargetAdded', undefined, record, context,
    state.records.map(cloneRecord).concat([record]));
};

const patchValue = (
  current: AdminAnnualTargetValue | undefined,
  patch: AdminAnnualTargetValue | undefined,
  clearValue: boolean | undefined,
  label: string
): AdminAnnualTargetValue | undefined => {
  if (clearValue && patch !== undefined) throw new Error('Choose either a ' + label + ' value or clear it, not both.');
  if (clearValue) return undefined;
  if (patch === undefined) return current;
  return patch;
};

export const editAnnualTargetSafeUat = (
  state: IAdminAnnualTargetsUatState,
  kpiId: string,
  performanceYear: string,
  targetVersionKey: string,
  patch: IAdminAnnualTargetEdit,
  context: IAdminAnnualTargetUatContext
): IAdminAnnualTargetsUatState => {
  assertSafeState(state);
  assertContext(context);
  assertEditableYear(state, performanceYear);
  const current = requireRecord(state.records, kpiId, performanceYear, targetVersionKey);
  const next: IAdminAnnualTargetRecord = {
    ...cloneRecord(current),
    annualTarget: patchValue(current.annualTarget, patch.annualTarget, patch.clearAnnualTarget, 'Annual Target'),
    q1Target: patchValue(current.q1Target, patch.q1Target, patch.clearQ1Target, 'Q1 Target'),
    q2Target: patchValue(current.q2Target, patch.q2Target, patch.clearQ2Target, 'Q2 Target'),
    q3Target: patchValue(current.q3Target, patch.q3Target, patch.clearQ3Target, 'Q3 Target'),
    q4Target: patchValue(current.q4Target, patch.q4Target, patch.clearQ4Target, 'Q4 Target'),
    status: patch.status === undefined ? current.status : patch.status,
    owner: patch.owner === undefined ? current.owner : clean(patch.owner),
    modifiedAt: clean(context.occurredAt),
    modifiedBy: clean(context.actorEmail)
  };
  const issues = validateAdminAnnualTarget(next);
  if (issues.length) throw new Error(issues.join(' '));
  const comparableCurrent = { ...current, modifiedAt: next.modifiedAt, modifiedBy: next.modifiedBy };
  if (JSON.stringify(next) === JSON.stringify(comparableCurrent)) return state;
  return appendAudit(state, 'AnnualTargetEdited', current, next, context, replaceRecord(state.records, next));
};
