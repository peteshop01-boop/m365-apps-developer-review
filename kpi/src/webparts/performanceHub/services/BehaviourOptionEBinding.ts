import type { BehaviourKey, BehaviourRoleLevelCode } from '../models/BehaviourWorkplanModels';
import {
  OPTION_E_BEHAVIOUR_VALUE_IDS,
  OPTION_E_GOVERNED_BEHAVIOUR_APPROVAL,
  OPTION_E_GOVERNED_BEHAVIOUR_EXTENSION_VERSION,
  type IOptionEBehaviourCatalogueAuthority,
  type IOptionEBehaviourHeadlineSnapshot,
  type IOptionEBehaviourSelectionSnapshot,
  type IOptionEGovernedBehaviourExtension,
  type OptionEBehaviourRoleLevelCode
} from '../models/OptionEWorkplanDraftModels';
import type { IBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';

const SHA256 = /^[A-F0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OWN_SELECTION_KEY = /^BHV-0[1-5]-OWN-[A-Z0-9][A-Z0-9-]{5,39}$/;
const nonBlank = (value: string | undefined): value is string => typeof value === 'string' && Boolean(value.trim());
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const roleCode = (value: BehaviourRoleLevelCode): OptionEBehaviourRoleLevelCode => value;

export interface IOptionEBehaviourRuntimeAuthority extends IOptionEBehaviourCatalogueAuthority {
  catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS';
}

export interface IOptionEBehaviourBindingSelection {
  source: 'Catalogue' | 'Own';
  selectionKey: string;
  focusKey?: string;
  focusTitle?: string;
  commitment: string;
  howWillWeKnow: string;
  storedSnapshot?: Readonly<IOptionEBehaviourSelectionSnapshot>;
}

export interface IOptionEBehaviourBindingHeadline {
  behaviourKey: BehaviourKey;
  selections: readonly Readonly<IOptionEBehaviourBindingSelection>[];
}

export interface IOptionEBehaviourBindingInput {
  catalogue: Readonly<IBehaviourFrameworkV2Catalogue>;
  authority: Readonly<IOptionEBehaviourRuntimeAuthority>;
  roleLevelCode: BehaviourRoleLevelCode;
  headlines: readonly Readonly<IOptionEBehaviourBindingHeadline>[];
  asOfDate: string;
}

const assertDate = (value: string): void => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value) throw new Error('The governed Behaviour as-of date is invalid.');
};

const assertAuthority = (
  catalogue: Readonly<IBehaviourFrameworkV2Catalogue>,
  authority: Readonly<IOptionEBehaviourRuntimeAuthority>
): void => {
  if (catalogue.status !== 'Published' || authority.catalogueId !== catalogue.catalogueKey
    || authority.catalogueVersion !== catalogue.catalogueVersion
    || authority.catalogueRevision !== catalogue.revision || !nonBlank(authority.catalogueEtag)
    || !SHA256.test(authority.catalogueContentSha256)
    || authority.approvalReference !== OPTION_E_GOVERNED_BEHAVIOUR_APPROVAL) {
    throw new Error('The approved governed Behaviour catalogue identity is missing, stale or crossed.');
  }
};

