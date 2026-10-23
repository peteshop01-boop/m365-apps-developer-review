/* eslint-disable @rushstack/no-new-null -- null is the explicit observed absence in the external contract */
/** Settled annual handlers, including the additive KCCC Behaviour v02 route. */
import type {
  IEmployeeBehaviourCommitmentInputV2,
  IEmployeeCoreContributionInputV2,
  IEmployeeCoreWeightingInputV2,
  IEmployeePersonalItemInputV2,
  IEmployeeWorkplanDraftInputV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import type {
  IBehaviourAnnualSnapshotV2,
  IBehaviourFrameworkV2PublishedSet,
  IBehaviourLibraryV2Record,
  IBehaviourPersonAssignmentV2
} from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_VALUE_IDS } from '../models/BehaviourFrameworkV2Models';
import {
  C2bAclImage,
  C2bCanonicalEntityImage,
  C2bCommandPlan,
  C2bEffectKind,
  C2bEffectPlan,
  C2bEffectTarget,
  C2bListAclImage,
  C2bPrincipalGrant,
  C2bReceiptActorAccess,
  C2bSecuredListPurpose,
  cloneC2b,
  canonicaliseC2b,
  createC2bCommandPlan,
  createC2bEffectPlan,
  hashC2bCanonical,
  normaliseC2bIntendedImage
} from './TestPilotCommandAdmissionC2b';
import {
  isEmployeeV2StableCommandKey,
  validateEmployeeCoreContributionInputV2,
  validateEmployeeCoreWeightingInputV2,
  validateEmployeeBehaviourCommitmentInputV2,
  validateEmployeePersonalItemInputV2,
  validateEmployeeWorkplanDraftInputV2
} from './EmployeeWorkplanV2PersistencePolicy';
import {
  createBehaviourAnnualSnapshotV2, createBehaviourPeriodSnapshotV2,
  readBehaviourPlanningLevelsV1, validateBehaviourPlanningLevelsV1
} from './BehaviourFrameworkV2Policy';
import {
  behaviourLibraryV2RecordMatchesAssignment,
  inspectBehaviourLibraryV2Record,
  isExactBehaviourLibraryV2SuggestionKey
} from './BehaviourLibraryV2Catalogue';
import { EMPLOYEE_V2_WORKPLAN_ITEM_FIELDS } from './EmployeeWorkplanV2PhysicalSchema';
import { decodeBehaviourSelectionSnapshotsV2, encodeBehaviourSelectionSnapshotsV2,
  BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, type BehaviourSelectionSnapshotV2,
  type IBehaviourSelectionSnapshotEnvelopeV2 } from './BehaviourSelectionSnapshotsV2';
import { normaliseSec006HumanReason } from './sec006/Sec006HumanReason';
import type { IDeliveryWeightConfigurationAuthority } from './CategoryWeightingPolicy';
import {
  assessSec006ControlCaseConsumption,
  type ISec006ControlCase,
  type ISec006ControlCaseConsumption
} from './sec006/Sec006ControlCaseStore';

export type C2bControlledRole = 'Employee' | 'Manager' | 'SeniorManagerAdmin' | 'SystemAdmin' | 'BoardReadOnly';
export interface C2bTrustedPerson {
  personKey: string;
  email: string;
  displayName: string;
  active: boolean;
  roles: C2bControlledRole[];
  managerPersonKey: string | null;
  managerEmail: string | null;
}
export interface C2bTrustedAnnualConfiguration {
  schemaRevision: string;
  performanceYear: number;
  behaviourContractVersion: string;
  deliveryWeightConfigurationAuthority?: IDeliveryWeightConfigurationAuthority;
  behaviourCataloguePin?: {
    catalogueKey: string; catalogueVersion: string; revision: number; contentSha256: string;
    contentCanonicalUtf8ByteLength: number;
    sourceSha256: string; sourceRowsCanonicalSha256: string; approvalReference: string;
    generatedRowsJsonSha256: string;
    sourcePath: string; rowCount: number;
  };
  initialState: 'Draft';
  initialAccessState: 'EmployeeEdit';
  initialTransitionStatus: 'Ready';
  processorPrincipalKey: string;
  adminPrincipalKeys: string[];
}
export interface CreateWorkplanDraftCommand {
  commandKey: string;
  commandType: 'CreateWorkplanDraft';
  personKey: string;
  performanceYear: number;
  payload: Record<string, never>;
}
export interface C2bTrustedWorkplanHeader {
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  etag: string;
  rowVersionToken: number;
  state: 'Draft' | 'ChangesRequested' | 'Submitted' | 'Approved' | 'Locked';
  accessState: 'EmployeeEdit' | 'ManagerDecision' | 'ReadOnly';
  transitionStatus: 'Ready';
  fields: Readonly<Record<string, unknown>>;
}
export interface C2bTrustedAnnualItem {
  workplanItemKey: string;
  workplanItemNaturalKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  itemType: 'CoreGold' | 'LocalPersonal' | 'Behaviour';
  activeInWorkplan: boolean;
  etag: string;
  rowVersionToken: number;
  fields: Readonly<Record<string, unknown>>;
}
export interface UpsertCoreContributionCommand {
  commandKey: string;
  commandType: 'UpsertCoreContributionV2';
  personKey: string;
  performanceYear: number;
  payload: IEmployeeCoreContributionInputV2;
}
export interface C2bTrustedBehaviourV2Observations {
  framework: IBehaviourFrameworkV2PublishedSet;
  assignment: IBehaviourPersonAssignmentV2;
  catalogue?: {
    complete: true;
    frameworkVersion: string;
    applicableDate: string;
    records: readonly IBehaviourLibraryV2Record[];
  };
  focusCatalogue?: {
    complete: true;
    applicableDate: string;
    catalogueKey: string;
    catalogueVersion: string;
    revision: number;
    contentSha256: string;
    publicationKey: string;
    publicationSha256: string;
    publicationImageSha256: string;
    rowsImageSha256: string;
    sourceSha256: string;
    sourceRowsCanonicalSha256: string;
    approvalReference: string;
    rowCount: number;
    rows: readonly {
      targetKey: string; behaviourKey: string; roleLevelCode: 'L1' | 'L2' | 'L3';
      focusKey: string; focusArea: string; suggestedTarget: string; effectiveStatus: 'Published' | 'Retired';
      effectiveFrom: string; effectiveTo?: string; contentSha256: string;
    }[];
  };
}
export interface C2bTrustedItemIdentity { workplanItemKey: string; }
export interface C2bTrustedCoreCatalogueItem {
  kpiId: string;
  kpiVersionKey: string;
  targetVersionKey: string;
  performanceYear: number;
  active: boolean;
  approved: boolean;
  contributionUnit: string;
  directContributionEligible: boolean;
  additiveEligible: boolean;
  nonOverlapRequired: boolean;
}
/** Trusted adapter proof of the complete annual readiness read, bound to the configured Behaviour contract. */
export interface C2bTrustedAnnualReadiness {
  complete: boolean;
  blockerCodes: readonly string[];
  pagingComplete: boolean;
  behaviourContractVersion: string;
  sourceHeaderSha256: string;
  sourceItemsSha256: string;
  sourceHeaderETag?: string;
  sourceItemsIdentitySha256?: string;
  deliveryWeightConfigurationSha256?: string;
  behaviourPublicationSha256?: string;
}
export interface C2bTrustedAclContext { current: readonly C2bListAclImage[]; }
export interface C2bTrustedCommandSource {
  listId: string;
  itemId: number;
  itemVersion: string;
}

