export type AdminControlApprovalStatus = 'Draft' | 'PendingApproval' | 'Approved' | 'Retired';
export type AdminOutputPublicationStatus = 'Draft' | 'Approved' | 'Published' | 'Retired';
export type AdminOutputMappingRequirement = 'Required' | 'Optional';
export type AdminReportingCadence = 'Quarterly' | 'Annual' | 'YearEndNarrative' | 'AdHoc';
export type AdminOutputFormat = 'XLSX' | 'CSV' | 'JSON' | 'WebFeed' | 'Other';

export interface IAdminOutputDefinition {
  id: number;
  outputCode: string;
  outputName: string;
  description?: string;
  active: boolean;
  reportingFrequency: string;
  mappingRequirement?: AdminOutputMappingRequirement;
  outputFormat?: AdminOutputFormat;
  effectiveFrom: string;
  effectiveTo?: string;
  version: string;
  publicationStatus: AdminOutputPublicationStatus;
  ownerEmail?: string;
  changeReference?: string;
  approvedByEmail?: string;
  approvedAt?: string;
}

export type AdminOutputDefinitionIssueCode =
  | 'IncompleteDefinition'
  | 'NoCurrentDefinition'
  | 'DuplicateDefinition'
  | 'OverlappingActiveDefinition'
  | 'InvalidEffectiveDates'
  | 'ExpiredActiveDefinition'
  | 'InvalidPublicationState';

export interface IAdminOutputDefinitionIssue {
  code: AdminOutputDefinitionIssueCode;
  outputCode: string;
  message: string;
}

export interface IAdminOutputDefinitionValidationResult {
  ready: boolean;
  asOfDate: string;
  activeCurrentOutputCodes: readonly string[];
  requiredCurrentOutputCodes: readonly string[];
  issues: readonly IAdminOutputDefinitionIssue[];
}

export interface IAdminOutputDefinitionDraftValidationResult {
  valid: boolean;
  fieldErrors: { [field: string]: string };
  issues: readonly string[];
}

export interface IAdminReportingKpiReference {
  kpiId: string;
  active: boolean;
  requiredForReporting: boolean;
}

export interface IAdminReportingMapRecord {
  id: number;
  mappingKey: string;
  /** Physical version-grouping key: KPIID|OutputCode. */
  naturalKey?: string;
  kpiId: string;
  outputCode: string;
  /** Existing physical row/field key; optional on Draft and Exclude rows. */
  externalKey?: string;
  treatment?: 'Direct' | 'Allocated' | 'CompositeComponent' | 'Narrative' | 'Exclude';
  /** Optional safe-UAT metadata pending a signed output-specific contract. */
  sectionKey?: string;
  /** Optional safe-UAT metadata pending a signed output-specific contract. */
  fieldKey?: string;
  allocationPercent?: number;
  treatmentRuleJson?: string;
  reportingCadence?: AdminReportingCadence;
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
  version: string;
  approvalStatus: AdminControlApprovalStatus;
  changeReference?: string;
  approvedByEmail?: string;
  approvedAt?: string;
}

export type AdminReportingMapIssueCode =
  | 'IncompleteMapping'
  | 'DuplicateMapping'
  | 'ExpiredMapping'
  | 'InvalidEffectiveDates'
  | 'UnknownOutput'
  | 'UnknownKpi'
  | 'UnmappedRequiredKpi'
  | 'UnmappedRequiredOutput'
  | 'RetiredKpiMapping'
  | 'UnapprovedMapping'
  | 'OutputDefinitionsNotReady';

export interface IAdminReportingMapIssue {
  code: AdminReportingMapIssueCode;
  mappingKey?: string;
  kpiId?: string;
  outputCode?: string;
  message: string;
}

export interface IAdminReportingMapValidationResult {
  ready: boolean;
  asOfDate: string;
  currentApprovedMappingCount: number;
  mappedRequiredKpiCount: number;
  requiredKpiCount: number;
  issues: readonly IAdminReportingMapIssue[];
}

export interface IAdminAuditRecord {
  id: number;
  auditKey: string;
  eventAt: string;
  actor: string;
  eventType: string;
  entityType: string;
  entityKey: string;
  correlationKey?: string;
  sourceReference?: string;
  beforeJson?: string;
  afterJson?: string;
  contextJson?: string;
}