/** Builds only from the current published catalogue and the authenticated role assignment. */
export const buildOptionEBehaviourGovernedExtension = (
  input: Readonly<IOptionEBehaviourBindingInput>
): IOptionEGovernedBehaviourExtension => {
  assertDate(input.asOfDate);
  assertAuthority(input.catalogue, input.authority);
  const assignedRole = input.catalogue.roleLevels.find(role => role.code === input.roleLevelCode);
  if (!assignedRole) throw new Error('The authenticated Behaviour role assignment is not in the approved catalogue.');
  const byBehaviour = new Map(input.headlines.map(headline => [headline.behaviourKey, headline]));
  if (byBehaviour.size !== OPTION_E_BEHAVIOUR_VALUE_IDS.length) {
    throw new Error('All five Behaviour headlines must be supplied exactly once.');
  }
  const seen = new Set<string>();
  const headlines: IOptionEBehaviourHeadlineSnapshot[] = OPTION_E_BEHAVIOUR_VALUE_IDS.map(behaviourKey => {
    const headline = input.catalogue.headlineBehaviours.find(item => item.behaviourKey === behaviourKey);
    const supplied = byBehaviour.get(behaviourKey);
    if (!headline || !supplied || !nonBlank(headline.title)) {
      throw new Error(`The approved ${behaviourKey} headline is unavailable.`);
    }
    const selections: IOptionEBehaviourSelectionSnapshot[] = supplied.selections.map(selection => {
      if (seen.has(selection.selectionKey)) throw new Error('A governed Behaviour selection key is duplicated.');
      seen.add(selection.selectionKey);
      if (selection.source === 'Own') {
        if (!OWN_SELECTION_KEY.test(selection.selectionKey)
          || !selection.selectionKey.startsWith(`${behaviourKey}-OWN-`)) {
          throw new Error(`The ${behaviourKey} own commitment identity is crossed.`);
        }
        const approvedFocus = input.catalogue.rows.some(row => row.behaviourKey === behaviourKey
          && row.roleLevelCode === input.roleLevelCode && row.focusKey === selection.focusKey
          && row.focusArea === selection.focusTitle && row.status === 'Published'
          && row.effectiveFrom <= input.asOfDate
          && (row.effectiveTo === undefined || row.effectiveTo >= input.asOfDate));
        if (!nonBlank(selection.focusKey) || !nonBlank(selection.focusTitle) || !approvedFocus) {
          throw new Error(`The ${selection.selectionKey} own commitment focus is retired, stale, crossed or unapproved.`);
        }
        if (selection.storedSnapshot && (selection.storedSnapshot.source !== 'Own'
          || selection.storedSnapshot.selectionKey !== selection.selectionKey
          || selection.storedSnapshot.behaviourKey !== behaviourKey
          || selection.storedSnapshot.roleLevelCode !== input.roleLevelCode
          || selection.storedSnapshot.catalogueId !== input.authority.catalogueId
          || selection.storedSnapshot.catalogueVersion !== input.authority.catalogueVersion
          || selection.storedSnapshot.catalogueRevision !== input.authority.catalogueRevision
          || selection.storedSnapshot.catalogueEtag !== input.authority.catalogueEtag
          || selection.storedSnapshot.catalogueContentSha256 !== input.authority.catalogueContentSha256
          || selection.storedSnapshot.focusKey !== selection.focusKey
          || selection.storedSnapshot.focusTitle !== selection.focusTitle)) {
          throw new Error(`The ${selection.selectionKey} stored own commitment is stale or crossed.`);
        }
        return {
          selectionKey: selection.selectionKey, source: 'Own' as const, behaviourKey, headlineTitle: headline.title,
          focusKey: selection.focusKey, focusTitle: selection.focusTitle, roleLevelCode: roleCode(input.roleLevelCode),
          selectedWording: selection.commitment, catalogueId: input.authority.catalogueId,
          catalogueVersion: input.authority.catalogueVersion, catalogueRevision: input.authority.catalogueRevision,
          catalogueEtag: input.authority.catalogueEtag,
          catalogueContentSha256: input.authority.catalogueContentSha256,
          myCommitment: selection.commitment, howWillWeKnow: selection.howWillWeKnow
        };
      }
      const row = input.catalogue.rows.find(item => item.targetKey === selection.selectionKey);
      if (!row || row.status !== 'Published' || row.behaviourKey !== behaviourKey
        || row.roleLevelCode !== input.roleLevelCode || row.targetKey !== selection.selectionKey
        || row.effectiveFrom > input.asOfDate || (row.effectiveTo !== undefined && row.effectiveTo < input.asOfDate)) {
        throw new Error(`The ${selection.selectionKey} catalogue selection is retired, stale, crossed or unapproved.`);
      }
      const snapshot: IOptionEBehaviourSelectionSnapshot = {
        selectionKey: selection.selectionKey, source: 'Catalogue' as const, behaviourKey, headlineTitle: headline.title,
        focusKey: row.focusKey, focusTitle: row.focusArea, roleLevelCode: roleCode(input.roleLevelCode),
        targetKey: row.targetKey, selectedWording: row.suggestedTarget,
        catalogueId: input.authority.catalogueId, catalogueVersion: input.authority.catalogueVersion,
        catalogueRevision: input.authority.catalogueRevision, catalogueEtag: input.authority.catalogueEtag,
        catalogueContentSha256: input.authority.catalogueContentSha256,
        myCommitment: selection.commitment, howWillWeKnow: selection.howWillWeKnow
      };
      const stored = selection.storedSnapshot;
      if (stored && (stored.source !== snapshot.source || stored.selectionKey !== snapshot.selectionKey
        || stored.behaviourKey !== snapshot.behaviourKey || stored.headlineTitle !== snapshot.headlineTitle
        || stored.focusKey !== snapshot.focusKey || stored.focusTitle !== snapshot.focusTitle
        || stored.roleLevelCode !== snapshot.roleLevelCode || stored.targetKey !== snapshot.targetKey
        || stored.selectedWording !== snapshot.selectedWording || stored.catalogueId !== snapshot.catalogueId
        || stored.catalogueVersion !== snapshot.catalogueVersion
        || stored.catalogueRevision !== snapshot.catalogueRevision || stored.catalogueEtag !== snapshot.catalogueEtag
        || stored.catalogueContentSha256 !== snapshot.catalogueContentSha256)) {
        throw new Error(`The ${selection.selectionKey} stored catalogue selection is edited, stale or crossed.`);
      }
      return snapshot;
    }).sort((left, right) => left.selectionKey.localeCompare(right.selectionKey));
    return { behaviourKey, headlineTitle: headline.title, selections };
  });
  return {
    schemaVersion: OPTION_E_GOVERNED_BEHAVIOUR_EXTENSION_VERSION,
    authority: clone(input.authority), roleLevelCode: roleCode(input.roleLevelCode), headlines,
    immutableSelectionSnapshots: true,
    legacyTargetRatingWeightFieldsWritten: false,
    deliveryArithmeticAffected: false
  };
};

export type OptionEBehaviourManagerDisposition = 'AGREED' | 'CHANGES REQUESTED';

export interface IOptionEBehaviourManagerIntent {
  contract: 'KCF.OptionEBehaviourManagerIntent/v1';
  idempotencyKey: string;
  workplanKey: string;
  performanceYear: number;
  submittedSnapshotKey: string;
  selectionKey: string;
  expectedRowVersion: number;
  expectedHierarchyVersion: number;
  disposition: OptionEBehaviourManagerDisposition;
  commentary?: string;
}

export interface IOptionEBehaviourManagerEvent {
  auditKey: string;
  sequence: number;
  workplanKey: string;
  performanceYear: number;
  submittedSnapshotKey: string;
  selectionKey: string;
  disposition: OptionEBehaviourManagerDisposition;
  commentary?: string;
  managerPersonKey: string;
  managerPrincipalId: string;
  managerEmail: string;
  hierarchyVersion: number;
  workplanRowVersion: number;
  occurredAt: string;
  changeReference: string;
}

/**
 * Separately trusted immutable receipt returned by the canonical event store.
 * The physical adapter must derive this from event-time actor/hierarchy authority rather than
 * reconstructing it from the current assignment or from caller-supplied event content.
 */
export interface IOptionEBehaviourManagerEventProvenance {
  contract: 'KCF.OptionEBehaviourManagerEventProvenance/v1';
  immutable: true;
  event: Readonly<IOptionEBehaviourManagerEvent>;
}

