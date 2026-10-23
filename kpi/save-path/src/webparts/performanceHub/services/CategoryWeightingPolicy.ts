import type { CoreKpiRole, IAnnualWorkplan, IProductionPerson, WorkplanState } from '../models/ProductionModels';
import type {
  EmployeeContributionMethodV2,
  EmployeeCoreWeightingModeV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import { controlledApplicationRoles } from './ControlledApplicationRoles';
import {
  UnsafeBoundaryInputError,
  assertCanonicalKeys,
  canonicalisePlainRecord
} from './SecurityBoundaryCanonicalisation';

/** PD-01 Delivery arithmetic contains Core and Impact only. */
export interface IDeliveryCategoryWeights {
  core: number;
  impact: number;
}

export interface IDeliveryWeightConfigurationAuthority {
  configurationId: string;
  version: string;
  etag: string;
  approvalReference: 'DEMO-APP-PETE-PD-01';
  contentSha256: string;
  effectiveFrom: string;
  publishedAt: string;
  publishedBy: string;
  changeReference: string;
}

/** Governed data contract supplied by Admin/configuration; it is not a scoring engine. */
export interface IGovernedDeliveryWeightConfigurationContract {
  schema: 'DEMO.DeliveryWeightConfiguration';
  immutable: true;
  published: true;
  authority: IDeliveryWeightConfigurationAuthority;
  defaultWeights: Readonly<IDeliveryCategoryWeights>;
  activeWeights: Readonly<IDeliveryCategoryWeights>;
}

export interface IDeliveryWeightConfigurationSnapshot {
  authority: Readonly<IDeliveryWeightConfigurationAuthority>;
  defaultWeights: Readonly<IDeliveryCategoryWeights>;
  activeWeights: Readonly<IDeliveryCategoryWeights>;
  behaviourIncluded: false;
}

/** Historic v01 shape retained so accepted Workplans remain renderable. */
export interface IWorkplanCategoryWeights {
  core: number;
  personal: number;
  behaviours: number;
}

export interface ICategoryWeightingValidation {
  valid: boolean;
  total: number;
  changedFromDefault: boolean;
  managerApprovalRequired: boolean;
  errors: string[];
}

export interface IDeliveryWeightingValidation extends ICategoryWeightingValidation {
  behaviourIncluded: false;
}

export interface ICoreWeightingItem {
  kpiId: string;
  weight: number;
  employeeRole?: CoreKpiRole;
  contributionMethod?: EmployeeContributionMethodV2;
}

export interface ICoreWeightingValidation {
  valid: boolean;
  mode: EmployeeCoreWeightingModeV2;
  total: number;
  errors: string[];
}

export type DeliveryWeightingApprovalRole = 'Manager' | 'SystemAdmin';

export interface IDeliveryWeightOverrideRequest {
  auditKey: string;
  existingAuditKeys?: readonly string[];
  current: Readonly<IDeliveryCategoryWeights>;
  proposed: Readonly<IDeliveryCategoryWeights>;
  reason: string;
  subjectPersonKey: string;
  actorEmail: string;
  actorRole: DeliveryWeightingApprovalRole;
  actorPersonKey: string;
  assignedManagerPersonKey?: string;
  eventAt: string;
  sourceVersion: number;
  state: WorkplanState;
}

export type IDeliveryWeightOverrideAuthoritativeActor = Pick<
IProductionPerson, 'personKey' | 'email' | 'appRoles' | 'active'>;
export type IDeliveryWeightOverrideAuthoritativeSubject = Pick<
IProductionPerson, 'personKey' | 'managerPersonKey' | 'managerEmail'>;

/** Runtime-opaque: only an exact object issued by the authoritative binding factory is accepted. */
export interface IDeliveryWeightOverrideCapability {
  readonly __deliveryWeightOverrideCapability: never;
}

export interface IDeliveryWeightOverrideAudit {
  auditKey: string;
  eventType: 'DeliveryWeightOverrideApproved';
  actorEmail: string;
  actorRole: DeliveryWeightingApprovalRole;
  eventAt: string;
  reason: string;
  sourceVersion: number;
  resultingState: WorkplanState;
  before: IDeliveryCategoryWeights;
  after: IDeliveryCategoryWeights;
}

export interface IDeliveryWeightOverrideResult {
  accepted: boolean;
  weights: IDeliveryCategoryWeights;
  errors: string[];
  audit?: IDeliveryWeightOverrideAudit;
}

interface IDeliveryWeightOverrideAuthoritySnapshot {
  actorEmail: string;
  actorPersonKey: string;
  actorRole: DeliveryWeightingApprovalRole;
  subjectPersonKey: string;
  assignedManagerPersonKey?: string;
}

const authorityCapabilities = new WeakMap<object, Readonly<IDeliveryWeightOverrideAuthoritySnapshot>>();
const authorityActorKeys = Object.freeze(['personKey', 'email', 'appRoles', 'active'] as const);
const authoritySubjectKeys = Object.freeze(['personKey', 'managerPersonKey', 'managerEmail'] as const);
const overrideRequestKeys = Object.freeze([
  'auditKey', 'existingAuditKeys', 'current', 'proposed', 'reason', 'subjectPersonKey',
  'actorEmail', 'actorRole', 'actorPersonKey', 'assignedManagerPersonKey', 'eventAt', 'sourceVersion', 'state'
] as const);
const deliveryWeightKeys = Object.freeze(['core', 'impact'] as const);
const deliveryConfigurationKeys = Object.freeze([
  'schema', 'immutable', 'published', 'authority', 'defaultWeights', 'activeWeights'
] as const);
const deliveryConfigurationAuthorityKeys = Object.freeze([
  'configurationId', 'version', 'etag', 'approvalReference', 'contentSha256', 'effectiveFrom',
  'publishedAt', 'publishedBy', 'changeReference'
] as const);
const mutableWorkplanStates: readonly WorkplanState[] = Object.freeze([
  'Draft', 'Submitted', 'ChangesRequested', 'Approved', 'Locked', 'Archived'
]);

const clean = (value: string): string => value.trim();
const cleanEmail = (value: string): string => clean(value).toLowerCase();

/**
 * Binds an opaque capability to authoritative People projections. The adapter
 * calling this factory owns proof that these projections came from its trusted
 * People read; request fields can never mint or copy the returned capability.
 */
export const bindAuthoritativeDeliveryWeightOverrideCapability = (
  actor: Readonly<IDeliveryWeightOverrideAuthoritativeActor>,
  subject: Readonly<IDeliveryWeightOverrideAuthoritativeSubject>
): IDeliveryWeightOverrideCapability => {
  const actorSnapshot = canonicalisePlainRecord(actor, 'Authoritative approving actor', authorityActorKeys);
  const subjectSnapshot = canonicalisePlainRecord(subject, 'Authoritative Workplan subject', authoritySubjectKeys);
  if (typeof actorSnapshot.personKey !== 'string' || typeof actorSnapshot.email !== 'string'
    || !Array.isArray(actorSnapshot.appRoles) || typeof actorSnapshot.active !== 'boolean'
    || typeof subjectSnapshot.personKey !== 'string'
    || (subjectSnapshot.managerPersonKey !== undefined && typeof subjectSnapshot.managerPersonKey !== 'string')
    || (subjectSnapshot.managerEmail !== undefined && typeof subjectSnapshot.managerEmail !== 'string')) {
    throw new Error('Authoritative override capability requires valid canonical People projections.');
  }
  const roles = controlledApplicationRoles(actorSnapshot.appRoles);
  const approvalRoles = roles?.filter(role => role === 'Manager' || role === 'SystemAdmin') || [];
  const actorPersonKey = clean(actorSnapshot.personKey);
  const actorEmail = cleanEmail(actorSnapshot.email);
  const subjectPersonKey = clean(subjectSnapshot.personKey);
  const assignedManagerPersonKey = subjectSnapshot.managerPersonKey
    ? clean(subjectSnapshot.managerPersonKey) : undefined;

  if (!actorSnapshot.active || !actorPersonKey || !actorEmail || !subjectPersonKey
    || approvalRoles.length !== 1) {
    throw new Error('Authoritative override capability requires one active Manager or System Admin People identity.');
  }
  const actorRole = approvalRoles[0] as DeliveryWeightingApprovalRole;
  if (actorRole === 'Manager' && (assignedManagerPersonKey !== actorPersonKey
    || cleanEmail(subjectSnapshot.managerEmail || '') !== actorEmail)) {
    throw new Error('Authoritative Manager capability must match the exact assigned manager identity.');
  }

  const capability = Object.freeze({}) as IDeliveryWeightOverrideCapability;
  authorityCapabilities.set(capability, Object.freeze({
    actorEmail,
    actorPersonKey,
    actorRole,
    subjectPersonKey,
    assignedManagerPersonKey
  }));
  return capability;
};

export const DEFAULT_DELIVERY_CATEGORY_WEIGHTS: Readonly<IDeliveryCategoryWeights> = Object.freeze({
  core: 70,
  impact: 30
});

/** Historic v01 default retained only for old Workplan rendering/validation. */
export const DEFAULT_WORKPLAN_CATEGORY_WEIGHTS: Readonly<IWorkplanCategoryWeights> = Object.freeze({
  core: 70,
  personal: 20,
  behaviours: 10
});

export const APPROVED_CORE_ROLES: readonly CoreKpiRole[] = Object.freeze([
  'AccountableOwner', 'DeliveryLead', 'Contributor', 'Oversight', 'EvidenceProvider'
]);

export const APPROVED_CONTRIBUTION_METHODS: readonly EmployeeContributionMethodV2[] = Object.freeze([
  'AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'
]);

const finite = (value: number): boolean => Number.isFinite(value);
const isPercent = (value: number): boolean => finite(value) && value >= 0 && value <= 100
  && Math.abs(Math.round(value * 100) - (value * 100)) < 0.00000001;
const percentTotal = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);
const exactHundred = (values: readonly number[]): boolean => values.reduce((sum, value) => sum + Math.round(value * 100), 0) === 10000;
const sameDeliveryWeights = (left: IDeliveryCategoryWeights, right: IDeliveryCategoryWeights): boolean =>
  left.core === right.core && left.impact === right.impact;