export interface IAdminAuditFilter {
  dateFrom?: string;
  dateTo?: string;
  actor?: string;
  eventType?: string;
  entity?: string;
  correlationOrReference?: string;
}

export interface IAdminAuditReadView {
  mode: 'ReadOnly';
  editAllowed: false;
  records: readonly IAdminAuditRecord[];
}

export interface IAdminBoundedAuditReadRequest extends IAdminAuditFilter {
  dateFrom: string;
  dateTo: string;
  operation: 'ReadOnly';
  maximumRangeDays: number;
}

export interface IAdminReportingReadinessInput {
  kpiScoringMetadataReady?: boolean;
  kpiWeightsReady?: boolean;
  workstreamWeightsReady?: boolean;
  boardPillarWeightsRequired?: boolean;
  boardPillarWeightsReady?: boolean;
  reportingMapReady?: boolean;
  outputDefinitionsReady?: boolean;
  unresolvedDataQualityCount?: number;
}

export interface IAdminPublicationReadiness {
  ready: boolean;
  status: 'READY' | 'NOT READY';
  blockers: readonly string[];
}

export interface IAdminReportingReadinessResult {
  publicationStatus: 'READY' | 'NOT READY';
  weightedScorePublicationAllowed: boolean;
  gold: IAdminPublicationReadiness;
  board: IAdminPublicationReadiness;
  external: IAdminPublicationReadiness;
  blockers: readonly string[];
}

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();
const reportingCadences: readonly string[] = ['Quarterly', 'Annual', 'YearEndNarrative', 'AdHoc'];
const outputFormats: readonly string[] = ['XLSX', 'CSV', 'JSON', 'WebFeed', 'Other'];
const emailLooksValid = (value: string | undefined): boolean => (
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value))
);

const parseDate = (value: string | undefined): number | undefined => {
  if (!clean(value)) return undefined;
  const parsed = Date.parse(clean(value));
  return isFinite(parsed) ? parsed : undefined;
};

/** EffectiveFrom/EffectiveTo are SharePoint DateOnly values. Compare their UTC calendar day,
 * not the time-of-day in the page snapshot, so an inclusive EffectiveTo remains valid all day. */