export interface IOptionEBehaviourSubmittedRecord {
  employeePersonKey: string;
  workplanKey: string;
  performanceYear: number;
  submittedSnapshotKey: string;
  state: 'Draft' | 'ChangesRequested' | 'Submitted' | 'Locked';
  rowVersion: number;
  hierarchyVersion: number;
  assignedManagerPersonKey: string;
  readableByManager: boolean;
  snapshotsComplete: boolean;
  snapshots: readonly Readonly<IOptionEBehaviourSelectionSnapshot>[];
  events: readonly Readonly<IOptionEBehaviourManagerEvent>[];
}

export interface IOptionEBehaviourManagerActor {
  personKey: string;
  principalId: string;
  email: string;
  effectiveRole: 'Manager' | 'Employee' | 'FormerManager' | 'System';
}

export type OptionEBehaviourAppendOutcome = 'Appended' | 'Replay' | 'Collision' | 'Conflict' | 'UnknownEffect';
export type OptionEBehaviourAssignmentOutcome = 'Authorised' | 'Denied' | 'Conflict' | 'UnknownEffect';

export interface IOptionEBehaviourManagerStore {
  readByEmployee(employeePersonKey: string): Promise<IOptionEBehaviourSubmittedRecord | undefined>;
  readExact(workplanKey: string, performanceYear: number, submittedSnapshotKey: string): Promise<IOptionEBehaviourSubmittedRecord | undefined>;
  readTrustedEventProvenance(workplanKey: string, performanceYear: number,
    submittedSnapshotKey: string): Promise<readonly Readonly<IOptionEBehaviourManagerEventProvenance>[]>;
  /**
   * Re-reads trusted current assignment/ACL state and authorises only if the complete expected
   * record identity, row/hierarchy CAS and authenticated actor still match in one atomic check.
   */
  reauthoriseCurrentAssignmentExact(record: Readonly<IOptionEBehaviourSubmittedRecord>,
    actor: Readonly<IOptionEBehaviourManagerActor>): Promise<OptionEBehaviourAssignmentOutcome>;
  /**
   * Atomically rechecks the expected row/hierarchy/current assignment against the event actor,
   * then appends the event and its immutable event-time provenance receipt.
   */
  appendExact(record: Readonly<IOptionEBehaviourSubmittedRecord>, event: Readonly<IOptionEBehaviourManagerEvent>): Promise<OptionEBehaviourAppendOutcome>;
}

export type IOptionEBehaviourManagerReadModel = Readonly<{
  state: 'Available';
  employeePersonKey: string;
  workplanKey: string;
  performanceYear: number;
  submittedSnapshotKey: string;
  rowVersion: number;
  hierarchyVersion: number;
  snapshots: readonly Readonly<IOptionEBehaviourSelectionSnapshot>[];
  events: readonly Readonly<IOptionEBehaviourManagerEvent>[];
}> | Readonly<{ state: 'Unavailable'; reason: string }>;

export type IOptionEBehaviourManagerResult = Readonly<{
  outcome: 'Confirmed' | 'ConfirmedReplay' | 'Denied' | 'Conflict' | 'Uncertain';
  message: string;
  event?: Readonly<IOptionEBehaviourManagerEvent>;
}>;

export interface IOptionEBehaviourManagerGateway {
  read(employeePersonKey: string): Promise<IOptionEBehaviourManagerReadModel>;
  review(intent: Readonly<IOptionEBehaviourManagerIntent>): Promise<IOptionEBehaviourManagerResult>;
}

type PlainDataRecord = Readonly<Record<string, unknown>>;
const BEHAVIOUR_KEY = /^BHV-0[1-5]$/;
const FOCUS_KEY = /^BHV-0[1-5]-FOCUS-0[1-9]\d*$/;
const CATALOGUE_SELECTION_KEY = /^BHV-0[1-5]-L[1-3]-0[1-9]\d*$/;
const OWN_SNAPSHOT_KEY = /^BHV-0[1-5]-OWN-[A-Z0-9][A-Z0-9-]{5,39}$/;

const exactPlainRecord = (value: unknown, required: readonly string[], optional: readonly string[] = []): PlainDataRecord | undefined => {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) return undefined;
    const stringKeys = keys as string[];
    const allowed = new Set([...required, ...optional]);
    if (required.some(key => stringKeys.indexOf(key) < 0) || stringKeys.some(key => !allowed.has(key))) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (stringKeys.some(key => !descriptors[key] || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')
      || descriptors[key].enumerable !== true)) return undefined;
    const snapshot: Record<string, unknown> = {};
    stringKeys.forEach(key => { snapshot[key] = descriptors[key].value; });
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
};

const exactPlainArray = (value: unknown): readonly unknown[] | undefined => {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = (descriptors as Record<string, PropertyDescriptor>).length;
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value) || Number(lengthDescriptor.value) < 0) return undefined;
    const length = Number(lengthDescriptor.value);
    const expected = new Set<string>(['length']);
    for (let index = 0; index < length; index += 1) expected.add(String(index));
    if (keys.some(key => !expected.has(key as string)) || expected.size !== keys.length) return undefined;
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.enumerable !== true) {
        return undefined;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
};

const plainText = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());

