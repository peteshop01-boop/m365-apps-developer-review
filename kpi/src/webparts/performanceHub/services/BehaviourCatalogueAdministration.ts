import type { IBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';
import { inspectBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';
import { assertNoBehaviourV2ScoringFields } from './BehaviourFrameworkV2Policy';
import { getAdminFoundationEntitlement } from './AdminFoundationEntitlement';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[A-F0-9]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nonBlank = (value: string | undefined): value is string => typeof value === 'string' && Boolean(value.trim());
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const unsafePlainData = (): never => { throw new Error('Unsafe plain-data carrier.'); };
const snapshotPlainData = <T,>(value: unknown): Readonly<T> => {
  const seen = new Set<object>();
  const visit = (input: unknown): unknown => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean'
      || typeof input === 'undefined') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : unsafePlainData();
    if (typeof input !== 'object' || seen.has(input)) return unsafePlainData();
    seen.add(input);
    if (Object.getOwnPropertySymbols(input).length) return unsafePlainData();
    const prototype = Object.getPrototypeOf(input);
    const names = Object.getOwnPropertyNames(input);
    if (Array.isArray(input)) {
      if (prototype !== Array.prototype) return unsafePlainData();
      const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
      if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
        || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
        || names.length !== lengthDescriptor.value + 1) return unsafePlainData();
      const output: unknown[] = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          || descriptor.enumerable !== true) return unsafePlainData();
        output.push(visit(descriptor.value));
      }
      return Object.freeze(output);
    }
    if (prototype !== Object.prototype) return unsafePlainData();
    const output: Record<string, unknown> = {};
    names.forEach(name => {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || descriptor.enumerable !== true) return unsafePlainData();
      Object.defineProperty(output, name, { value: visit(descriptor.value), enumerable: true,
        writable: false, configurable: false });
    });
    return Object.freeze(output);
  };
  return visit(value) as Readonly<T>;
};
const exactKeys = (value: object, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => required.indexOf(key) >= 0 || optional.indexOf(key) >= 0);
};
const exactIsoTime = (value: string): boolean => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
};

export const BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT = 'KCF.BehaviourCatalogueAdministration/v1' as const;
export type BehaviourCatalogueAdminAction = 'Baseline' | 'PublishSuccessor' | 'Retire' | 'Reactivate' | 'Correct';
export type BehaviourCatalogueAdminMutationAction = Exclude<BehaviourCatalogueAdminAction, 'Baseline'>;

export interface IBehaviourCatalogueAdminActor {
  personKey: string;
  email: string;
  appRoles: readonly string[];
}

export interface IBehaviourCatalogueAdminIdentity {
  catalogueVersion: string;
  catalogueRevision: number;
  contentSha256: string;
}

export interface IBehaviourCatalogueAdminAuthority {
  approvalReference: string;
  approvedV1Catalogue: Readonly<IBehaviourFrameworkV2Catalogue>;
  approvedV1ContentSha256: string;
}

export interface IBehaviourCatalogueAdminVersion {
  versionKey: string;
  previousVersionKey?: string;
  action: BehaviourCatalogueAdminAction;
  catalogue: Readonly<IBehaviourFrameworkV2Catalogue>;
  contentSha256: string;
  createdByPersonKey: string;
  createdByEmail: string;
  createdAt: string;
  reason: string;
  changeReference: string;
}

export interface IBehaviourCatalogueAdminEvent {
  auditKey: string;
  idempotencyKey: string;
  sequence: number;
  action: BehaviourCatalogueAdminAction;
  actorPersonKey: string;
  actorEmail: string;
  occurredAt: string;
  reason: string;
  changeReference: string;
  before?: IBehaviourCatalogueAdminIdentity;
  after: IBehaviourCatalogueAdminIdentity;
}

export interface IBehaviourCatalogueAdminState {
  contract: typeof BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT;
  catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS';
  rowVersion: number;
  etag: string;
  currentVersionKey: string;
  versions: readonly Readonly<IBehaviourCatalogueAdminVersion>[];
  events: readonly Readonly<IBehaviourCatalogueAdminEvent>[];
}

export interface IBehaviourCatalogueAdminCommand {
  contract: typeof BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT;
  idempotencyKey: string;
  action: BehaviourCatalogueAdminMutationAction;
  expectedEtag: string;
  expectedRowVersion: number;
  expectedCurrentVersionKey: string;
  reason: string;
  candidate: Readonly<IBehaviourFrameworkV2Catalogue>;
}