const parseDateOnly = (value: string | undefined): number | undefined => {
  const parsed = parseDate(value);
  if (parsed === undefined) return undefined;
  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const dateRangeIsValid = (effectiveFrom: string, effectiveTo: string | undefined): boolean => {
  const from = parseDateOnly(effectiveFrom);
  const to = parseDateOnly(effectiveTo);
  return from !== undefined && (!clean(effectiveTo) || (to !== undefined && to >= from));
};

const effectiveOn = (
  effectiveFrom: string,
  effectiveTo: string | undefined,
  asOfTimestamp: number
): boolean => {
  const from = parseDateOnly(effectiveFrom);
  const to = parseDateOnly(effectiveTo);
  return from !== undefined && from <= asOfTimestamp && (to === undefined || to >= asOfTimestamp);
};

const rangesOverlap = (
  leftFrom: string,
  leftTo: string | undefined,
  rightFrom: string,
  rightTo: string | undefined
): boolean => {
  const leftStart = parseDateOnly(leftFrom);
  const rightStart = parseDateOnly(rightFrom);
  if (leftStart === undefined || rightStart === undefined) return false;
  const leftEnd = parseDateOnly(leftTo);
  const rightEnd = parseDateOnly(rightTo);
  const leftMaximum = leftEnd === undefined ? Number.POSITIVE_INFINITY : leftEnd;
  const rightMaximum = rightEnd === undefined ? Number.POSITIVE_INFINITY : rightEnd;
  return leftStart <= rightMaximum && rightStart <= leftMaximum;
};

const outputIdentity = (definition: IAdminOutputDefinition): string => (
  normalise(definition.outputCode)
);

const validStoredRule = (value: string | undefined): boolean => {
  if (!clean(value)) return false;
  try {
    const parsed = JSON.parse(clean(value)) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
};

/**
 * Validates a browser-memory Output Definition before it can be appended,
 * replaced or represented by a local Audit event. Publication approval fields
 * are intentionally outside this Draft gate and remain governed separately by
 * validateOutputDefinitions.
 */
export const validateAdminOutputDefinitionDraft = (
  definition: Partial<IAdminOutputDefinition>
): IAdminOutputDefinitionDraftValidationResult => {
  const fieldErrors: { [field: string]: string } = {};
  const required = (field: string, value: string | undefined, label: string): void => {
    if (!clean(value)) fieldErrors[field] = label + ' is required.';
  };

  required('outputCode', definition.outputCode, 'Output Code');
  required('outputName', definition.outputName, 'Output Name');
  required('description', definition.description, 'Description');
  required('version', definition.version, 'Schema version');
  required('changeReference', definition.changeReference, 'Change reference');
  required('effectiveFrom', definition.effectiveFrom, 'Effective from');

  if (reportingCadences.indexOf(clean(definition.reportingFrequency)) < 0) {
    fieldErrors.reportingFrequency = 'Choose a supported reporting frequency.';
  }
  if (definition.mappingRequirement !== 'Required' && definition.mappingRequirement !== 'Optional') {
    fieldErrors.mappingRequirement = 'Choose Required or Optional.';
  }
  if (outputFormats.indexOf(clean(definition.outputFormat)) < 0) {
    fieldErrors.outputFormat = 'Choose a supported output format.';
  }
  if (!clean(definition.ownerEmail)) {
    fieldErrors.ownerEmail = 'Owner Email is required.';
  } else if (!emailLooksValid(definition.ownerEmail)) {
    fieldErrors.ownerEmail = 'Enter a valid Owner Email.';
  }
  if (clean(definition.effectiveFrom)
    && !dateRangeIsValid(clean(definition.effectiveFrom), definition.effectiveTo)) {
    fieldErrors.effectiveFrom = 'Enter valid effective dates; Effective to cannot precede Effective from.';
  }

  const issues = Object.keys(fieldErrors).sort().map(field => fieldErrors[field]);
  return { valid: issues.length === 0, fieldErrors, issues };
};

export const validateOutputDefinitions = (
  definitions: readonly IAdminOutputDefinition[],
  asOfDate: string
): IAdminOutputDefinitionValidationResult => {
  const issues: IAdminOutputDefinitionIssue[] = [];
  const seenIdentities: { [key: string]: boolean } = {};
  const asOfTimestamp = parseDateOnly(asOfDate);
  const current: IAdminOutputDefinition[] = [];

  if (asOfTimestamp === undefined) {
    issues.push({ code: 'InvalidEffectiveDates', outputCode: '', message: 'Reporting as-of date is invalid.' });
  }

  definitions.forEach(definition => {
    const code = clean(definition.outputCode);
    if (!code || !clean(definition.outputName) || !clean(definition.reportingFrequency)
      || !clean(definition.version) || !clean(definition.effectiveFrom)
      || reportingCadences.indexOf(clean(definition.reportingFrequency)) < 0
      || (definition.mappingRequirement !== 'Required' && definition.mappingRequirement !== 'Optional')) {
      issues.push({
        code: 'IncompleteDefinition',
        outputCode: code,
        message: 'Output Definition requires Code, Name, a supported frequency, explicit Required/Optional mapping state, effective-from date and version.'
      });
    }
    if (!clean(definition.description) || outputFormats.indexOf(clean(definition.outputFormat)) < 0
      || !clean(definition.ownerEmail) || !clean(definition.changeReference)) {
      issues.push({
        code: 'IncompleteDefinition',
        outputCode: code,
        message: 'Output Definition requires its stored Description, Output Format, Owner Email and Change Reference.'
      });
    }
    const rowIdentity = outputIdentity(definition);
    if (seenIdentities[rowIdentity]) {
      issues.push({
        code: 'DuplicateDefinition',
        outputCode: code,
        message: 'Output Code ' + code + ' is duplicated; physical storage permits one row per code.'
      });
    }
    seenIdentities[rowIdentity] = true;
    if (!dateRangeIsValid(definition.effectiveFrom, definition.effectiveTo)) {
      issues.push({
        code: 'InvalidEffectiveDates',
        outputCode: code,
        message: 'Output Definition ' + code + ' has invalid effective dates.'
      });
    }
    if (definition.active && definition.publicationStatus === 'Retired') {
      issues.push({
        code: 'InvalidPublicationState',
        outputCode: code,
        message: 'Retired Output Definition ' + code + ' cannot remain active.'
      });
    }
    const expiry = parseDateOnly(definition.effectiveTo);
    if (definition.active && expiry !== undefined && asOfTimestamp !== undefined && expiry < asOfTimestamp) {
      issues.push({
        code: 'ExpiredActiveDefinition',
        outputCode: code,
        message: 'Output Definition ' + code + ' is active but expired.'
      });
    }
    if (definition.active && asOfTimestamp !== undefined
      && effectiveOn(definition.effectiveFrom, definition.effectiveTo, asOfTimestamp)) current.push(definition);
  });

  for (let leftIndex = 0; leftIndex < definitions.length; leftIndex += 1) {
    const left = definitions[leftIndex];
    if (!left.active) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < definitions.length; rightIndex += 1) {
      const right = definitions[rightIndex];
      if (right.active && normalise(left.outputCode) === normalise(right.outputCode)
        && rangesOverlap(left.effectiveFrom, left.effectiveTo, right.effectiveFrom, right.effectiveTo)) {
        issues.push({
          code: 'OverlappingActiveDefinition',
          outputCode: clean(left.outputCode),
          message: 'Output Definition ' + clean(left.outputCode) + ' has overlapping active versions.'
        });
      }
    }
  }

  current.forEach(definition => {
    if (definition.publicationStatus !== 'Approved' && definition.publicationStatus !== 'Published') {
      issues.push({
        code: 'InvalidPublicationState',
        outputCode: clean(definition.outputCode),
        message: 'Current Output Definition ' + clean(definition.outputCode) + ' is not approved for publication.'
      });
    }
    if (!clean(definition.approvedByEmail) || parseDate(definition.approvedAt) === undefined) {
      issues.push({
        code: 'InvalidPublicationState',
        outputCode: clean(definition.outputCode),
        message: 'Current Output Definition ' + clean(definition.outputCode)
          + ' requires stored approver email and a valid approval timestamp.'
      });
    }
  });

  const currentCodes: string[] = [];
  const requiredCodes: string[] = [];
  current.forEach(definition => {
    const code = clean(definition.outputCode);
    if (currentCodes.map(normalise).indexOf(normalise(code)) < 0) currentCodes.push(code);
    if (definition.mappingRequirement === 'Required'
      && requiredCodes.map(normalise).indexOf(normalise(code)) < 0) requiredCodes.push(code);
  });
  currentCodes.sort((left, right) => left.localeCompare(right));
  requiredCodes.sort((left, right) => left.localeCompare(right));
  if (!currentCodes.length) {
    issues.push({
      code: 'NoCurrentDefinition',
      outputCode: '',
      message: 'No active current Output Definition is available.'
    });
  }

  return {
    ready: issues.length === 0,
    asOfDate: clean(asOfDate),
    activeCurrentOutputCodes: currentCodes,
    requiredCurrentOutputCodes: requiredCodes,
    issues
  };
};

/** The approved physical natural path is KPIID|OutputCode. ExternalKey is versioned
 * mapping content and must not allow overlapping paths to evade duplicate detection. */
const mapPathIdentity = (mapping: IAdminReportingMapRecord): string => [
  normalise(mapping.kpiId),
  normalise(mapping.outputCode)
].join('|');

export const validateReportingMaps = (
  mappings: readonly IAdminReportingMapRecord[],
  outputDefinitions: readonly IAdminOutputDefinition[],
  kpis: readonly IAdminReportingKpiReference[],
  asOfDate: string
): IAdminReportingMapValidationResult => {
  const issues: IAdminReportingMapIssue[] = [];
  const outputValidation = validateOutputDefinitions(outputDefinitions, asOfDate);
  const asOfTimestamp = parseDateOnly(asOfDate);
  const currentOutputCodes = outputValidation.activeCurrentOutputCodes.map(normalise);
  const kpiById: { [key: string]: IAdminReportingKpiReference } = {};
  const seenMappingKeys: { [key: string]: boolean } = {};
  const currentApproved: IAdminReportingMapRecord[] = [];

  if (!outputValidation.ready) {
    issues.push({
      code: 'OutputDefinitionsNotReady',
      message: 'Reporting Map cannot be ready while Output Definitions are not ready.'
    });
  }
  kpis.forEach(kpi => { kpiById[normalise(kpi.kpiId)] = kpi; });

  mappings.forEach(mapping => {
    const mappingKey = clean(mapping.mappingKey);
    const kpiId = clean(mapping.kpiId);
    const outputCode = clean(mapping.outputCode);
    if (!mappingKey || !kpiId || !outputCode || !clean(mapping.version) || !clean(mapping.effectiveFrom)) {
      issues.push({
        code: 'IncompleteMapping', mappingKey, kpiId, outputCode,
        message: 'Reporting Map requires identity, KPI, output, effective-from date and version.'
      });
    }
    const expectedNaturalKey = [kpiId, outputCode].join('|');
    if (!clean(mapping.naturalKey) || normalise(mapping.naturalKey) !== normalise(expectedNaturalKey)
      || mapping.treatment === undefined
      || mapping.allocationPercent === undefined || !isFinite(mapping.allocationPercent)
      || mapping.allocationPercent < 0 || mapping.allocationPercent > 100
      || reportingCadences.indexOf(clean(mapping.reportingCadence)) < 0
      || !clean(mapping.changeReference)) {
      issues.push({
        code: 'IncompleteMapping', mappingKey, kpiId, outputCode,
        message: 'Reporting Map requires its canonical KPI|Output natural key, Treatment, 0-100 Allocation, supported cadence and Change Reference.'
      });
    }
    if ((mapping.treatment === 'Allocated' || mapping.treatment === 'CompositeComponent'
      || mapping.treatment === 'Narrative') && !validStoredRule(mapping.treatmentRuleJson)) {
      issues.push({
        code: 'IncompleteMapping', mappingKey, kpiId, outputCode,
        message: 'Complex non-Direct Reporting Map treatment requires a stored valid TreatmentRuleJSON object.'
      });
    }
    if (mapping.approvalStatus === 'Approved'
      && (!clean(mapping.approvedByEmail) || parseDate(mapping.approvedAt) === undefined)) {
      issues.push({
        code: 'IncompleteMapping', mappingKey, kpiId, outputCode,
        message: 'Approved Reporting Map requires stored approver email and a valid approval timestamp.'
      });
    }
    if (mapping.active && mapping.approvalStatus === 'Approved'
      && mapping.treatment !== 'Exclude' && !clean(mapping.externalKey)) {
      issues.push({
        code: 'IncompleteMapping', mappingKey, kpiId, outputCode,
        message: 'An approved active publishable Reporting Map requires an External Key.'
      });
    }
    const normalisedMappingKey = normalise(mappingKey);
    if (seenMappingKeys[normalisedMappingKey]) {
      issues.push({
        code: 'DuplicateMapping', mappingKey, kpiId, outputCode,
        message: 'Reporting Map key ' + mappingKey + ' is duplicated.'
      });
    }
    seenMappingKeys[normalisedMappingKey] = true;
    if (!dateRangeIsValid(mapping.effectiveFrom, mapping.effectiveTo)) {
      issues.push({
        code: 'InvalidEffectiveDates', mappingKey, kpiId, outputCode,
        message: 'Reporting Map ' + mappingKey + ' has invalid effective dates.'
      });
    }
    const expiry = parseDateOnly(mapping.effectiveTo);
    if (mapping.active && expiry !== undefined && asOfTimestamp !== undefined && expiry < asOfTimestamp) {
      issues.push({
        code: 'ExpiredMapping', mappingKey, kpiId, outputCode,
        message: 'Reporting Map ' + mappingKey + ' is active but expired.'
      });
    }
    if (mapping.active && currentOutputCodes.indexOf(normalise(outputCode)) < 0) {
      issues.push({
        code: 'UnknownOutput', mappingKey, kpiId, outputCode,
        message: 'Reporting Map ' + mappingKey + ' references an unknown or unavailable Output Definition.'
      });
    }
    const kpi = kpiById[normalise(kpiId)];
    if (!kpi) {
      issues.push({
        code: 'UnknownKpi', mappingKey, kpiId, outputCode,
        message: 'Reporting Map ' + mappingKey + ' references an unknown KPI.'
      });
    } else if (mapping.active && !kpi.active) {
      issues.push({
        code: 'RetiredKpiMapping', mappingKey, kpiId, outputCode,
        message: 'Reporting Map ' + mappingKey + ' references retired KPI ' + kpiId + '.'
      });
    }
    if (mapping.active && asOfTimestamp !== undefined
      && effectiveOn(mapping.effectiveFrom, mapping.effectiveTo, asOfTimestamp)) {
      if (mapping.approvalStatus !== 'Approved') {
        issues.push({
          code: 'UnapprovedMapping', mappingKey, kpiId, outputCode,
          message: 'Current Reporting Map ' + mappingKey + ' is not approved.'
        });
      } else if (mapping.treatment !== 'Exclude' && kpi && kpi.active
        && currentOutputCodes.indexOf(normalise(outputCode)) >= 0) {
        currentApproved.push(mapping);
      }
    }
  });

  for (let leftIndex = 0; leftIndex < mappings.length; leftIndex += 1) {
    const left = mappings[leftIndex];
    if (!left.active) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < mappings.length; rightIndex += 1) {
      const right = mappings[rightIndex];
      if (right.active && mapPathIdentity(left) === mapPathIdentity(right)
        && rangesOverlap(left.effectiveFrom, left.effectiveTo, right.effectiveFrom, right.effectiveTo)) {
        issues.push({
          code: 'DuplicateMapping',
          mappingKey: clean(left.mappingKey) + ' / ' + clean(right.mappingKey),
          kpiId: clean(left.kpiId),
          outputCode: clean(left.outputCode),
          message: 'Reporting Map path is duplicated across overlapping active periods.'
        });
      }
    }
  }

  let mappedRequiredKpiCount = 0;
  const requiredKpis = kpis.filter(kpi => kpi.active && kpi.requiredForReporting);
  requiredKpis.forEach(kpi => {
    const mapped = currentApproved.some(mapping => normalise(mapping.kpiId) === normalise(kpi.kpiId));
    if (mapped) mappedRequiredKpiCount += 1;
    else {
      issues.push({
        code: 'UnmappedRequiredKpi', kpiId: clean(kpi.kpiId),
        message: 'Required KPI ' + clean(kpi.kpiId) + ' has no current approved Reporting Map.'
      });
    }
  });

  outputValidation.requiredCurrentOutputCodes.forEach(outputCode => {
    if (!currentApproved.some(mapping => normalise(mapping.outputCode) === normalise(outputCode))) {
      issues.push({
        code: 'UnmappedRequiredOutput', outputCode,
        message: 'Required Output Definition ' + outputCode + ' has no current approved Reporting Map.'
      });
    }
  });

  return {
    ready: issues.length === 0,
    asOfDate: clean(asOfDate),
    currentApprovedMappingCount: currentApproved.length,
    mappedRequiredKpiCount,
    requiredKpiCount: requiredKpis.length,
    issues
  };
};