const canonicalSnapshot = (value: unknown): Readonly<IOptionEBehaviourSelectionSnapshot> | undefined => {
  const snapshot = exactPlainRecord(value, [
    'selectionKey', 'source', 'behaviourKey', 'headlineTitle', 'focusKey', 'focusTitle', 'roleLevelCode',
    'selectedWording', 'catalogueId', 'catalogueVersion', 'catalogueRevision', 'catalogueEtag',
    'catalogueContentSha256', 'myCommitment', 'howWillWeKnow'
  ], ['targetKey']);
  if (!snapshot || !plainText(snapshot.selectionKey) || !plainText(snapshot.behaviourKey)
    || !BEHAVIOUR_KEY.test(snapshot.behaviourKey) || !plainText(snapshot.headlineTitle)
    || !plainText(snapshot.focusKey) || !FOCUS_KEY.test(snapshot.focusKey)
    || !snapshot.focusKey.startsWith(`${snapshot.behaviourKey}-FOCUS-`) || !plainText(snapshot.focusTitle)
    || (snapshot.roleLevelCode !== 'L1' && snapshot.roleLevelCode !== 'L2' && snapshot.roleLevelCode !== 'L3')
    || !plainText(snapshot.selectedWording) || snapshot.catalogueId !== 'KCF-KCCC-BEHAVIOUR-FOCUS'
    || !plainText(snapshot.catalogueVersion) || !Number.isSafeInteger(snapshot.catalogueRevision)
    || Number(snapshot.catalogueRevision) < 1 || !plainText(snapshot.catalogueEtag)
    || typeof snapshot.catalogueContentSha256 !== 'string' || !SHA256.test(snapshot.catalogueContentSha256)
    || !plainText(snapshot.myCommitment) || !plainText(snapshot.howWillWeKnow)) return undefined;
  if (snapshot.source === 'Catalogue') {
    if (!CATALOGUE_SELECTION_KEY.test(snapshot.selectionKey) || snapshot.targetKey !== snapshot.selectionKey
      || !snapshot.selectionKey.startsWith(`${snapshot.behaviourKey}-${snapshot.roleLevelCode}-`)) return undefined;
  } else if (snapshot.source === 'Own') {
    if (!OWN_SNAPSHOT_KEY.test(snapshot.selectionKey) || snapshot.targetKey !== undefined
      || !snapshot.selectionKey.startsWith(`${snapshot.behaviourKey}-OWN-`)) return undefined;
  } else {
    return undefined;
  }
  return Object.freeze({
    selectionKey: snapshot.selectionKey, source: snapshot.source, behaviourKey: snapshot.behaviourKey,
    headlineTitle: snapshot.headlineTitle, focusKey: snapshot.focusKey, focusTitle: snapshot.focusTitle,
    roleLevelCode: snapshot.roleLevelCode, targetKey: snapshot.targetKey, selectedWording: snapshot.selectedWording,
    catalogueId: snapshot.catalogueId, catalogueVersion: snapshot.catalogueVersion,
    catalogueRevision: Number(snapshot.catalogueRevision), catalogueEtag: snapshot.catalogueEtag,
    catalogueContentSha256: snapshot.catalogueContentSha256,
    myCommitment: snapshot.myCommitment, howWillWeKnow: snapshot.howWillWeKnow
  } as IOptionEBehaviourSelectionSnapshot);
};

const canonicalManagerActor = (value: unknown): Readonly<IOptionEBehaviourManagerActor> | undefined => {
  const actor = exactPlainRecord(value, ['personKey', 'principalId', 'email', 'effectiveRole']);
  if (!actor || !plainText(actor.personKey) || !plainText(actor.principalId) || !plainText(actor.email)
    || !EMAIL.test(actor.email)
    || (actor.effectiveRole !== 'Manager' && actor.effectiveRole !== 'Employee'
      && actor.effectiveRole !== 'FormerManager' && actor.effectiveRole !== 'System')) return undefined;
  return Object.freeze({ personKey: actor.personKey, principalId: actor.principalId,
    email: actor.email.trim().toLowerCase(), effectiveRole: actor.effectiveRole });
};

const canonicalManagerIntent = (value: unknown): Readonly<IOptionEBehaviourManagerIntent> | undefined => {
  const intent = exactPlainRecord(value, [
    'contract', 'idempotencyKey', 'workplanKey', 'performanceYear', 'submittedSnapshotKey', 'selectionKey',
    'expectedRowVersion', 'expectedHierarchyVersion', 'disposition'
  ], ['commentary']);
  if (!intent || intent.contract !== 'KCF.OptionEBehaviourManagerIntent/v1'
    || typeof intent.idempotencyKey !== 'string' || !UUID.test(intent.idempotencyKey)
    || !plainText(intent.workplanKey) || !Number.isSafeInteger(intent.performanceYear)
    || Number(intent.performanceYear) < 1000 || !plainText(intent.submittedSnapshotKey)
    || !plainText(intent.selectionKey) || !Number.isSafeInteger(intent.expectedRowVersion)
    || Number(intent.expectedRowVersion) < 0 || !Number.isSafeInteger(intent.expectedHierarchyVersion)
    || Number(intent.expectedHierarchyVersion) < 1
    || (intent.disposition !== 'AGREED' && intent.disposition !== 'CHANGES REQUESTED')
    || (intent.disposition === 'CHANGES REQUESTED' ? !plainText(intent.commentary) : intent.commentary !== undefined)) {
    return undefined;
  }
  return Object.freeze({
    contract: 'KCF.OptionEBehaviourManagerIntent/v1', idempotencyKey: intent.idempotencyKey,
    workplanKey: intent.workplanKey, performanceYear: Number(intent.performanceYear),
    submittedSnapshotKey: intent.submittedSnapshotKey, selectionKey: intent.selectionKey,
    expectedRowVersion: Number(intent.expectedRowVersion),
    expectedHierarchyVersion: Number(intent.expectedHierarchyVersion), disposition: intent.disposition,
    commentary: intent.disposition === 'CHANGES REQUESTED' ? (intent.commentary as string).trim() : undefined
  });
};

