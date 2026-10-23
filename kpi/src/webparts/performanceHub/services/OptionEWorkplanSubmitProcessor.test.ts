import { createHash } from 'node:crypto';
import {
  canonicaliseOptionEDraft,
  type IOptionEWorkplanDraftAggregate
} from '../models/OptionEWorkplanDraftModels';
import type {
  IOptionEAuthoritativeReferenceReadback,
  IOptionEAutomationPrincipalIds,
  IOptionEAclAssignmentTuple,
  IOptionEAclVerification,
  IOptionECanonicalDraftDto,
  IOptionEPeopleRow,
  IOptionEProtectedWorkplanDto,
  IOptionESubmitAudit,
  IOptionESubmitAuditWrite,
  IOptionESubmitOperation,
  IOptionESubmitRequestReadback,
  IOptionESubmitRoleIds,
  IOptionESubmitSnapshot,
  IOptionEWorkplanSubmitPayload,
  OptionESubmitCheckpoint
} from '../models/OptionEWorkplanSubmitModels';
import {
  OPTION_E_ACL_CONNECTION_REFERENCE,
  OptionEWorkplanSubmitProcessor,
  type IOptionEControlPatch,
  type IOptionESubmitAclContext,
  type IOptionESubmitProcessorStore
} from './OptionEWorkplanSubmitProcessor';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sha = (value: string): string => createHash('sha256').update(value).digest('hex').toUpperCase();
const coreDigest = (payload: IOptionEWorkplanDraftAggregate, year = 2027): string => sha(payload.core.entries
  .map(entry => `${entry.kpiId}|${entry.kpiVersionKey}|${entry.targetVersionKey}|${year}`).sort().join('\n'));

const aggregate = (): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1',
  core: {
    weightingMode: 'Equal',
    entries: [{
      coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1',
      role: 'Owner', contributionMethod: 'AdditiveDirect', weightPercent: 100,
      annual: { value: 10, success: 'Annual' }, q1: { value: 1 }, q2: { value: 2 },
      q3: { value: 3 }, q4: { value: 4 }
    }]
  },
  impact: [{
    impactId: 'IMPACT-1', wording: 'Improve service', measure: 'Cases', unit: 'count',
    annual: 10, q1: 1, q2: 2, q3: 3, q4: 4, success: 'Delivered'
  }],
  behaviours: {
    frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: Array.from({ length: 5 }, (_, index) => {
      const valueId = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
      return {
        valueId,
        descriptorKey: `KCCC-BEHAVIOUR|v02|IC_OFFICER|${valueId}`,
        guidancePromptKeys: Array.from({ length: 5 }, (__, promptIndex) => `${valueId}|L1|${promptIndex + 1}`),
        selectedPromptKeys: [`${valueId}|L1|1`], commitment: `Commitment ${index + 1}`,
        periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' }
      };
    }),
    governedExtension: {
      schemaVersion: 'kcf.option-e.behaviours/v02',
      authority: { catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS',
        catalogueVersion: 'KCF-BHV-PD03-2026.09-v2', catalogueRevision: 7,
        catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
        approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' },
      roleLevelCode: 'L1',
      headlines: Array.from({ length: 5 }, (_, index) => {
        const behaviourKey = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
        return { behaviourKey, headlineTitle: `Headline ${index + 1}`, selections: [{
          selectionKey: index === 0 ? `${behaviourKey}-L1-01` : `${behaviourKey}-OWN-ABCDEF`,
          source: index === 0 ? 'Catalogue' as const : 'Own' as const, behaviourKey,
          headlineTitle: `Headline ${index + 1}`, focusKey: `${behaviourKey}-FOCUS-01`, focusTitle: `Focus ${index + 1}`,
          roleLevelCode: 'L1' as const,
          ...(index === 0 ? { targetKey: `${behaviourKey}-L1-01` } : {}),
          selectedWording: index === 0 ? 'Approved target 1' : `Commitment ${index + 1}`,
          catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'KCF-BHV-PD03-2026.09-v2',
          catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
          myCommitment: `Commitment ${index + 1}`, howWillWeKnow: `Evidence ${index + 1}`
        }] };
      }),
      immutableSelectionSnapshots: true, legacyTargetRatingWeightFieldsWritten: false,
      deliveryArithmeticAffected: false
    }
  }
});