const cloneDeliveryWeights = (weights: Readonly<IDeliveryCategoryWeights>): IDeliveryCategoryWeights => ({
  core: weights.core,
  impact: weights.impact
});

export const validateDeliveryCategoryWeights = (
  weights: Readonly<IDeliveryCategoryWeights>,
  reason?: string,
  configuredDefault: Readonly<IDeliveryCategoryWeights> = DEFAULT_DELIVERY_CATEGORY_WEIGHTS
): IDeliveryWeightingValidation => {
  const errors: string[] = [];
  const values = [weights.core, weights.impact];
  const total = percentTotal(values);
  const changedFromDefault = !sameDeliveryWeights(weights, configuredDefault);

  if (!values.every(isPercent)) errors.push('Core and Impact weights must each be a number from 0% to 100% with no more than two decimal places.');
  if (!exactHundred(values)) errors.push('Core and Impact category weights must total exactly 100%.');
  if (changedFromDefault && !reason?.trim()) errors.push(`A reason is required when Delivery weighting differs from the configured ${configuredDefault.core}% Core / ${configuredDefault.impact}% Impact default.`);

  return {
    valid: errors.length === 0,
    total,
    changedFromDefault,
    managerApprovalRequired: changedFromDefault,
    behaviourIncluded: false,
    errors
  };
};

