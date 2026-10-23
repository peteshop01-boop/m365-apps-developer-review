import {
  organisationalWeightGroupKey,
  organisationalWeightRecordKey,
  type IOrganisationalWeightRecord
} from './ProductionPolicyStructures';

export type OrganisationalWeightLevel = IOrganisationalWeightRecord['weightLevel'];

/**
 * Active hierarchy membership comes from KPI Master, Workstream and Pillar
 * configuration. It is deliberately separate from the stored weight value so
 * an absent row remains visible as missing rather than being auto-filled.
 * Workstream currently has no permanent physical ID: callers must supply the
 * controlled composite key (PillarCode + exact Workstream text), and a rename
 * must therefore be introduced through a new weighting version.
 */
export interface IOrganisationalWeightExpectation {
  weightLevel: OrganisationalWeightLevel;
  parentKey: string;
  childKey: string;
  active: boolean;
}

export interface IOrganisationalWeightingValidationInput {
  performanceYear: number;
  version: string;
  asOfDate: string;
  expectedMembers: readonly IOrganisationalWeightExpectation[];
  records: readonly IOrganisationalWeightRecord[];
  requireLockedPublishedSnapshot?: boolean;
}

export interface IOrganisationalWeightTotal {
  groupKey: string;
  weightLevel: OrganisationalWeightLevel;
  total: number;
  memberCount: number;
  missingMemberKeys: readonly string[];
  invalidMemberKeys: readonly string[];
  complete: boolean;
  exactTotal: boolean;
  ready: boolean;
}

export interface IOrganisationalWeightingValidationResult {
  valid: boolean;
  publicationReady: boolean;
  configurationState: 'READY' | 'NOT READY';
  workstreamKpiTotals: readonly IOrganisationalWeightTotal[];
  pillarWorkstreamTotals: readonly IOrganisationalWeightTotal[];
  boardPillarTotals: readonly IOrganisationalWeightTotal[];
  errors: readonly string[];
}

const normaliseKey = (value: string | number): string => String(value).trim().toLowerCase();
const clean = (value: string): string => value.trim();
const parseGovernedDate = (value: string | undefined): number | undefined => {
  if (!value || !clean(value)) return undefined;
  const timestamp = Date.parse(clean(value));
  if (Number.isNaN(timestamp)) return undefined;
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const isValidDate = (value: string | undefined): boolean => parseGovernedDate(value) !== undefined;
const isValidWeight = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
  && value <= 100
  && Math.abs((value * 100) - Math.round(value * 100)) <= 0.000001
);

const expectationIdentity = (
  expectation: Pick<IOrganisationalWeightExpectation, 'weightLevel' | 'parentKey' | 'childKey'>
): string => [expectation.weightLevel, expectation.parentKey, expectation.childKey]
  .map(normaliseKey)
  .join('|');

const groupIdentity = (
  expectation: Pick<IOrganisationalWeightExpectation, 'weightLevel' | 'parentKey'>
): string => [expectation.weightLevel, expectation.parentKey]
  .map(normaliseKey)
  .join('|');

const sameSelection = (
  record: IOrganisationalWeightRecord,
  performanceYear: number,
  version: string
): boolean => normaliseKey(record.performanceYear) === normaliseKey(performanceYear)
  && normaliseKey(record.version) === normaliseKey(version);

const validateRecordGovernance = (
  record: IOrganisationalWeightRecord,
  label: string,
  asOfDate: string,
  asOfTimestamp: number | undefined,
  requireLockedPublishedSnapshot: boolean,
  errors: string[]
): boolean => {
  let ready = true;
  if (record.weightGroupKey !== organisationalWeightGroupKey(record)
    || record.organisationalWeightKey !== organisationalWeightRecordKey(record)) {
    errors.push(`${label} has an invalid controlled group or record key.`);
    ready = false;
  }
  if (record.approvalStatus !== 'Approved' || !clean(record.approvalReference)) {
    errors.push(`${label} is not CONTROL-approved with an auditable approval reference.`);
    ready = false;
  }
  if (!clean(record.source) || !isValidDate(record.effectiveFrom)
    || (record.effectiveTo !== undefined && !isValidDate(record.effectiveTo))) {
    errors.push(`${label} has incomplete source or effective-date governance.`);
    ready = false;
  }
  const effectiveFrom = parseGovernedDate(record.effectiveFrom);
  const effectiveTo = parseGovernedDate(record.effectiveTo);
  if (asOfTimestamp !== undefined
    && effectiveFrom !== undefined
    && (effectiveFrom > asOfTimestamp || (effectiveTo !== undefined && effectiveTo < asOfTimestamp))) {
    errors.push(`${label} is not effective on ${clean(asOfDate)} for the selected year/version.`);
    ready = false;
  }
  if (record.publishedSnapshotKey && !record.historicSnapshotLocked) {
    errors.push(`${label} has an unlocked published historic snapshot.`);
    ready = false;
  }
  if (requireLockedPublishedSnapshot && !record.historicSnapshotLocked) {
    errors.push(`${label} is not locked into the published historic snapshot.`);
    ready = false;
  }
  return ready;
};