const request = (client = 'fb1f6035-236e-434c-ae05-a78003badd47'): IOptionESubmitRequestReadback => {
  const draft = aggregate();
  const payload = canonicaliseOptionEDraft(draft);
  return {
    RequestKey: `EMP-001|2027|${client}`, PersonKey: 'EMP-001', PerformanceYear: 2027,
    WorkplanKey: 'EMP-001|2027', ClientSubmitID: client, DraftItemID: 41, DraftETag: '"draft-4"',
    DraftVersion: '4.0', DraftSchemaVersion: draft.schemaVersion, PayloadJSON: payload,
    PayloadSHA256: sha(payload), FrameworkVersion: draft.behaviours.frameworkVersion,
    CatalogueVersion: coreDigest(draft), ClientSubmittedAt: '2026-09-18T03:00:00.000Z',
    id: 91, etag: '"request-1"', createdByEmail: 'employee@example.invalid'
  };
};

const referenceReadback = (
  personKey: string,
  performanceYear: number
): IOptionEAuthoritativeReferenceReadback => {
  const payload = aggregate();
  const extension = payload.behaviours.governedExtension!;
  const snapshots = extension.headlines.flatMap(headline => headline.selections);
  return ({
  coreKpis: payload.core.entries.map(entry => ({
    kpiId: entry.kpiId, kpiVersionKey: entry.kpiVersionKey, active: true
  })),
  coreTargets: payload.core.entries.map(entry => ({
    targetVersionKey: entry.targetVersionKey, kpiId: entry.kpiId, performanceYear, status: 'Approved'
  })),
  frameworkSets: [{ frameworkVersion: payload.behaviours.frameworkVersion, published: true, immutable: true }],
  behaviourValues: payload.behaviours.entries.map((entry, index) => ({
    frameworkValueKey: `${payload.behaviours.frameworkVersion}|${entry.valueId}`,
    frameworkVersion: payload.behaviours.frameworkVersion, valueId: entry.valueId,
    governedOrder: index + 1, roleTier: payload.behaviours.roleTier, descriptorKey: entry.descriptorKey
  })),
  personAssignments: [{
    personKey, frameworkVersion: payload.behaviours.frameworkVersion,
    roleTier: payload.behaviours.roleTier, roleLevelCode: extension.roleLevelCode, active: true
  }],
  prompts: payload.behaviours.entries.flatMap(entry => entry.guidancePromptKeys.map(promptKey => ({
    promptKey, behaviourKey: entry.valueId, roleTier: payload.behaviours.roleTier, active: true
  }))),
  governedBehaviourAuthority: { ...extension.authority, published: true, immutable: true,
    asOfDate: '2026-09-18', effectiveFrom: '2026-09-01' },
  governedBehaviourHeadlines: extension.headlines.map((headline, index) => ({
    behaviourKey: headline.behaviourKey, headlineTitle: headline.headlineTitle, governedOrder: index + 1
  })),
  governedBehaviourFocuses: snapshots.map(snapshot => ({
    behaviourKey: snapshot.behaviourKey, focusKey: snapshot.focusKey, focusTitle: snapshot.focusTitle,
    roleLevelCode: snapshot.roleLevelCode, status: 'Published' as const, effectiveFrom: '2026-09-01'
  })),
  governedBehaviourTargets: snapshots.filter(snapshot => snapshot.source === 'Catalogue').map(snapshot => ({
    behaviourKey: snapshot.behaviourKey, focusKey: snapshot.focusKey, focusTitle: snapshot.focusTitle,
    roleLevelCode: snapshot.roleLevelCode, status: 'Published' as const, effectiveFrom: '2026-09-01',
    targetKey: snapshot.targetKey!, selectedWording: snapshot.selectedWording
  }))
});
};

type DraftMutator = (rows: IOptionECanonicalDraftDto[], read: number) => void;
type DeepMutable<T> = T extends readonly (infer U)[] ? Array<DeepMutable<U>>
  : T extends object ? { -readonly [P in keyof T]: DeepMutable<T[P]> } : T;
type MutableReference = DeepMutable<IOptionEAuthoritativeReferenceReadback>;
type MutableAggregate = DeepMutable<IOptionEWorkplanDraftAggregate>;
type MutableAcl = DeepMutable<IOptionEAclVerification>;
type ReferenceMutator = (value: MutableReference, read: number) => void;
type AclMutator = (value: MutableAcl) => void;