const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const naturalKeyPart = (value: unknown): value is string => nonBlank(value) && !value.includes('|');
const email = (value: string): string => value.trim().toLowerCase();
const fail = (message: string): never => { throw new Error(message); };
const CONTROLLED_ROLES: readonly C2bControlledRole[] = ['Employee', 'Manager', 'SeniorManagerAdmin', 'SystemAdmin', 'BoardReadOnly'];
const ANNUAL_ITEM_FIELD_VOCABULARY = new Set<string>([
  ...EMPLOYEE_V2_WORKPLAN_ITEM_FIELDS,
  // RowVersionToken is trusted concurrency metadata carried by the immutable effect model.
  'RowVersionToken'
]);
const CONTROL_CASE_REQUIRED_FIELDS = [
  'controlCaseKey', 'controlReference', 'authorisedAction', 'subjectKey', 'workplanKey', 'workplanVersion',
  'expectedETag', 'expectedRowVersionToken', 'storageETag', 'storageRowVersionToken', 'active',
  'validFromUtc', 'validToUtc', 'revoked'
] as const;
const CONTROL_CASE_OPTIONAL_FIELDS = [
  'revokedAtUtc', 'revocationReason', 'consumedAtUtc', 'consumedCommandKey', 'consumedSourceListId',
  'consumedSourceItemId', 'consumedSourceItemVersion', 'recoveryHoldAtUtc', 'recoveryHoldReason'
] as const;

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('C2b handler rejected: command shape is invalid.');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(object, key)))
    return fail('C2b handler rejected: protected or unknown client fields are prohibited.');
  return object;
}
export function assertC2bControlledPerson(person: C2bTrustedPerson): void {
  if (!nonBlank(person.personKey) || !nonBlank(person.displayName) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(person.email))
    || typeof person.active !== 'boolean' || !Array.isArray(person.roles) || person.roles.length < 1
    || person.roles.some(role => !CONTROLLED_ROLES.includes(role)) || new Set(person.roles).size !== person.roles.length
    || (person.managerPersonKey === null) !== (person.managerEmail === null)
    || person.managerPersonKey !== null && (!nonBlank(person.managerPersonKey) || person.managerPersonKey === person.personKey
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(person.managerEmail || ''))))
    return fail('C2b handler rejected: controlled People identity or role vocabulary is invalid.');
}
export function assertC2bEmployeeManagerIdentity(authenticatedEmail: string, employee: C2bTrustedPerson,
  manager: C2bTrustedPerson): void {
  assertC2bAnnualPeopleIdentity(employee, manager);
  if (email(authenticatedEmail) !== email(employee.email))
    return fail('C2b handler rejected: authenticated employee and exact active manager key-plus-email mapping do not reconcile.');
}
function assertC2bAnnualPeopleIdentity(employee: C2bTrustedPerson, manager: C2bTrustedPerson): void {
  assertC2bControlledPerson(employee); assertC2bControlledPerson(manager);
  if (!employee.active || !manager.active || !employee.roles.includes('Employee') || !manager.roles.includes('Manager')
    || employee.managerPersonKey !== manager.personKey || email(employee.managerEmail || '') !== email(manager.email))
    return fail('C2b handler rejected: employee and exact active manager key-plus-email mapping do not reconcile.');
}
export function assertC2bAssignedManagerIdentity(authenticatedEmail: string, employee: C2bTrustedPerson,
  manager: C2bTrustedPerson): void {
  assertC2bAnnualPeopleIdentity(employee, manager);
  if (email(authenticatedEmail) !== email(manager.email) || manager.personKey === employee.personKey)
    return fail('C2b handler rejected: only the exact assigned manager key-plus-email may perform this transition.');
}
export function assertC2bSystemAdminIdentity(authenticatedEmail: string, systemAdmin: C2bTrustedPerson,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson): void {
  assertC2bAnnualPeopleIdentity(employee, manager); assertC2bControlledPerson(systemAdmin);
  if (!systemAdmin.active || !systemAdmin.roles.includes('SystemAdmin')
    || email(authenticatedEmail) !== email(systemAdmin.email) || systemAdmin.personKey === employee.personKey)
    return fail('C2b handler rejected: exact active SystemAdmin authority is required.');
}
function validateConfiguration(configuration: C2bTrustedAnnualConfiguration): void {
  if (!Number.isInteger(configuration.performanceYear) || configuration.performanceYear < 2000
    || (configuration.schemaRevision !== 'c2b-annual-v2' && configuration.schemaRevision !== 'c2b-annual-v3')
    || !nonBlank(configuration.behaviourContractVersion)
    || (configuration.schemaRevision === 'c2b-annual-v3' && (!configuration.behaviourCataloguePin
      || configuration.behaviourCataloguePin.catalogueKey !== 'KCF-KCCC-BEHAVIOUR-FOCUS'
      || !nonBlank(configuration.behaviourCataloguePin.catalogueVersion)
      || !Number.isSafeInteger(configuration.behaviourCataloguePin.revision)
      || !/^[A-F0-9]{64}$/i.test(configuration.behaviourCataloguePin.contentSha256)))
    || configuration.initialState !== 'Draft' || configuration.initialAccessState !== 'EmployeeEdit'
    || configuration.initialTransitionStatus !== 'Ready' || !nonBlank(configuration.processorPrincipalKey)
    || !Array.isArray(configuration.adminPrincipalKeys) || configuration.adminPrincipalKeys.some(key => !nonBlank(key))
    || new Set(configuration.adminPrincipalKeys).size !== configuration.adminPrincipalKeys.length)
    return fail('C2b handler rejected: trusted annual/security configuration is incomplete.');
}
function assertHeader(header: C2bTrustedWorkplanHeader, employee: C2bTrustedPerson,
  manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration): void {
  const fields = header.fields;
  if (!naturalKeyPart(employee.personKey) || !naturalKeyPart(manager.personKey)
    || !nonBlank(header.workplanKey) || header.workplanKey !== `${employee.personKey}|${configuration.performanceYear}`
    || header.personKey !== employee.personKey || header.performanceYear !== configuration.performanceYear
    || !['Draft', 'ChangesRequested', 'Submitted', 'Approved', 'Locked'].includes(header.state)
    || !['EmployeeEdit', 'ManagerDecision', 'ReadOnly'].includes(header.accessState)
    || !nonBlank(header.etag) || header.etag === '*' || !Number.isSafeInteger(header.rowVersionToken)
    || header.rowVersionToken < 1 || header.workplanKey !== fields.WorkplanKey || header.personKey !== fields.PersonKey
    || header.performanceYear !== fields.PerformanceYear || header.state !== fields.State
    || header.accessState !== fields.AccessState || header.transitionStatus !== fields.TransitionStatus
    || header.rowVersionToken !== fields.RowVersionToken || fields.ManagerPersonKey !== manager.personKey
    || email(String(fields.ManagerEmail || '')) !== email(manager.email))
    return fail('C2b handler rejected: trusted Workplan header identity, manager snapshot, ETag or token is stale.');
}
function assertEditableHeader(header: C2bTrustedWorkplanHeader): void {
  if (header.state !== 'Draft' && header.state !== 'ChangesRequested' || header.accessState !== 'EmployeeEdit'
    || header.transitionStatus !== 'Ready')
    return fail('C2b handler rejected: Workplan is not in an editable transition-ready annual state.');
}
function assertSubmittedHeader(header: C2bTrustedWorkplanHeader): void {
  if (header.state !== 'Submitted' || header.accessState !== 'ManagerDecision' || header.transitionStatus !== 'Ready')
    return fail('C2b handler rejected: the current Submitted manager-decision snapshot is required.');
}
function assertCompleteItems(header: C2bTrustedWorkplanHeader,
  allItems: readonly C2bTrustedAnnualItem[]): C2bTrustedAnnualItem[] {
  const items = allItems.map(item => cloneC2b(item));
  const keys = items.map(item => item.workplanItemKey);
  const naturalKeys = items.map(item => item.workplanItemNaturalKey);
  if (new Set(keys).size !== keys.length || new Set(naturalKeys).size !== naturalKeys.length
    || items.some(item => {
      if (!item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields)
        || Object.keys(item.fields).some(key => !ANNUAL_ITEM_FIELD_VOCABULARY.has(key))) return true;
      const referenceId = item.itemType === 'CoreGold' ? item.fields.KPIID
        : item.itemType === 'Behaviour' ? item.fields.BehaviourID : item.workplanItemKey;
      const expectedNaturalKey = `${item.workplanKey}|${item.itemType}|${String(referenceId || '')}`;
      return !naturalKeyPart(item.workplanItemKey) || !naturalKeyPart(referenceId)
       || !nonBlank(item.workplanItemNaturalKey) || item.workplanItemNaturalKey !== expectedNaturalKey
      || !['CoreGold', 'LocalPersonal', 'Behaviour'].includes(item.itemType)
      || typeof item.activeInWorkplan !== 'boolean'
      || item.workplanKey !== header.workplanKey || item.personKey !== header.personKey
      || item.performanceYear !== header.performanceYear || !nonBlank(item.etag) || item.etag === '*'
      || !Number.isSafeInteger(item.rowVersionToken) || item.rowVersionToken < 1
      || item.workplanItemKey !== item.fields.WorkplanItemKey
      || item.workplanItemNaturalKey !== item.fields.WorkplanItemNaturalKey
      || item.workplanKey !== item.fields.WorkplanKey || item.personKey !== item.fields.PersonKey
      || item.performanceYear !== item.fields.PerformanceYear || item.itemType !== item.fields.ItemType
      || item.activeInWorkplan !== item.fields.ActiveInWorkplan || item.rowVersionToken !== item.fields.RowVersionToken
      || !nonBlank(item.fields.AddedByEmail) || !Number.isFinite(Date.parse(String(item.fields.AddedAt || '')));
    }))
    return fail('C2b handler rejected: complete current item set is missing, duplicated, stale or cross-Workplan.');
  return items.sort((left, right) => left.workplanItemNaturalKey.localeCompare(right.workplanItemNaturalKey));
}

function currentItemFromCompleteSet(item: C2bTrustedAnnualItem | undefined,
  matching: readonly C2bTrustedAnnualItem[], label: string): C2bTrustedAnnualItem | undefined {
  if (!item) {
    if (matching.length !== 0) return fail(`${label} rejected: natural-key collision prevents item creation.`);
    return undefined;
  }
  if (matching.length !== 1 || canonicaliseC2b(item) !== canonicaliseC2b(matching[0])) {
    return fail(`${label} rejected: duplicate item observation does not byte-canonically match the complete current set.`);
  }
  return matching[0];
}

function assertControlCaseShape(value: ISec006ControlCase): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('C2b amendment rejected: authoritative CONTROL-case observation is malformed.');
  }
  const keys = Object.keys(value);
  const allowed = new Set<string>([...CONTROL_CASE_REQUIRED_FIELDS, ...CONTROL_CASE_OPTIONAL_FIELDS]);
  if (CONTROL_CASE_REQUIRED_FIELDS.some(key => !Object.prototype.hasOwnProperty.call(value, key))
    || keys.some(key => !allowed.has(key))) {
    return fail('C2b amendment rejected: authoritative CONTROL-case observation contains missing or unknown fields.');
  }
}

function resolveAmendmentControlCase(controlReference: string, commandKey: string,
  header: C2bTrustedWorkplanHeader, processedAt: string, controlCases: readonly ISec006ControlCase[],
  source: C2bTrustedCommandSource): { controlCase: ISec006ControlCase; consumption: ISec006ControlCaseConsumption } {
  if (!Array.isArray(controlCases) || !source || typeof source !== 'object'
    || !isEmployeeV2StableCommandKey(source.listId) || !Number.isSafeInteger(source.itemId) || source.itemId < 1
    || !nonBlank(source.itemVersion)) {
    return fail('C2b amendment rejected: trusted command source identity is missing or malformed.');
  }
  controlCases.forEach(assertControlCaseShape);
  const matches = controlCases.filter(candidate => candidate.controlCaseKey === controlReference);
  if (matches.length !== 1) {
    return fail('C2b amendment rejected: CONTROL case is missing or ambiguous.');
  }
  const controlCase = cloneC2b(matches[0]);
  if (!nonBlank(controlCase.storageETag) || controlCase.storageETag === '*'
    || !Number.isSafeInteger(controlCase.storageRowVersionToken) || controlCase.storageRowVersionToken < 1) {
    return fail('C2b amendment rejected: authoritative CONTROL-case storage ETag/token is missing or stale.');
  }
  const consumption: ISec006ControlCaseConsumption = {
    controlCaseKey: controlCase.controlCaseKey,
    controlReference,
    authorisedAction: 'CreateWorkplanAmendmentV2',
    subjectKey: header.workplanKey,
    workplanKey: header.workplanKey,
    workplanVersion: Number(header.fields.WorkplanVersion),
    expectedETag: header.etag,
    expectedRowVersionToken: header.rowVersionToken,
    expectedStorageETag: controlCase.storageETag,
    expectedStorageRowVersionToken: controlCase.storageRowVersionToken,
    trustedUtc: processedAt,
    consumedAtUtc: processedAt,
    consumedCommandKey: commandKey,
    consumedSourceListId: source.listId,
    consumedSourceItemId: source.itemId,
    consumedSourceItemVersion: source.itemVersion
  };
  const rejection = assessSec006ControlCaseConsumption(controlCase, consumption);
  if (rejection) return fail(`C2b amendment rejected: authoritative CONTROL case failed ${rejection}.`);
  return { controlCase, consumption };
}
const currentItemsHash = (items: readonly C2bTrustedAnnualItem[]): string => hashC2bCanonical(items
  .map(item => ({ naturalKey: item.workplanItemNaturalKey, fields: cloneC2b(item.fields) }))
  .sort((left, right) => left.naturalKey.localeCompare(right.naturalKey)));
const currentItemsIdentityHash = (items: readonly C2bTrustedAnnualItem[]): string => hashC2bCanonical(items
  .map(item => ({ naturalKey: item.workplanItemNaturalKey, etag: item.etag,
    rowVersionToken: item.rowVersionToken }))
  .sort((left, right) => left.naturalKey.localeCompare(right.naturalKey)));