export type BehaviourCatalogueAdminAppendOutcome = 'Appended' | 'Replay' | 'Collision' | 'Conflict'
  | 'IntegrityFailure' | 'UnknownEffect';

export interface IBehaviourCatalogueAdminAppendIntegrity {
  canonicalCatalogueJson: string;
  contentSha256: string;
}

export interface IBehaviourCatalogueAdminAppendReceipt {
  outcome: BehaviourCatalogueAdminAppendOutcome;
  atomic: 'Committed' | 'NotCommitted' | 'Unknown';
  versionKey: string;
  auditKey: string;
  contentSha256: string;
}

export interface IBehaviourCatalogueAdministrationStore {
  readCanonical(): Promise<IBehaviourCatalogueAdminState | undefined>;
  appendSuccessorExact(
    expected: Readonly<{ etag: string; rowVersion: number; currentVersionKey: string }>,
    version: Readonly<IBehaviourCatalogueAdminVersion>,
    event: Readonly<IBehaviourCatalogueAdminEvent>,
    integrity: Readonly<IBehaviourCatalogueAdminAppendIntegrity>
  ): Promise<Readonly<IBehaviourCatalogueAdminAppendReceipt>>;
}

export type IBehaviourCatalogueAdminReadModel = Readonly<{
  state: 'Available';
  rowVersion: number;
  etag: string;
  currentVersionKey: string;
  currentCatalogue: Readonly<IBehaviourFrameworkV2Catalogue>;
  versions: readonly Readonly<IBehaviourCatalogueAdminVersion>[];
  events: readonly Readonly<IBehaviourCatalogueAdminEvent>[];
}> | Readonly<{ state: 'Denied' | 'Unavailable'; reason: string }>;

export type IBehaviourCatalogueAdminResult = Readonly<{
  outcome: 'Confirmed' | 'ConfirmedReplay' | 'Denied' | 'Conflict' | 'Uncertain';
  message: string;
  event?: Readonly<IBehaviourCatalogueAdminEvent>;
}>;

export interface IBehaviourCatalogueAdministrationGateway {
  read(): Promise<IBehaviourCatalogueAdminReadModel>;
  publish(command: Readonly<IBehaviourCatalogueAdminCommand>): Promise<IBehaviourCatalogueAdminResult>;
}

export type BehaviourCatalogueSha256 = (canonicalJson: string) => Promise<string>;

const identity = (version: Readonly<IBehaviourCatalogueAdminVersion>): IBehaviourCatalogueAdminIdentity => ({
  catalogueVersion: version.catalogue.catalogueVersion,
  catalogueRevision: version.catalogue.revision,
  contentSha256: version.contentSha256
});

const exactIdentity = (
  left: Readonly<IBehaviourCatalogueAdminIdentity> | undefined,
  right: Readonly<IBehaviourCatalogueAdminIdentity> | undefined
): boolean => JSON.stringify(left) === JSON.stringify(right);

const exactHeadlineAuthority = (
  candidate: Readonly<IBehaviourFrameworkV2Catalogue>,
  approved: Readonly<IBehaviourFrameworkV2Catalogue>
): boolean => JSON.stringify(candidate.headlineBehaviours) === JSON.stringify(approved.headlineBehaviours)
  && JSON.stringify(candidate.roleLevels) === JSON.stringify(approved.roleLevels)
  && JSON.stringify(candidate.ratingScale) === JSON.stringify(approved.ratingScale)
  && JSON.stringify(candidate.selectionGuidance) === JSON.stringify(approved.selectionGuidance);

const tupleProjection = (catalogue: Readonly<IBehaviourFrameworkV2Catalogue>): readonly string[] =>
  catalogue.rows.map(row => [row.targetKey, row.behaviourKey, row.focusKey, row.focusArea,
    row.roleLevelCode, row.suggestedTarget].join('|')).sort();

const exactApprovedV1 = (
  actual: Readonly<IBehaviourFrameworkV2Catalogue>,
  approved: Readonly<IBehaviourFrameworkV2Catalogue>
): boolean => actual.catalogueKey === approved.catalogueKey
  && actual.catalogueVersion === approved.catalogueVersion
  && actual.revision === approved.revision
  && actual.rows.length === 75
  && JSON.stringify(tupleProjection(actual)) === JSON.stringify(tupleProjection(approved))
  && JSON.stringify(actual) === JSON.stringify(approved);

