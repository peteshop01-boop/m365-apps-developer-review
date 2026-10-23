import type { IAdminUatContext } from '../models/AdminFoundationModels';
import {
  organisationalWeightGroupKey,
  organisationalWeightRecordKey,
  type IOrganisationalWeightRecord
} from './ProductionPolicyStructures';
import {
  type IOrganisationalWeightExpectation,
  type IOrganisationalWeightingValidationResult,
  validateOrganisationalWeighting
} from './OrganisationalWeightingPolicy';

export interface IAdminOrganisationalWeightingAuditEvent {
  sequence: number;
  action: 'WeightSet' | 'WeightCleared';
  performanceYear: number;
  version: string;
  weightLevel: IOrganisationalWeightRecord['weightLevel'];
  parentKey: string;
  childKey: string;
  previousWeightPercent?: number;
  nextWeightPercent?: number;
  actorEmail: string;
  occurredAt: string;
}

export interface IAdminOrganisationalWeightingUatState {
  mode: 'SafeLocalUat' | 'ProductionReadOnly';
  sourceList: 'KCFKPI_OrganisationalWeights';
  persistence: 'BrowserMemoryOnly' | 'ReadOnly';
  performanceYear: number;
  version: string;
  asOfDate: string;
  expectedMembers: readonly IOrganisationalWeightExpectation[];
  records: readonly IOrganisationalWeightRecord[];
  audit: readonly IAdminOrganisationalWeightingAuditEvent[];
}

export interface IAdminOrganisationalWeightRow extends IOrganisationalWeightExpectation {
  weightPercent?: number;
  approvalStatus?: IOrganisationalWeightRecord['approvalStatus'];
  approvalReference?: string;
  stored: boolean;
}

export type IAdminOrganisationalWeightTarget = Pick<
  IOrganisationalWeightExpectation,
  'weightLevel' | 'parentKey' | 'childKey'
>;

export interface IAdminWeightingKpiMembershipSource {
  kpiId: string;
  pillar: string;
  workstream: string;
  active: boolean;
}

const clean = (value: string): string => value.trim();
const normalise = (value: string | number): string => String(value).trim().toLowerCase();
const cloneExpectation = (
  expectation: IOrganisationalWeightExpectation
): IOrganisationalWeightExpectation => ({ ...expectation });
const cloneRecord = (record: IOrganisationalWeightRecord): IOrganisationalWeightRecord => ({ ...record });

/**
 * Builds explicit hierarchy membership only. It never creates or infers a
 * weight. Workstream keys are controlled Pillar|Workstream composites because
 * the current physical model has no independent Workstream identifier.
 */
export const buildAdminOrganisationalWeightingExpectations = (
  kpis: readonly IAdminWeightingKpiMembershipSource[],
  includeBoardPillarLevel: boolean = false
): readonly IOrganisationalWeightExpectation[] => {
  const expectations: IOrganisationalWeightExpectation[] = [];
  const workstreams: { [key: string]: { pillar: string; workstreamKey: string } } = {};
  const pillars: { [key: string]: string } = {};
  kpis.filter(kpi => kpi.active).forEach(kpi => {
    const pillar = clean(kpi.pillar);
    const workstream = clean(kpi.workstream);
    const kpiId = clean(kpi.kpiId);
    if (!pillar || !workstream || !kpiId) return;
    const workstreamKey = pillar + '|' + workstream;
    expectations.push({
      weightLevel: 'KPIWithinWorkstream',
      parentKey: workstreamKey,
      childKey: kpiId,
      active: true
    });
    workstreams[normalise(workstreamKey)] = { pillar, workstreamKey };
    pillars[normalise(pillar)] = pillar;
  });
  Object.keys(workstreams).sort().forEach(key => {
    const membership = workstreams[key];
    expectations.push({
      weightLevel: 'WorkstreamWithinPillar',
      parentKey: membership.pillar,
      childKey: membership.workstreamKey,
      active: true
    });
  });
  if (includeBoardPillarLevel) {
    Object.keys(pillars).sort().forEach(key => expectations.push({
      weightLevel: 'PillarWithinBoard',
      parentKey: 'BOARD',
      childKey: pillars[key],
      active: true
    }));
  }
  return expectations;
};

const targetIdentity = (target: IAdminOrganisationalWeightTarget): string => (
  [target.weightLevel, target.parentKey, target.childKey].map(normalise).join('|')
);

const sameSelection = (
  record: IOrganisationalWeightRecord,
  state: Pick<IAdminOrganisationalWeightingUatState, 'performanceYear' | 'version'>
): boolean => normalise(record.performanceYear) === normalise(state.performanceYear)
  && normalise(record.version) === normalise(state.version);