const cloneAudit = (record: IAdminAuditRecord): IAdminAuditRecord => ({ ...record });

export const buildBoundedAuditReadRequest = (
  filter: IAdminAuditFilter,
  maximumRangeDays: number = 93
): IAdminBoundedAuditReadRequest => {
  const from = parseDate(filter.dateFrom);
  const to = parseDate(filter.dateTo);
  if (from === undefined || to === undefined) {
    throw new Error('Audit reads require valid dateFrom and dateTo boundaries.');
  }
  if (to < from) throw new Error('Audit dateTo must be on or after dateFrom.');
  if (!isFinite(maximumRangeDays) || maximumRangeDays <= 0) {
    throw new Error('Audit maximum range must be a positive number of days.');
  }
  const rangeDays = (to - from) / (24 * 60 * 60 * 1000);
  if (rangeDays > maximumRangeDays) {
    throw new Error('Audit read range exceeds the bounded maximum of ' + maximumRangeDays + ' days.');
  }
  return {
    ...filter,
    dateFrom: clean(filter.dateFrom),
    dateTo: clean(filter.dateTo),
    operation: 'ReadOnly',
    maximumRangeDays
  };
};

export const filterAuditEventsReadOnly = (
  records: readonly IAdminAuditRecord[],
  filter: IAdminAuditFilter = {}
): IAdminAuditReadView => {
  const fromValue = clean(filter.dateFrom);
  const toValue = clean(filter.dateTo);
  const from = parseDate(/^\d{4}-\d{2}-\d{2}$/.test(fromValue)
    ? fromValue + 'T00:00:00.000Z'
    : fromValue);
  const to = parseDate(/^\d{4}-\d{2}-\d{2}$/.test(toValue)
    ? toValue + 'T23:59:59.999Z'
    : toValue);
  const actor = normalise(filter.actor);
  const eventType = normalise(filter.eventType);
  const entity = normalise(filter.entity);
  const correlation = normalise(filter.correlationOrReference);
  return {
    mode: 'ReadOnly',
    editAllowed: false,
    records: records.filter(record => {
      const eventAt = parseDate(record.eventAt);
      if (from !== undefined && (eventAt === undefined || eventAt < from)) return false;
      if (to !== undefined && (eventAt === undefined || eventAt > to)) return false;
      if (actor && normalise(record.actor).indexOf(actor) < 0) return false;
      if (eventType && normalise(record.eventType) !== eventType) return false;
      if (entity && (normalise(record.entityType) + ' ' + normalise(record.entityKey)).indexOf(entity) < 0) return false;
      if (correlation && (normalise(record.correlationKey) + ' ' + normalise(record.sourceReference))
        .indexOf(correlation) < 0) return false;
      return true;
    }).map(cloneAudit).sort((left, right) => right.eventAt.localeCompare(left.eventAt))
  };
};