function assertReadiness(readiness: C2bTrustedAnnualReadiness, header: C2bTrustedWorkplanHeader,
  items: readonly C2bTrustedAnnualItem[], configuration: C2bTrustedAnnualConfiguration): void {
  if (header.fields.BehaviourContractVersion !== undefined
    && header.fields.BehaviourContractVersion !== configuration.behaviourContractVersion)
    return fail('C2b handler rejected: stored and configured Behaviour contract versions are crossed.');
  if (readiness.complete !== true || readiness.pagingComplete !== true || readiness.blockerCodes.length !== 0
    || readiness.behaviourContractVersion !== configuration.behaviourContractVersion
    || readiness.sourceHeaderSha256 !== hashC2bCanonical(header.fields)
    || readiness.sourceItemsSha256 !== currentItemsHash(items))
    return fail('C2b handler rejected: complete trusted annual readiness proof is missing or stale.');
  if (configuration.behaviourContractVersion === 'KCCC-BEHAVIOUR|v02'
    && (header.fields.BehaviourContractVersion !== 'KCCC-BEHAVIOUR|v02'
      || !configuration.deliveryWeightConfigurationAuthority
      || readiness.sourceHeaderETag !== header.etag
      || readiness.sourceItemsIdentitySha256 !== currentItemsIdentityHash(items)
      || !/^[A-F0-9]{64}$/i.test(String(readiness.deliveryWeightConfigurationSha256 || ''))
      || !/^[A-F0-9]{64}$/i.test(String(readiness.behaviourPublicationSha256 || ''))))
    return fail('C2b handler rejected: governed v02 Delivery and publication readiness proof is missing.');
}
function assertV02StoredSubmission(header: C2bTrustedWorkplanHeader,
  items: readonly C2bTrustedAnnualItem[], configuration: C2bTrustedAnnualConfiguration): void {
  if (configuration.behaviourContractVersion !== 'KCCC-BEHAVIOUR|v02') return;
  const active = items.filter(item => item.itemType === 'Behaviour' && item.activeInWorkplan);
  if (header.fields.BehaviourContractVersion !== 'KCCC-BEHAVIOUR|v02' || active.length !== 5
    || [header.fields.CoreCategoryWeight, header.fields.PersonalCategoryWeight,
      header.fields.BehaviourCategoryWeight].some(value => value !== undefined && value !== null))
    return fail('C2b Behaviour v02 submission rejected: exact five Values and unweighted annual header are required.');
  const ids = active.map(item => item.fields.BehaviourID);
  if (BEHAVIOUR_V2_VALUE_IDS.some(id => ids.filter(value => value === id).length !== 1))
    return fail('C2b Behaviour v02 submission rejected: duplicate, missing or unknown Value.');
  active.forEach(item => {
    const fields = item.fields;
    if (fields.BehaviourFrameworkVersion !== 'KCCC-BEHAVIOUR|v02'
      || fields.BehaviourVersionKey !== 'KCCC-BEHAVIOUR|v02'
      || !nonBlank(fields.BehaviourValueTitleSnapshot) || !nonBlank(fields.BehaviourCorporateValueSnapshot)
      || !nonBlank(fields.BehaviourDescriptorSnapshot) || !nonBlank(fields.BehaviourCommitmentV2)
      || ['BehaviourItemWeight', 'Q1BehaviourTargetRating', 'Q2BehaviourTargetRating',
        'Q3BehaviourTargetRating', 'Q4BehaviourTargetRating', 'ScoredContribution']
        .some(key => fields[key] !== undefined && fields[key] !== null))
      return fail('C2b Behaviour v02 submission rejected: a stored Value snapshot or commitment is invalid.');
    try {
      const snapshot: IBehaviourAnnualSnapshotV2 = {
        frameworkVersion: fields.BehaviourFrameworkVersion as never,
        valueId: fields.BehaviourID as never,
        valueTitle: fields.BehaviourValueTitleSnapshot as string,
        corporateValue: fields.BehaviourCorporateValueSnapshot as string,
        roleTier: fields.BehaviourRoleTierSnapshot as never,
        descriptor: fields.BehaviourDescriptorSnapshot as string,
        cadence: fields.BehaviourCadenceSnapshot as never,
        periodKeys: JSON.parse(String(fields.BehaviourPeriodKeysSnapshotJSON)) as never,
        ratingOptions: JSON.parse(String(fields.BehaviourRatingLabelsSnapshotJSON)) as never
      };
      createBehaviourPeriodSnapshotV2(snapshot, snapshot.periodKeys[0]);
      const periods = JSON.parse(String(fields.BehaviourPeriodCommitmentsV2JSON)) as Array<{ period: string; commitment: string }>;
      if (!Array.isArray(periods) || periods.length !== snapshot.periodKeys.length
        || snapshot.periodKeys.some(key => periods.filter(row => row.period === key && nonBlank(row.commitment)).length !== 1))
        throw new Error('Incomplete period commitments.');
      readBehaviourPlanningLevelsV1(fields);
      const selections = decodeBehaviourSelectionSnapshotsV2(
        String(fields.BehaviourV2SelectionSnapshotsJSON), String(fields.BehaviourV2SelectionSnapshotsSHA256),
        Number(fields.BehaviourV2SelectionSnapshotsUtf8ByteLength));
      const selectedKeys = JSON.parse(String(fields.BehaviourV2SelectedSuggestionKeysJSON)) as unknown;
      if (selections.valueId !== snapshot.valueId || !Array.isArray(selectedKeys)
        || canonicaliseC2b(selectedKeys) !== canonicaliseC2b(selections.selections
          .filter(row => row.source === 'Catalogue').map(row => row.selectionKey)))
        throw new Error('Crossed selection provenance.');
    } catch {
      return fail('C2b Behaviour v02 submission rejected: stored period, planning or focus provenance is invalid.');
    }
  });
}
function desiredPrincipals(employee: C2bTrustedPerson, manager: C2bTrustedPerson,
  configuration: C2bTrustedAnnualConfiguration): C2bPrincipalGrant[] {
  const principals: C2bPrincipalGrant[] = [
    { principalKey: configuration.processorPrincipalKey, permission: 'FullControl', source: 'Processor' },
    { principalKey: employee.personKey, permission: 'Read', source: 'Employee' },
    { principalKey: manager.personKey, permission: 'Read', source: 'Manager' },
    ...configuration.adminPrincipalKeys.map(principalKey => ({ principalKey, permission: 'FullControl' as const, source: 'Admin' as const }))
  ];
  if (new Set(principals.map(principal => principal.principalKey)).size !== principals.length)
    return fail('C2b handler rejected: processor, employee, manager and admin principals must be distinct.');
  return principals;
}
function aclPlan(listPurpose: C2bSecuredListPurpose, containerKey: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson,
  configuration: C2bTrustedAnnualConfiguration, acl: C2bTrustedAclContext): {
    current: C2bAclImage; grant: C2bAclImage; final: C2bAclImage;
  } {
  const matches = acl.current.filter(valueAcl => valueAcl.listPurpose === listPurpose);
  if (matches.length !== 1 || matches[0].acl.containerKey !== containerKey
    || matches[0].acl.breaksInheritanceAtContainer !== true || matches[0].acl.canonicalChildrenInherit !== true)
    return fail('C2b handler rejected: trusted employee-container ACL observation is incomplete.');
  const current = normaliseC2bIntendedImage({ header: { naturalKey: containerKey, fields: {} },
    items: [], acls: [{ listPurpose, acl: matches[0].acl }] }).acls[0].acl;
  const allowed = desiredPrincipals(employee, manager, configuration);
  const desiredKeys = allowed.map(principal => principal.principalKey);
  const currentExtra = current.allowedPrincipals.filter(principal => !desiredKeys.includes(principal.principalKey));
  const proposedGrant: C2bAclImage = { containerKey, breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
    allowedPrincipals: [...currentExtra, ...allowed], revokedPrincipalKeys: [] };
  const proposedFinal: C2bAclImage = { containerKey, breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
    allowedPrincipals: allowed, revokedPrincipalKeys: currentExtra.map(principal => principal.principalKey) };
  const grant = normaliseC2bIntendedImage({ header: { naturalKey: containerKey, fields: {} }, items: [],
    acls: [{ listPurpose, acl: proposedGrant }] }).acls[0].acl;
  const final = normaliseC2bIntendedImage({ header: { naturalKey: containerKey, fields: {} }, items: [],
    acls: [{ listPurpose, acl: proposedFinal }] }).acls[0].acl;
  return { current, grant, final };
}
const asRecord = (value: unknown): Record<string, unknown> => cloneC2b(value) as Record<string, unknown>;
const effect = (sequence: number, commandKey: string, kind: C2bEffectKind, target: C2bEffectTarget,
  naturalKey: string, expectedETag: string | null, expectedRowVersionToken: number | null,
  beforeFields: Record<string, unknown> | null, desiredFields: Record<string, unknown>,
  claimSequence = 1): C2bEffectPlan =>
  createC2bEffectPlan({ sequence, effectKey: `${commandKey}|${String(sequence).padStart(2, '0')}|${kind}`,
    kind, target, naturalKey, expectedETag,
    expectedETagFromEffectKey: kind === 'Finalise' ? `${commandKey}|${String(claimSequence).padStart(2, '0')}|Claim`
      : kind === 'ReceiptGrant' ? `${commandKey}|${String(sequence - 1).padStart(2, '0')}|ReceiptCreate` : null,
    expectedRowVersionToken, beforeFields, desiredFields });
const receiptAccess = (commandKey: string, actor: C2bTrustedPerson,
  effectiveRole: 'Employee' | 'Manager' | 'SystemAdmin',
  configuration: C2bTrustedAnnualConfiguration): C2bReceiptActorAccess => ({
  receiptKey: commandKey, breaksInheritance: true,
  allowedPrincipals: [
    { principalKey: actor.personKey, permission: 'Read',
      source: effectiveRole === 'Employee' ? 'Employee' : effectiveRole === 'Manager' ? 'Manager' : 'Admin' },
    { principalKey: configuration.processorPrincipalKey, permission: 'FullControl', source: 'Processor' }
  ], revokedPrincipalKeys: []
});
function commonTail(start: number, commandKey: string, workplanKey: string, expectedToken: number,
  claimFields: Record<string, unknown>, finalFields: Record<string, unknown>, intendedImageSha256: string,
  eventType: string, eventSubject: string, employee: C2bTrustedPerson,
  configuration: C2bTrustedAnnualConfiguration): C2bEffectPlan[] {
  return [
    effect(start, commandKey, 'Finalise', 'Workplans', workplanKey, null, expectedToken + 1, claimFields, finalFields),
    effect(start + 1, commandKey, 'AuditAppend', 'Audit', `${commandKey}|Accepted`, null, null, null,
      { operation: 'Append', eventType, outcome: 'Accepted', subjectKey: eventSubject,
        correlationKey: commandKey, afterImageSha256: intendedImageSha256, success: true }),
    effect(start + 2, commandKey, 'StableRead', 'Workplans', workplanKey, null, expectedToken + 2, null,
      { operation: 'PostFinaliseDoubleRead', intendedImageSha256, requireCompletePaging: true,
        requireExactAcl: true, requireAllEffectEvidence: true }),
    effect(start + 3, commandKey, 'ReceiptCreate', 'CommandReceipts', commandKey, null, null, null,
      { operation: 'CreateAfterStableRead', commandKey, outcome: 'Accepted' }),
    effect(start + 4, commandKey, 'ReceiptGrant', 'CommandReceipts', commandKey, null, null,
      { operation: 'ProcessorOnly', receiptKey: commandKey },
      { operation: 'GrantReceiptRead', receiptKey: commandKey,
        actorAccess: receiptAccess(commandKey, employee, 'Employee', configuration) })
  ];
}