const exactEvent = (left: Readonly<IOptionEBehaviourManagerEvent>, right: Readonly<IOptionEBehaviourManagerEvent>): boolean =>
  left.auditKey === right.auditKey && left.sequence === right.sequence
  && left.workplanKey === right.workplanKey && left.performanceYear === right.performanceYear
  && left.submittedSnapshotKey === right.submittedSnapshotKey && left.selectionKey === right.selectionKey
  && left.disposition === right.disposition && left.commentary === right.commentary
  && left.managerPersonKey === right.managerPersonKey && left.managerPrincipalId === right.managerPrincipalId
  && left.managerEmail === right.managerEmail && left.hierarchyVersion === right.hierarchyVersion
  && left.workplanRowVersion === right.workplanRowVersion && left.occurredAt === right.occurredAt
  && left.changeReference === right.changeReference;

const eventRequiredKeys = [
  'auditKey', 'sequence', 'workplanKey', 'performanceYear', 'submittedSnapshotKey', 'selectionKey',
  'disposition', 'managerPersonKey', 'managerPrincipalId', 'managerEmail', 'hierarchyVersion',
  'workplanRowVersion', 'occurredAt', 'changeReference'
] as const;
const eventAllowedKeys = [...eventRequiredKeys, 'commentary'];
const provenanceRequiredKeys = ['contract', 'immutable', 'event'] as const;
const exactIsoTime = (value: string): boolean => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
};

const canonicalEvent = (value: unknown): Readonly<IOptionEBehaviourManagerEvent> | undefined => {
  const event = exactPlainRecord(value, eventRequiredKeys, ['commentary']);
  if (!event || typeof event.auditKey !== 'string' || !UUID.test(event.auditKey)
    || !Number.isSafeInteger(event.sequence) || Number(event.sequence) < 1
    || !plainText(event.workplanKey) || !Number.isSafeInteger(event.performanceYear)
    || Number(event.performanceYear) < 1000 || !plainText(event.submittedSnapshotKey)
    || !plainText(event.selectionKey)
    || (event.disposition !== 'AGREED' && event.disposition !== 'CHANGES REQUESTED')
    || (event.disposition === 'CHANGES REQUESTED' ? !plainText(event.commentary) : event.commentary !== undefined)
    || !plainText(event.managerPersonKey) || !plainText(event.managerPrincipalId) || !plainText(event.managerEmail)
    || !EMAIL.test(event.managerEmail) || event.managerEmail !== event.managerEmail.trim().toLowerCase()
    || !Number.isSafeInteger(event.hierarchyVersion) || Number(event.hierarchyVersion) < 1
    || !Number.isSafeInteger(event.workplanRowVersion) || Number(event.workplanRowVersion) < 0
    || typeof event.occurredAt !== 'string' || !exactIsoTime(event.occurredAt)
    || !plainText(event.changeReference)) return undefined;
  return Object.freeze({
    auditKey: event.auditKey, sequence: Number(event.sequence), workplanKey: event.workplanKey,
    performanceYear: Number(event.performanceYear), submittedSnapshotKey: event.submittedSnapshotKey,
    selectionKey: event.selectionKey, disposition: event.disposition,
    commentary: event.disposition === 'CHANGES REQUESTED' ? (event.commentary as string).trim() : undefined,
    managerPersonKey: event.managerPersonKey, managerPrincipalId: event.managerPrincipalId,
    managerEmail: event.managerEmail, hierarchyVersion: Number(event.hierarchyVersion),
    workplanRowVersion: Number(event.workplanRowVersion), occurredAt: event.occurredAt,
    changeReference: event.changeReference
  });
};

const canonicalSubmittedRecord = (value: unknown): Readonly<IOptionEBehaviourSubmittedRecord> | undefined => {
  const record = exactPlainRecord(value, [
    'employeePersonKey', 'workplanKey', 'performanceYear', 'submittedSnapshotKey', 'state', 'rowVersion',
    'hierarchyVersion', 'assignedManagerPersonKey', 'readableByManager', 'snapshotsComplete', 'snapshots', 'events'
  ]);
  if (!record || !plainText(record.employeePersonKey) || !plainText(record.workplanKey)
    || !Number.isSafeInteger(record.performanceYear) || Number(record.performanceYear) < 1000
    || !plainText(record.submittedSnapshotKey)
    || (record.state !== 'Draft' && record.state !== 'ChangesRequested'
      && record.state !== 'Submitted' && record.state !== 'Locked')
    || !Number.isSafeInteger(record.rowVersion) || Number(record.rowVersion) < 0
    || !Number.isSafeInteger(record.hierarchyVersion) || Number(record.hierarchyVersion) < 1
    || !plainText(record.assignedManagerPersonKey) || typeof record.readableByManager !== 'boolean'
    || typeof record.snapshotsComplete !== 'boolean') return undefined;
  const snapshotCarriers = exactPlainArray(record.snapshots);
  const eventCarriers = exactPlainArray(record.events);
  if (!snapshotCarriers || snapshotCarriers.length < 1 || !eventCarriers) return undefined;
  const snapshots: Readonly<IOptionEBehaviourSelectionSnapshot>[] = [];
  for (const carrier of snapshotCarriers) {
    const snapshot = canonicalSnapshot(carrier);
    if (!snapshot) return undefined;
    snapshots.push(snapshot);
  }
  if (new Set(snapshots.map(snapshot => snapshot.selectionKey)).size !== snapshots.length) return undefined;
  const authority = snapshots[0];
  if (snapshots.some(snapshot => snapshot.catalogueId !== authority.catalogueId
    || snapshot.catalogueVersion !== authority.catalogueVersion
    || snapshot.catalogueRevision !== authority.catalogueRevision
    || snapshot.catalogueEtag !== authority.catalogueEtag
    || snapshot.catalogueContentSha256 !== authority.catalogueContentSha256
    || snapshot.roleLevelCode !== authority.roleLevelCode)) return undefined;
  const events: Readonly<IOptionEBehaviourManagerEvent>[] = [];
  for (const carrier of eventCarriers) {
    const event = canonicalEvent(carrier);
    if (!event) return undefined;
    events.push(event);
  }
  return Object.freeze({
    employeePersonKey: record.employeePersonKey, workplanKey: record.workplanKey,
    performanceYear: Number(record.performanceYear), submittedSnapshotKey: record.submittedSnapshotKey,
    state: record.state, rowVersion: Number(record.rowVersion), hierarchyVersion: Number(record.hierarchyVersion),
    assignedManagerPersonKey: record.assignedManagerPersonKey, readableByManager: record.readableByManager,
    snapshotsComplete: record.snapshotsComplete, snapshots: Object.freeze(snapshots), events: Object.freeze(events)
  });
};