const preservesExistingTargetIdentities = (
  current: Readonly<IBehaviourFrameworkV2Catalogue>,
  candidate: Readonly<IBehaviourFrameworkV2Catalogue>
): boolean => {
  const candidateByKey = new Map(candidate.rows.map(row => [row.targetKey, row]));
  return current.rows.every(row => {
    const successor = candidateByKey.get(row.targetKey);
    return successor !== undefined && successor.behaviourKey === row.behaviourKey
      && successor.roleLevelCode === row.roleLevelCode && successor.focusKey === row.focusKey
      && successor.sortOrder === row.sortOrder;
  });
};

const validCatalogue = (
  catalogue: Readonly<IBehaviourFrameworkV2Catalogue>,
  authority: Readonly<IBehaviourCatalogueAdminAuthority>
): boolean => {
  try {
    assertNoBehaviourV2ScoringFields(catalogue);
    const inspection = inspectBehaviourFrameworkV2Catalogue(catalogue as IBehaviourFrameworkV2Catalogue);
    const exactShape = exactKeys(catalogue, ['catalogueKey', 'catalogueVersion', 'revision', 'schemaVersion',
      'status', 'effectiveFrom', 'headlineBehaviours', 'roleLevels', 'ratingScale', 'selectionGuidance', 'rows'],
    ['effectiveTo'])
      && catalogue.headlineBehaviours.every(row => exactKeys(row, ['behaviourKey', 'title', 'sortOrder']))
      && catalogue.roleLevels.every(row => exactKeys(row, ['code', 'name', 'sortOrder']))
      && exactKeys(catalogue.selectionGuidance, ['recommendedMinimum', 'recommendedMaximum', 'hardMaximum'])
      && catalogue.rows.every(row => exactKeys(row, ['targetKey', 'behaviourKey', 'roleLevelCode', 'focusKey',
        'focusArea', 'suggestedTarget', 'suggestedMeasure', 'suggestedUnit', 'suggestedEvidence', 'status',
        'sortOrder', 'effectiveFrom'], ['effectiveTo']));
    return exactShape && inspection.valid && catalogue.status === 'Published'
      && exactHeadlineAuthority(catalogue, authority.approvedV1Catalogue);
  } catch { return false; }
};

const exactVersionEvent = (
  version: Readonly<IBehaviourCatalogueAdminVersion>,
  event: Readonly<IBehaviourCatalogueAdminEvent>,
  previous: Readonly<IBehaviourCatalogueAdminVersion> | undefined,
  index: number
): boolean => event.sequence === index + 1 && UUID.test(event.auditKey)
  && exactKeys(version, ['versionKey', 'action', 'catalogue', 'contentSha256', 'createdByPersonKey',
    'createdByEmail', 'createdAt', 'reason', 'changeReference'], ['previousVersionKey'])
  && exactKeys(event, ['auditKey', 'idempotencyKey', 'sequence', 'action', 'actorPersonKey', 'actorEmail',
    'occurredAt', 'reason', 'changeReference', 'after'], ['before'])
  && event.idempotencyKey === event.auditKey && version.action === event.action
  && version.createdByPersonKey === event.actorPersonKey && version.createdByEmail === event.actorEmail
  && version.createdAt === event.occurredAt && version.reason === event.reason
  && version.changeReference === event.changeReference
  && exactIdentity(event.before, previous && identity(previous))
  && exactIdentity(event.after, identity(version));

const validActionTransition = (
  action: BehaviourCatalogueAdminAction,
  current: Readonly<IBehaviourFrameworkV2Catalogue>,
  candidate: Readonly<IBehaviourFrameworkV2Catalogue>
): boolean => {
  if (action === 'Baseline') return false;
  const currentByKey = new Map(current.rows.map(row => [row.targetKey, row]));
  const retired = candidate.rows.some(row => currentByKey.get(row.targetKey)?.status === 'Published'
    && row.status === 'Retired');
  const reactivated = candidate.rows.some(row => currentByKey.get(row.targetKey)?.status === 'Retired'
    && row.status === 'Published');
  if (action === 'Retire') return retired && !reactivated;
  if (action === 'Reactivate') return reactivated && !retired;
  return !retired && !reactivated;
};

