import type { IAnnualWorkplan } from '../models/ProductionModels';
import {
  DELIVERY_PUBLICATION_V1, type GovernedDeliveryPublicationProposal,
  type IDeliveryPublicationManagerObservations, type IDeliveryPublicationNativeCoordinates,
  type IGlobalDeliveryPublicationProposal, type IManagerDeliveryPublicationProposal
} from '../models/GovernedDeliveryPublicationV1Models';
import { ADMIN_OVERALL_DELIVERY_CONFIG_KEYS, type IAdminOverallDeliveryConfigurationContract } from './AdminConfigDomain';
import {
  approveDeliveryWeightOverride, bindAuthoritativeDeliveryWeightOverrideCapability,
  resolveGovernedDeliveryWeightConfiguration, validateDeliveryCategoryWeights,
  type IDeliveryCategoryWeights, type IDeliveryWeightOverrideRequest,
  type IGovernedDeliveryWeightConfigurationContract
} from './CategoryWeightingPolicy';
import { canonicalisePlainRecord } from './SecurityBoundaryCanonicalisation';

const hold = (detail: string): never => { throw new Error(`Delivery publication HOLD: ${detail}`); };
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const exactEtag = (value: unknown): boolean => text(value) && !value.includes('*');
const utc = (value: unknown): value is string => typeof value === 'string'
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const positive = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) > 0;
const year = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 2000 && (value as number) <= 2100;
const email = (value: string): string => value.trim().toLowerCase();
const sameWeights = (left: Readonly<IDeliveryCategoryWeights>, right: Readonly<IDeliveryCategoryWeights>): boolean =>
  left.core === right.core && left.impact === right.impact;

// Inputs are recursively copied/frozen before any validation or approval; required keys
// are checked separately because the existing canonicaliser only rejects extra keys.
const keys = (value: unknown, required: readonly string[], optional: readonly string[] = []): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) hold('A complete record is required.');
  const actual = Object.keys(value as object);
  if (required.some(key => !actual.includes(key))
    || actual.some(key => !required.includes(key) && !optional.includes(key))) hold('Closed record keys differ.');
};
const sameValue = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.keys(left); const b = Object.keys(right);
  return a.length === b.length && a.every(key => b.includes(key)
    && sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
};
const weights = (value: Readonly<IDeliveryCategoryWeights>): void => {
  keys(value, ['core', 'impact']);
  if (!validateDeliveryCategoryWeights(value, 'Observed governed weighting.').valid) hold('Invalid Delivery weights.');
};

const payloadValid = (payload: Readonly<IGovernedDeliveryWeightConfigurationContract>): void => {
  keys(payload, ['schema', 'immutable', 'published', 'authority', 'defaultWeights', 'activeWeights']);
  keys(payload.authority, ['configurationId', 'version', 'etag', 'approvalReference', 'contentSha256',
    'effectiveFrom', 'publishedAt', 'publishedBy', 'changeReference']);
  weights(payload.defaultWeights); weights(payload.activeWeights);
  const authority = payload.authority;
  if (!Object.values(authority).every(text) || !exactEtag(authority.etag) || !utc(authority.publishedAt)) {
    hold('Complete separate publisher observations are required.');
  }
  // Deterministic validity as of the observed publication time; no wall-clock inference
  // or conversion of Config identities into publisher authority occurs here.
  resolveGovernedDeliveryWeightConfiguration(payload, authority, new Date(authority.publishedAt));
};

const configValid = (source: Readonly<IAdminOverallDeliveryConfigurationContract>): void => {
  keys(source, ['schema', 'schemaVersion', 'sourceList', 'environment', 'performanceYear', 'versionToken',
    'weights', 'includedCategories', 'excludedCategories', 'behavioursExcludedFromDeliveryArithmetic',
    'poorCoreMaskingGuard', 'poorCoreThresholdConfiguredHere', 'authority', 'tenantMutationExecuted']);
  keys(source.weights, ['core', 'impact', 'total']); keys(source.authority, ['core', 'impact']);
  if (source.schema !== 'KCF.OverallDelivery.Configuration' || source.schemaVersion !== 1
    || source.sourceList !== 'KCFKPI_Config' || !text(source.environment) || !year(source.performanceYear)
    || !sameValue(source.includedCategories, ['Core', 'Impact']) || !sameValue(source.excludedCategories, ['Behaviours'])
    || source.behavioursExcludedFromDeliveryArithmetic !== true
    || source.poorCoreMaskingGuard !== 'RequiredDownstreamGovernedRule'
    || source.poorCoreThresholdConfiguredHere !== false || source.tenantMutationExecuted !== false
    || !Number.isInteger(source.weights.core) || !Number.isInteger(source.weights.impact)
    || source.weights.total !== 100 || !validateDeliveryCategoryWeights(source.weights, 'Governed Config.').valid) {
    hold('Invalid complete Admin Delivery configuration.');
  }
  (['core', 'impact'] as const).forEach(category => {
    const row = source.authority[category]; keys(row, ['identity', 'provenance']);
    keys(row.identity, ['itemId', 'key', 'environment', 'etag', 'state']);
    keys(row.provenance, ['modifiedAt', 'modifiedBy', 'changeReference']);
    if (!positive(row.identity.itemId) || !exactEtag(row.identity.etag) || row.identity.state !== 'Active'
      || row.identity.environment !== source.environment
      || row.identity.key !== ADMIN_OVERALL_DELIVERY_CONFIG_KEYS[category === 'core' ? 'coreWeight' : 'impactWeight']
      || !utc(row.provenance.modifiedAt) || !text(row.provenance.modifiedBy) || !text(row.provenance.changeReference)) {
      hold('Config row identity or modification provenance is incomplete.');
    }
  });
  const core = source.authority.core.identity; const impact = source.authority.impact.identity;
  if (core.itemId === impact.itemId || source.versionToken !== `${core.itemId}@${core.etag}|${impact.itemId}@${impact.etag}`) {
    hold('Config version does not match both exact source rows.');
  }
};