const canonicalProvenance = (value: unknown): Readonly<IOptionEBehaviourManagerEventProvenance> | undefined => {
  const receipt = exactPlainRecord(value, provenanceRequiredKeys);
  if (!receipt || receipt.contract !== 'KCF.OptionEBehaviourManagerEventProvenance/v1' || receipt.immutable !== true) {
    return undefined;
  }
  const event = canonicalEvent(receipt.event);
  return event ? Object.freeze({ contract: 'KCF.OptionEBehaviourManagerEventProvenance/v1',
    immutable: true, event }) : undefined;
};

const canonicalProvenanceSet = (
  value: unknown
): readonly Readonly<IOptionEBehaviourManagerEventProvenance>[] | undefined => {
  const carriers = exactPlainArray(value);
  if (!carriers) return undefined;
  const receipts: Readonly<IOptionEBehaviourManagerEventProvenance>[] = [];
  for (const carrier of carriers) {
    const receipt = canonicalProvenance(carrier);
    if (!receipt) return undefined;
    receipts.push(receipt);
  }
  return Object.freeze(receipts);
};
const canonicalManagerHistory = (
  record: Readonly<IOptionEBehaviourSubmittedRecord>,
  provenance: readonly Readonly<IOptionEBehaviourManagerEventProvenance>[],
  allowLocked: boolean
): boolean => {
  if (!nonBlank(record.employeePersonKey) || !nonBlank(record.workplanKey)
    || !Number.isSafeInteger(record.performanceYear) || record.performanceYear < 1000
    || !nonBlank(record.submittedSnapshotKey) || !Number.isSafeInteger(record.rowVersion) || record.rowVersion < 0
    || !Number.isSafeInteger(record.hierarchyVersion) || record.hierarchyVersion < 1
    || !record.readableByManager || !record.snapshotsComplete
    || (record.state !== 'Submitted' && !(allowLocked && record.state === 'Locked'))
    || record.snapshots.length < 1) return false;
  const selectionKeys = record.snapshots.map(snapshot => snapshot.selectionKey);
  if (selectionKeys.some(key => !nonBlank(key)) || new Set(selectionKeys).size !== selectionKeys.length
    || new Set(record.events.map(event => event.auditKey)).size !== record.events.length
    || !Array.isArray(provenance) || provenance.length !== record.events.length) return false;
  const provenanceByAuditKey = new Map<string, Readonly<IOptionEBehaviourManagerEventProvenance>>();
  for (const receipt of provenance) {
    const receiptEventKeys = receipt?.event && typeof receipt.event === 'object' && !Array.isArray(receipt.event)
      ? Object.keys(receipt.event) : [];
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
      || Object.keys(receipt).length !== provenanceRequiredKeys.length
      || provenanceRequiredKeys.some(key => !Object.prototype.hasOwnProperty.call(receipt, key))
      || receipt.contract !== 'KCF.OptionEBehaviourManagerEventProvenance/v1' || receipt.immutable !== true
      || !receipt.event || typeof receipt.event !== 'object' || Array.isArray(receipt.event)
      || eventRequiredKeys.some(key => !Object.prototype.hasOwnProperty.call(receipt.event, key))
      || receiptEventKeys.some(key => eventAllowedKeys.indexOf(key as typeof eventAllowedKeys[number]) < 0)
      || !UUID.test(receipt.event.auditKey) || provenanceByAuditKey.has(receipt.event.auditKey)) return false;
    provenanceByAuditKey.set(receipt.event.auditKey, receipt);
  }
  return record.events.every((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
    const keys = Object.keys(event);
    if (eventRequiredKeys.some(key => !Object.prototype.hasOwnProperty.call(event, key))
      || keys.some(key => eventAllowedKeys.indexOf(key as typeof eventAllowedKeys[number]) < 0)
      || event.sequence !== index + 1 || !UUID.test(event.auditKey)
      || event.workplanKey !== record.workplanKey || event.performanceYear !== record.performanceYear
      || event.submittedSnapshotKey !== record.submittedSnapshotKey
      || selectionKeys.indexOf(event.selectionKey) < 0
      || (event.disposition !== 'AGREED' && event.disposition !== 'CHANGES REQUESTED')
      || (event.disposition === 'CHANGES REQUESTED' ? !nonBlank(event.commentary) : event.commentary !== undefined)
      || !nonBlank(event.managerPersonKey) || !nonBlank(event.managerPrincipalId) || !EMAIL.test(event.managerEmail)
      || event.managerEmail !== event.managerEmail.trim().toLowerCase()
      || !Number.isSafeInteger(event.hierarchyVersion) || event.hierarchyVersion < 1
      || !Number.isSafeInteger(event.workplanRowVersion) || event.workplanRowVersion < 0
      || event.workplanRowVersion > record.rowVersion
      || (index > 0 && event.workplanRowVersion <= record.events[index - 1].workplanRowVersion)
      // Equal canonical instants are allowed for trusted events emitted in the same millisecond.
      // No wall-clock future rejection is inferred here; the event time comes from trusted processor authority.
      || (index > 0 && Date.parse(event.occurredAt) < Date.parse(record.events[index - 1].occurredAt))
      || !exactIsoTime(event.occurredAt) || !nonBlank(event.changeReference)) return false;
    const receipt = provenanceByAuditKey.get(event.auditKey);
    if (!receipt || !exactEvent(receipt.event, event)) return false;
    return true;
  });
};