const validAuthorityCarrier = (value: unknown): value is Readonly<IBehaviourCatalogueAdminAuthority> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && exactKeys(value, ['approvalReference', 'approvedV1Catalogue', 'approvedV1ContentSha256'])
  && typeof (value as IBehaviourCatalogueAdminAuthority).approvedV1Catalogue === 'object'
  && (value as IBehaviourCatalogueAdminAuthority).approvedV1Catalogue !== null
  && !Array.isArray((value as IBehaviourCatalogueAdminAuthority).approvedV1Catalogue);

const validCommandCarrier = (value: unknown): value is Readonly<IBehaviourCatalogueAdminCommand> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && exactKeys(value, ['contract', 'idempotencyKey', 'action', 'expectedEtag', 'expectedRowVersion',
    'expectedCurrentVersionKey', 'reason', 'candidate'])
  && typeof (value as IBehaviourCatalogueAdminCommand).candidate === 'object'
  && (value as IBehaviourCatalogueAdminCommand).candidate !== null
  && !Array.isArray((value as IBehaviourCatalogueAdminCommand).candidate);

const validAppendReceipt = (
  value: unknown,
  version: Readonly<IBehaviourCatalogueAdminVersion>,
  event: Readonly<IBehaviourCatalogueAdminEvent>
): value is Readonly<IBehaviourCatalogueAdminAppendReceipt> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !exactKeys(value, ['outcome', 'atomic', 'versionKey', 'auditKey', 'contentSha256'])) return false;
  const receipt = value as IBehaviourCatalogueAdminAppendReceipt;
  const outcomes: readonly BehaviourCatalogueAdminAppendOutcome[] = [
    'Appended', 'Replay', 'Collision', 'Conflict', 'IntegrityFailure', 'UnknownEffect'
  ];
  const expectedAtomic = receipt.outcome === 'Appended' || receipt.outcome === 'Replay' ? 'Committed'
    : receipt.outcome === 'UnknownEffect' ? 'Unknown' : 'NotCommitted';
  return outcomes.indexOf(receipt.outcome) >= 0 && receipt.atomic === expectedAtomic
    && receipt.versionKey === version.versionKey && receipt.auditKey === event.auditKey
    && receipt.contentSha256 === version.contentSha256;
};

const canonicalState = async (
  state: Readonly<IBehaviourCatalogueAdminState>,
  authority: Readonly<IBehaviourCatalogueAdminAuthority>,
  sha256: BehaviourCatalogueSha256
): Promise<boolean> => {
  if (typeof state !== 'object' || state === null || Array.isArray(state)
    || !validAuthorityCarrier(authority)
    || !exactKeys(state, ['contract', 'catalogueKey', 'rowVersion', 'etag', 'currentVersionKey',
    'versions', 'events']) || state.contract !== BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT
    || state.catalogueKey !== 'KCF-KCCC-BEHAVIOUR-FOCUS' || !nonBlank(state.etag)
    || !Array.isArray(state.versions) || !Array.isArray(state.events)
    || !Number.isSafeInteger(state.rowVersion) || state.rowVersion !== state.versions.length
    || state.versions.length < 1 || state.events.length !== state.versions.length
    || state.currentVersionKey !== state.versions[state.versions.length - 1].versionKey
    || new Set(state.versions.map(version => version.versionKey)).size !== state.versions.length
    || new Set(state.events.map(event => event.auditKey)).size !== state.events.length) return false;
  if (!nonBlank(authority.approvalReference) || !SHA256.test(authority.approvedV1ContentSha256)
    || !exactApprovedV1(state.versions[0].catalogue, authority.approvedV1Catalogue)) return false;

  for (let index = 0; index < state.versions.length; index += 1) {
    const version = state.versions[index];
    const event = state.events[index];
    const previous = index ? state.versions[index - 1] : undefined;
    if (typeof version !== 'object' || version === null || Array.isArray(version)
      || typeof event !== 'object' || event === null || Array.isArray(event)
      || typeof version.catalogue !== 'object' || version.catalogue === null
      || Array.isArray(version.catalogue)) return false;
    const actualHash = (await sha256(JSON.stringify(version.catalogue))).toUpperCase();
    if (!version || !event || !SHA256.test(version.contentSha256) || actualHash !== version.contentSha256
      || !validCatalogue(version.catalogue, authority)
      || version.versionKey !== version.catalogue.catalogueVersion
      || version.catalogue.catalogueKey !== state.catalogueKey
      || version.previousVersionKey !== previous?.versionKey
      || (index === 0 ? version.action !== 'Baseline' : version.action === 'Baseline')
      || (previous !== undefined && !preservesExistingTargetIdentities(previous.catalogue, version.catalogue))
      || (previous !== undefined && !validActionTransition(version.action, previous.catalogue, version.catalogue))
      || (index > 0 && version.catalogue.revision !== previous!.catalogue.revision + 1)
      || (previous !== undefined && Date.parse(version.createdAt) < Date.parse(previous.createdAt))
      || !nonBlank(version.createdByPersonKey) || !EMAIL.test(version.createdByEmail)
      || !exactIsoTime(version.createdAt) || !nonBlank(version.reason) || !nonBlank(version.changeReference)
      || !exactVersionEvent(version, event, previous, index)) return false;
  }
  return state.versions[0].contentSha256 === authority.approvedV1ContentSha256
    && (await sha256(JSON.stringify(authority.approvedV1Catalogue))).toUpperCase()
      === authority.approvedV1ContentSha256;
};