class MemoryStore implements IOptionESubmitProcessorStore {
  public readonly requests = new Map<string, IOptionESubmitRequestReadback>();
  public readonly operations = new Map<string, IOptionESubmitOperation>();
  public readonly snapshots = new Map<string, IOptionESubmitSnapshot>();
  public readonly audits = new Map<string, IOptionESubmitAudit>();
  public readonly writes: string[] = [];
  public readonly throwAfterCommit = new Set<string>();
  public readonly trustedReferences: IOptionEAuthoritativeReferenceReadback;
  public draftRows: IOptionECanonicalDraftDto[];
  public draftMutator?: DraftMutator;
  public referenceMutator?: ReferenceMutator;
  public aclMutator?: AclMutator;
  public throwDraftRead = false;
  public throwReferenceRead = false;
  public throwHash = false;
  public staleControlOnRead = false;
  public nativeCreatedAt = '2026-09-18T03:01:00.000Z';
  public aclRevocations = 0;
  public people: IOptionEPeopleRow[] = [
    { personKey: 'EMP-001', email: 'employee@example.invalid', principalId: 201,
      managerPersonKey: 'MGR-001', managerEmail: 'manager@example.invalid', active: true },
    { personKey: 'MGR-001', email: 'manager@example.invalid', principalId: 202, active: true }
  ];
  public automationPrincipalIds: IOptionEAutomationPrincipalIds = {
    contentProcessor: 301, aclReconciler: 302, recoveryAdmin: 303
  };
  public roleIds: IOptionESubmitRoleIds = {
    itemReader: 101, addReadNoEdit: 102, draftEditor: 103,
    mutatorNoDelete: 104, aclReconciler: 105, fullControl: 106
  };
  public control: IOptionEProtectedWorkplanDto = {
    workplanKey: 'EMP-001|2027', personKey: 'EMP-001', performanceYear: 2027, draftItemId: 41,
    draftSchemaVersion: 'kcf.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
    managerPersonKey: 'MGR-001', hierarchyEpoch: 4, aclEpoch: 4, etag: '"control-1"'
  };
  private revision = 1;
  private draftReadCount = 0;
  private referenceReadCount = 0;

  public constructor(...items: IOptionESubmitRequestReadback[]) {
    items.forEach(item => this.requests.set(item.RequestKey, clone(item)));
    const seed = items[0] || request();
    this.trustedReferences = referenceReadback(seed.PersonKey, seed.PerformanceYear);
    this.draftRows = [{
      itemId: seed.DraftItemID, etag: seed.DraftETag, version: seed.DraftVersion,
      schemaVersion: seed.DraftSchemaVersion, payloadJson: seed.PayloadJSON,
      payloadSha256: seed.PayloadSHA256, frameworkVersion: seed.FrameworkVersion,
      catalogueVersion: seed.CatalogueVersion
    }];
  }