const canonicalUtc = (value: string): boolean => !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;
const canonicalDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));

/**
 * Validates the exact governed PD-01 source identity and returns an immutable
 * snapshot for existing calculation/UI consumers. Behaviour data is absent by
 * construction and calculateOverallDeliveryScore remains the only arithmetic.
 */
export const resolveGovernedDeliveryWeightConfiguration = (
  contract: Readonly<IGovernedDeliveryWeightConfigurationContract>,
  expectedAuthority: Readonly<IDeliveryWeightConfigurationAuthority>,
  asOf: Date
): Readonly<IDeliveryWeightConfigurationSnapshot> => {
  const source = canonicalisePlainRecord(contract, 'Governed Delivery-weight configuration', deliveryConfigurationKeys);
  const authority = canonicalisePlainRecord(
    source.authority, 'Governed Delivery-weight configuration authority', deliveryConfigurationAuthorityKeys
  );
  const expected = canonicalisePlainRecord(
    expectedAuthority, 'Expected Delivery-weight configuration authority', deliveryConfigurationAuthorityKeys
  );
  assertCanonicalKeys(source.defaultWeights, deliveryWeightKeys, 'Governed Delivery default weights');
  assertCanonicalKeys(source.activeWeights, deliveryWeightKeys, 'Governed Delivery active weights');
  if (source.schema !== 'DEMO.DeliveryWeightConfiguration' || source.immutable !== true || source.published !== true) {
    throw new Error('Governed Delivery-weight configuration must be immutable and published.');
  }
  if (JSON.stringify(authority) !== JSON.stringify(expected)) {
    throw new Error('Governed Delivery-weight configuration authority, version, ETag or provenance changed after it was loaded.');
  }
  if (!authority.configurationId.trim() || !authority.version.trim() || !authority.etag.trim()
    || authority.approvalReference !== 'DEMO-APP-PETE-PD-01'
    || !/^[a-f\d]{64}$/i.test(authority.contentSha256) || !authority.publishedBy.trim()
    || !authority.changeReference.trim() || !canonicalDate(authority.effectiveFrom)
    || !canonicalUtc(authority.publishedAt)) {
    throw new Error('Governed Delivery-weight configuration provenance is invalid.');
  }
  if (!Number.isFinite(asOf.getTime()) || asOf < new Date(`${authority.effectiveFrom}T00:00:00.000Z`)) {
    throw new Error('Governed Delivery-weight configuration is not effective.');
  }
  const defaultValidation = validateDeliveryCategoryWeights(source.defaultWeights, undefined, source.defaultWeights);
  const activeValidation = validateDeliveryCategoryWeights(
    source.activeWeights, 'Governed Admin configuration.', source.defaultWeights
  );
  if (!defaultValidation.valid || !activeValidation.valid
    || source.defaultWeights.core !== 70 || source.defaultWeights.impact !== 30) {
    throw new Error('Governed Delivery-weight configuration must use the approved 70/30 default and total exactly 100%.');
  }
  return Object.freeze({
    authority: Object.freeze({ ...authority }),
    defaultWeights: Object.freeze(cloneDeliveryWeights(source.defaultWeights)),
    activeWeights: Object.freeze(cloneDeliveryWeights(source.activeWeights)),
    behaviourIncluded: false as const
  });
};