/** Descriptor-safe immutable snapshots for storage adapters; no authority is created here. */
export const snapshotBehaviourCatalogueAdministrationPlainData = <T,>(value: unknown): Readonly<T> =>
  snapshotPlainData<T>(value);

/** Reuse the existing canonical history rules without changing processor semantics. */
export const validateBehaviourCatalogueAdministrationCanonicalState = async (
  state: unknown, authority: unknown, sha256: BehaviourCatalogueSha256
): Promise<boolean> => {
  try {
    return await canonicalState(snapshotPlainData<IBehaviourCatalogueAdminState>(state),
      snapshotPlainData<IBehaviourCatalogueAdminAuthority>(authority), sha256);
  } catch { return false; }
};

const denied = (message: string): IBehaviourCatalogueAdminResult => ({ outcome: 'Denied', message });
const unavailableRead = (): IBehaviourCatalogueAdminReadModel => ({
  state: 'Unavailable', reason: 'Behaviour catalogue administration is unavailable. Reload or contact KPI support.'
});
const deniedRead = (): IBehaviourCatalogueAdminReadModel => ({
  state: 'Denied', reason: 'You are not authorised to administer the Behaviour catalogue.'
});
const authorisedActor = (value: unknown): value is Readonly<IBehaviourCatalogueAdminActor> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !exactKeys(value, ['personKey', 'email', 'appRoles'])) return false;
  const actor = value as IBehaviourCatalogueAdminActor;
  return nonBlank(actor.personKey) && EMAIL.test(actor.email) && Array.isArray(actor.appRoles)
    && actor.appRoles.every(role => nonBlank(role))
    && getAdminFoundationEntitlement(actor.appRoles).entitled;
};

export class BehaviourCatalogueAdministrationProcessor implements IBehaviourCatalogueAdministrationGateway {
  public constructor(
    private readonly store: IBehaviourCatalogueAdministrationStore,
    private readonly authority: Readonly<IBehaviourCatalogueAdminAuthority>,
    private readonly actor: () => Promise<unknown>,
    private readonly trustedNow: () => string,
    private readonly trustedChangeReference: () => string,
    private readonly sha256: BehaviourCatalogueSha256
  ) {}

  public async read(): Promise<IBehaviourCatalogueAdminReadModel> {
    let authority: Readonly<IBehaviourCatalogueAdminAuthority>;
    try {
      const snapshot = snapshotPlainData<IBehaviourCatalogueAdminAuthority>(this.authority);
      if (!validAuthorityCarrier(snapshot)) return unavailableRead();
      authority = snapshot;
    } catch { return unavailableRead(); }
    let actorCarrier: unknown;
    let stateCarrier: IBehaviourCatalogueAdminState | undefined;
    try { actorCarrier = await this.actor(); }
    catch { return unavailableRead(); }
    try {
      const snapshot = snapshotPlainData<IBehaviourCatalogueAdminActor>(actorCarrier);
      if (!authorisedActor(snapshot)) return deniedRead();
    } catch { return deniedRead(); }
    try { stateCarrier = await this.store.readCanonical(); }
    catch { return unavailableRead(); }
    try {
      const state = snapshotPlainData<IBehaviourCatalogueAdminState | undefined>(stateCarrier);
      if (!state || !await canonicalState(state, authority, this.sha256)) return unavailableRead();
      const current = state.versions[state.versions.length - 1].catalogue;
      return { state: 'Available', rowVersion: state.rowVersion, etag: state.etag,
        currentVersionKey: state.currentVersionKey, currentCatalogue: clone(current),
        versions: clone(state.versions), events: clone(state.events) };
    } catch { return unavailableRead(); }
  }