  private etag(kind: string): string { this.revision += 1; return `"${kind}-${this.revision}"`; }
  private failAfter(name: string): void {
    if (this.throwAfterCommit.delete(name)) throw new Error(`Simulated timeout after ${name}`);
  }
  public async sha256(value: string): Promise<string> {
    if (this.throwHash) throw new Error('Hash unavailable');
    return sha(value);
  }
  public async readRequest(key: string): Promise<IOptionESubmitRequestReadback | undefined> {
    const value = this.requests.get(key); return value && clone(value);
  }
  public async findActivePeopleByEmail(email: string): Promise<readonly IOptionEPeopleRow[]> {
    return clone(this.people.filter(item => item.active && item.email.toLowerCase() === email.toLowerCase()));
  }
  public async findActivePeopleByPersonKey(personKey: string): Promise<readonly IOptionEPeopleRow[]> {
    return clone(this.people.filter(item => item.active && item.personKey === personKey));
  }
  public async findWorkplanByActorAndDraft(personKey: string, draftItemId: number): Promise<readonly IOptionEProtectedWorkplanDto[]> {
    return this.control.personKey === personKey && this.control.draftItemId === draftItemId ? [clone(this.control)] : [];
  }
  public async readAuthoritativeDraft(): Promise<readonly IOptionECanonicalDraftDto[]> {
    if (this.throwDraftRead) throw new Error('Draft read failed');
    this.draftReadCount += 1;
    const rows = clone(this.draftRows);
    this.draftMutator?.(rows, this.draftReadCount);
    return rows;
  }
  public async readCurrentGovernedReferences(
    _payload: IOptionEWorkplanSubmitPayload,
    _personKey: string,
    _performanceYear: number
  ): Promise<IOptionEAuthoritativeReferenceReadback> {
    if (this.throwReferenceRead) throw new Error('Reference read failed');
    this.referenceReadCount += 1;
    const value = clone(this.trustedReferences);
    this.referenceMutator?.(value as MutableReference, this.referenceReadCount);
    return clone(value);
  }
  public async readAutomationPrincipalIds(): Promise<IOptionEAutomationPrincipalIds> {
    return clone(this.automationPrincipalIds);
  }
  public async readSubmitRoleIds(): Promise<IOptionESubmitRoleIds> { return clone(this.roleIds); }
  public async readOperation(key: string): Promise<IOptionESubmitOperation | undefined> {
    const value = this.operations.get(key); return value && clone(value);
  }
  public async createOperation(value: Omit<IOptionESubmitOperation, 'etag'>): Promise<IOptionESubmitOperation> {
    const existing = this.operations.get(value.operationKey);
    if (existing) return clone(existing);
    const created = { ...clone(value), etag: this.etag('operation') };
    this.operations.set(value.operationKey, created); this.writes.push('OperationCreated');
    this.failAfter('OperationCreated'); return clone(created);
  }
  public async updateOperation(
    key: string, expectedEtag: string,
    patch: Partial<Omit<IOptionESubmitOperation, 'operationKey' | 'requestKey' | 'etag'>>
  ): Promise<IOptionESubmitOperation> {
    const current = this.operations.get(key);
    if (!current || current.etag !== expectedEtag) throw new Error('Operation ETag conflict');
    const updated = { ...current, ...clone(patch), etag: this.etag('operation') };
    this.operations.set(key, updated); this.writes.push(`Operation:${updated.checkpoint}:${updated.outcome}`);
    this.failAfter(`Operation:${updated.checkpoint}`); return clone(updated);
  }
  public async readControl(): Promise<IOptionEProtectedWorkplanDto | undefined> {
    if (this.staleControlOnRead) {
      this.staleControlOnRead = false;
      this.control = { ...this.control, transitionStatus: 'Submitting', etag: this.etag('control') };
    }
    return clone(this.control);
  }
  public async compareAndSwapControl(
    _key: string, expectedEtag: string, patch: IOptionEControlPatch
  ): Promise<IOptionEProtectedWorkplanDto> {
    if (this.control.etag !== expectedEtag) throw new Error('Control ETag conflict');
    this.control = { ...this.control, ...clone(patch), etag: this.etag('control') };
    this.writes.push(`Control:${this.control.transitionStatus}`);
    this.failAfter(`Control:${this.control.transitionStatus}`); return clone(this.control);
  }
  public async readSnapshot(key: string): Promise<IOptionESubmitSnapshot | undefined> {
    const value = this.snapshots.get(key); return value && clone(value);
  }
  public async createSnapshot(value: IOptionESubmitSnapshot): Promise<IOptionESubmitSnapshot> {
    const existing = this.snapshots.get(value.snapshotKey);
    if (existing) return clone(existing);
    this.snapshots.set(value.snapshotKey, clone(value)); this.writes.push('Snapshot');
    this.failAfter('Snapshot'); return clone(value);
  }
  public async readAudit(key: string): Promise<IOptionESubmitAudit | undefined> {
    const value = this.audits.get(key); return value && clone(value);
  }
  public async createAudit(value: IOptionESubmitAuditWrite): Promise<IOptionESubmitAudit> {
    const existing = this.audits.get(value.auditKey);
    if (existing) return clone(existing);
    const created: IOptionESubmitAudit = { ...clone(value), nativeCreatedAt: this.nativeCreatedAt };
    this.audits.set(value.auditKey, created); this.writes.push('Audit');
    this.failAfter('Audit'); return clone(created);
  }
  public async frameworkSnapshot(version: string): Promise<string> {
    return JSON.stringify({ version, immutable: true });
  }
  public async catalogueSnapshot(version: string): Promise<string> {
    return JSON.stringify({ version, immutable: true });
  }
  private aclProof(context: IOptionESubmitAclContext): IOptionEAclVerification {
    expect(context.connectionReference).toBe(OPTION_E_ACL_CONNECTION_REFERENCE);
    const role = (
      roleDefinitionId: number, roleName: string, roleTypeKind: number, roleHigh: number, roleLow: number
    ): Pick<IOptionEAclAssignmentTuple,
      'roleDefinitionId' | 'roleName' | 'roleTypeKind' | 'roleHigh' | 'roleLow'> =>
      ({ roleDefinitionId, roleName, roleTypeKind, roleHigh, roleLow });
    const tuple = (
      principalId: number, principalKey: string,
      roleValue: ReturnType<typeof role>
    ): IOptionEAclAssignmentTuple => ({ principalId, principalKey, principalType: 1, ...roleValue });
    const reader = role(context.roleIds.itemReader, 'KCF KPI Option E Item Reader v1', 0, 0, 1);
    const addReader = role(context.roleIds.addReadNoEdit, 'KCF KPI Option E Add Read No Edit v1', 0, 0, 3);
    const draftEditor = role(context.roleIds.draftEditor, 'KCF KPI Option E Draft Editor v1', 0, 0, 5);
    const mutator = role(context.roleIds.mutatorNoDelete, 'KCF KPI Option E Mutator No Delete v1', 0, 0, 7);
    const reconciler = role(context.roleIds.aclReconciler, 'KCF KPI Option E ACL Reconciler v1', 0, 0, 33554433);
    const fullControl = role(context.roleIds.fullControl, 'Full Control', 5, 2147483647, 4294967295);
    const system = (contentRole: ReturnType<typeof role>): IOptionEAclAssignmentTuple[] => [
      tuple(context.automationPrincipalIds.contentProcessor, 'contentProcessor', contentRole),
      tuple(context.automationPrincipalIds.aclReconciler, 'aclReconciler', reconciler),
      tuple(context.automationPrincipalIds.recoveryAdmin, 'recoveryAdmin', fullControl)
    ];
    const subject = `${context.control.performanceYear}/${context.control.personKey}`;
    const targets = [
      { target: `KCFKPI_WorkplanDrafts/${subject}/${context.request.DraftItemID}`,
        assignments: [...system(mutator), tuple(context.actor.principalId, context.actor.email, reader)] },
      { target: `KCFKPI_WorkplanSubmittedSnapshots/${subject}/${context.snapshotKey}`,
        assignments: [...system(addReader), tuple(context.actor.principalId, context.actor.email, reader),
          tuple(context.manager.principalId, context.manager.email, reader)] },
      { target: `KCFKPI_WorkplanSubmitOperations/${subject}/SafeOperation`,
        assignments: [...system(mutator), tuple(context.actor.principalId, context.actor.email, reader),
          tuple(context.manager.principalId, context.manager.email, reader)] },
      { target: `KCFKPI_Workplans/${subject}/ControlItem`,
        assignments: [...system(draftEditor), tuple(context.actor.principalId, context.actor.email, reader),
          tuple(context.manager.principalId, context.manager.email, reader)] }
    ].map(item => ({
      ...item, canonicalCollectionPath: `${item.target}/RoleAssignments`,
      pageCount: 1, totalCount: item.assignments.length, complete: true, continuationUris: []
    }));
    const proof: IOptionEAclVerification = {
      targets, hierarchyEpoch: context.control.hierarchyEpoch, aclEpoch: context.control.hierarchyEpoch
    };
    this.aclMutator?.(proof as MutableAcl);
    return clone(proof);
  }
  public async applyAndReadBackAcl(context: IOptionESubmitAclContext): Promise<IOptionEAclVerification> {
    const result = this.aclProof(context); this.writes.push('Acl'); this.failAfter('Acl'); return result;
  }
  public async readBackAcl(context: IOptionESubmitAclContext): Promise<IOptionEAclVerification> {
    return this.aclProof(context);
  }
  public async revokeUnverifiedManager(): Promise<void> { this.aclRevocations += 1; this.writes.push('AclRevoke'); }
  public now(): string { return '2026-09-18T03:01:00.000Z'; }
}