const globalValid = (proposal: Readonly<IGlobalDeliveryPublicationProposal>): void => {
  keys(proposal, ['contract', 'purposeApproval', 'scope', 'payload', 'provenance']);
  keys(proposal.scope, ['kind', 'year']); keys(proposal.provenance, ['configSource']);
  if (proposal.contract !== DELIVERY_PUBLICATION_V1 || proposal.purposeApproval !== 'KCF-KPI-PM83-D001'
    || proposal.scope.kind !== 'GlobalDefault') hold('Wrong GlobalDefault publication contract.');
  configValid(proposal.provenance.configSource); payloadValid(proposal.payload);
  const source = proposal.provenance.configSource;
  if (proposal.scope.year !== source.performanceYear || !sameWeights(source.weights, proposal.payload.activeWeights)
    || Date.parse(source.authority.core.provenance.modifiedAt) > Date.parse(proposal.payload.authority.publishedAt)
    || Date.parse(source.authority.impact.provenance.modifiedAt) > Date.parse(proposal.payload.authority.publishedAt)) {
    hold('Global publication differs from its observed configuration.');
  }
};

const nativeValid = (native: Readonly<IDeliveryPublicationNativeCoordinates>): void => {
  keys(native, ['siteId', 'webId', 'listId', 'itemId', 'version', 'etag']);
  const guid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  if (![native.siteId, native.webId, native.listId].every(value => typeof value === 'string' && guid.test(value))
    || !positive(native.itemId) || !text(native.version) || native.version.includes('*') || !exactEtag(native.etag)) {
    hold('Exact native coordinates/version/ETag are required.');
  }
};

const workplanRequired = ['id', 'etag', 'workplanKey', 'personKey', 'employeeDisplayName', 'employeeEmail',
  'performanceYear', 'state', 'accessState', 'transitionStatus', 'coreCategoryWeight', 'personalCategoryWeight',
  'behaviourCategoryWeight', 'rowVersionToken'];
const workplanOptional = ['managerPersonKey', 'managerDisplayName', 'managerEmail', 'transitionCorrelationKey',
  'overallDeliveryWeightConfiguration', 'categoryWeightReason', 'submittedAt', 'submittedByEmail',
  'managerDecisionComment', 'approvedAt', 'approvedByEmail', 'lockedAt', 'lockedByEmail'];
const workplanValid = (workplan: Readonly<IAnnualWorkplan>): void => {
  keys(workplan, workplanRequired, workplanOptional);
  if (!positive(workplan.id) || !exactEtag(workplan.etag) || !text(workplan.workplanKey) || !text(workplan.personKey)
    || !text(workplan.employeeDisplayName) || !text(workplan.employeeEmail) || !year(workplan.performanceYear)
    || !text(workplan.accessState) || !positive(workplan.rowVersionToken)
    || !['Draft', 'ChangesRequested'].includes(workplan.state) || workplan.transitionStatus !== 'Ready'
    || ![workplan.coreCategoryWeight, workplan.personalCategoryWeight, workplan.behaviourCategoryWeight].every(Number.isFinite)
    || workplanOptional.filter(key => key !== 'overallDeliveryWeightConfiguration').some(key => {
      const value = (workplan as unknown as Record<string, unknown>)[key];
      return value !== undefined && typeof value !== 'string';
    })) hold('An exact mutable Draft/ChangesRequested Workplan with Ready transition is required.');
  if (workplan.overallDeliveryWeightConfiguration !== undefined) {
    const current = workplan.overallDeliveryWeightConfiguration;
    keys(current, ['configurationKey', 'configurationVersion', 'coreWeight', 'impactWeight', 'sourceReference']);
    if (!text(current.configurationKey) || !text(current.configurationVersion)
      || current.sourceReference !== 'KCF-KPI-Sponsor-PD-01') hold('Workplan Delivery configuration is incomplete.');
    weights({ core: current.coreWeight, impact: current.impactWeight });
  }
};