export const calculateOverallDeliveryScore = (
  coreScore: number,
  impactScore: number,
  weights: Readonly<IDeliveryCategoryWeights>
): number => {
  const validation = validateDeliveryCategoryWeights(weights, 'Approved governed configuration.');
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  if (!finite(coreScore) || !finite(impactScore)) throw new Error('Core and Impact scores must be finite numbers.');
  return ((coreScore * weights.core) + (impactScore * weights.impact)) / 100;
};

/** Historical approved reviews keep their own snapshot when later configuration changes. */
export const resolveDeliveryWeightSnapshot = (
  activeConfiguration: Readonly<IDeliveryCategoryWeights>,
  historicalSnapshot?: Readonly<IDeliveryCategoryWeights>
): IDeliveryCategoryWeights => cloneDeliveryWeights(historicalSnapshot || activeConfiguration);

export const equalCoreWeights = (count: number): number[] => {
  if (!Number.isInteger(count) || count < 0) throw new Error('Core KPI count must be a non-negative whole number.');
  if (count === 0) return [];
  const baseHundredths = Math.floor(10000 / count);
  const remainder = 10000 % count;
  return Array.from({ length: count }, (_, index) => (baseHundredths + (index < remainder ? 1 : 0)) / 100);
};

export const applyCoreWeightingMode = (
  items: readonly Readonly<ICoreWeightingItem>[],
  mode: EmployeeCoreWeightingModeV2
): ICoreWeightingItem[] => {
  const copies = items.map(item => ({ ...item }));
  if (mode === 'Custom') return copies;
  const weights = equalCoreWeights(copies.length);
  return copies.map((item, index) => ({ ...item, weight: weights[index] }));
};

export const validateCoreWeightingSelection = (
  items: readonly Readonly<ICoreWeightingItem>[],
  mode: EmployeeCoreWeightingModeV2
): ICoreWeightingValidation => {
  const errors: string[] = [];
  const total = percentTotal(items.map(item => item.weight));
  if (items.length === 0) errors.push('Select at least one Core KPI before choosing a weighting method.');
  if (new Set(items.map(item => item.kpiId)).size !== items.length || items.some(item => !item.kpiId.trim())) {
    errors.push('Core KPI weighting requires unique non-blank KPI IDs.');
  }
  if (items.some(item => !isPercent(item.weight))) errors.push('Each Core KPI weight must be from 0% to 100% with no more than two decimal places.');
  if (items.length > 0 && !exactHundred(items.map(item => item.weight))) errors.push('Core KPI weights must total exactly 100%.');
  if (mode === 'Equal' && items.length > 0) {
    const expected = equalCoreWeights(items.length);
    if (items.some((item, index) => item.weight !== expected[index])) {
      errors.push('Equal weighting must use the deterministic equal split for every selected Core KPI.');
    }
  }
  return { valid: errors.length === 0, mode, total, errors };
};