interface C2bPlannedItemMutation {
  naturalKey: string;
  current: C2bTrustedAnnualItem | undefined;
  desiredFields: Record<string, unknown>;
}
interface C2bPlannedAudit {
  eventType: string;
  subjectKey: string;
  details?: Readonly<Record<string, unknown>>;
}
function buildAnnualMutationPlan(input: {
  commandKey: string;
  commandType: C2bCommandPlan['commandType'];
  payload: unknown;
  employee: C2bTrustedPerson;
  manager: C2bTrustedPerson;
  actor: C2bTrustedPerson;
  effectiveRole: 'Employee' | 'Manager' | 'SystemAdmin';
  configuration: C2bTrustedAnnualConfiguration;
  header: C2bTrustedWorkplanHeader;
  allItems: readonly C2bTrustedAnnualItem[];
  mutations: readonly C2bPlannedItemMutation[];
  finalFields: Record<string, unknown>;
  audits: readonly C2bPlannedAudit[];
  processedAt: string;
  acl: C2bTrustedAclContext;
  amendmentControl?: {
    controlCase: ISec006ControlCase;
    consumption: ISec006ControlCaseConsumption;
  };
}): C2bCommandPlan {
  const items = assertCompleteItems(input.header, input.allItems);
  const finalFields: Record<string, unknown> = {
    ...cloneC2b(input.finalFields), TransitionCorrelationKey: input.commandKey
  };
  if (!Number.isFinite(Date.parse(input.processedAt)) || input.audits.length < 1
    || finalFields.WorkplanKey !== input.header.workplanKey
    || finalFields.PersonKey !== input.header.personKey
    || finalFields.PerformanceYear !== input.header.performanceYear
    || finalFields.RowVersionToken !== input.header.rowVersionToken + 2
    || finalFields.TransitionStatus !== 'Ready' || finalFields.AccessState === 'RecoveryHold')
    return fail('C2b handler rejected: final annual image, audit or trusted processing time is incomplete.');
  const mutationKeys = input.mutations.map(mutation => mutation.naturalKey);
  if (new Set(mutationKeys).size !== mutationKeys.length) return fail('C2b handler rejected: duplicate item mutations are prohibited.');
  input.mutations.forEach(mutation => {
    const matching = items.filter(item => item.workplanItemNaturalKey === mutation.naturalKey);
    if (mutation.current) {
      if (matching.length !== 1 || matching[0].workplanItemKey !== mutation.current.workplanItemKey
        || matching[0].etag !== mutation.current.etag || matching[0].rowVersionToken !== mutation.current.rowVersionToken)
        return fail('C2b handler rejected: item update does not reconcile to the complete current set.');
    } else if (matching.length !== 0) return fail('C2b handler rejected: natural-key collision prevents item creation.');
    if (mutation.desiredFields.WorkplanItemNaturalKey !== mutation.naturalKey
      || mutation.desiredFields.WorkplanKey !== input.header.workplanKey
      || mutation.desiredFields.PersonKey !== input.employee.personKey
      || mutation.desiredFields.PerformanceYear !== input.header.performanceYear
      || mutation.desiredFields.RowVersionToken !== (mutation.current?.rowVersionToken || 0) + 1)
      return fail('C2b handler rejected: item identity or version was not processor-derived.');
  });
  const mutationsByKey = new Map(input.mutations.map(mutation => [mutation.naturalKey, mutation]));
  const intendedItems: C2bCanonicalEntityImage[] = items
    .map(item => ({ naturalKey: item.workplanItemNaturalKey,
      fields: mutationsByKey.get(item.workplanItemNaturalKey)?.desiredFields || cloneC2b(item.fields) }));
  input.mutations.filter(mutation => !mutation.current).forEach(mutation => intendedItems.push({
    naturalKey: mutation.naturalKey, fields: mutation.desiredFields
  }));
  const employeeContainerKey = input.employee.personKey;
  const workplansAcl = aclPlan('Workplans', employeeContainerKey, input.employee, input.manager,
    input.configuration, input.acl);
  const workplanItemsAcl = input.mutations.length > 0
    ? aclPlan('WorkplanItems', employeeContainerKey, input.employee, input.manager, input.configuration, input.acl)
    : undefined;
  const intended = normaliseC2bIntendedImage({
    header: { naturalKey: input.header.workplanKey, fields: finalFields },
    items: intendedItems,
    acls: [
      { listPurpose: 'Workplans', acl: workplansAcl.final },
      ...(workplanItemsAcl ? [{ listPurpose: 'WorkplanItems' as const, acl: workplanItemsAcl.final }] : [])
    ]
  });
  const intendedHash = hashC2bCanonical(intended);
  const beforeImageSha256 = hashC2bCanonical({ header: input.header.fields,
    items: items.map(item => ({ naturalKey: item.workplanItemNaturalKey, fields: item.fields })) });
  const claimFields = { ...cloneC2b(input.header.fields), AccessState: 'RecoveryHold',
    TransitionStatus: 'InProgress', TransitionCorrelationKey: input.commandKey,
    RowVersionToken: input.header.rowVersionToken + 1 };
  const effects: C2bEffectPlan[] = [];
  let sequence = 1;
  if (input.amendmentControl) {
    effects.push(effect(sequence++, input.commandKey, 'ControlCaseConsume', 'AuthoritativeControlCase',
      input.amendmentControl.controlCase.controlCaseKey,
      input.amendmentControl.controlCase.storageETag,
      input.amendmentControl.controlCase.storageRowVersionToken,
      asRecord(input.amendmentControl.controlCase),
      { operation: 'CompareAndSwapConsume', ...cloneC2b(input.amendmentControl.consumption) }));
  }
  effects.push(effect(sequence++, input.commandKey, 'Claim', 'Workplans', input.header.workplanKey,
    input.header.etag, input.header.rowVersionToken, cloneC2b(input.header.fields), claimFields));
  input.mutations.forEach(mutation => effects.push(effect(sequence++, input.commandKey, 'CanonicalUpsert',
    'WorkplanItems', mutation.naturalKey, mutation.current?.etag || null, mutation.current?.rowVersionToken || 0,
    mutation.current ? cloneC2b(mutation.current.fields) : null, mutation.desiredFields)));
  effects.push(effect(sequence++, input.commandKey, 'Grant', 'Workplans', employeeContainerKey, null, null,
    asRecord(workplansAcl.current), asRecord(workplansAcl.grant)));
  if (workplanItemsAcl) effects.push(effect(sequence++, input.commandKey, 'Grant', 'WorkplanItems',
    employeeContainerKey, null, null, asRecord(workplanItemsAcl.current), asRecord(workplanItemsAcl.grant)));
  effects.push(effect(sequence++, input.commandKey, 'Revoke', 'Workplans', employeeContainerKey, null, null,
    asRecord(workplansAcl.grant), asRecord(workplansAcl.final)));
  if (workplanItemsAcl) effects.push(effect(sequence++, input.commandKey, 'Revoke', 'WorkplanItems',
    employeeContainerKey, null, null, asRecord(workplanItemsAcl.grant), asRecord(workplanItemsAcl.final)));
  effects.push(effect(sequence++, input.commandKey, 'Finalise', 'Workplans', input.header.workplanKey, null,
    input.header.rowVersionToken + 1, claimFields, finalFields, input.amendmentControl ? 2 : 1));
  input.audits.forEach((entry, index) => effects.push(effect(sequence++, input.commandKey, 'AuditAppend', 'Audit',
    `${input.commandKey}|${String(index + 1).padStart(2, '0')}|${entry.eventType}`, null, null, null, {
      operation: 'Append', eventType: entry.eventType, outcome: 'Accepted', subjectKey: entry.subjectKey,
      correlationKey: input.commandKey, actorPersonKey: input.actor.personKey, actorEmail: email(input.actor.email),
      actorRole: input.effectiveRole, eventAt: input.processedAt, beforeImageSha256,
      afterImageSha256: intendedHash, success: true, ...(entry.details ? cloneC2b(entry.details) : {})
    })));
  effects.push(effect(sequence++, input.commandKey, 'StableRead', 'Workplans', input.header.workplanKey, null,
    input.header.rowVersionToken + 2, null, { operation: 'PostFinaliseDoubleRead', intendedImageSha256: intendedHash,
      requireCompletePaging: true, requireExactAcl: true, requireAllEffectEvidence: true }));
  effects.push(effect(sequence++, input.commandKey, 'ReceiptCreate', 'CommandReceipts', input.commandKey,
    null, null, null, { operation: 'CreateAfterStableRead', commandKey: input.commandKey, outcome: 'Accepted' }));
  effects.push(effect(sequence++, input.commandKey, 'ReceiptGrant', 'CommandReceipts', input.commandKey,
    null, null, { operation: 'ProcessorOnly', receiptKey: input.commandKey }, {
      operation: 'GrantReceiptRead', receiptKey: input.commandKey,
      actorAccess: receiptAccess(input.commandKey, input.actor, input.effectiveRole, input.configuration)
    }));
  return createC2bCommandPlan({ commandKey: input.commandKey, commandType: input.commandType,
    personKey: input.employee.personKey, actorPersonKey: input.actor.personKey, effectiveRole: input.effectiveRole,
    subjectKey: input.header.workplanKey, performanceYear: input.header.performanceYear,
    payload: input.payload, intendedImage: intended, effects });
}

const optional = (value: unknown): unknown => value === undefined ? null : value;
const quarter = (input: IEmployeeCoreContributionInputV2, key: 'Q1' | 'Q2' | 'Q3' | 'Q4'):
  IEmployeeCoreContributionInputV2['quarterTargets'][number] =>
  input.quarterTargets.find(target => target.quarter === key)!;
