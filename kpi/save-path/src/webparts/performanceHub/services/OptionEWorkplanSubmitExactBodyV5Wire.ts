import {
  EXACT_BODY_V5, V5_MAX_BYTES, V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT,
  V5_OPERATION_CONTRACT, V5_DELIVERY_READER_CONTRACT, V5_TAXONOMY_READER_CONTRACT, V5_CHECKPOINTS, V5_CAPTURE_ENCODING,
  type V5Request, type V5ReferenceSet, type V5Authority, type V5Admission, type V5JournalOperation,
  type V5Snapshot, type V5Receipt
} from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import { OPTION_E_DRAFT_V2_SCHEMA_VERSION } from '../models/OptionEWorkplanDraftV2Models';
import type { GovernedDeliveryPublicationProposal } from '../models/GovernedDeliveryPublicationV1Models';
import { parseCanonicalOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { assertV4Schema, v4Canonical, parseV4Canonical, v4Etag, BufferByteLength } from './OptionEWorkplanSubmitExactBodyV4Wire';

const fail = (): never => { throw new Error('ExactBodyV5WireInvalid'); };
const requireThat = (condition: unknown): void => { if (!condition) fail(); };
const text = { type: 'string' };
const number = { type: 'number', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };
const positive = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const year = { type: 'integer', minimum: 2000, maximum: 9999 };
const fixed = (value: string | number | boolean): object => ({ type: typeof value, const: value });
const choice = (values: readonly string[]): object => ({ type: 'string', enum: values });
const array = (items: unknown): object => ({ type: 'array', items });
const closed = (required: Record<string, unknown>, optional: Record<string, unknown> = {}): object => ({
  type: 'object', additionalProperties: false, required: Object.keys(required).sort(), properties: { ...required, ...optional }
});
const capability = closed(Object.fromEntries(Object.entries(EXACT_BODY_V5).map(([key, value]) => [key, fixed(value)])));
const native = closed({ siteId: text, webId: text, listId: text, itemId: positive, version: text, etag: text });
const draft = closed({ itemId: positive, etag: text, version: text, schema: fixed(OPTION_E_DRAFT_V2_SCHEMA_VERSION), body: text });
export const V5_WIRE_SCHEMA = closed({ capability, action: fixed('Submit'), command: text, person: text, year,
  workplan: text, source: draft, referenceBody: text });
const legacyKinds = ['Kpi', 'Target', 'Framework', 'Assignment', 'Value', 'Prompt', 'Catalogue', 'Headline', 'Focus', 'BehaviourTarget'];
const row = { key: text, itemId: positive, etag: text, version: text, body: text };
export const V5_REFERENCE_SCHEMA = closed({ contract: fixed(V5_REFERENCE_CONTRACT), asOf: text, rows: array({ anyOf: [
  closed({ ...row, kind: choice(legacyKinds) }),
  closed({ ...row, kind: fixed('DeliveryConfiguration'), readerContract: fixed(V5_DELIVERY_READER_CONTRACT), native, nativeMetadataBody: text }),
  closed({ ...row, kind: fixed('ImpactTaxonomy'), readerContract: fixed(V5_TAXONOMY_READER_CONTRACT), native, nativeMetadataBody: text })
] }) });

// Independent closed shapes retain complete U1/U2 publication data; policy/origin admission is later work.
const weights = closed({ core: number, impact: number });
const publicationAuthority = (id: string, approval: string): object => closed({
  [id]: text, version: text, etag: text, approvalReference: fixed(approval), contentSha256: text,
  effectiveFrom: text, publishedAt: text, publishedBy: text, changeReference: text
});
const deliveryPayload = closed({ schema: fixed('DEMO.DeliveryWeightConfiguration'), immutable: fixed(true), published: fixed(true),
  authority: publicationAuthority('configurationId', 'DEMO-APP-PETE-PD-01'), defaultWeights: weights, activeWeights: weights });
const configRow = (key: string): object => closed({
  identity: closed({ itemId: positive, key: fixed(key), environment: text, etag: text, state: fixed('Active') }),
  provenance: closed({ modifiedAt: text, modifiedBy: text, changeReference: text })
});
const config = closed({ schema: fixed('DEMO.OverallDelivery.Configuration'), schemaVersion: fixed(1), sourceList: fixed('DEMOAPP_Config'),
  environment: text, performanceYear: year, versionToken: text, weights: closed({ core: number, impact: number, total: fixed(100) }),
  includedCategories: array(text), excludedCategories: array(text), behavioursExcludedFromDeliveryArithmetic: fixed(true),
  poorCoreMaskingGuard: fixed('RequiredDownstreamGovernedRule'), poorCoreThresholdConfiguredHere: fixed(false),
  authority: closed({ core: configRow('OverallDelivery.Weight.Core'), impact: configRow('OverallDelivery.Weight.Impact') }),
  tenantMutationExecuted: fixed(false) });
const globalScope = closed({ kind: fixed('GlobalDefault'), year });
const overrideScope = closed({ kind: fixed('WorkplanOverride'), workplan: text, person: text, year });
const publicationRoot = (scope: object, provenance: object): object => closed({
  contract: fixed('demo.option-e.delivery-publication/v1'), purposeApproval: fixed('DEMO-APP-PM83-D001'), scope, payload: deliveryPayload, provenance
});
const globalPublication = publicationRoot(globalScope, closed({ configSource: config }));
const workplan = closed({ id: positive, etag: text, workplanKey: text, personKey: text, employeeDisplayName: text, employeeEmail: text,
  performanceYear: year, state: choice(['Draft', 'Submitted', 'ChangesRequested', 'Approved', 'Locked', 'Archived']), accessState: text,
  transitionStatus: text, coreCategoryWeight: number, personalCategoryWeight: number, behaviourCategoryWeight: number, rowVersionToken: positive
}, { ...Object.fromEntries(['managerPersonKey', 'managerDisplayName', 'managerEmail', 'transitionCorrelationKey', 'categoryWeightReason',
  'submittedAt', 'submittedByEmail', 'managerDecisionComment', 'approvedAt', 'approvedByEmail', 'lockedAt', 'lockedByEmail'].map(key => [key, text])),
  overallDeliveryWeightConfiguration: closed({ configurationKey: text, configurationVersion: text, coreWeight: number,
    impactWeight: number, sourceReference: fixed('DEMO-APP-PETE-PD-01') }) });
const observation = (value: object): object => closed({ native, value });
const managerPublication = publicationRoot(overrideScope, closed({ baseline: globalPublication, workplanSource: observation(workplan),
  actorSource: observation(closed({ personKey: text, email: text, appRoles: array(text), active: fixed(true) })),
  subjectSource: observation(closed({ personKey: text, managerPersonKey: text, managerEmail: text })),
  approval: closed({ actorPersonKey: text, subjectPersonKey: text, assignedManagerPersonKey: text,
    audit: closed({ auditKey: text, eventType: fixed('DeliveryWeightOverrideApproved'), actorEmail: text, actorRole: fixed('Manager'),
      eventAt: text, reason: text, sourceVersion: positive, resultingState: choice(['Draft', 'ChangesRequested']), before: weights, after: weights }) })
}));
const taxonomyOption = closed({ key: text, label: text, source: text, active: fixed(true), approved: fixed(true), effectiveFrom: text },
  { sourceReference: text, effectiveTo: text });
const taxonomyPublication = closed({ contract: fixed('demo.option-e.impact-taxonomy-publication/v1'), purposeApproval: fixed('DEMO-APP-PM83-D001'),
  payload: closed({ schema: fixed('DEMO.ImpactTaxonomy'), immutable: fixed(true), published: fixed(true),
    authority: publicationAuthority('taxonomyId', 'DEMO-APP-PETE-PD-02'), strategicPillars: array(taxonomyOption), businessContributionAreas: array(taxonomyOption) }),
  provenance: closed({ sourceReference: fixed('DEMO-APP-PETE-PD-02'), publisherPrincipal: positive }) });
const person = closed({ key: text, principal: positive, active: fixed(true), version: text }, { manager: text });
const controlRequired = { workplan: text, person: text, year, draftId: positive, manager: text, hierarchyEpoch: positive,
  aclEpoch: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  state: choice(['Draft', 'ChangesRequested', 'Submitted']), transition: choice(['Ready', 'Submitting', 'AclPending']) };
const controlOptional = { command: text, snapshot: text };
const control = closed({ ...controlRequired, etag: text }, controlOptional);
const controlAfter = closed(controlRequired, controlOptional);
const nativeRequestFields = { itemId: positive, etag: text, version: text, createdBy: positive, body: text };
const authorityFields = { contract: fixed(V5_AUTHORITY_CONTRACT), actor: person, manager: person, control, workplan: observation(workplan) };
const authority = closed({ ...authorityFields, request: closed({ ...nativeRequestFields, query: V5_WIRE_SCHEMA }),
  draft, references: V5_REFERENCE_SCHEMA });
const admission = closed({ contract: fixed(V5_ADMISSION_CONTRACT), capability, key: text, authority, eventAt: text });
// Unadmitted V5 source revision r2 removes only duplicate fields. All captured authority remains in snapshot.admission.
const snapshot = closed({ contract: fixed(EXACT_BODY_V5.storage), key: text, admission, body: text });
const receipt = closed({ contract: fixed(EXACT_BODY_V5.receipt), key: text, snapshot, nativeCreated: text });
const operation = closed({ contract: fixed(V5_OPERATION_CONTRACT), admission, checkpoint: choice(V5_CHECKPOINTS), etag: text,
  outcome: choice(['Running', 'Completed', 'RecoveryHold']), controlReadback: control },
  { holdReason: text, controlIntent: closed({ before: control, after: controlAfter }) });
// Explicit r3 storage schemas; expanded view validation below is never a persisted-frame parser.
export const V5_CAPTURED_ADMISSION_SCHEMA = closed({ contract: fixed(V5_ADMISSION_CONTRACT), capability, key: text, eventAt: text,
  encoding: fixed(V5_CAPTURE_ENCODING), authority: closed({ ...authorityFields, request: closed(nativeRequestFields) }) });
export const V5_CAPTURED_JOURNAL_SCHEMA = closed({ contract: fixed(V5_OPERATION_CONTRACT), admission: V5_CAPTURED_ADMISSION_SCHEMA,
  checkpoint: choice(V5_CHECKPOINTS), etag: text, outcome: choice(['Running', 'Completed', 'RecoveryHold']), controlReadback: control },
  { holdReason: text, controlIntent: closed({ before: control, after: controlAfter }) });
export const V5_CAPTURED_SNAPSHOT_SCHEMA = closed({ contract: fixed(EXACT_BODY_V5.storage), key: text,
  admission: V5_CAPTURED_ADMISSION_SCHEMA, body: text });
export const V5_CAPTURED_RECEIPT_SCHEMA = closed({ contract: fixed(EXACT_BODY_V5.receipt), key: text,
  snapshot: V5_CAPTURED_SNAPSHOT_SCHEMA, nativeCreated: text });

const nonBlank = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const utc = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const equal = (left: unknown, right: unknown): boolean => v4Canonical(left) === v4Canonical(right);
const bounded = (body: string): void => { requireThat(BufferByteLength(body) <= V5_MAX_BYTES); };
const parsed = (body: string, schema: object): unknown => {
  bounded(body); const result = parseV4Canonical(body); assertV4Schema(result, schema); return result;
};
const coordinates = (value: { itemId: number; etag: string; version: string }): void => {
  requireThat(Number.isSafeInteger(value.itemId) && value.itemId > 0 && v4Etag(value.etag) && nonBlank(value.version));
};
const nativeCoordinates = (value: { siteId: string; webId: string; listId: string; itemId: number; etag: string; version: string }): void => {
  coordinates(value);
  requireThat([value.siteId, value.webId, value.listId].every(id => /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(id)));
};
/** Native text remains byte-for-byte data, including its original field order/whitespace. */
const innerObject = (body: string): Record<string, unknown> => {
  bounded(body);
  const value = JSON.parse(body) as unknown;
  requireThat(!!value && typeof value === 'object' && !Array.isArray(value));
  // Reuse the strict scalar/depth walker for the decoded value; never save this validation representation.
  parseV4Canonical(v4Canonical(value));
  return value as Record<string, unknown>;
};

/** Canonical representation only; this does not assert any request or native authority. */
export function v5Canonical(value: unknown): string {
  const body = v4Canonical(value); bounded(body); parseV4Canonical(body); return body;
}

export function parseV5ReferenceSet(body: string): V5ReferenceSet {
  const result = parsed(body, V5_REFERENCE_SCHEMA) as V5ReferenceSet;
  requireThat(utc(result.asOf));
  const keys = new Set<string>(); let deliveryCount = 0, taxonomyCount = 0;
  result.rows.forEach(item => {
    coordinates(item); requireThat(nonBlank(item.key));
    // Encode the pair so delimiters in historical reference keys cannot alias a different row.
    const identity = v4Canonical([item.kind, item.key]); requireThat(!keys.has(identity)); keys.add(identity);
    if (item.kind !== 'DeliveryConfiguration' && item.kind !== 'ImpactTaxonomy') {
      parseV4Canonical(item.body); return; // Existing kind-specific domain semantics belong to the V5 admission unit.
    }
    nativeCoordinates(item.native);
    requireThat(['itemId', 'etag', 'version'].every(key => item[key as 'itemId' | 'etag' | 'version'] === item.native[key as 'itemId' | 'etag' | 'version']));
    innerObject(item.nativeMetadataBody);
    const publication = innerObject(item.body);
    assertV4Schema(publication, item.kind === 'DeliveryConfiguration' ? { anyOf: [globalPublication, managerPublication] } : taxonomyPublication);
    const payload = publication.payload as { authority: Record<string, unknown> };
    const pin = payload.authority;
    requireThat(nonBlank(pin.version) && v4Etag(pin.etag) && typeof pin.contentSha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(pin.contentSha256));
    requireThat(item.key === pin[item.kind === 'DeliveryConfiguration' ? 'configurationId' : 'taxonomyId']);
    if (item.kind === 'DeliveryConfiguration') {
      deliveryCount++;
      requireThat(pin.version === item.native.version && pin.etag === item.native.etag);
      const delivery = publication as unknown as GovernedDeliveryPublicationProposal;
      if (delivery.scope.kind === 'GlobalDefault' && 'configSource' in delivery.provenance) {
        requireThat(delivery.scope.year === delivery.provenance.configSource.performanceYear);
      } else if (delivery.scope.kind === 'WorkplanOverride' && 'workplanSource' in delivery.provenance) {
        const observed = delivery.provenance.workplanSource;
        nativeCoordinates(observed.native);
        nativeCoordinates(delivery.provenance.actorSource.native);
        nativeCoordinates(delivery.provenance.subjectSource.native);
        requireThat(delivery.scope.workplan === observed.value.workplanKey && delivery.scope.person === observed.value.personKey
          && delivery.scope.year === observed.value.performanceYear && delivery.scope.year === delivery.provenance.baseline.scope.year
          && observed.native.itemId === observed.value.id && observed.native.etag === observed.value.etag);
      } else fail();
    } else taxonomyCount++; // PD-02 authority pins are deliberately distinct from native document coordinates.
  });
  requireThat(deliveryCount === 1 && taxonomyCount === 1);
  return result;
}

const identityFields = (request: V5Request): void => {
  assertV4Schema(request.capability, capability);
  requireThat(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(request.command)
    && nonBlank(request.person) && !request.person.includes('|') && Number.isInteger(request.year) && request.year >= 2000 && request.year <= 9999);
};
export function v5IdentityKey(request: V5Request): string {
  identityFields(request);
  return [...Object.values(EXACT_BODY_V5), V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT,
    V5_OPERATION_CONTRACT, OPTION_E_DRAFT_V2_SCHEMA_VERSION, request.person, request.year, request.command].join('|');
}
export function parseV5Request(body: string): V5Request {
  const request = parsed(body, V5_WIRE_SCHEMA) as V5Request;
  identityFields(request); requireThat(nonBlank(request.workplan)); coordinates(request.source);
  parseCanonicalOptionEDraftV2(request.source.body); parseV5ReferenceSet(request.referenceBody);
  return request;
}
const checkControl = (value: V5Authority['control'], withEtag = true): void => {
  requireThat(nonBlank(value.workplan) && nonBlank(value.person) && !value.person.includes('|') && nonBlank(value.manager)
    && value.aclEpoch <= value.hierarchyEpoch && (!withEtag || v4Etag(value.etag)));
};
const checkAuthority = (value: V5Authority): void => {
  const request = parseV5Request(value.request.body);
  requireThat(equal(request, value.request.query) && equal(request.source, value.draft)
    && equal(parseV5ReferenceSet(request.referenceBody), value.references));
  coordinates(value.request); coordinates(value.draft);
  [value.actor, value.manager].forEach(personValue => requireThat(nonBlank(personValue.key) && !personValue.key.includes('|') && nonBlank(personValue.version)));
  checkControl(value.control); nativeCoordinates(value.workplan.native);
  const wp = value.workplan.value;
  requireThat(value.workplan.native.itemId === wp.id && value.workplan.native.etag === wp.etag
    && wp.workplanKey === request.workplan && wp.personKey === request.person && wp.performanceYear === request.year
    && value.control.workplan === request.workplan && value.control.person === request.person && value.control.year === request.year
    && value.control.draftId === value.draft.itemId && value.actor.key === request.person && value.manager.key === value.control.manager);
};
const checkAdmission = (value: V5Admission): void => {
  checkAuthority(value.authority);
  requireThat(utc(value.eventAt) && value.key === v5IdentityKey(value.authority.request.query));
};
export function parseV5Admission(body: string): V5Admission {
  const value = parsed(body, admission) as V5Admission; checkAdmission(value); return value;
}
const checkJournal = (value: V5JournalOperation): void => {
  checkAdmission(value.admission); checkControl(value.controlReadback); requireThat(v4Etag(value.etag));
  const fixedControl = ['workplan', 'person', 'year', 'draftId', 'manager', 'hierarchyEpoch'] as const;
  const sameControl = (candidate: Omit<V5Authority['control'], 'etag'>): void => {
    requireThat(fixedControl.every(key => candidate[key] === value.admission.authority.control[key]));
  };
  sameControl(value.controlReadback);
  if (value.controlIntent) {
    checkControl(value.controlIntent.before); checkControl(value.controlIntent.after as V5Authority['control'], false);
    sameControl(value.controlIntent.before); sameControl(value.controlIntent.after);
  }
};
export function parseV5JournalOperation(body: string): V5JournalOperation {
  const value = parsed(body, operation) as V5JournalOperation; checkJournal(value); return value;
}
const checkSnapshot = (value: V5Snapshot): void => {
  checkAdmission(value.admission);
  requireThat(value.key === value.admission.key && value.body === value.admission.authority.draft.body);
};
export function parseV5Snapshot(body: string): V5Snapshot {
  const value = parsed(body, snapshot) as V5Snapshot; checkSnapshot(value); return value;
}
const checkReceipt = (value: V5Receipt): void => {
  checkSnapshot(value.snapshot);
  requireThat(value.key === value.snapshot.key && value.key === value.snapshot.admission.key && utc(value.nativeCreated));
  // Structural consistency is not immutable replay admission: the later executor must compare the full captured admission.
};
export function parseV5Receipt(body: string): V5Receipt {
  const value = parsed(body, receipt) as V5Receipt; checkReceipt(value); return value;
}

/** Closed object validation only. No bytes/storage/origin admission; raw inner frames retain their own limits.
 * The finite closed schemas bound object depth; v4Canonical checks every scalar/Unicode value without
 * applying a persisted byte limit to the expanded view. Captured encoders bound the actual stored bytes.
 */
const validationView = <T>(value: unknown, schema: object, check: (view: T) => void): T => {
  assertV4Schema(value, schema); v4Canonical(value); check(value as T); return value as T;
};
export const validateV5AdmissionView = (value: unknown): V5Admission => validationView(value, admission, checkAdmission);
export const validateV5JournalOperationView = (value: unknown): V5JournalOperation => validationView(value, operation, checkJournal);
export const validateV5SnapshotView = (value: unknown): V5Snapshot => validationView(value, snapshot, checkSnapshot);
export const validateV5ReceiptView = (value: unknown): V5Receipt => validationView(value, receipt, checkReceipt);