const assertSelection = (performanceYear: number, version: string, asOfDate: string): void => {
  if (!Number.isInteger(performanceYear) || performanceYear < 2000 || performanceYear > 2100 || !clean(version)) {
    throw new Error('Performance Year and version are required for safe organisational-weight UAT.');
  }
  if (!clean(asOfDate) || Number.isNaN(Date.parse(asOfDate))) {
    throw new Error('A valid as-of date is required for safe organisational-weight UAT.');
  }
};

const assertSafeState = (state: IAdminOrganisationalWeightingUatState): void => {
  if (state.mode !== 'SafeLocalUat' || state.persistence !== 'BrowserMemoryOnly') {
    throw new Error('Organisational Weighting Admin mutation was blocked outside the safe browser-memory UAT boundary.');
  }
  if (state.version === 'NOT-CONFIGURED' || state.version.indexOf('SELECT-') === 0) {
    throw new Error('Choose an explicit organisational-weighting version before staging weights.');
  }
};

const assertContext = (context: IAdminUatContext): void => {
  if (!clean(context.actorEmail) || !clean(context.occurredAt) || Number.isNaN(Date.parse(context.occurredAt))) {
    throw new Error('Safe organisational-weight UAT requires an actor email and valid timestamp.');
  }
};

const assertWeight = (weightPercent: number | undefined): void => {
  if (weightPercent === undefined) return;
  if (!Number.isFinite(weightPercent) || weightPercent < 0 || weightPercent > 100
    || Math.abs((weightPercent * 100) - Math.round(weightPercent * 100)) > 0.000001) {
    throw new Error('Organisational weight must be blank or a number from 0 to 100 with no more than two decimal places.');
  }
};

/**
 * Parses the text held by the Admin row editor before any React state mutation.
 * Blank is deliberately invalid here because clearing has its own explicit action.
 */
export const parseAdminOrganisationalWeightDraft = (draft: string): number => {
  const value = clean(draft);
  if (!value) {
    throw new Error('Enter an organisational weight, or use Clear to remove the current draft weight.');
  }
  const weightPercent = Number(value);
  assertWeight(weightPercent);
  return weightPercent;
};

const requireActiveExpectation = (
  state: IAdminOrganisationalWeightingUatState,
  target: IAdminOrganisationalWeightTarget
): IOrganisationalWeightExpectation => {
  const identity = targetIdentity(target);
  const matches = state.expectedMembers.filter(expectation => expectation.active
    && targetIdentity(expectation) === identity);
  if (matches.length !== 1) {
    throw new Error('The selected organisational-weight member is not a unique active hierarchy member.');
  }
  return matches[0];
};

export const createAdminOrganisationalWeightingUatState = (
  performanceYear: number,
  version: string,
  asOfDate: string,
  expectedMembers: readonly IOrganisationalWeightExpectation[],
  productionReadRecords: readonly IOrganisationalWeightRecord[] = []
): IAdminOrganisationalWeightingUatState => {
  assertSelection(performanceYear, version, asOfDate);
  return {
    mode: 'SafeLocalUat',
    sourceList: 'KCFKPI_OrganisationalWeights',
    persistence: 'BrowserMemoryOnly',
    performanceYear,
    version: clean(version),
    asOfDate: clean(asOfDate),
    expectedMembers: expectedMembers.map(cloneExpectation),
    records: productionReadRecords.map(cloneRecord),
    audit: []
  };
};

export const createAdminOrganisationalWeightingReadOnlyState = (
  performanceYear: number,
  version: string,
  asOfDate: string,
  expectedMembers: readonly IOrganisationalWeightExpectation[],
  productionReadRecords: readonly IOrganisationalWeightRecord[]
): IAdminOrganisationalWeightingUatState => ({
  ...createAdminOrganisationalWeightingUatState(
    performanceYear, version, asOfDate, expectedMembers, productionReadRecords
  ),
  mode: 'ProductionReadOnly',
  persistence: 'ReadOnly'
});

export const selectAdminOrganisationalWeightingPeriod = (
  state: IAdminOrganisationalWeightingUatState,
  performanceYear: number,
  version: string,
  asOfDate: string,
  expectedMembers: readonly IOrganisationalWeightExpectation[]
): IAdminOrganisationalWeightingUatState => {
  assertSelection(performanceYear, version, asOfDate);
  return {
    ...state,
    performanceYear,
    version: clean(version),
    asOfDate: clean(asOfDate),
    expectedMembers: expectedMembers.map(cloneExpectation),
    records: state.records.map(cloneRecord),
    audit: state.audit.map(event => ({ ...event }))
  };
};