const currentManagerIsAuthorised = (
  record: Readonly<IOptionEBehaviourSubmittedRecord>,
  actor: Readonly<IOptionEBehaviourManagerActor>
): boolean => actor.effectiveRole === 'Manager' && nonBlank(actor.personKey) && nonBlank(actor.principalId)
  && EMAIL.test(actor.email) && actor.personKey === record.assignedManagerPersonKey;

const exactManagerRecordBinding = (
  left: Readonly<IOptionEBehaviourSubmittedRecord>,
  right: Readonly<IOptionEBehaviourSubmittedRecord>
): boolean => left.employeePersonKey === right.employeePersonKey && left.workplanKey === right.workplanKey
  && left.performanceYear === right.performanceYear && left.submittedSnapshotKey === right.submittedSnapshotKey
  && left.hierarchyVersion === right.hierarchyVersion
  && left.assignedManagerPersonKey === right.assignedManagerPersonKey
  && JSON.stringify(left.snapshots) === JSON.stringify(right.snapshots);

const unavailable = (): IOptionEBehaviourManagerReadModel => ({
  state: 'Unavailable', reason: 'Governed Behaviour review is unavailable. Reload or contact KPI support.'
});

export class OptionEBehaviourManagerProcessor implements IOptionEBehaviourManagerGateway {
  public constructor(
    private readonly store: IOptionEBehaviourManagerStore,
    private readonly actor: () => Promise<Readonly<IOptionEBehaviourManagerActor>>,
    private readonly trustedNow: () => string,
    private readonly trustedChangeReference: () => string
  ) {}

  public async read(employeePersonKey: string): Promise<IOptionEBehaviourManagerReadModel> {
    if (!nonBlank(employeePersonKey)) return unavailable();
    try {
      const [recordCarrier, actorCarrier] = await Promise.all([
        this.store.readByEmployee(employeePersonKey), this.actor()
      ]);
      const record = canonicalSubmittedRecord(recordCarrier);
      const actor = canonicalManagerActor(actorCarrier);
      if (!record || record.employeePersonKey !== employeePersonKey
        || !actor || !currentManagerIsAuthorised(record, actor)) return unavailable();
      const provenance = canonicalProvenanceSet(await this.store.readTrustedEventProvenance(
        record.workplanKey, record.performanceYear, record.submittedSnapshotKey));
      if (!provenance) return unavailable();
      if (!canonicalManagerHistory(record, provenance, true)) return unavailable();
      // This trusted CAS re-read is deliberately the final await before governed history is returned.
      const assignment = await this.store.reauthoriseCurrentAssignmentExact(record, actor);
      if (assignment !== 'Authorised') return unavailable();
      return {
        state: 'Available', employeePersonKey: record.employeePersonKey, workplanKey: record.workplanKey,
        performanceYear: record.performanceYear, submittedSnapshotKey: record.submittedSnapshotKey,
        rowVersion: record.rowVersion, hierarchyVersion: record.hierarchyVersion,
        snapshots: record.snapshots, events: record.events
      };
    } catch {
      return unavailable();
    }
  }