const observationsValid = (observations: Readonly<IDeliveryPublicationManagerObservations>, baseline: Readonly<IGlobalDeliveryPublicationProposal>): void => {
  keys(observations, ['workplanSource', 'actorSource', 'subjectSource']);
  [observations.workplanSource, observations.actorSource, observations.subjectSource].forEach(source => {
    keys(source, ['native', 'value']); nativeValid(source.native);
  });
  const workplan = observations.workplanSource.value;
  const actor = observations.actorSource.value; const subject = observations.subjectSource.value;
  workplanValid(workplan);
  keys(actor, ['personKey', 'email', 'appRoles', 'active']);
  keys(subject, ['personKey', 'managerPersonKey', 'managerEmail']);
  if (![actor.personKey, actor.email, subject.personKey, subject.managerPersonKey, subject.managerEmail,
    workplan.managerPersonKey, workplan.managerEmail].every(text) || !Array.isArray(actor.appRoles)
    || actor.active !== true || !actor.appRoles.includes('Manager') || actor.appRoles.includes('SystemAdmin')
    || workplan.id !== observations.workplanSource.native.itemId || workplan.etag !== observations.workplanSource.native.etag
    || workplan.performanceYear !== baseline.scope.year || workplan.personKey !== subject.personKey
    || actor.personKey === subject.personKey || email(actor.email) === email(workplan.employeeEmail)
    || actor.personKey !== subject.managerPersonKey || workplan.managerPersonKey !== subject.managerPersonKey
    || email(workplan.managerEmail || '') !== email(subject.managerEmail || '')
    || email(actor.email) !== email(subject.managerEmail || '')) hold('Workplan and assigned active Manager observations disagree.');
  const wpNative = observations.workplanSource.native;
  if ([observations.actorSource.native, observations.subjectSource.native].some(source =>
    source.siteId !== wpNative.siteId || source.webId !== wpNative.webId)
    || observations.actorSource.native.listId !== observations.subjectSource.native.listId
    || observations.actorSource.native.itemId === observations.subjectSource.native.itemId) {
    hold('Workplan and People coordinates disagree.');
  }
};

const currentWeights = (baseline: Readonly<IGlobalDeliveryPublicationProposal>, workplan: Readonly<IAnnualWorkplan>): Readonly<IDeliveryCategoryWeights> =>
  workplan.overallDeliveryWeightConfiguration
    ? { core: workplan.overallDeliveryWeightConfiguration.coreWeight, impact: workplan.overallDeliveryWeightConfiguration.impactWeight }
    : baseline.payload.activeWeights;

/** Caller owns trusted backend reads. Plain observations confer no protected origin. */
export const buildGlobalDeliveryPublicationProposal = (
  source: Readonly<IAdminOverallDeliveryConfigurationContract>, payload: Readonly<IGovernedDeliveryWeightConfigurationContract>
): Readonly<IGlobalDeliveryPublicationProposal> => {
  const observed = canonicalisePlainRecord({ source, payload }, 'Delivery global proposal inputs');
  const proposal = canonicalisePlainRecord<IGlobalDeliveryPublicationProposal>({
    contract: DELIVERY_PUBLICATION_V1, purposeApproval: 'KCF-KPI-PM83-D001',
    scope: { kind: 'GlobalDefault', year: observed.source.performanceYear },
    payload: observed.payload, provenance: { configSource: observed.source }
  }, 'Delivery global proposal');
  globalValid(proposal); return proposal;
};