const publication = (blockers: readonly string[]): IAdminPublicationReadiness => ({
  ready: blockers.length === 0,
  status: blockers.length === 0 ? 'READY' : 'NOT READY',
  blockers: blockers.slice()
});

const addUnique = (target: string[], value: string): void => {
  if (target.indexOf(value) < 0) target.push(value);
};

export const assessReportingReadiness = (
  input: IAdminReportingReadinessInput
): IAdminReportingReadinessResult => {
  const goldBlockers: string[] = [];
  if (input.kpiScoringMetadataReady !== true) goldBlockers.push('KPI scoring metadata is not ready.');
  if (input.kpiWeightsReady !== true) goldBlockers.push('KPI organisational weights are not ready.');
  if (input.workstreamWeightsReady !== true) goldBlockers.push('Workstream organisational weights are not ready.');
  if (input.unresolvedDataQualityCount === undefined || input.unresolvedDataQualityCount < 0) {
    goldBlockers.push('Unresolved Data Quality could not be confirmed.');
  } else if (input.unresolvedDataQualityCount > 0) {
    goldBlockers.push('Unresolved Data Quality issues remain: ' + input.unresolvedDataQualityCount + '.');
  }

  const boardBlockers = goldBlockers.slice();
  if (input.boardPillarWeightsRequired && input.boardPillarWeightsReady !== true) {
    boardBlockers.push('Board Pillar weights are required but not ready.');
  }
  if (input.reportingMapReady !== true) boardBlockers.push('Reporting Map is not ready.');
  if (input.outputDefinitionsReady !== true) boardBlockers.push('Output Definitions are not ready.');

  const externalBlockers = goldBlockers.slice();
  if (input.reportingMapReady !== true) externalBlockers.push('Reporting Map is not ready.');
  if (input.outputDefinitionsReady !== true) externalBlockers.push('Output Definitions are not ready.');

  const allBlockers: string[] = [];
  goldBlockers.concat(boardBlockers, externalBlockers).forEach(blocker => addUnique(allBlockers, blocker));
  const gold = publication(goldBlockers);
  const board = publication(boardBlockers);
  const external = publication(externalBlockers);
  const ready = gold.ready && board.ready && external.ready;
  return {
    publicationStatus: ready ? 'READY' : 'NOT READY',
    weightedScorePublicationAllowed: gold.ready,
    gold,
    board,
    external,
    blockers: allBlockers
  };
};