const expectZeroWriteFailure = async (store: MemoryStore): Promise<void> => {
  await expect(new OptionEWorkplanSubmitProcessor(store).process(request().RequestKey)).rejects.toThrow();
  expect(store.writes).toEqual([]);
  expect(store.operations.size).toBe(0);
  expect(store.snapshots.size).toBe(0);
  expect(store.audits.size).toBe(0);
};

const selfConsistentRequest = (mutate: (draft: MutableAggregate) => void): IOptionESubmitRequestReadback => {
  const item = request();
  const draft = clone(aggregate()) as MutableAggregate;
  mutate(draft);
  item.PayloadJSON = canonicaliseOptionEDraft(draft);
  item.PayloadSHA256 = sha(item.PayloadJSON);
  return item;
};

describe('B13-05 integrated Option-E Submit processor security repair', () => {
  it('proves Draft A and governed references before operation, completes, and snapshots Request A after later Draft B', async () => {
    const item = request();
    const store = new MemoryStore(item);
    const payloadA = item.PayloadJSON;
    const processor = new OptionEWorkplanSubmitProcessor(store, {
      afterCheckpoint: checkpoint => {
        if (checkpoint === 'ControlClaimed') {
          const changed = aggregate();
          changed.impact[0].wording = 'Later mutable Draft B';
          const payloadB = canonicaliseOptionEDraft(changed);
          store.draftRows[0] = {
            ...store.draftRows[0], etag: '"draft-5"', version: '5.0',
            payloadJson: payloadB, payloadSha256: sha(payloadB)
          };
        }
      }
    });
    await expect(processor.process(item.RequestKey)).resolves.toMatchObject({ checkpoint: 'Completed', outcome: 'Completed' });
    expect(store.snapshots.get(item.RequestKey)?.payloadJson).toBe(payloadA);
    expect(store.snapshots.get(item.RequestKey)?.payloadJson).not.toBe(store.draftRows[0].payloadJson);
    expect(store.writes).toEqual(expect.arrayContaining(['OperationCreated', 'Snapshot', 'Audit', 'Acl', 'Control:Ready']));
  });

  it.each([
    ['payload-only mismatch', (store: MemoryStore) => { store.draftRows[0].payloadJson += ' '; }],
    ['hash-only mismatch', (store: MemoryStore) => { store.draftRows[0].payloadSha256 = 'A'.repeat(64); }],
    ['recomputed forged pair', (store: MemoryStore) => {
      const changed = aggregate(); changed.impact[0].wording = 'Forged';
      store.draftRows[0].payloadJson = canonicaliseOptionEDraft(changed);
      store.draftRows[0].payloadSha256 = sha(store.draftRows[0].payloadJson);
    }],
    ['Draft ETag drift', (store: MemoryStore) => { store.draftRows[0].etag = '"draft-5"'; }],
    ['Draft version drift', (store: MemoryStore) => { store.draftRows[0].version = '5.0'; }],
    ['two-read drift', (store: MemoryStore) => {
      store.draftMutator = (rows, read) => { if (read === 2) rows[0].etag = '"drift"'; };
    }],
    ['missing Draft', (store: MemoryStore) => { store.draftRows = []; }],
    ['duplicate Draft', (store: MemoryStore) => { store.draftRows.push(clone(store.draftRows[0])); }],
    ['Draft connector error', (store: MemoryStore) => { store.throwDraftRead = true; }],
    ['hash connector error', (store: MemoryStore) => { store.throwHash = true; }],
    ['stale protected state', (store: MemoryStore) => { store.staleControlOnRead = true; }]
  ])('rejects %s with zero operation/snapshot/audit/control/ACL writes', async (_name, mutate) => {
    const store = new MemoryStore(request()); mutate(store); await expectZeroWriteFailure(store);
  });

  it('rejects invalid saved aggregate bytes with zero protected writes', async () => {
    const item = request();
    item.PayloadJSON = '{"schemaVersion":"wrong"}'; item.PayloadSHA256 = sha(item.PayloadJSON);
    const store = new MemoryStore(item);
    await expectZeroWriteFailure(store);
  });

  it.each([
    ['self-consistent selected wording substitution', (draft: MutableAggregate) => {
      draft.behaviours.governedExtension!.headlines[1].selections[0].selectedWording = 'Injected wording';
    }],
    ['self-consistent authority version substitution', (draft: MutableAggregate) => {
      const extension = draft.behaviours.governedExtension!;
      extension.authority.catalogueVersion = 'KCF-BHV-INJECTED-v9';
      extension.headlines.forEach(headline => headline.selections.forEach(selection => {
        selection.catalogueVersion = extension.authority.catalogueVersion;
      }));
    }],
    ['self-consistent authority ETag substitution', (draft: MutableAggregate) => {
      const extension = draft.behaviours.governedExtension!;
      extension.authority.catalogueEtag = '"catalogue-injected"';
      extension.headlines.forEach(headline => headline.selections.forEach(selection => {
        selection.catalogueEtag = extension.authority.catalogueEtag;
      }));
    }],
    ['self-consistent authority hash substitution', (draft: MutableAggregate) => {
      const extension = draft.behaviours.governedExtension!;
      extension.authority.catalogueContentSha256 = 'B'.repeat(64);
      extension.headlines.forEach(headline => headline.selections.forEach(selection => {
        selection.catalogueContentSha256 = extension.authority.catalogueContentSha256;
      }));
    }],
    ['self-consistent role substitution', (draft: MutableAggregate) => {
      const extension = draft.behaviours.governedExtension!;
      extension.roleLevelCode = 'L2';
      extension.headlines.forEach(headline => headline.selections.forEach(selection => {
        selection.roleLevelCode = 'L2';
      }));
      const selection = extension.headlines[0].selections[0];
      selection.selectionKey = 'BHV-01-L2-01'; selection.targetKey = 'BHV-01-L2-01';
    }],
    ['self-consistent focus substitution', (draft: MutableAggregate) => {
      const selection = draft.behaviours.governedExtension!.headlines[1].selections[0];
      selection.focusKey = 'BHV-02-FOCUS-09'; selection.focusTitle = 'Injected focus';
    }],
    ['self-consistent target substitution', (draft: MutableAggregate) => {
      const selection = draft.behaviours.governedExtension!.headlines[0].selections[0];
      selection.selectionKey = 'BHV-01-L1-02'; selection.targetKey = 'BHV-01-L1-02';
      selection.focusKey = 'BHV-01-FOCUS-02'; selection.focusTitle = 'Injected focus';
      selection.selectedWording = 'Injected approved target';
    }]
  ])('rejects %s against independent trusted catalogue and assignment state', async (_name, mutate) => {
    const item = selfConsistentRequest(mutate);
    await expectZeroWriteFailure(new MemoryStore(item));
  });

  it.each([
    ['substituted Core KPI', (value: MutableReference) => { value.coreKpis[0].kpiId = 'KPI-X'; }],
    ['stale Core version', (value: MutableReference) => { value.coreKpis[0].kpiVersionKey = 'KPI-1|old'; }],
    ['wrong target year', (value: MutableReference) => { value.coreTargets[0].performanceYear = 2026; }],
    ['cross-KPI target', (value: MutableReference) => { value.coreTargets[0].kpiId = 'KPI-X'; }],
    ['missing framework', (value: MutableReference) => { value.frameworkSets = []; }],
    ['duplicate framework', (value: MutableReference) => { value.frameworkSets.push(clone(value.frameworkSets[0])); }],
    ['wrong assigned person', (value: MutableReference) => { value.personAssignments[0].personKey = 'EMP-X'; }],
    ['wrong assigned tier', (value: MutableReference) => { value.personAssignments[0].roleTier = 'PEOPLE_MANAGER'; }],
    ['substituted descriptor', (value: MutableReference) => { value.behaviourValues[0].descriptorKey = 'substituted'; }],
    ['cross-Behaviour prompt', (value: MutableReference) => { value.prompts[0].behaviourKey = 'BHV-02'; }],
    ['wrong-tier prompt', (value: MutableReference) => { value.prompts[0].roleTier = 'PEOPLE_MANAGER'; }],
    ['missing prompt', (value: MutableReference) => { value.prompts.pop(); }],
    ['duplicate prompt', (value: MutableReference) => { value.prompts.push(clone(value.prompts[0])); }],
    ['retired governed focus', (value: MutableReference) => { value.governedBehaviourFocuses![0].status = 'Retired'; }],
    ['stale governed focus', (value: MutableReference) => { value.governedBehaviourFocuses![0].effectiveTo = '2026-09-17'; }],
    ['retired governed target', (value: MutableReference) => { value.governedBehaviourTargets![0].status = 'Retired'; }],
    ['stale governed target', (value: MutableReference) => { value.governedBehaviourTargets![0].effectiveTo = '2026-09-17'; }]
  ])('rejects %s before operation creation', async (_name, mutate) => {
    const store = new MemoryStore(request());
    store.referenceMutator = value => mutate(value);
    await expectZeroWriteFailure(store);
  });

  it('rejects protected reference read drift before operation creation', async () => {
    const store = new MemoryStore(request());
    store.referenceMutator = (value, read) => { if (read === 2) value.prompts[0].active = false as true; };
    await expectZeroWriteFailure(store);
  });

  it.each([
    ['partial page', (proof: MutableAcl) => { proof.targets[0].complete = false; }],
    ['unsafe off-origin continuation', (proof: MutableAcl) => {
      proof.targets[0].pageCount = 2; proof.targets[0].continuationUris = ['https://evil.invalid/RoleAssignments?$skiptoken=x'];
    }],
    ['cross-collection continuation', (proof: MutableAcl) => {
      proof.targets[0].pageCount = 2; proof.targets[0].continuationUris = ['KCFKPI_Workplans/x/RoleAssignments?$skiptoken=x'];
    }],
    ['extra principal', (proof: MutableAcl) => {
      proof.targets[0].assignments.push({ ...clone(proof.targets[0].assignments[0]), principalId: 999 });
      proof.targets[0].totalCount += 1;
    }],
    ['unexpected group type', (proof: MutableAcl) => { proof.targets[0].assignments[0].principalType = 8; }],
    ['wrong role ID', (proof: MutableAcl) => { proof.targets[0].assignments[0].roleDefinitionId = 999; }],
    ['wrong role name', (proof: MutableAcl) => { proof.targets[0].assignments[0].roleName = 'Edit'; }],
    ['wrong role type', (proof: MutableAcl) => { proof.targets[0].assignments[0].roleTypeKind = 5; }],
    ['wrong role mask', (proof: MutableAcl) => { proof.targets[0].assignments[0].roleLow = 8; }],
    ['duplicate tuple', (proof: MutableAcl) => {
      proof.targets[0].assignments.push(clone(proof.targets[0].assignments[0])); proof.targets[0].totalCount += 1;
    }],
    ['missing tuple', (proof: MutableAcl) => {
      proof.targets[0].assignments.pop(); proof.targets[0].totalCount -= 1;
    }]
  ])('never reaches Ready for ACL %s', async (_name, mutate) => {
    const item = request(); const store = new MemoryStore(item); store.aclMutator = mutate;
    await expect(new OptionEWorkplanSubmitProcessor(store).process(item.RequestKey)).resolves.toMatchObject({
      outcome: 'RecoveryHold', errorCode: 'AclProofMismatch'
    });
    expect(store.control.transitionStatus).toBe('RecoveryHold');
    expect(store.control.state).toBe('Submitted');
    expect(store.writes).not.toContain('Control:Ready');
    expect(store.aclRevocations).toBe(1);
  });

  it('converges post-commit timeouts without duplicate immutable evidence', async () => {
    const item = request(); const store = new MemoryStore(item);
    ['OperationCreated', 'Snapshot', 'Audit', 'Control:AclPending'].forEach(name => store.throwAfterCommit.add(name));
    await expect(new OptionEWorkplanSubmitProcessor(store).process(item.RequestKey)).resolves.toMatchObject({ outcome: 'Completed' });
    expect(store.operations.size).toBe(1);
    expect(store.snapshots.size).toBe(1);
    expect(store.audits.size).toBe(1);
  });

  it.each<readonly [OptionESubmitCheckpoint]>([['ControlClaimed'], ['SnapshotWritten'], ['AuditWritten'], ['ControlPointed'], ['AclVerified']])(
    'resumes idempotently after %s', async checkpoint => {
      const item = request(); const store = new MemoryStore(item);
      await expect(new OptionEWorkplanSubmitProcessor(store, {
        afterCheckpoint: actual => { if (actual === checkpoint) throw new Error(`interrupt:${checkpoint}`); }
      }).process(item.RequestKey)).rejects.toThrow(`interrupt:${checkpoint}`);
      await expect(new OptionEWorkplanSubmitProcessor(store).process(item.RequestKey)).resolves.toMatchObject({ outcome: 'Completed' });
      expect(store.snapshots.size).toBe(1); expect(store.audits.size).toBe(1);
    }
  );

  it('fails closed when the trusted Audit native timestamp is outside the five-minute bound', async () => {
    const item = request(); const store = new MemoryStore(item);
    store.nativeCreatedAt = '2026-09-18T04:01:00.000Z';
    await expect(new OptionEWorkplanSubmitProcessor(store).process(item.RequestKey)).resolves.toMatchObject({
      outcome: 'RecoveryHold', errorCode: 'AuditMismatchOrUncertain'
    });
  });
});