function coreActiveFields(payload: IEmployeeCoreContributionInputV2, catalogue: C2bTrustedCoreCatalogueItem,
  header: C2bTrustedWorkplanHeader, itemKey: string, naturalKey: string, current: C2bTrustedAnnualItem | undefined,
  employee: C2bTrustedPerson, processedAt: string): Record<string, unknown> {
  const q1 = quarter(payload, 'Q1'); const q2 = quarter(payload, 'Q2');
  const q3 = quarter(payload, 'Q3'); const q4 = quarter(payload, 'Q4');
  return {
    ...(current ? cloneC2b(current.fields) : {
      WorkplanItemKey: itemKey, WorkplanItemNaturalKey: naturalKey, WorkplanKey: header.workplanKey,
      PersonKey: header.personKey, PerformanceYear: header.performanceYear, ItemType: 'CoreGold',
      AddedByEmail: email(employee.email), AddedAt: processedAt
    }),
    Title: catalogue.kpiId, KPIID: catalogue.kpiId, KPIVersionKey: catalogue.kpiVersionKey,
    TargetVersionKey: catalogue.targetVersionKey, EmployeeKpiRole: payload.role,
    ContributionMethod: payload.contributionMethod, UnitLabel: catalogue.contributionUnit,
    YearEndTargetValue: optional(payload.annualTargetValue), YearEndTargetText: optional(payload.annualTargetText),
    Q1TargetValue: optional(q1.targetValue), Q1TargetText: optional(q1.targetText || q1.commitment),
    Q1SuccessDefinition: optional(q1.successDefinition), Q2TargetValue: optional(q2.targetValue),
    Q2TargetText: optional(q2.targetText || q2.commitment), Q2SuccessDefinition: optional(q2.successDefinition),
    Q3TargetValue: optional(q3.targetValue), Q3TargetText: optional(q3.targetText || q3.commitment),
    Q3SuccessDefinition: optional(q3.successDefinition), Q4TargetValue: optional(q4.targetValue),
    Q4TargetText: optional(q4.targetText || q4.commitment), Q4SuccessDefinition: optional(q4.successDefinition),
    SharedTargetRule: optional(payload.sharedTargetRule),
    SharedApportionmentPercent: optional(payload.sharedApportionmentPercent),
    ContributionGovernanceReference: optional(payload.governanceReference),
    DenominatorNumerator: optional(payload.denominatorNumerator), DenominatorValue: optional(payload.denominatorValue),
    DenominatorUnit: optional(payload.denominatorUnit), DenominatorRuleReference: optional(payload.denominatorRuleReference),
    DenominatorSourceReference: optional(payload.denominatorSourceReference),
    DirectContributionEligible: catalogue.directContributionEligible,
    ContributionApprovalState: 'Draft', AdditiveApproved: false,
    NonOverlapRequired: catalogue.nonOverlapRequired, NonOverlapApproved: false,
    DisplayOrder: payload.displayOrder, ActiveInWorkplan: true,
    RowVersionToken: (current?.rowVersionToken || 0) + 1
  };
}
function personalActiveFields(payload: IEmployeePersonalItemInputV2, header: C2bTrustedWorkplanHeader,
  itemKey: string, naturalKey: string, current: C2bTrustedAnnualItem | undefined,
  employee: C2bTrustedPerson, processedAt: string): Record<string, unknown> {
  return {
    ...(current ? cloneC2b(current.fields) : {
      WorkplanItemKey: itemKey, WorkplanItemNaturalKey: naturalKey, WorkplanKey: header.workplanKey,
      PersonKey: header.personKey, PerformanceYear: header.performanceYear, ItemType: 'LocalPersonal',
      AddedByEmail: email(employee.email), AddedAt: processedAt
    }),
    Title: payload.wording.trim().slice(0, 255), LocalKPIWording: payload.wording.trim(),
    LocalKPIDescription: optional(payload.description?.trim()), LocalMeasure: payload.measure.trim(),
    LocalMetricType: optional(payload.measureType), LocalScoringDirection: optional(payload.scoringDirection),
    LocalPercentageScale: optional(payload.percentageSourceScale), LocalBaselineValue: optional(payload.baselineValue),
    YearEndTargetValue: optional(payload.yearEndTargetValue), YearEndTargetText: optional(payload.yearEndTargetText?.trim()),
    Q1TargetValue: optional(payload.q1TargetValue), Q1TargetText: optional(payload.q1TargetText?.trim()),
    Q2TargetValue: optional(payload.q2TargetValue), Q2TargetText: optional(payload.q2TargetText?.trim()),
    Q3TargetValue: optional(payload.q3TargetValue), Q3TargetText: optional(payload.q3TargetText?.trim()),
    Q4TargetValue: optional(payload.q4TargetValue), Q4TargetText: optional(payload.q4TargetText?.trim()),
    UnitLabel: payload.unitLabel.trim(), PersonalItemWeight: optional(payload.personalItemWeight),
    DisplayOrder: payload.displayOrder, ActiveInWorkplan: true,
    RowVersionToken: (current?.rowVersionToken || 0) + 1
  };
}

function behaviourV2SnapshotFields(snapshot: Readonly<IBehaviourAnnualSnapshotV2>): Record<string, unknown> {
  return {
    BehaviourFrameworkVersion: snapshot.frameworkVersion,
    BehaviourVersionKey: snapshot.frameworkVersion,
    BehaviourID: snapshot.valueId,
    BehaviourValueTitleSnapshot: snapshot.valueTitle,
    BehaviourCorporateValueSnapshot: snapshot.corporateValue,
    BehaviourRoleTierSnapshot: snapshot.roleTier,
    BehaviourDescriptorSnapshot: snapshot.descriptor,
    BehaviourCadenceSnapshot: snapshot.cadence,
    BehaviourPeriodKeysSnapshotJSON: JSON.stringify(snapshot.periodKeys),
    BehaviourRatingLabelsSnapshotJSON: JSON.stringify(snapshot.ratingOptions.map(option => ({
      value: option.value, label: option.label, displayLabel: option.displayLabel
    })))
  };
}

function assertStoredBehaviourV2Snapshot(current: C2bTrustedAnnualItem,
  immutableSnapshotFields: Readonly<Record<string, unknown>>): void {
  const storedSnapshot = Object.keys(immutableSnapshotFields).reduce((result, key) => ({
    ...result, [key]: current.fields[key]
  }), {} as Record<string, unknown>);
  if (canonicaliseC2b(storedSnapshot) !== canonicaliseC2b(immutableSnapshotFields)) {
    return fail('C2b Behaviour v02 rejected: the immutable stored snapshot differs from trusted published observations.');
  }
  const forbiddenStoredFields = ['BehaviourItemWeight', 'Q1BehaviourTargetRating', 'Q2BehaviourTargetRating',
    'Q3BehaviourTargetRating', 'Q4BehaviourTargetRating', 'Average', 'CalculatedRAG', 'RAGFromTarget',
    'RawNormalisedScore', 'NormalisedScore', 'ScoredContribution', 'PeerRating', 'PeerScore', 'PeerEffect'];
  if (forbiddenStoredFields.some(key => current.fields[key] !== undefined && current.fields[key] !== null)) {
    return fail('C2b Behaviour v02 rejected: legacy or scoring content is present on the v02 item.');
  }
}

function exactIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validatedBehaviourV2SuggestionKeys(payload: IEmployeeBehaviourCommitmentInputV2,
  current: C2bTrustedAnnualItem | undefined, configuration: C2bTrustedAnnualConfiguration,
  trusted: C2bTrustedBehaviourV2Observations, processedAt: string): string[] {
  const catalogueValue: unknown = trusted.catalogue;
  if (!catalogueValue || typeof catalogueValue !== 'object' || Array.isArray(catalogueValue)) {
    return fail('C2b Behaviour v02 rejected: the complete trusted catalogue observation is missing or malformed.');
  }
  const catalogue = catalogueValue as NonNullable<C2bTrustedBehaviourV2Observations['catalogue']>;
  const catalogueFields = ['complete', 'frameworkVersion', 'applicableDate', 'records'];
  const actualFields = Object.keys(catalogue);
  const processedDate = new Date(processedAt);
  if (actualFields.length !== catalogueFields.length
    || catalogueFields.some(field => !Object.prototype.hasOwnProperty.call(catalogue, field))
    || catalogue.complete !== true || !Array.isArray(catalogue.records)
    || !exactIsoDate(catalogue.applicableDate) || Number.isNaN(processedDate.getTime())
    || catalogue.applicableDate !== processedDate.toISOString().slice(0, 10)
    || catalogue.frameworkVersion !== configuration.behaviourContractVersion
    || catalogue.frameworkVersion !== trusted.framework.frameworkVersion
    || catalogue.frameworkVersion !== trusted.assignment.frameworkVersion) {
    return fail('C2b Behaviour v02 rejected: the complete trusted catalogue version or applicable date is invalid or stale.');
  }
  const observedKeys: string[] = [];
  catalogue.records.forEach(record => {
    if (inspectBehaviourLibraryV2Record(record).length > 0) {
      return fail('C2b Behaviour v02 rejected: a trusted catalogue record is malformed or crossed.');
    }
    observedKeys.push(record.behaviourObjectiveKey);
  });
  if (new Set(observedKeys).size !== observedKeys.length) {
    return fail('C2b Behaviour v02 rejected: trusted catalogue stable keys are duplicated or conflicting.');
  }

  let storedKeys: string[] = [];
  if (current) {
    const storedJson = current.fields.BehaviourV2SelectedSuggestionKeysJSON;
    let parsed: unknown;
    if (typeof storedJson !== 'string') {
      return fail('C2b Behaviour v02 rejected: canonical stored suggestion-key JSON is missing or malformed.');
    }
    try { parsed = JSON.parse(storedJson); } catch {
      return fail('C2b Behaviour v02 rejected: canonical stored suggestion-key JSON is missing or malformed.');
    }
    if (!Array.isArray(parsed) || parsed.some(key => typeof key !== 'string'
      || !isExactBehaviourLibraryV2SuggestionKey(payload.behaviourId, key))
      || new Set(parsed).size !== parsed.length) {
      return fail('C2b Behaviour v02 rejected: canonical stored suggestion keys are malformed, duplicated or crossed.');
    }
    storedKeys = parsed;
  }

  if (payload.selectedSuggestionKeys.some(key =>
    !isExactBehaviourLibraryV2SuggestionKey(payload.behaviourId, key))) {
    return fail('C2b Behaviour v02 rejected: a requested suggestion key has a legacy or crossed Value shape.');
  }
  const selectable = new Set(catalogue.records
    .filter(record => behaviourLibraryV2RecordMatchesAssignment(record, payload.behaviourId,
      catalogue.frameworkVersion, trusted.assignment.roleTier, processedDate))
    .map(record => record.behaviourObjectiveKey));
  const stored = new Set(storedKeys);
  if (payload.selectedSuggestionKeys.some(key => !selectable.has(key) && !stored.has(key))) {
    return fail('C2b Behaviour v02 rejected: a new suggestion key is unavailable or untrusted.');
  }
  return [...payload.selectedSuggestionKeys].sort((left, right) => left.localeCompare(right));
}