/** Role and contribution method are validated as two independent required choices. */
export const validateCoreRoleAndContributionMethod = (
  items: readonly Readonly<ICoreWeightingItem>[]
): string[] => {
  const errors: string[] = [];
  items.forEach(item => {
    if (!item.employeeRole || APPROVED_CORE_ROLES.indexOf(item.employeeRole) < 0) {
      errors.push(`${item.kpiId || 'A Core KPI'} needs an approved employee role.`);
    }
    if (!item.contributionMethod || APPROVED_CONTRIBUTION_METHODS.indexOf(item.contributionMethod) < 0) {
      errors.push(`${item.kpiId || 'A Core KPI'} needs an approved contribution method selected separately from role.`);
    }
  });
  return errors;
};

export const approveDeliveryWeightOverride = (
  request: Readonly<IDeliveryWeightOverrideRequest>,
  capability?: IDeliveryWeightOverrideCapability
): IDeliveryWeightOverrideResult => {
  const reject = (
    weights: Readonly<IDeliveryCategoryWeights>, errors: readonly string[]
  ): IDeliveryWeightOverrideResult => Object.freeze({
    accepted: false,
    weights: Object.freeze(cloneDeliveryWeights(weights)),
    errors: Object.freeze(Array.from(new Set(errors))) as unknown as string[]
  });
  const authority = capability && authorityCapabilities.get(capability);
  if (!authority) {
    return reject(DEFAULT_DELIVERY_CATEGORY_WEIGHTS,
      ['An authoritative, bound Manager or System Admin capability is required.']);
  }

  let snapshot: Readonly<IDeliveryWeightOverrideRequest>;
  try {
    snapshot = canonicalisePlainRecord(request, 'Delivery-weight override request', overrideRequestKeys);
    assertCanonicalKeys(snapshot.current, deliveryWeightKeys, 'Current Delivery weights');
    assertCanonicalKeys(snapshot.proposed, deliveryWeightKeys, 'Proposed Delivery weights');
  } catch (error) {
    const message = error instanceof UnsafeBoundaryInputError ? error.message : 'The override request is unsafe.';
    return reject(DEFAULT_DELIVERY_CATEGORY_WEIGHTS, [message]);
  }

  const reason = typeof snapshot.reason === 'string' ? clean(snapshot.reason) : '';
  const auditKey = typeof snapshot.auditKey === 'string' ? clean(snapshot.auditKey) : '';
  const actorEmail = typeof snapshot.actorEmail === 'string' ? cleanEmail(snapshot.actorEmail) : '';
  const actorPersonKey = typeof snapshot.actorPersonKey === 'string' ? clean(snapshot.actorPersonKey) : '';
  const subjectPersonKey = typeof snapshot.subjectPersonKey === 'string' ? clean(snapshot.subjectPersonKey) : '';
  const assignedManagerPersonKey = typeof snapshot.assignedManagerPersonKey === 'string'
    ? clean(snapshot.assignedManagerPersonKey) : undefined;
  const eventAt = typeof snapshot.eventAt === 'string' ? clean(snapshot.eventAt) : '';
  const errors = validateDeliveryCategoryWeights(snapshot.proposed, reason || undefined).errors.slice();
  if (sameDeliveryWeights(snapshot.current, snapshot.proposed)) {
    errors.push('The proposed Delivery weighting does not change the current weighting.');
  }
  if (!reason) errors.push('Every Delivery-weight override requires a reason.');
  if (!auditKey) errors.push('A stable audit key is required.');
  if (snapshot.existingAuditKeys !== undefined && (!Array.isArray(snapshot.existingAuditKeys)
    || snapshot.existingAuditKeys.some(key => typeof key !== 'string' || !clean(key)))) {
    errors.push('The replay set must contain only stable non-blank audit keys.');
  } else if (snapshot.existingAuditKeys?.includes(auditKey)) {
    errors.push('This Delivery-weight approval has already been processed.');
  }
  if (actorEmail !== authority.actorEmail || actorPersonKey !== authority.actorPersonKey
    || snapshot.actorRole !== authority.actorRole || subjectPersonKey !== authority.subjectPersonKey) {
    errors.push('The request identity does not match the authoritative approving capability.');
  }
  if (authority.actorRole === 'Manager' && (authority.assignedManagerPersonKey !== authority.actorPersonKey
    || assignedManagerPersonKey !== authority.actorPersonKey)) {
    errors.push('Only the exact assigned manager or System Admin may approve a Delivery-weight override.');
  }
  if (authority.actorRole === 'SystemAdmin' && assignedManagerPersonKey !== undefined
    && assignedManagerPersonKey !== authority.assignedManagerPersonKey) {
    errors.push('The caller-asserted assigned manager does not match authoritative People data.');
  }
  if (!Number.isInteger(snapshot.sourceVersion) || snapshot.sourceVersion < 1) {
    errors.push('A positive source version is required for the audit event.');
  }
  if (!mutableWorkplanStates.includes(snapshot.state)) errors.push('A controlled Workplan state is required.');
  if (!eventAt || Number.isNaN(Date.parse(eventAt)) || new Date(eventAt).toISOString() !== eventAt) {
    errors.push('A canonical UTC audit timestamp is required.');
  }
  if (snapshot.state === 'Approved' || snapshot.state === 'Locked' || snapshot.state === 'Archived') {
    errors.push('Approved, Locked or Archived weighting is immutable; create a controlled reopen or successor version first.');
  }

  if (errors.length > 0) return reject(snapshot.current, errors);
  const before = Object.freeze(cloneDeliveryWeights(snapshot.current));
  const after = Object.freeze(cloneDeliveryWeights(snapshot.proposed));
  const audit = Object.freeze({
    auditKey,
    eventType: 'DeliveryWeightOverrideApproved' as const,
    actorEmail: authority.actorEmail,
    actorRole: authority.actorRole,
    eventAt,
    reason,
    sourceVersion: snapshot.sourceVersion,
    resultingState: snapshot.state,
    before,
    after: Object.freeze(cloneDeliveryWeights(after))
  });
  return Object.freeze({
    accepted: true,
    weights: after,
    errors: Object.freeze([]) as unknown as string[],
    audit
  });
};