  public async review(intent: Readonly<IOptionEBehaviourManagerIntent>): Promise<IOptionEBehaviourManagerResult> {
    const governedIntent = canonicalManagerIntent(intent as unknown);
    if (!governedIntent) {
      return { outcome: 'Denied', message: 'The manager Behaviour intent is incomplete or invalid.' };
    }
    let recordCarrier: unknown;
    let actorCarrier: unknown;
    try {
      [recordCarrier, actorCarrier] = await Promise.all([
        this.store.readExact(governedIntent.workplanKey, governedIntent.performanceYear,
          governedIntent.submittedSnapshotKey), this.actor()
      ]);
    } catch {
      return { outcome: 'Uncertain', message: 'The canonical submitted Behaviour state could not be checked.' };
    }
    const record = canonicalSubmittedRecord(recordCarrier);
    const actor = canonicalManagerActor(actorCarrier);
    if (!record || !actor || !currentManagerIsAuthorised(record, actor)
      || record.hierarchyVersion !== governedIntent.expectedHierarchyVersion
      || !record.snapshots.some(snapshot => snapshot.selectionKey === governedIntent.selectionKey)) {
      return { outcome: 'Denied', message: 'The manager, submitted snapshot, selection or version is not authorised.' };
    }
    let provenance: readonly Readonly<IOptionEBehaviourManagerEventProvenance>[] | undefined;
    try {
      provenance = canonicalProvenanceSet(await this.store.readTrustedEventProvenance(
        record.workplanKey, record.performanceYear, record.submittedSnapshotKey));
    } catch {
      return { outcome: 'Uncertain', message: 'The trusted manager event provenance could not be checked.' };
    }
    if (!provenance || !canonicalManagerHistory(record, provenance, false)) {
      return { outcome: 'Denied', message: 'The canonical manager history or its trusted provenance is invalid.' };
    }
    let assignment: OptionEBehaviourAssignmentOutcome;
    try { assignment = await this.store.reauthoriseCurrentAssignmentExact(record, actor); }
    catch { assignment = 'UnknownEffect'; }
    if (assignment === 'UnknownEffect') {
      return { outcome: 'Uncertain', message: 'The current manager assignment could not be re-authorised.' };
    }
    if (assignment === 'Conflict') {
      return { outcome: 'Conflict', message: 'The submitted Workplan or manager assignment changed. Reload before retrying.' };
    }
    if (assignment !== 'Authorised') {
      return { outcome: 'Denied', message: 'The current manager assignment is not authorised.' };
    }
    const auditKey = governedIntent.idempotencyKey.toLowerCase();
    const existing = record.events.find(candidate => candidate.auditKey === auditKey);
    if (existing) {
      const sameIntent = existing.workplanKey === governedIntent.workplanKey
        && existing.performanceYear === governedIntent.performanceYear
        && existing.submittedSnapshotKey === governedIntent.submittedSnapshotKey
        && existing.selectionKey === governedIntent.selectionKey
        && existing.disposition === governedIntent.disposition
        && (existing.commentary || '') === (governedIntent.disposition === 'CHANGES REQUESTED'
          ? governedIntent.commentary! : '')
        && existing.managerPersonKey === actor.personKey
        && existing.managerPrincipalId === actor.principalId
        && existing.managerEmail === actor.email
        && existing.hierarchyVersion === governedIntent.expectedHierarchyVersion
        && existing.workplanRowVersion === governedIntent.expectedRowVersion;
      return sameIntent
        ? { outcome: 'ConfirmedReplay', message: 'The existing canonical manager event was confirmed.', event: existing }
        : { outcome: 'Denied', message: 'The manager audit key collides with different canonical content.' };
    }
    if (record.rowVersion !== governedIntent.expectedRowVersion) {
      return { outcome: 'Denied', message: 'The manager, submitted snapshot, selection or version is not authorised.' };
    }
    let occurredAt: unknown;
    let changeReference: unknown;
    try {
      occurredAt = this.trustedNow();
      changeReference = this.trustedChangeReference();
    } catch {
      return { outcome: 'Denied', message: 'The trusted manager event time or change reference is invalid.' };
    }
    if (typeof occurredAt !== 'string' || !exactIsoTime(occurredAt) || !plainText(changeReference)) {
      return { outcome: 'Denied', message: 'The trusted manager event time or change reference is invalid.' };
    }
    const event: Readonly<IOptionEBehaviourManagerEvent> = Object.freeze({
      auditKey, sequence: record.events.length + 1,
      workplanKey: record.workplanKey, performanceYear: record.performanceYear,
      submittedSnapshotKey: record.submittedSnapshotKey, selectionKey: governedIntent.selectionKey,
      disposition: governedIntent.disposition,
      commentary: governedIntent.disposition === 'CHANGES REQUESTED' ? governedIntent.commentary : undefined,
      managerPersonKey: actor.personKey, managerPrincipalId: actor.principalId, managerEmail: actor.email,
      hierarchyVersion: record.hierarchyVersion, workplanRowVersion: record.rowVersion,
      occurredAt, changeReference
    });
    let append: OptionEBehaviourAppendOutcome;
    try { append = await this.store.appendExact(record, event); }
    catch { append = 'UnknownEffect'; }
    if (append === 'Collision') return { outcome: 'Denied', message: 'The manager audit key collides with different content.' };
    if (append === 'Conflict') return { outcome: 'Conflict', message: 'The submitted Workplan or manager assignment changed. Reload before retrying.' };
    let observedCarrier: unknown;
    try {
      observedCarrier = await this.store.readExact(governedIntent.workplanKey, governedIntent.performanceYear,
        governedIntent.submittedSnapshotKey);
    }
    catch { return { outcome: 'Uncertain', message: 'The manager event effect is uncertain; canonical readback is required.' }; }
    const observed = canonicalSubmittedRecord(observedCarrier);
    if (!observed || !exactManagerRecordBinding(record, observed)
      || !currentManagerIsAuthorised(observed, actor)) {
      return { outcome: 'Denied', message: 'Canonical readback contains malformed or crossed manager history.' };
    }
    let observedProvenance: readonly Readonly<IOptionEBehaviourManagerEventProvenance>[] | undefined;
    try {
      observedProvenance = canonicalProvenanceSet(await this.store.readTrustedEventProvenance(
        observed.workplanKey, observed.performanceYear, observed.submittedSnapshotKey));
    } catch {
      return { outcome: 'Uncertain', message: 'The manager event effect is uncertain; trusted provenance readback is required.' };
    }
    if (!observedProvenance || !canonicalManagerHistory(observed, observedProvenance, false)) {
      return { outcome: 'Denied', message: 'Canonical readback contains malformed or crossed manager history.' };
    }
    try { assignment = await this.store.reauthoriseCurrentAssignmentExact(observed, actor); }
    catch { assignment = 'UnknownEffect'; }
    if (assignment === 'UnknownEffect') {
      return { outcome: 'Uncertain', message: 'The manager event effect is uncertain; current assignment readback is required.' };
    }
    if (assignment === 'Conflict') {
      return { outcome: 'Conflict', message: 'The submitted Workplan or manager assignment changed. Reload before retrying.' };
    }
    if (assignment !== 'Authorised') {
      return { outcome: 'Denied', message: 'The current manager assignment is not authorised.' };
    }
    const confirmed = observed.events.find(candidate => candidate.auditKey === event.auditKey);
    if (!confirmed) return { outcome: 'Uncertain', message: 'The manager event effect is uncertain; no success was reported.' };
    if (!exactEvent(confirmed, event)) return { outcome: 'Denied', message: 'Canonical readback found a duplicate-key collision.' };
    return { outcome: append === 'Replay' ? 'ConfirmedReplay' : 'Confirmed',
      message: 'The canonical manager Behaviour event was confirmed.', event: confirmed };
  }
}

export const createDisabledOptionEBehaviourManagerGateway = (): IOptionEBehaviourManagerGateway => ({
  read: async () => unavailable(),
  review: async () => ({ outcome: 'Denied',
    message: 'The governed manager Behaviour processor is disabled until its physical binding and ACL gate are approved.' })
});