  public async publish(command: Readonly<IBehaviourCatalogueAdminCommand>): Promise<IBehaviourCatalogueAdminResult> {
    let preparedCommand: Readonly<IBehaviourCatalogueAdminCommand>;
    let authority: Readonly<IBehaviourCatalogueAdminAuthority>;
    let commandCanonicalJson: string;
    let candidateCanonicalJson: string;
    try {
      const commandSnapshot = snapshotPlainData<IBehaviourCatalogueAdminCommand>(command);
      const authoritySnapshot = snapshotPlainData<IBehaviourCatalogueAdminAuthority>(this.authority);
      if (!validCommandCarrier(commandSnapshot) || !validAuthorityCarrier(authoritySnapshot)
        || commandSnapshot.contract !== BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT
        || !UUID.test(commandSnapshot.idempotencyKey)
        || ['PublishSuccessor', 'Retire', 'Reactivate', 'Correct'].indexOf(commandSnapshot.action) < 0
        || !nonBlank(commandSnapshot.expectedEtag) || !Number.isSafeInteger(commandSnapshot.expectedRowVersion)
        || !nonBlank(commandSnapshot.expectedCurrentVersionKey) || !nonBlank(commandSnapshot.reason)) {
        return denied('The governed catalogue command or authority carrier is incomplete or invalid.');
      }
      preparedCommand = commandSnapshot;
      authority = authoritySnapshot;
      commandCanonicalJson = JSON.stringify(commandSnapshot);
      candidateCanonicalJson = JSON.stringify(commandSnapshot.candidate);
    } catch { return denied('The governed catalogue command or authority carrier is unsafe.'); }

    let actorCarrier: unknown;
    let stateCarrier: IBehaviourCatalogueAdminState | undefined;
    try { actorCarrier = await this.actor(); }
    catch { return { outcome: 'Uncertain', message: 'The canonical catalogue state could not be checked.' }; }
    let actor: Readonly<IBehaviourCatalogueAdminActor>;
    try {
      const actorSnapshot = snapshotPlainData<IBehaviourCatalogueAdminActor>(actorCarrier);
      if (!authorisedActor(actorSnapshot)) {
        return denied('You are not authorised to administer the Behaviour catalogue.');
      }
      actor = actorSnapshot;
    } catch { return denied('You are not authorised to administer the Behaviour catalogue.'); }
    try { stateCarrier = await this.store.readCanonical(); }
    catch { return { outcome: 'Uncertain', message: 'The canonical catalogue state could not be checked.' }; }
    let state: Readonly<IBehaviourCatalogueAdminState>;
    try {
      const stateSnapshot = snapshotPlainData<IBehaviourCatalogueAdminState | undefined>(stateCarrier);
      if (!stateSnapshot || !await canonicalState(stateSnapshot, authority, this.sha256)) {
        return denied('The canonical catalogue or immutable history is unavailable or malformed.');
      }
      state = stateSnapshot;
    } catch {
      return denied('The canonical catalogue or immutable history is unavailable or malformed.');
    }
    let candidateHash: string;
    try { candidateHash = (await this.sha256(candidateCanonicalJson)).toUpperCase(); }
    catch { return { outcome: 'Uncertain', message: 'The catalogue content identity could not be calculated.' }; }
    try {
      const currentCommand = snapshotPlainData<IBehaviourCatalogueAdminCommand>(command);
      if (!validCommandCarrier(currentCommand) || JSON.stringify(currentCommand) !== commandCanonicalJson) {
        return denied('The governed catalogue command changed during validation.');
      }
    } catch { return denied('The governed catalogue command changed during validation.'); }
    const auditKey = preparedCommand.idempotencyKey.toLowerCase();
    const replay = state.events.find(event => event.auditKey === auditKey);
    if (replay) {
      const same = replay.action === preparedCommand.action && replay.reason === preparedCommand.reason.trim()
        && replay.before?.catalogueVersion === preparedCommand.expectedCurrentVersionKey
        && replay.after.catalogueVersion === preparedCommand.candidate.catalogueVersion
        && replay.after.catalogueRevision === preparedCommand.candidate.revision
        && replay.after.contentSha256 === candidateHash;
      return same ? { outcome: 'ConfirmedReplay', message: 'The existing catalogue event was confirmed.', event: clone(replay) }
        : denied('The catalogue audit key collides with a different command.');
    }
    if (state.etag !== preparedCommand.expectedEtag || state.rowVersion !== preparedCommand.expectedRowVersion
      || state.currentVersionKey !== preparedCommand.expectedCurrentVersionKey) {
      return { outcome: 'Conflict', message: 'The catalogue changed. Reload before preparing another version.' };
    }
    const current = state.versions[state.versions.length - 1];
    if (!SHA256.test(candidateHash) || !validCatalogue(preparedCommand.candidate, authority)
      || preparedCommand.candidate.catalogueVersion === current.catalogue.catalogueVersion
      || state.versions.some(version => version.versionKey === preparedCommand.candidate.catalogueVersion)
      || preparedCommand.candidate.revision !== current.catalogue.revision + 1
      || candidateCanonicalJson === JSON.stringify(current.catalogue)
      || !preservesExistingTargetIdentities(current.catalogue, preparedCommand.candidate)
      || !validActionTransition(preparedCommand.action, current.catalogue, preparedCommand.candidate)) {
      return denied('The successor catalogue is invalid, unchanged, crossed or inconsistent with the requested action.');
    }
    let occurredAt: string;
    let changeReference: string;
    try {
      occurredAt = this.trustedNow();
      changeReference = this.trustedChangeReference();
    } catch { return denied('Trusted actor, time or change reference is unavailable.'); }
    if (!nonBlank(actor.personKey) || !EMAIL.test(actor.email) || !exactIsoTime(occurredAt)
      || !nonBlank(changeReference)) return denied('Trusted actor, time or change reference is unavailable.');
    const version = snapshotPlainData<IBehaviourCatalogueAdminVersion>({
      versionKey: preparedCommand.candidate.catalogueVersion, previousVersionKey: current.versionKey,
      action: preparedCommand.action, catalogue: preparedCommand.candidate, contentSha256: candidateHash,
      createdByPersonKey: actor.personKey, createdByEmail: actor.email.trim().toLowerCase(),
      createdAt: occurredAt, reason: preparedCommand.reason.trim(), changeReference
    });
    const event = snapshotPlainData<IBehaviourCatalogueAdminEvent>({
      auditKey, idempotencyKey: auditKey, sequence: state.events.length + 1, action: preparedCommand.action,
      actorPersonKey: version.createdByPersonKey, actorEmail: version.createdByEmail,
      occurredAt, reason: version.reason, changeReference,
      before: identity(current), after: identity(version)
    });
    const integrity = snapshotPlainData<IBehaviourCatalogueAdminAppendIntegrity>({
      canonicalCatalogueJson: candidateCanonicalJson, contentSha256: candidateHash
    });
    let appendReceipt: Readonly<IBehaviourCatalogueAdminAppendReceipt>;
    try {
      const receiptCarrier = await this.store.appendSuccessorExact({ etag: state.etag, rowVersion: state.rowVersion,
        currentVersionKey: state.currentVersionKey }, version, event, integrity);
      const receiptSnapshot = snapshotPlainData<IBehaviourCatalogueAdminAppendReceipt>(receiptCarrier);
      if (!validAppendReceipt(receiptSnapshot, version, event)) throw new Error('Invalid append receipt.');
      appendReceipt = receiptSnapshot;
    } catch {
      appendReceipt = Object.freeze({ outcome: 'UnknownEffect', atomic: 'Unknown',
        versionKey: version.versionKey, auditKey: event.auditKey, contentSha256: version.contentSha256 });
    }
    const append = appendReceipt.outcome;
    if (append === 'IntegrityFailure') return denied('The store rejected the catalogue integrity or atomic append receipt.');
    if (append === 'Collision') return denied('The catalogue audit key collides with different canonical content.');
    if (append === 'Conflict') return { outcome: 'Conflict', message: 'The catalogue changed before publication completed.' };
    let observed: Readonly<IBehaviourCatalogueAdminState> | undefined;
    try {
      const observedCarrier = await this.store.readCanonical();
      observed = snapshotPlainData<IBehaviourCatalogueAdminState | undefined>(observedCarrier);
    }
    catch { return { outcome: 'Uncertain', message: 'Publication effect is uncertain; canonical reload is required.' }; }
    if (!observed || !await canonicalState(observed, authority, this.sha256)) {
      return denied('Canonical reload contains malformed or partial catalogue history.');
    }
    const confirmedEvent = observed.events.find(item => item.auditKey === auditKey);
    const confirmedVersion = observed.versions.find(item => item.versionKey === version.versionKey);
    if (!confirmedEvent || !confirmedVersion) {
      return { outcome: 'Uncertain', message: 'Publication effect is uncertain; no success was reported.' };
    }
    if (JSON.stringify(confirmedEvent) !== JSON.stringify(event)
      || JSON.stringify(confirmedVersion) !== JSON.stringify(version)) {
      return denied('Canonical reload does not match the prepared catalogue publication.');
    }
    return { outcome: append === 'Replay' ? 'ConfirmedReplay' : 'Confirmed',
      message: 'The successor catalogue and append-only event were confirmed.', event: clone(event) };
  }
}