const validateLevel = (
  level: OrganisationalWeightLevel,
  expectations: readonly IOrganisationalWeightExpectation[],
  records: readonly IOrganisationalWeightRecord[],
  asOfDate: string,
  asOfTimestamp: number | undefined,
  requireLockedPublishedSnapshot: boolean,
  errors: string[]
): IOrganisationalWeightTotal[] => {
  const groups = new Map<string, IOrganisationalWeightExpectation[]>();
  expectations.filter(expectation => expectation.weightLevel === level).forEach(expectation => {
    const identity = groupIdentity(expectation);
    groups.set(identity, (groups.get(identity) || []).concat([expectation]));
  });

  const results: IOrganisationalWeightTotal[] = [];
  groups.forEach(group => {
    const parentKey = clean(group[0].parentKey);
    const missingMemberKeys: string[] = [];
    const invalidMemberKeys: string[] = [];
    let totalBasisPoints = 0;
    let governanceReady = true;

    group.forEach(expectation => {
      const identity = expectationIdentity(expectation);
      const matches = records.filter(record => expectationIdentity(record) === identity);
      const childKey = clean(expectation.childKey);
      const label = `${level} ${parentKey}/${childKey}`;
      if (matches.length === 0) {
        missingMemberKeys.push(childKey);
        errors.push(`${label} has no active weight for the selected year/version.`);
        return;
      }
      if (matches.length > 1) {
        invalidMemberKeys.push(childKey);
        errors.push(`${label} is duplicated for the selected year/version.`);
        return;
      }
      const record = matches[0];
      if (!isValidWeight(record.weightPercent)) {
        invalidMemberKeys.push(childKey);
        errors.push(`${label} has a blank or invalid weight.`);
      } else {
        totalBasisPoints += Math.round(record.weightPercent * 100);
      }
      if (!validateRecordGovernance(
        record, label, asOfDate, asOfTimestamp, requireLockedPublishedSnapshot, errors
      )) {
        governanceReady = false;
      }
    });

    const total = totalBasisPoints / 100;
    const complete = missingMemberKeys.length === 0 && invalidMemberKeys.length === 0;
    const exactTotal = complete && totalBasisPoints === 10000;
    if (complete && !exactTotal) {
      errors.push(`${level} group ${parentKey} active weights total ${total}%, not 100%.`);
    }
    results.push({
      groupKey: parentKey,
      weightLevel: level,
      total,
      memberCount: group.length,
      missingMemberKeys,
      invalidMemberKeys,
      complete,
      exactTotal,
      ready: complete && exactTotal && governanceReady
    });
  });
  return results.sort((left, right) => left.groupKey.localeCompare(right.groupKey));
};