function validatedFocusSelectionsV2(payload: IEmployeeBehaviourCommitmentInputV2,
  current: C2bTrustedAnnualItem | undefined, configuration: C2bTrustedAnnualConfiguration,
  trusted: C2bTrustedBehaviourV2Observations, processedAt: string): ReturnType<typeof encodeBehaviourSelectionSnapshotsV2> {
  const pin = configuration.behaviourCataloguePin;
  const catalogue = trusted.focusCatalogue;
  const date = new Date(processedAt);
  const dateOnly = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  if (configuration.schemaRevision !== 'c2b-annual-v3' || !pin || !catalogue
    || catalogue.complete !== true || !Array.isArray(catalogue.rows)
    || catalogue.catalogueKey !== pin.catalogueKey
    || catalogue.catalogueVersion !== pin.catalogueVersion || catalogue.revision !== pin.revision
    || catalogue.contentSha256 !== pin.contentSha256
    || catalogue.sourceSha256 !== pin.sourceSha256
    || catalogue.sourceRowsCanonicalSha256 !== pin.sourceRowsCanonicalSha256
    || catalogue.approvalReference !== pin.approvalReference
    || catalogue.rowCount !== pin.rowCount || catalogue.rows.length !== pin.rowCount
    || catalogue.applicableDate !== dateOnly || !nonBlank(catalogue.publicationKey)
    || !/^[A-F0-9]{64}$/i.test(catalogue.publicationSha256)
    || !/^[A-F0-9]{64}$/i.test(catalogue.publicationImageSha256)
    || !/^[A-F0-9]{64}$/i.test(catalogue.rowsImageSha256)
    || !Array.isArray(payload.selections)) {
    return fail('C2b Behaviour v02 rejected: trusted focus publication or client selections are missing, crossed or stale.');
  }
  const observedKeys = catalogue.rows.map(row => row.targetKey);
  if (new Set(observedKeys).size !== observedKeys.length
    || catalogue.rows.some(row => row.contentSha256 !== pin.contentSha256
      || row.behaviourKey !== row.targetKey.slice(0, 6)
      || !/^BHV-0[1-5]-L[1-3]-0[1-9][0-9]*$/.test(row.targetKey)
      || row.targetKey.split('-')[2] !== row.roleLevelCode
      || !row.focusKey.startsWith(`${row.behaviourKey}-FOCUS-`)
      || !nonBlank(row.focusArea) || !nonBlank(row.suggestedTarget))) {
    return fail('C2b Behaviour v02 rejected: focus rows are duplicate, malformed or crossed.');
  }
  const roleLevelCode = trusted.assignment.roleTier === 'IC_OFFICER' ? 'L1'
    : trusted.assignment.roleTier === 'PEOPLE_MANAGER' ? 'L2'
      : trusted.assignment.roleTier === 'SENIOR_LEADER' ? 'L3' : undefined;
  if (!roleLevelCode || trusted.assignment.frameworkVersion !== configuration.behaviourContractVersion) {
    return fail('C2b Behaviour v02 rejected: trusted assigned role or framework is invalid.');
  }
  let stored = new Map<string, BehaviourSelectionSnapshotV2>();
  if (current) {
    const fields = current.fields;
    if (typeof fields.BehaviourV2SelectionSnapshotsJSON !== 'string'
      || typeof fields.BehaviourV2SelectionSnapshotsSHA256 !== 'string'
      || !Number.isSafeInteger(fields.BehaviourV2SelectionSnapshotsUtf8ByteLength)) {
      return fail('C2b Behaviour v02 rejected: pre-extension historical item is read-only.');
    }
    const previous = decodeBehaviourSelectionSnapshotsV2(fields.BehaviourV2SelectionSnapshotsJSON,
      fields.BehaviourV2SelectionSnapshotsSHA256, Number(fields.BehaviourV2SelectionSnapshotsUtf8ByteLength));
    if (previous.valueId !== payload.behaviourId) {
      return fail('C2b Behaviour v02 rejected: stored selection Value is crossed.');
    }
    stored = new Map(previous.selections.map(row => [row.selectionKey, row]));
    if (previous.selections.some(row => !payload.selections?.some(requested => requested.selectionKey === row.selectionKey
      && requested.source === row.source))) {
      return fail('C2b Behaviour v02 rejected: an immutable historical selection cannot be removed.');
    }
  }
  const selections: BehaviourSelectionSnapshotV2[] = payload.selections.map(requested => {
    const previous = stored.get(requested.selectionKey);
    const commitment = requested.commitment.trim();
    const howWillWeKnow = requested.howWillWeKnow.trim();
    if (previous) return { ...previous, commitment, howWillWeKnow };
    if (requested.source === 'Own') return {
      source: 'Own', selectionKey: requested.selectionKey, behaviourKey: payload.behaviourId,
      commitment, howWillWeKnow
    };
    const row = catalogue.rows.find(candidate => candidate.targetKey === requested.selectionKey);
    if (requested.source !== 'Catalogue' || !row || row.behaviourKey !== payload.behaviourId
      || row.roleLevelCode !== roleLevelCode || row.effectiveStatus !== 'Published'
      || !exactIsoDate(row.effectiveFrom) || row.effectiveFrom > dateOnly
      || row.effectiveTo && (!exactIsoDate(row.effectiveTo) || row.effectiveTo < dateOnly)) {
      return fail('C2b Behaviour v02 rejected: a new catalogue selection is unavailable or retired.');
    }
    return { source: 'Catalogue', selectionKey: requested.selectionKey,
      catalogueKey: pin.catalogueKey, catalogueVersion: pin.catalogueVersion,
      catalogueRevision: pin.revision, targetKey: row.targetKey, focusKey: row.focusKey,
      behaviourKey: payload.behaviourId, roleLevelCode, focusArea: row.focusArea,
      selectedExampleText: row.suggestedTarget, commitment, howWillWeKnow };
  });
  const envelope: IBehaviourSelectionSnapshotEnvelopeV2 = {
    schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA,
    frameworkVersion: 'KCCC-BEHAVIOUR|v02', valueId: payload.behaviourId,
    selections: selections.sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
  };
  return encodeBehaviourSelectionSnapshotsV2(envelope);
}

function behaviourV2ActiveFields(payload: IEmployeeBehaviourCommitmentInputV2,
  snapshot: Readonly<IBehaviourAnnualSnapshotV2>, header: C2bTrustedWorkplanHeader,
  itemKey: string, naturalKey: string, current: C2bTrustedAnnualItem | undefined,
  employee: C2bTrustedPerson, processedAt: string, selectedSuggestionKeys: readonly string[],
  selectionSnapshots?: ReturnType<typeof encodeBehaviourSelectionSnapshotsV2>): Record<string, unknown> {
  const immutableSnapshotFields = behaviourV2SnapshotFields(snapshot);
  const periods = payload.periodCommitments.map(entry => entry.period);
  if (canonicaliseC2b([...periods].sort()) !== canonicaliseC2b([...snapshot.periodKeys].sort())) {
    return fail('C2b Behaviour v02 rejected: client commitments do not match the trusted assigned cadence.');
  }
  const previousPlanning = current ? readBehaviourPlanningLevelsV1(current.fields) : undefined;
  const planning = payload.planningLevels === undefined ? previousPlanning
    : validateBehaviourPlanningLevelsV1(payload.planningLevels);
  return {
    ...(current ? cloneC2b(current.fields) : {
      WorkplanItemKey: itemKey, WorkplanItemNaturalKey: naturalKey, WorkplanKey: header.workplanKey,
      PersonKey: header.personKey, PerformanceYear: header.performanceYear, ItemType: 'Behaviour',
      WorkplanVersion: Number(header.fields.WorkplanVersion || 1),
      AddedByEmail: email(employee.email), AddedAt: processedAt
    }),
    ...immutableSnapshotFields,
    BehaviourCommitmentV2: payload.commitment.trim(),
    BehaviourPeriodCommitmentsV2JSON: JSON.stringify(payload.periodCommitments
      .map(entry => ({ period: entry.period, commitment: entry.commitment.trim() }))
      .sort((left, right) => left.period.localeCompare(right.period))),
    ...(planning ? {
      BehaviourPlanningContractVersion: planning.contractVersion,
      BehaviourCurrentLevelV2: planning.currentLevel ?? null,
      BehaviourTargetLevelV2: planning.targetLevel ?? null,
      BehaviourTargetLevelReasonV2: planning.targetJustification ?? null
    } : {}),
    BehaviourV2SelectedSuggestionKeysJSON: JSON.stringify([...selectedSuggestionKeys]),
    ...(selectionSnapshots ? {
      BehaviourV2SelectionSnapshotsJSON: selectionSnapshots.json,
      BehaviourV2SelectionSnapshotsSHA256: selectionSnapshots.sha256,
      BehaviourV2SelectionSnapshotsUtf8ByteLength: selectionSnapshots.utf8ByteLength
    } : {}),
    DisplayOrder: payload.displayOrder,
    ActiveInWorkplan: true,
    RowVersionToken: (current?.rowVersionToken || 0) + 1
  };
}

export function planCreateWorkplanDraftC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  acl: C2bTrustedAclContext): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = exactObject(raw.payload, []);
  assertC2bEmployeeManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'CreateWorkplanDraft' || raw.personKey !== employee.personKey
    || raw.performanceYear !== configuration.performanceYear || Object.keys(payload).length !== 0)
    return fail('C2b CreateWorkplanDraft rejected: command and trusted annual configuration do not reconcile.');
  const commandKey = raw.commandKey as string;
  const year = raw.performanceYear as number;
  const workplanKey = `${employee.personKey}|${year}`;
  const employeeContainerKey = employee.personKey;
  const aclImages = aclPlan('Workplans', employeeContainerKey, employee, manager, configuration, acl);
  const claimFields: Record<string, unknown> = {
    WorkplanKey: workplanKey, PersonKey: employee.personKey, EmployeeDisplayName: employee.displayName,
    EmployeeEmail: email(employee.email), ManagerPersonKey: manager.personKey, ManagerDisplayName: manager.displayName,
    ManagerEmail: email(manager.email), PerformanceYear: year, State: configuration.initialState,
    AccessState: 'RecoveryHold', TransitionStatus: 'InProgress', TransitionCorrelationKey: commandKey,
    BehaviourContractVersion: configuration.behaviourContractVersion, SchemaRevision: configuration.schemaRevision,
    RowVersionToken: 1
  };
  const finalFields = { ...claimFields, AccessState: configuration.initialAccessState,
    TransitionStatus: configuration.initialTransitionStatus, RowVersionToken: 2 };
  const intended = normaliseC2bIntendedImage({ header: { naturalKey: workplanKey, fields: finalFields },
    items: [], acls: [{ listPurpose: 'Workplans', acl: aclImages.final }] });
  const intendedHash = hashC2bCanonical(intended);
  const effects: C2bEffectPlan[] = [
    effect(1, commandKey, 'Claim', 'Workplans', workplanKey, null, 0, null, claimFields),
    effect(2, commandKey, 'Grant', 'Workplans', employeeContainerKey, null, null,
      asRecord(aclImages.current), asRecord(aclImages.grant)),
    effect(3, commandKey, 'Revoke', 'Workplans', employeeContainerKey, null, null,
      asRecord(aclImages.grant), asRecord(aclImages.final)),
    ...commonTail(4, commandKey, workplanKey, 0, claimFields, finalFields, intendedHash,
      'WorkplanDraftCreated', workplanKey, employee, configuration)
  ];
  return createC2bCommandPlan({ commandKey, commandType: 'CreateWorkplanDraft', personKey: employee.personKey,
    subjectKey: workplanKey, performanceYear: year, payload, intendedImage: intended, effects });
}

export function planUpsertCoreContributionC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, item: C2bTrustedAnnualItem | undefined,
  allItems: readonly C2bTrustedAnnualItem[], processedAt: string, acl: C2bTrustedAclContext,
  catalogue?: C2bTrustedCoreCatalogueItem, itemIdentity?: C2bTrustedItemIdentity): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = raw.payload as IEmployeeCoreContributionInputV2;
  assertC2bEmployeeManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertEditableHeader(header);
  const currentItems = assertCompleteItems(header, allItems); validateEmployeeCoreContributionInputV2(payload);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'UpsertCoreContributionV2' || raw.personKey !== employee.personKey
    || raw.performanceYear !== header.performanceYear || typeof payload.activeInWorkplan !== 'boolean'
    || !naturalKeyPart(payload.kpiId)
    || payload.sharedTargetRule !== undefined
      && !['VisibleOnly', 'ApprovedApportionment'].includes(payload.sharedTargetRule)
    || !Number.isFinite(Date.parse(processedAt)))
    return fail('C2b Core upsert/deactivation rejected: stale, forged or mismatched annual state.');
  const commandKey = raw.commandKey as string;
  const naturalKey = `${header.workplanKey}|CoreGold|${payload.kpiId}`;
  const naturalMatches = currentItems.filter(candidate => candidate.workplanItemNaturalKey === naturalKey);
  const current = currentItemFromCompleteSet(item, naturalMatches, 'C2b Core upsert/deactivation');
  if (current && (current.itemType !== 'CoreGold' || current.fields.KPIID !== payload.kpiId))
    return fail('C2b Core upsert/deactivation rejected: unique natural key or current item identity did not reconcile.');
  let desiredItemFields: Record<string, unknown>;
  let eventType: string;
  if (!payload.activeInWorkplan) {
    if (!current || !current.activeInWorkplan)
      return fail('C2b Core deactivation rejected: one active retained Core item is required.');
    desiredItemFields = { ...cloneC2b(current.fields), ActiveInWorkplan: false,
      RowVersionToken: current.rowVersionToken + 1 };
    eventType = 'CoreContributionDeactivated';
  } else {
    if (!catalogue || !catalogue.active || !catalogue.approved || catalogue.kpiId !== payload.kpiId
      || catalogue.performanceYear !== header.performanceYear || !nonBlank(catalogue.kpiVersionKey)
      || !nonBlank(catalogue.targetVersionKey) || !nonBlank(catalogue.contributionUnit)
      || typeof catalogue.directContributionEligible !== 'boolean' || typeof catalogue.additiveEligible !== 'boolean'
      || typeof catalogue.nonOverlapRequired !== 'boolean'
      || payload.contributionMethod === 'AdditiveDirect'
        && (!catalogue.directContributionEligible || !catalogue.additiveEligible))
      return fail('C2b Core upsert rejected: current approved catalogue/target identity is incomplete.');
    const workplanItemKey = current?.workplanItemKey || itemIdentity?.workplanItemKey;
    if (!naturalKeyPart(workplanItemKey)
      || itemIdentity && current && itemIdentity.workplanItemKey !== current.workplanItemKey)
      return fail('C2b Core upsert rejected: trusted item identity is missing or mismatched.');
    desiredItemFields = coreActiveFields(payload, catalogue, header, workplanItemKey, naturalKey, current,
      employee, processedAt);
    eventType = current ? current.activeInWorkplan ? 'CoreContributionUpdated' : 'CoreContributionReactivated'
      : 'CoreContributionCreated';
  }
  const finalFields = { ...cloneC2b(header.fields), State: header.state, AccessState: header.accessState,
    TransitionStatus: 'Ready', RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'UpsertCoreContributionV2', payload,
    employee, manager, actor: employee, effectiveRole: 'Employee', configuration, header, allItems: currentItems,
    mutations: [{ naturalKey, current, desiredFields: desiredItemFields }], finalFields,
    audits: [{ eventType, subjectKey: String(desiredItemFields.WorkplanItemKey) }], processedAt, acl });
}