export const createBehaviourCatalogueAdministrationBaseline = async (
  authority: Readonly<IBehaviourCatalogueAdminAuthority>,
  actor: Readonly<{ personKey: string; email: string }>,
  occurredAt: string,
  changeReference: string,
  auditKey: string,
  sha256: BehaviourCatalogueSha256
): Promise<IBehaviourCatalogueAdminState> => {
  let authoritySnapshot: Readonly<IBehaviourCatalogueAdminAuthority>;
  let actorSnapshot: Readonly<{ personKey: string; email: string }>;
  try {
    authoritySnapshot = snapshotPlainData<IBehaviourCatalogueAdminAuthority>(authority);
    actorSnapshot = snapshotPlainData<{ personKey: string; email: string }>(actor);
  } catch { throw new Error('The approved v1 catalogue baseline carrier is unsafe.'); }
  const catalogueJson = validAuthorityCarrier(authoritySnapshot)
    ? JSON.stringify(authoritySnapshot.approvedV1Catalogue) : '';
  const hash = (await sha256(catalogueJson)).toUpperCase();
  if (!validAuthorityCarrier(authoritySnapshot)
    || typeof actorSnapshot !== 'object' || actorSnapshot === null || Array.isArray(actorSnapshot)
    || !exactKeys(actorSnapshot, ['personKey', 'email'])
    || hash !== authoritySnapshot.approvedV1ContentSha256 || !UUID.test(auditKey)
    || !nonBlank(actorSnapshot.personKey) || !EMAIL.test(actorSnapshot.email)
    || !exactIsoTime(occurredAt) || !nonBlank(changeReference)
    || !nonBlank(authoritySnapshot.approvalReference)
    || !validCatalogue(authoritySnapshot.approvedV1Catalogue, authoritySnapshot)
    || authoritySnapshot.approvedV1Catalogue.rows.length !== 75) {
    throw new Error('The approved v1 catalogue baseline identity is invalid.');
  }
  const version: IBehaviourCatalogueAdminVersion = {
    versionKey: authoritySnapshot.approvedV1Catalogue.catalogueVersion, action: 'Baseline',
    catalogue: clone(authoritySnapshot.approvedV1Catalogue), contentSha256: hash,
    createdByPersonKey: actorSnapshot.personKey, createdByEmail: actorSnapshot.email.trim().toLowerCase(),
    createdAt: occurredAt, reason: authoritySnapshot.approvalReference, changeReference
  };
  const event: IBehaviourCatalogueAdminEvent = {
    auditKey: auditKey.toLowerCase(), idempotencyKey: auditKey.toLowerCase(), sequence: 1,
    action: 'Baseline', actorPersonKey: version.createdByPersonKey, actorEmail: version.createdByEmail,
    occurredAt, reason: version.reason, changeReference, after: identity(version)
  };
  return { contract: BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
    catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS', rowVersion: 1, etag: '"catalogue-admin-1"',
    currentVersionKey: version.versionKey, versions: [version], events: [event] };
};

export const createDisabledBehaviourCatalogueAdministrationGateway = (
): IBehaviourCatalogueAdministrationGateway => ({
  read: async () => unavailableRead(),
  publish: async () => denied('The physical Behaviour catalogue administration adapter is disabled.')
});