export const categoryWeightsFromWorkplan = (workplan: IAnnualWorkplan): IWorkplanCategoryWeights => ({
  core: workplan.coreCategoryWeight,
  personal: workplan.personalCategoryWeight,
  behaviours: workplan.behaviourCategoryWeight
});

/** Historic v01 validation retained for render/read compatibility only. */
export const validateWorkplanCategoryWeights = (
  weights: IWorkplanCategoryWeights,
  activePersonalKpiCount: number,
  reason?: string
): ICategoryWeightingValidation => {
  const errors: string[] = [];
  const total = weights.core + weights.personal + weights.behaviours;
  const changedFromDefault = weights.core !== DEFAULT_WORKPLAN_CATEGORY_WEIGHTS.core
    || weights.personal !== DEFAULT_WORKPLAN_CATEGORY_WEIGHTS.personal
    || weights.behaviours !== DEFAULT_WORKPLAN_CATEGORY_WEIGHTS.behaviours;

  if (![weights.core, weights.personal, weights.behaviours].every(finite)) errors.push('All category weights must be numbers.');
  if (weights.core < 60 || weights.core > 90) errors.push('Core category weight must be between 60% and 90%.');
  if (weights.personal < 0 || weights.personal > 30) errors.push('Personal category weight must be between 0% and 30%.');
  if (weights.behaviours < 10 || weights.behaviours > 20) errors.push('Behaviour category weight must be between 10% and 20%.');
  if (total !== 100) errors.push('Core, Personal and Behaviour category weights must total exactly 100%.');
  if (activePersonalKpiCount === 0 && weights.personal !== 0) {
    errors.push('Personal category weight must be 0% when the Workplan has no active Personal KPIs.');
  }
  if (changedFromDefault && !reason?.trim()) errors.push('Explain why the Workplan category balance differs from the 70/20/10 default.');

  return {
    valid: errors.length === 0,
    total,
    changedFromDefault,
    managerApprovalRequired: changedFromDefault,
    errors
  };
};

export const categoryWeightsAreManagerApproved = (state: WorkplanState): boolean =>
  state === 'Approved' || state === 'Locked' || state === 'Archived';