export function planUpdateWorkplanDraftC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, allItems: readonly C2bTrustedAnnualItem[], processedAt: string,
  acl: C2bTrustedAclContext): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = raw.payload as IEmployeeWorkplanDraftInputV2;
  assertC2bEmployeeManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertEditableHeader(header);
  if (configuration.behaviourContractVersion === 'KCCC-BEHAVIOUR|v02'
    || header.fields.BehaviourContractVersion === 'KCCC-BEHAVIOUR|v02')
    return fail('C2b Workplan Draft update rejected: v02 uses governed Delivery configuration; legacy category weights cannot be written.');
  validateEmployeeWorkplanDraftInputV2(payload);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'UpdateWorkplanDraftV2'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear)
    return fail('C2b Workplan Draft update rejected: command identity or annual state is invalid.');
  const commandKey = raw.commandKey as string;
  const finalFields = { ...cloneC2b(header.fields), CoreCategoryWeight: payload.coreCategoryWeight,
    PersonalCategoryWeight: payload.personalCategoryWeight, BehaviourCategoryWeight: payload.behaviourCategoryWeight,
    CategoryWeightingReason: optional(payload.categoryWeightReason?.trim()), State: header.state,
    AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'UpdateWorkplanDraftV2', payload,
    employee, manager, actor: employee, effectiveRole: 'Employee', configuration, header, allItems,
    mutations: [], finalFields, audits: [{ eventType: 'WorkplanDraftUpdated', subjectKey: header.workplanKey,
      details: { zeroPersonalProposal: cloneC2b(payload.zeroPersonalProposal || null),
        zeroPersonalProposalSha256: hashC2bCanonical(payload.zeroPersonalProposal || null) } }],
    processedAt, acl });
}

export function planUpsertPersonalItemC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, item: C2bTrustedAnnualItem | undefined,
  allItems: readonly C2bTrustedAnnualItem[], processedAt: string, acl: C2bTrustedAclContext,
  itemIdentity?: C2bTrustedItemIdentity): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = raw.payload as IEmployeePersonalItemInputV2;
  assertC2bEmployeeManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertEditableHeader(header);
  const currentItems = assertCompleteItems(header, allItems); validateEmployeePersonalItemInputV2(payload);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'UpsertPersonalItemV2'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear
    || typeof payload.activeInWorkplan !== 'boolean' || !Number.isInteger(payload.displayOrder)
    || payload.displayOrder < 1 || payload.displayOrder > 5
    || payload.measureType !== undefined && !['Count', 'Number', 'Percentage', 'Currency', 'Rate', 'Days',
      'Score', 'Milestone', 'TextStatus', 'Other'].includes(payload.measureType)
    || payload.scoringDirection !== undefined && !['HigherIsBetter', 'LowerIsBetter', 'TargetRange',
      'Milestone', 'TBC'].includes(payload.scoringDirection)
    || payload.percentageSourceScale !== undefined && !['Fraction', 'Whole'].includes(payload.percentageSourceScale)
    || !Number.isFinite(Date.parse(processedAt)))
    return fail('C2b Personal item upsert rejected: command identity or annual state is invalid.');
  const proposedWorkplanItemKey = item?.workplanItemKey || itemIdentity?.workplanItemKey;
  const workplanItemKey = proposedWorkplanItemKey;
  if (!naturalKeyPart(workplanItemKey)
    || itemIdentity && item && itemIdentity.workplanItemKey !== item.workplanItemKey)
    return fail('C2b Personal item upsert rejected: trusted item identity is missing or mismatched.');
  const naturalKey = `${header.workplanKey}|LocalPersonal|${workplanItemKey}`;
  const matches = currentItems.filter(candidate => candidate.workplanItemNaturalKey === naturalKey);
  const current = currentItemFromCompleteSet(item, matches, 'C2b Personal item upsert');
  if (current && current.itemType !== 'LocalPersonal')
    return fail('C2b Personal item upsert rejected: unique natural key or current item identity did not reconcile.');
  let desiredItemFields: Record<string, unknown>;
  let eventType: string;
  if (!payload.activeInWorkplan) {
    if (!current || !current.activeInWorkplan)
      return fail('C2b Personal item deactivation rejected: one active retained item is required.');
    desiredItemFields = { ...cloneC2b(current.fields), ActiveInWorkplan: false,
      RowVersionToken: current.rowVersionToken + 1 };
    eventType = 'PersonalItemDeactivated';
  } else {
    desiredItemFields = personalActiveFields(payload, header, workplanItemKey, naturalKey, current, employee, processedAt);
    eventType = current ? current.activeInWorkplan ? 'PersonalItemUpdated' : 'PersonalItemReactivated'
      : 'PersonalItemCreated';
  }
  const commandKey = raw.commandKey as string;
  const finalFields = { ...cloneC2b(header.fields), State: header.state, AccessState: 'EmployeeEdit',
    TransitionStatus: 'Ready', RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'UpsertPersonalItemV2', payload,
    employee, manager, actor: employee, effectiveRole: 'Employee', configuration, header, allItems: currentItems,
    mutations: [{ naturalKey, current, desiredFields: desiredItemFields }], finalFields,
    audits: [{ eventType, subjectKey: workplanItemKey }], processedAt, acl });
}

export function planUpsertBehaviourCommitmentC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, item: C2bTrustedAnnualItem | undefined,
  allItems: readonly C2bTrustedAnnualItem[], processedAt: string, acl: C2bTrustedAclContext,
  trusted: C2bTrustedBehaviourV2Observations, itemIdentity?: C2bTrustedItemIdentity): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = raw.payload as IEmployeeBehaviourCommitmentInputV2;
  assertC2bEmployeeManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertEditableHeader(header);
  const currentItems = assertCompleteItems(header, allItems); validateEmployeeBehaviourCommitmentInputV2(payload);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'UpsertBehaviourCommitmentV2'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear
    || trusted.assignment.personKey !== employee.personKey
    || trusted.assignment.frameworkVersion !== configuration.behaviourContractVersion
    || !Number.isFinite(Date.parse(processedAt))) {
    return fail('C2b Behaviour v02 upsert rejected: command, person assignment or annual configuration is crossed.');
  }
  const snapshot = createBehaviourAnnualSnapshotV2(trusted.framework, trusted.assignment, payload.behaviourId);
  const naturalKey = `${header.workplanKey}|Behaviour|${payload.behaviourId}`;
  const matches = currentItems.filter(candidate => candidate.workplanItemNaturalKey === naturalKey);
  const current = currentItemFromCompleteSet(item, matches, 'C2b Behaviour v02 upsert/deactivation');
  if (current && (current.itemType !== 'Behaviour' || current.fields.BehaviourID !== payload.behaviourId)) {
    return fail('C2b Behaviour v02 upsert rejected: unique natural key or Value identity did not reconcile.');
  }
  if (current) assertStoredBehaviourV2Snapshot(current, behaviourV2SnapshotFields(snapshot));
  if (current) readBehaviourPlanningLevelsV1(current.fields);
  let desiredItemFields: Record<string, unknown>;
  let eventType: string;
  if (!payload.activeInWorkplan) {
    if (!current || !current.activeInWorkplan || current.fields.BehaviourFrameworkVersion !== 'KCCC-BEHAVIOUR|v02') {
      return fail('C2b Behaviour v02 deactivation rejected: one active retained v02 item is required.');
    }
    desiredItemFields = { ...cloneC2b(current.fields), ActiveInWorkplan: false,
      RowVersionToken: current.rowVersionToken + 1 };
    eventType = 'BehaviourCommitmentV2Deactivated';
  } else {
    const workplanItemKey = current?.workplanItemKey || itemIdentity?.workplanItemKey;
    if (!naturalKeyPart(workplanItemKey)
      || itemIdentity && current && itemIdentity.workplanItemKey !== current.workplanItemKey) {
      return fail('C2b Behaviour v02 upsert rejected: trusted item identity is missing or mismatched.');
    }
    const selectionSnapshots = configuration.schemaRevision === 'c2b-annual-v3'
      ? validatedFocusSelectionsV2(payload, current, configuration, trusted, processedAt) : undefined;
    const selectedSuggestionKeys = selectionSnapshots?.catalogueKeys
      || validatedBehaviourV2SuggestionKeys(payload, current, configuration, trusted, processedAt);
    desiredItemFields = behaviourV2ActiveFields(payload, snapshot, header, workplanItemKey,
      naturalKey, current, employee, processedAt, selectedSuggestionKeys, selectionSnapshots);
    eventType = current ? current.activeInWorkplan ? 'BehaviourCommitmentV2Updated'
      : 'BehaviourCommitmentV2Reactivated' : 'BehaviourCommitmentV2Created';
  }
  const commandKey = raw.commandKey as string;
  const finalFields = { ...cloneC2b(header.fields), State: header.state, AccessState: 'EmployeeEdit',
    TransitionStatus: 'Ready', RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'UpsertBehaviourCommitmentV2', payload,
    employee, manager, actor: employee, effectiveRole: 'Employee', configuration, header,
    allItems: currentItems, mutations: [{ naturalKey, current, desiredFields: desiredItemFields }],
    finalFields, audits: [{ eventType, subjectKey: String(desiredItemFields.WorkplanItemKey),
      details: { frameworkVersion: desiredItemFields.BehaviourFrameworkVersion,
        roleTier: desiredItemFields.BehaviourRoleTierSnapshot,
        cadence: desiredItemFields.BehaviourCadenceSnapshot } }], processedAt, acl });
}