export const getAdminOrganisationalWeightingReadiness = (
  state: IAdminOrganisationalWeightingUatState
): IOrganisationalWeightingValidationResult => validateOrganisationalWeighting({
  performanceYear: state.performanceYear,
  version: state.version,
  asOfDate: state.asOfDate,
  expectedMembers: state.expectedMembers,
  records: state.records
});

export const listAdminOrganisationalWeightRows = (
  state: IAdminOrganisationalWeightingUatState
): readonly IAdminOrganisationalWeightRow[] => state.expectedMembers
  .filter(expectation => expectation.active)
  .map(expectation => {
    const record = state.records.filter(candidate => sameSelection(candidate, state)
      && candidate.active
      && targetIdentity(candidate) === targetIdentity(expectation))[0];
    return {
      ...cloneExpectation(expectation),
      weightPercent: record?.weightPercent,
      approvalStatus: record?.approvalStatus,
      approvalReference: record?.approvalReference,
      stored: Boolean(record)
    };
  });

export const setAdminOrganisationalWeightSafeUat = (
  state: IAdminOrganisationalWeightingUatState,
  target: IAdminOrganisationalWeightTarget,
  weightPercent: number | undefined,
  context: IAdminUatContext
): IAdminOrganisationalWeightingUatState => {
  assertSafeState(state);
  assertContext(context);
  assertWeight(weightPercent);
  const expectation = requireActiveExpectation(state, target);
  const identity = targetIdentity(expectation);
  const matchingIndexes: number[] = [];
  state.records.forEach((record, index) => {
    if (sameSelection(record, state) && targetIdentity(record) === identity) matchingIndexes.push(index);
  });
  if (matchingIndexes.length > 1) {
    throw new Error('The selected organisational-weight member has duplicate year/version records.');
  }

  const currentIndex = matchingIndexes.length ? matchingIndexes[0] : -1;
  const current = currentIndex >= 0 ? state.records[currentIndex] : undefined;
  if (current && (current.historicSnapshotLocked || current.publishedSnapshotKey)) {
    throw new Error('Published or locked historic organisational weights cannot be edited.');
  }
  if (current && current.weightPercent === weightPercent && current.active && current.approvalStatus === 'Draft') return state;

  if (weightPercent === undefined) {
    if (currentIndex < 0) return state;
    return {
      ...state,
      records: state.records.filter((_record, index) => index !== currentIndex).map(cloneRecord),
      audit: state.audit.map(auditEvent => ({ ...auditEvent })).concat([{
        sequence: state.audit.length + 1,
        action: 'WeightCleared',
        performanceYear: state.performanceYear,
        version: state.version,
        weightLevel: expectation.weightLevel,
        parentKey: clean(expectation.parentKey),
        childKey: clean(expectation.childKey),
        previousWeightPercent: current?.weightPercent,
        actorEmail: clean(context.actorEmail),
        occurredAt: new Date(context.occurredAt).toISOString()
      }])
    };
  }

  const occurredDate = new Date(context.occurredAt).toISOString().slice(0, 10);
  const keyParts = {
    performanceYear: state.performanceYear,
    weightLevel: expectation.weightLevel,
    parentKey: clean(expectation.parentKey),
    childKey: clean(expectation.childKey),
    version: state.version
  };
  const next: IOrganisationalWeightRecord = {
    organisationalWeightKey: organisationalWeightRecordKey(keyParts),
    weightGroupKey: organisationalWeightGroupKey(keyParts),
    ...keyParts,
    weightPercent,
    active: true,
    approvalStatus: 'Draft',
    effectiveFrom: current?.effectiveFrom || occurredDate,
    approvalReference: 'KCF-KPI-020B-UAT-DRAFT',
    source: 'KCF-KPI-020B safe browser-memory Admin UAT',
    historicSnapshotLocked: false
  };
  const records = state.records.map(cloneRecord);
  if (currentIndex >= 0) records[currentIndex] = next;
  else records.push(next);

  const event: IAdminOrganisationalWeightingAuditEvent = {
    sequence: state.audit.length + 1,
    action: 'WeightSet',
    performanceYear: state.performanceYear,
    version: state.version,
    weightLevel: expectation.weightLevel,
    parentKey: clean(expectation.parentKey),
    childKey: clean(expectation.childKey),
    previousWeightPercent: current?.weightPercent,
    nextWeightPercent: weightPercent,
    actorEmail: clean(context.actorEmail),
    occurredAt: new Date(context.occurredAt).toISOString()
  };
  return {
    ...state,
    records,
    audit: state.audit.map(auditEvent => ({ ...auditEvent })).concat([event])
  };
};