/** Always binds its own capability and invokes the existing governed approval policy. */
export const buildManagerDeliveryPublicationProposal = (
  baseline: Readonly<IGlobalDeliveryPublicationProposal>, observations: Readonly<IDeliveryPublicationManagerObservations>,
  request: Readonly<IDeliveryWeightOverrideRequest>, payload: Readonly<IGovernedDeliveryWeightConfigurationContract>
): Readonly<IManagerDeliveryPublicationProposal> => {
  const input = canonicalisePlainRecord({ baseline, observations, request, payload }, 'Delivery Manager proposal inputs');
  globalValid(input.baseline); observationsValid(input.observations, input.baseline); payloadValid(input.payload);
  const workplan = input.observations.workplanSource.value;
  const actor = input.observations.actorSource.value; const subject = input.observations.subjectSource.value;
  keys(input.request, ['auditKey', 'current', 'proposed', 'reason', 'subjectPersonKey', 'actorEmail', 'actorRole',
    'actorPersonKey', 'assignedManagerPersonKey', 'eventAt', 'sourceVersion', 'state'], ['existingAuditKeys']);
  weights(input.request.current); weights(input.request.proposed);
  if (input.request.actorRole !== 'Manager' || input.request.sourceVersion !== workplan.rowVersionToken
    || input.request.state !== workplan.state || !sameWeights(input.request.current, currentWeights(input.baseline, workplan))
    || !sameWeights(input.request.proposed, input.payload.activeWeights)
    || !utc(input.request.eventAt) || Date.parse(input.request.eventAt) < Date.parse(input.baseline.payload.authority.publishedAt)
    || Date.parse(input.request.eventAt) > Date.parse(input.payload.authority.publishedAt)) {
    hold('Request weights, version, state or audit time do not reconcile to the observed sources.');
  }
  const capability = bindAuthoritativeDeliveryWeightOverrideCapability(actor, subject);
  const approved = approveDeliveryWeightOverride(input.request, capability);
  if (!approved.accepted || !approved.audit) return hold(approved.errors.join(' '));
  return canonicalisePlainRecord<IManagerDeliveryPublicationProposal>({
    contract: DELIVERY_PUBLICATION_V1, purposeApproval: 'KCF-KPI-PM83-D001',
    scope: { kind: 'WorkplanOverride', workplan: workplan.workplanKey, person: workplan.personKey, year: workplan.performanceYear },
    payload: input.payload, provenance: {
      baseline: input.baseline, ...input.observations,
      approval: { actorPersonKey: actor.personKey, subjectPersonKey: subject.personKey,
        assignedManagerPersonKey: subject.managerPersonKey!, audit: approved.audit }
    }
  }, 'Delivery Manager proposal');
};

const managerValid = (proposal: Readonly<IManagerDeliveryPublicationProposal>): void => {
  keys(proposal, ['contract', 'purposeApproval', 'scope', 'payload', 'provenance']);
  keys(proposal.scope, ['kind', 'workplan', 'person', 'year']);
  keys(proposal.provenance, ['baseline', 'workplanSource', 'actorSource', 'subjectSource', 'approval']);
  const approval = proposal.provenance.approval;
  keys(approval, ['actorPersonKey', 'subjectPersonKey', 'assignedManagerPersonKey', 'audit']);
  const audit = approval.audit;
  keys(audit, ['auditKey', 'eventType', 'actorEmail', 'actorRole', 'eventAt', 'reason', 'sourceVersion', 'resultingState', 'before', 'after']);
  const expected = buildManagerDeliveryPublicationProposal(proposal.provenance.baseline, {
    workplanSource: proposal.provenance.workplanSource, actorSource: proposal.provenance.actorSource,
    subjectSource: proposal.provenance.subjectSource
  }, {
    auditKey: audit.auditKey, current: audit.before, proposed: audit.after, reason: audit.reason,
    subjectPersonKey: approval.subjectPersonKey, actorEmail: audit.actorEmail, actorRole: audit.actorRole,
    actorPersonKey: approval.actorPersonKey, assignedManagerPersonKey: approval.assignedManagerPersonKey,
    eventAt: audit.eventAt, sourceVersion: audit.sourceVersion, state: audit.resultingState
  }, proposal.payload);
  if (!sameValue(expected, proposal)) hold('Manager envelope differs from its complete governed approval.');
};

/**
 * Policy-only selection for uncaptured mutable Workplans. Missing/invalid supplied
 * evidence throws HOLD; it never silently falls back. A future capture consumer must
 * prefer its verified historical capture and separately prove protected read origin.
 */
export const selectEffectiveDeliveryPublication = (
  observedGlobal: Readonly<IGlobalDeliveryPublicationProposal> | undefined,
  observedWorkplanOverride: Readonly<IManagerDeliveryPublicationProposal> | undefined,
  exactWorkplan: Readonly<IAnnualWorkplan>
): GovernedDeliveryPublicationProposal => {
  if (observedGlobal === undefined) return hold('Global publication evidence is missing.');
  const input = canonicalisePlainRecord({ observedGlobal, observedWorkplanOverride, exactWorkplan }, 'Delivery selection inputs');
  globalValid(input.observedGlobal); workplanValid(input.exactWorkplan);
  if (input.observedGlobal.scope.year !== input.exactWorkplan.performanceYear) hold('Global and exact Workplan years disagree.');
  if (input.observedWorkplanOverride === undefined) return input.observedGlobal;
  const override = input.observedWorkplanOverride;
  managerValid(override);
  if (!sameValue(override.provenance.workplanSource.value, input.exactWorkplan)
    || override.provenance.baseline.provenance.configSource.environment !== input.observedGlobal.provenance.configSource.environment) {
    hold('Supplied Workplan override is stale or belongs to a different scope.');
  }
  return override;
};