function equalCoreWeights(items: readonly C2bTrustedAnnualItem[]): Map<string, number> {
  const sorted = [...items].sort((left, right) => String(left.fields.KPIID).localeCompare(String(right.fields.KPIID)));
  const base = Math.floor(10000 / sorted.length);
  let remainder = 10000 - base * sorted.length;
  const result = new Map<string, number>();
  sorted.forEach(item => {
    const hundredths = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    result.set(String(item.fields.KPIID), hundredths / 100);
  });
  return result;
}
export function planSetCoreWeightingC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, allItems: readonly C2bTrustedAnnualItem[], processedAt: string,
  acl: C2bTrustedAclContext): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = raw.payload as IEmployeeCoreWeightingInputV2;
  assertC2bEmployeeManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertEditableHeader(header);
  const currentItems = assertCompleteItems(header, allItems); validateEmployeeCoreWeightingInputV2(payload);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'SetCoreWeightingV2'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear)
    return fail('C2b Core weighting rejected: command identity or annual state is invalid.');
  const activeCore = currentItems.filter(item => item.itemType === 'CoreGold' && item.activeInWorkplan);
  const coreIds = activeCore.map(item => String(item.fields.KPIID));
  if (activeCore.length < 1 || coreIds.some(value => !nonBlank(value)) || new Set(coreIds).size !== coreIds.length)
    return fail('C2b Core weighting rejected: the complete active Core set is empty or duplicated.');
  const weights = payload.mode === 'Equal' ? equalCoreWeights(activeCore)
    : new Map((payload.customWeights || []).map(value => [value.kpiId, value.weight]));
  if (weights.size !== activeCore.length || coreIds.some(kpiId => !weights.has(kpiId))
    || Array.from(weights.keys()).some(kpiId => !coreIds.includes(kpiId)))
    return fail('C2b Core weighting rejected: weights do not reconcile to the complete affected Core set.');
  const mutations: C2bPlannedItemMutation[] = activeCore.map(item => ({
    naturalKey: item.workplanItemNaturalKey, current: item,
    desiredFields: { ...cloneC2b(item.fields), CoreWorkplanWeight: weights.get(String(item.fields.KPIID)),
      RowVersionToken: item.rowVersionToken + 1 }
  }));
  const commandKey = raw.commandKey as string;
  const finalFields = { ...cloneC2b(header.fields), CoreWeightingMode: payload.mode,
    State: header.state, AccessState: 'EmployeeEdit', TransitionStatus: 'Ready',
    RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'SetCoreWeightingV2', payload,
    employee, manager, actor: employee, effectiveRole: 'Employee', configuration, header, allItems: currentItems,
    mutations, finalFields, audits: [{ eventType: 'CoreWeightingSet', subjectKey: header.workplanKey,
      details: { affectedCoreCount: activeCore.length, mode: payload.mode } }], processedAt, acl });
}

export function planSubmitWorkplanC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, allItems: readonly C2bTrustedAnnualItem[],
  readiness: C2bTrustedAnnualReadiness, processedAt: string, acl: C2bTrustedAclContext): C2bCommandPlan {
  if (typeof commandValue !== 'string') return fail('C2b Workplan submission rejected: JSON text is required.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(commandValue) as unknown;
  } catch {
    return fail('C2b Workplan submission rejected: malformed JSON text.');
  }
  const raw = exactObject(parsed, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = exactObject(raw.payload, []);
  assertC2bEmployeeManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertEditableHeader(header);
  const currentItems = assertCompleteItems(header, allItems);
  assertReadiness(readiness, header, currentItems, configuration);
  assertV02StoredSubmission(header, currentItems, configuration);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'SubmitWorkplan'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear
    || Object.keys(payload).length !== 0 || !Number.isFinite(Date.parse(processedAt)))
    return fail('C2b Workplan submission rejected: identity, readiness or processing time is invalid.');
  const commandKey = raw.commandKey as string;
  const eventType = header.state === 'ChangesRequested' ? 'WorkplanResubmitted' : 'WorkplanSubmitted';
  const finalFields = { ...cloneC2b(header.fields), State: 'Submitted', AccessState: 'ManagerDecision',
    TransitionStatus: 'Ready', TransitionCorrelationKey: commandKey, SubmittedAt: processedAt,
    SubmittedByEmail: email(employee.email), ManagerPersonKey: manager.personKey,
    ManagerDisplayName: manager.displayName, ManagerEmail: email(manager.email),
    RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'SubmitWorkplan', payload,
    employee, manager, actor: employee, effectiveRole: 'Employee', configuration, header, allItems: currentItems,
    mutations: [], finalFields, audits: [{ eventType, subjectKey: header.workplanKey,
      details: { readinessSha256: hashC2bCanonical(readiness) } }], processedAt, acl });
}

export function planRequestWorkplanChangesC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, allItems: readonly C2bTrustedAnnualItem[], processedAt: string,
  acl: C2bTrustedAclContext): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = exactObject(raw.payload, ['reason']);
  assertC2bAssignedManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertSubmittedHeader(header);
  const reason = normaliseSec006HumanReason(payload.reason) || '';
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'RequestWorkplanChanges'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear
    || !nonBlank(reason) || !Number.isFinite(Date.parse(processedAt)))
    return fail('C2b Request Changes rejected: assigned-manager identity, mandatory reason or state is invalid.');
  const commandKey = raw.commandKey as string;
  const finalFields = { ...cloneC2b(header.fields), State: 'ChangesRequested', AccessState: 'EmployeeEdit',
    TransitionStatus: 'Ready', TransitionCorrelationKey: commandKey, ManagerDecisionComment: reason,
    RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'RequestWorkplanChanges', payload,
    employee, manager, actor: manager, effectiveRole: 'Manager', configuration, header, allItems,
    mutations: [], finalFields, audits: [{ eventType: 'WorkplanChangesRequested', subjectKey: header.workplanKey,
      details: { reason } }], processedAt, acl });
}

export function planApproveAndLockWorkplanC2b(commandValue: unknown, authenticatedEmail: string,
  employee: C2bTrustedPerson, manager: C2bTrustedPerson, configuration: C2bTrustedAnnualConfiguration,
  header: C2bTrustedWorkplanHeader, allItems: readonly C2bTrustedAnnualItem[],
  readiness: C2bTrustedAnnualReadiness, processedAt: string, acl: C2bTrustedAclContext): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = exactObject(raw.payload, []);
  assertC2bAssignedManagerIdentity(authenticatedEmail, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration); assertSubmittedHeader(header);
  const currentItems = assertCompleteItems(header, allItems); assertReadiness(readiness, header, currentItems, configuration);
  assertV02StoredSubmission(header, currentItems, configuration);
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'ApproveAndLockWorkplan'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear
    || Object.keys(payload).length !== 0 || !Number.isFinite(Date.parse(processedAt)))
    return fail('C2b Approve and Lock rejected: current Submitted snapshot or assigned manager is invalid.');
  const commandKey = raw.commandKey as string;
  const finalFields = { ...cloneC2b(header.fields), State: 'Locked', AccessState: 'ReadOnly',
    TransitionStatus: 'Ready', TransitionCorrelationKey: commandKey, ApprovedAt: processedAt,
    ApprovedByEmail: email(manager.email), LockedAt: processedAt, LockedByEmail: email(manager.email),
    RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'ApproveAndLockWorkplan', payload,
    employee, manager, actor: manager, effectiveRole: 'Manager', configuration, header, allItems: currentItems,
    mutations: [], finalFields, audits: [
      { eventType: 'WorkplanApproved', subjectKey: header.workplanKey,
        details: { readinessSha256: hashC2bCanonical(readiness) } },
      { eventType: 'WorkplanLocked', subjectKey: header.workplanKey }
    ], processedAt, acl });
}

export function planCreateWorkplanAmendmentC2b(commandValue: unknown, authenticatedEmail: string,
  systemAdmin: C2bTrustedPerson, employee: C2bTrustedPerson, manager: C2bTrustedPerson,
  configuration: C2bTrustedAnnualConfiguration, header: C2bTrustedWorkplanHeader,
  allItems: readonly C2bTrustedAnnualItem[], processedAt: string, acl: C2bTrustedAclContext,
  controlCases: readonly ISec006ControlCase[], source: C2bTrustedCommandSource): C2bCommandPlan {
  const raw = exactObject(commandValue, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'payload']);
  const payload = exactObject(raw.payload, ['reason', 'controlReference']);
  assertC2bSystemAdminIdentity(authenticatedEmail, systemAdmin, employee, manager); validateConfiguration(configuration);
  assertHeader(header, employee, manager, configuration);
  const reason = normaliseSec006HumanReason(payload.reason) || '';
  const controlReference = typeof payload.controlReference === 'string' ? payload.controlReference.trim() : '';
  const currentVersion = header.fields.WorkplanVersion;
  if (!isEmployeeV2StableCommandKey(raw.commandKey) || raw.commandType !== 'CreateWorkplanAmendmentV2'
    || raw.personKey !== employee.personKey || raw.performanceYear !== header.performanceYear
    || header.state !== 'Approved' && header.state !== 'Locked' || header.accessState !== 'ReadOnly'
    || header.transitionStatus !== 'Ready' || !Number.isSafeInteger(currentVersion) || Number(currentVersion) < 1
    || !nonBlank(String(header.fields.ApprovedAt || '')) || !nonBlank(String(header.fields.ApprovedByEmail || ''))
    || header.state === 'Locked' && (!nonBlank(String(header.fields.LockedAt || ''))
      || !nonBlank(String(header.fields.LockedByEmail || '')))
    || !nonBlank(reason)
    || !/^CONTROL-[A-Z0-9][A-Z0-9-]{4,}$/i.test(controlReference)
    || !Number.isFinite(Date.parse(processedAt)))
    return fail('C2b amendment rejected: exact SystemAdmin, approved/locked history, reason and CONTROL reference are required.');
  const currentItems = assertCompleteItems(header, allItems);
  if (currentItems.length < 1) return fail('C2b amendment rejected: complete locked/approved item history is required.');
  const amendmentControl = resolveAmendmentControlCase(controlReference, raw.commandKey as string,
    header, processedAt, controlCases, source);
  const newVersion = Number(currentVersion) + 1;
  const mutations: C2bPlannedItemMutation[] = currentItems.map(item => ({
    naturalKey: item.workplanItemNaturalKey, current: item,
    desiredFields: { ...cloneC2b(item.fields), WorkplanVersion: newVersion,
      RowVersionToken: item.rowVersionToken + 1 }
  }));
  const commandKey = raw.commandKey as string;
  const finalFields = { ...cloneC2b(header.fields), State: 'ChangesRequested', AccessState: 'EmployeeEdit',
    TransitionStatus: 'Ready', TransitionCorrelationKey: commandKey, WorkplanVersion: newVersion,
    ManagerDecisionComment: reason, RowVersionToken: header.rowVersionToken + 2 };
  return buildAnnualMutationPlan({ commandKey, commandType: 'CreateWorkplanAmendmentV2', payload,
    employee, manager, actor: systemAdmin, effectiveRole: 'SystemAdmin', configuration, header,
    allItems: currentItems, mutations, finalFields, amendmentControl,
    audits: [{ eventType: 'WorkplanAmendmentCreated', subjectKey: header.workplanKey,
      details: { reason, controlReference, priorState: header.state, priorWorkplanVersion: currentVersion,
        workplanVersion: newVersion } }], processedAt, acl });
}

export const C2B_DEFERRED_ANNUAL_HANDLER_DETAILS = Object.freeze([] as const);