export const validateOrganisationalWeighting = (
  input: IOrganisationalWeightingValidationInput
): IOrganisationalWeightingValidationResult => {
  const errors: string[] = [];
  if (!Number.isInteger(input.performanceYear) || input.performanceYear < 2000 || input.performanceYear > 2100
    || !clean(input.version)) {
    errors.push('Performance Year and version are required for organisational weighting.');
  }
  const asOfTimestamp = parseGovernedDate(input.asOfDate);
  if (asOfTimestamp === undefined) {
    errors.push('A valid as-of date is required for organisational weighting.');
  }

  const activeExpectations = input.expectedMembers.filter(expectation => expectation.active);
  const uniqueExpectations: IOrganisationalWeightExpectation[] = [];
  const seenExpectations = new Set<string>();
  activeExpectations.forEach(expectation => {
    const identity = expectationIdentity(expectation);
    if (!clean(expectation.parentKey) || !clean(expectation.childKey)) {
      errors.push(`${expectation.weightLevel} has an incomplete parent/child identity.`);
      return;
    }
    if (seenExpectations.has(identity)) {
      errors.push(`${expectation.weightLevel} ${clean(expectation.parentKey)}/${clean(expectation.childKey)} is duplicated in active hierarchy membership.`);
      return;
    }
    seenExpectations.add(identity);
    uniqueExpectations.push(expectation);
  });

  if (!uniqueExpectations.some(expectation => expectation.weightLevel === 'KPIWithinWorkstream')) {
    errors.push('No active KPI-within-Workstream weighting membership is configured.');
  }
  if (!uniqueExpectations.some(expectation => expectation.weightLevel === 'WorkstreamWithinPillar')) {
    errors.push('No active Workstream-within-Pillar weighting membership is configured.');
  }

  const kpiWorkstreamKeys = new Set(uniqueExpectations
    .filter(expectation => expectation.weightLevel === 'KPIWithinWorkstream')
    .map(expectation => normaliseKey(expectation.parentKey)));
  const configuredWorkstreamKeys = new Set(uniqueExpectations
    .filter(expectation => expectation.weightLevel === 'WorkstreamWithinPillar')
    .map(expectation => normaliseKey(expectation.childKey)));
  kpiWorkstreamKeys.forEach(workstreamKey => {
    if (!configuredWorkstreamKeys.has(workstreamKey)) {
      errors.push(`Workstream ${workstreamKey} has active KPI membership but no active Workstream-within-Pillar membership.`);
    }
  });
  configuredWorkstreamKeys.forEach(workstreamKey => {
    if (!kpiWorkstreamKeys.has(workstreamKey)) {
      errors.push(`Workstream ${workstreamKey} has active Pillar membership but no active KPI membership.`);
    }
  });

  const boardPillarKeys = new Set(uniqueExpectations
    .filter(expectation => expectation.weightLevel === 'PillarWithinBoard')
    .map(expectation => normaliseKey(expectation.childKey)));
  if (boardPillarKeys.size > 0) {
    const workstreamPillarKeys = new Set(uniqueExpectations
      .filter(expectation => expectation.weightLevel === 'WorkstreamWithinPillar')
      .map(expectation => normaliseKey(expectation.parentKey)));
    workstreamPillarKeys.forEach(pillarKey => {
      if (!boardPillarKeys.has(pillarKey)) {
        errors.push(`Pillar ${pillarKey} has active Workstream membership but no active Pillar-within-Board membership.`);
      }
    });
    boardPillarKeys.forEach(pillarKey => {
      if (!workstreamPillarKeys.has(pillarKey)) {
        errors.push(`Pillar ${pillarKey} has active Board membership but no active Workstream membership.`);
      }
    });
  }

  const selectedRecords = input.records.filter(record => record.active
    && sameSelection(record, input.performanceYear, input.version));

  const approvedYearRecords = input.records.filter(record => record.active
    && record.approvalStatus === 'Approved'
    && record.performanceYear === input.performanceYear);
  const approvedByMember = new Map<string, IOrganisationalWeightRecord[]>();
  approvedYearRecords.forEach(record => {
    const identity = expectationIdentity(record);
    approvedByMember.set(identity, (approvedByMember.get(identity) || []).concat([record]));
  });
  approvedByMember.forEach(group => {
    const ordered = group.slice().sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
    ordered.forEach((record, index) => {
      const from = parseGovernedDate(record.effectiveFrom);
      const parsedTo = parseGovernedDate(record.effectiveTo);
      const to = record.effectiveTo ? parsedTo : Number.POSITIVE_INFINITY;
      const label = `${record.weightLevel} ${clean(record.parentKey)}/${clean(record.childKey)} version ${record.version}`;
      if (from === undefined || to === undefined || from > to) {
        errors.push(`${label} has an invalid effective window.`);
      }
      ordered.slice(index + 1).forEach(other => {
        const otherFrom = parseGovernedDate(other.effectiveFrom);
        const parsedOtherTo = parseGovernedDate(other.effectiveTo);
        const otherTo = other.effectiveTo ? parsedOtherTo : Number.POSITIVE_INFINITY;
        if (normaliseKey(record.version) === normaliseKey(other.version)) {
          errors.push(`${label} is duplicated as an active approved version.`);
        } else if (from !== undefined && to !== undefined
          && otherFrom !== undefined && otherTo !== undefined
          && from <= otherTo && otherFrom <= to) {
          errors.push(`${record.weightLevel} ${clean(record.parentKey)}/${clean(record.childKey)} has overlapping active approved versions ${record.version} and ${other.version}.`);
        }
      });
    });
  });
  selectedRecords.forEach(record => {
    const identity = expectationIdentity(record);
    if (!seenExpectations.has(identity)) {
      errors.push(`${record.weightLevel} ${clean(record.parentKey)}/${clean(record.childKey)} is active but is not an active hierarchy member.`);
    }
  });

  const requireLocked = input.requireLockedPublishedSnapshot === true;
  const workstreamKpiTotals = validateLevel(
    'KPIWithinWorkstream', uniqueExpectations, selectedRecords,
    input.asOfDate, asOfTimestamp, requireLocked, errors
  );
  const pillarWorkstreamTotals = validateLevel(
    'WorkstreamWithinPillar', uniqueExpectations, selectedRecords,
    input.asOfDate, asOfTimestamp, requireLocked, errors
  );
  const boardPillarTotals = validateLevel(
    'PillarWithinBoard', uniqueExpectations, selectedRecords,
    input.asOfDate, asOfTimestamp, requireLocked, errors
  );
  const totals = workstreamKpiTotals.concat(pillarWorkstreamTotals, boardPillarTotals);
  const publicationReady = errors.length === 0 && totals.every(total => total.ready);

  return {
    valid: publicationReady,
    publicationReady,
    configurationState: publicationReady ? 'READY' : 'NOT READY',
    workstreamKpiTotals,
    pillarWorkstreamTotals,
    boardPillarTotals,
    errors
  };
};
