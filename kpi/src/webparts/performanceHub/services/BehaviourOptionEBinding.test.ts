import {
  assertOptionEDraftWritable,
  canonicaliseOptionEDraft,
  parseCanonicalOptionEDraft,
  type IOptionEWorkplanDraftAggregate
} from '../models/OptionEWorkplanDraftModels';
import type { IOptionEGovernedBehaviourExtension } from '../models/OptionEWorkplanDraftModels';
import type { IBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';
import {
  buildOptionEBehaviourGovernedExtension,
  OptionEBehaviourManagerProcessor,
  type IOptionEBehaviourManagerActor,
  type IOptionEBehaviourBindingHeadline,
  type IOptionEBehaviourManagerEvent,
  type IOptionEBehaviourManagerEventProvenance,
  type IOptionEBehaviourManagerIntent,
  type IOptionEBehaviourManagerStore,
  type IOptionEBehaviourSubmittedRecord,
  type OptionEBehaviourAssignmentOutcome,
  type OptionEBehaviourAppendOutcome
} from './BehaviourOptionEBinding';

const behaviourKeys = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const catalogue = (): IBehaviourFrameworkV2Catalogue => ({
  catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'KCF-BHV-PD03-2026.09-v2', revision: 7,
  schemaVersion: '2.0', status: 'Published', effectiveFrom: '2026-09-01',
  headlineBehaviours: behaviourKeys.map((behaviourKey, index) => ({
    behaviourKey, title: `Headline ${index + 1}`, sortOrder: index + 1
  })),
  roleLevels: [
    { code: 'L1', name: 'Individual Contributor / Coach', sortOrder: 1 },
    { code: 'L2', name: 'Manager', sortOrder: 2 },
    { code: 'L3', name: 'Senior Manager / Leader', sortOrder: 3 }
  ],
  ratingScale: ['Developing', 'Effective', 'Exceptional'],
  selectionGuidance: { recommendedMinimum: 3, recommendedMaximum: 5, hardMaximum: null },
  rows: behaviourKeys.slice(0, 3).map((behaviourKey, index) => ({
    targetKey: `${behaviourKey}-L2-01`, behaviourKey, roleLevelCode: 'L2',
    focusKey: `${behaviourKey}-FOCUS-01`, focusArea: `Focus ${index + 1}`,
    suggestedTarget: `Approved example ${index + 1}`, suggestedMeasure: 'Commitment',
    suggestedUnit: 'Text', suggestedEvidence: `Evidence ${index + 1}`, status: 'Published',
    sortOrder: index + 1, effectiveFrom: '2026-09-01'
  }))
});

const authority = {
  catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS' as const,
  catalogueVersion: 'KCF-BHV-PD03-2026.09-v2', catalogueRevision: 7,
  catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
  approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' as const
};

const extension = (): IOptionEGovernedBehaviourExtension => buildOptionEBehaviourGovernedExtension({
  catalogue: catalogue(), authority, roleLevelCode: 'L2', asOfDate: '2026-09-23',
  headlines: behaviourKeys.map((behaviourKey, index) => ({
    behaviourKey,
    selections: index < 2 ? [{ source: 'Catalogue' as const, selectionKey: `${behaviourKey}-L2-01`,
      commitment: `Commitment ${index + 1}`, howWillWeKnow: `Evidence ${index + 1}` }]
      : index === 2 ? [{ source: 'Own' as const, selectionKey: `${behaviourKey}-OWN-ABCDEF`,
        focusKey: `${behaviourKey}-FOCUS-01`, focusTitle: `Focus ${index + 1}`,
        commitment: 'Coach a colleague each month', howWillWeKnow: 'Monthly feedback record' }] : []
  }))
});

const aggregate = (includeExtension: boolean): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1', core: { weightingMode: 'Equal', entries: [] }, impact: [],
  behaviours: {
    frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'PEOPLE_MANAGER',
    entries: behaviourKeys.map(valueId => ({
      valueId, descriptorKey: `KCCC-BEHAVIOUR|v02|PEOPLE_MANAGER|${valueId}`,
      guidancePromptKeys: [1, 2, 3, 4, 5].map(index => `${valueId}-L2-0${index}`),
      selectedPromptKeys: [], commitment: '', periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' }
    })),
    governedExtension: includeExtension ? extension() : undefined
  }
});

const receipt = (event: Readonly<IOptionEBehaviourManagerEvent>): IOptionEBehaviourManagerEventProvenance => ({
  contract: 'KCF.OptionEBehaviourManagerEventProvenance/v1', immutable: true, event: clone(event)
});

class MemoryStore implements IOptionEBehaviourManagerStore {
  public appendMode: OptionEBehaviourAppendOutcome = 'Appended';
  public authorisationMode: OptionEBehaviourAssignmentOutcome = 'Authorised';
  public applyBeforeUnknown = false;
  public appendCalls = 0;
  public returnReadReference = false;
  public provenanceHook?: () => void;
  public reauthorisationHook?: () => void;
  public corruptAfterAppend?: (
    record: IOptionEBehaviourSubmittedRecord
  ) => IOptionEBehaviourSubmittedRecord;
  public provenance: IOptionEBehaviourManagerEventProvenance[];
  public constructor(public current: IOptionEBehaviourSubmittedRecord,
    provenance: readonly Readonly<IOptionEBehaviourManagerEventProvenance>[] = []) {
    this.provenance = provenance.map(item => clone(item));
  }
  public async readByEmployee(employeePersonKey: string): Promise<IOptionEBehaviourSubmittedRecord | undefined> {
    return this.current.employeePersonKey === employeePersonKey
      ? this.returnReadReference ? this.current : clone(this.current) : undefined;
  }
  public async readExact(workplanKey: string, performanceYear: number,
    submittedSnapshotKey: string): Promise<IOptionEBehaviourSubmittedRecord | undefined> {
    return this.current.workplanKey === workplanKey && this.current.performanceYear === performanceYear
      && this.current.submittedSnapshotKey === submittedSnapshotKey ? clone(this.current) : undefined;
  }
  public async readTrustedEventProvenance(workplanKey: string, performanceYear: number,
    submittedSnapshotKey: string): Promise<readonly Readonly<IOptionEBehaviourManagerEventProvenance>[]> {
    if (this.provenanceHook) this.provenanceHook();
    return this.current.workplanKey === workplanKey && this.current.performanceYear === performanceYear
      && this.current.submittedSnapshotKey === submittedSnapshotKey ? clone(this.provenance) : [];
  }
  public async reauthoriseCurrentAssignmentExact(record: Readonly<IOptionEBehaviourSubmittedRecord>,
    actor: Readonly<IOptionEBehaviourManagerActor>): Promise<OptionEBehaviourAssignmentOutcome> {
    if (this.reauthorisationHook) this.reauthorisationHook();
    if (this.authorisationMode !== 'Authorised') return this.authorisationMode;
    if (record.employeePersonKey !== this.current.employeePersonKey || record.workplanKey !== this.current.workplanKey
      || record.performanceYear !== this.current.performanceYear
      || record.submittedSnapshotKey !== this.current.submittedSnapshotKey
      || record.state !== this.current.state || record.rowVersion !== this.current.rowVersion
      || record.hierarchyVersion !== this.current.hierarchyVersion
      || record.assignedManagerPersonKey !== this.current.assignedManagerPersonKey
      || record.readableByManager !== this.current.readableByManager
      || record.snapshotsComplete !== this.current.snapshotsComplete
      || JSON.stringify(record.snapshots) !== JSON.stringify(this.current.snapshots)
      || JSON.stringify(record.events) !== JSON.stringify(this.current.events)) return 'Conflict';
    return actor.effectiveRole === 'Manager' && actor.personKey === this.current.assignedManagerPersonKey
      && this.current.readableByManager ? 'Authorised' : 'Denied';
  }
  public async appendExact(record: Readonly<IOptionEBehaviourSubmittedRecord>,
    event: Readonly<IOptionEBehaviourManagerEvent>): Promise<OptionEBehaviourAppendOutcome> {
    this.appendCalls += 1;
    const existing = this.current.events.find(candidate => candidate.auditKey === event.auditKey);
    if (existing) return JSON.stringify(existing) === JSON.stringify(event) ? 'Replay' : 'Collision';
    if (record.rowVersion !== this.current.rowVersion || record.hierarchyVersion !== this.current.hierarchyVersion
      || record.assignedManagerPersonKey !== this.current.assignedManagerPersonKey
      || event.managerPersonKey !== this.current.assignedManagerPersonKey || !this.current.readableByManager) {
      return 'Conflict';
    }
    if (this.appendMode === 'Appended' || (this.appendMode === 'UnknownEffect' && this.applyBeforeUnknown)) {
      this.current = { ...this.current, rowVersion: this.current.rowVersion + 1,
        events: [...this.current.events, clone(event)] };
      this.provenance = [...this.provenance, receipt(event)];
      if (this.corruptAfterAppend) this.current = this.corruptAfterAppend(this.current);
    }
    return this.appendMode;
  }
}

const manager: IOptionEBehaviourManagerActor = {
  personKey: 'PERSON-MANAGER', principalId: 'PRINCIPAL-MANAGER',
  email: 'manager@example.invalid', effectiveRole: 'Manager'
};
const submitted = (): IOptionEBehaviourSubmittedRecord => ({
  employeePersonKey: 'PERSON-EMPLOYEE', workplanKey: 'PERSON-EMPLOYEE|2027', performanceYear: 2027,
  submittedSnapshotKey: 'SUBMIT-001', state: 'Submitted', rowVersion: 8, hierarchyVersion: 4,
  assignedManagerPersonKey: manager.personKey, readableByManager: true, snapshotsComplete: true,
  snapshots: extension().headlines.flatMap(headline => headline.selections), events: []
});
const intent = (patch: Partial<IOptionEBehaviourManagerIntent> = {}): IOptionEBehaviourManagerIntent => ({
  contract: 'KCF.OptionEBehaviourManagerIntent/v1', idempotencyKey: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1',
  workplanKey: 'PERSON-EMPLOYEE|2027', performanceYear: 2027, submittedSnapshotKey: 'SUBMIT-001',
  selectionKey: 'BHV-01-L2-01', expectedRowVersion: 8, expectedHierarchyVersion: 4,
  disposition: 'AGREED', ...patch
});
const processor = (store: MemoryStore, actor = manager,
  trustedNow: () => string = () => '2026-09-23T21:30:00.000Z'): OptionEBehaviourManagerProcessor =>
  new OptionEBehaviourManagerProcessor(store, async () => actor,
    trustedNow, () => 'KCF-KPI-PM35-A003');

describe('governed Option E Behaviour binding', () => {
  it('keeps canonical legacy payload readable but requires the versioned governed extension for writes', () => {
    const legacyJson = canonicaliseOptionEDraft(aggregate(false));
    expect(parseCanonicalOptionEDraft(legacyJson).behaviours.governedExtension).toBeUndefined();
    expect(() => assertOptionEDraftWritable(parseCanonicalOptionEDraft(legacyJson))).toThrow(/read-only/i);

    const writable = aggregate(true);
    expect(() => assertOptionEDraftWritable(writable)).not.toThrow();
    const reopened = parseCanonicalOptionEDraft(canonicaliseOptionEDraft(writable));
    expect(reopened.behaviours.governedExtension?.headlines).toHaveLength(5);
    expect(reopened.behaviours.governedExtension?.headlines[0].selections[0]).toMatchObject({
      selectedWording: 'Approved example 1', myCommitment: 'Commitment 1',
      howWillWeKnow: 'Evidence 1', catalogueEtag: '"catalogue-7"'
    });
    expect(JSON.stringify(reopened.behaviours.governedExtension)).not.toMatch(/targetRating|behaviourWeight|weightPercent/);
  });

  it('rejects retired, wrong-role and edited catalogue selections before a canonical write payload exists', () => {
    const current = catalogue();
    const retired: IBehaviourFrameworkV2Catalogue = {
      ...current, rows: current.rows.map((row, index) => index === 0 ? { ...row, status: 'Retired' } : row)
    };
    expect(() => buildOptionEBehaviourGovernedExtension({
      catalogue: retired, authority, roleLevelCode: 'L2', asOfDate: '2026-09-23',
      headlines: behaviourKeys.map((behaviourKey, index) => ({ behaviourKey,
        selections: index === 0 ? [{ source: 'Catalogue', selectionKey: 'BHV-01-L2-01',
          commitment: 'Do it', howWillWeKnow: 'See it' }] : [] }))
    })).toThrow(/retired, stale, crossed or unapproved/i);
    const stored = extension().headlines[0].selections[0];
    expect(() => buildOptionEBehaviourGovernedExtension({
      catalogue: current, authority, roleLevelCode: 'L2', asOfDate: '2026-09-23',
      headlines: behaviourKeys.map((behaviourKey, index) => ({ behaviourKey,
        selections: index === 0 ? [{ source: 'Catalogue', selectionKey: 'BHV-01-L2-01',
          commitment: 'Do it', howWillWeKnow: 'See it',
          storedSnapshot: { ...stored, selectedWording: 'Earlier edited wording' } }] : [] }))
    })).toThrow(/edited, stale or crossed/i);
  });

  it('binds each own commitment to an exact currently approved focus and preserves that focus identity', () => {
    const governed = extension();
    expect(governed.headlines[2].selections[0]).toMatchObject({
      source: 'Own', focusKey: 'BHV-03-FOCUS-01', focusTitle: 'Focus 3',
      selectedWording: 'Coach a colleague each month'
    });
    const ownHeadline = (focusKey?: string, focusTitle?: string): IOptionEBehaviourBindingHeadline[] =>
      behaviourKeys.map((behaviourKey, index) => ({
      behaviourKey,
      selections: index === 2 ? [{ source: 'Own' as const, selectionKey: 'BHV-03-OWN-ABCDEF',
        focusKey, focusTitle, commitment: 'Coach a colleague each month',
        howWillWeKnow: 'Monthly feedback record' }] : []
      }));
    expect(() => buildOptionEBehaviourGovernedExtension({ catalogue: catalogue(), authority,
      roleLevelCode: 'L2', asOfDate: '2026-09-23', headlines: ownHeadline() }))
      .toThrow(/focus is retired, stale, crossed or unapproved/i);
    expect(() => buildOptionEBehaviourGovernedExtension({ catalogue: catalogue(), authority,
      roleLevelCode: 'L2', asOfDate: '2026-09-23',
      headlines: ownHeadline('BHV-03-FOCUS-01', 'Edited focus title') }))
      .toThrow(/focus is retired, stale, crossed or unapproved/i);
    const current = catalogue();
    const retiredFocus: IBehaviourFrameworkV2Catalogue = { ...current,
      rows: current.rows.map(row => row.focusKey === 'BHV-03-FOCUS-01' ? { ...row, status: 'Retired' } : row) };
    expect(() => buildOptionEBehaviourGovernedExtension({ catalogue: retiredFocus, authority,
      roleLevelCode: 'L2', asOfDate: '2026-09-23',
      headlines: ownHeadline('BHV-03-FOCUS-01', 'Focus 3') }))
      .toThrow(/focus is retired, stale, crossed or unapproved/i);
  });

  it('confirms both dispositions only after canonical append/readback and preserves exact stored history', async () => {
    const store = new MemoryStore(submitted());
    const service = processor(store);
    expect(await service.review(intent())).toMatchObject({ outcome: 'Confirmed' });
    expect(await service.review(intent())).toMatchObject({ outcome: 'ConfirmedReplay' });
    const changesIntent = intent({ idempotencyKey: '8f3ae803-2f7c-48e9-a177-de8d5280bd08',
      selectionKey: 'BHV-02-L2-01', expectedRowVersion: 9,
      disposition: 'CHANGES REQUESTED', commentary: 'Make the evidence measurable.' });
    expect(await service.review(changesIntent)).toMatchObject({ outcome: 'Confirmed' });
    const history = await service.read('PERSON-EMPLOYEE');
    expect(history.state).toBe('Available');
    if (history.state !== 'Available') throw new Error('Expected available history.');
    expect(history.events.map(event => [event.sequence, event.disposition])).toEqual([
      [1, 'AGREED'], [2, 'CHANGES REQUESTED']
    ]);
    expect(history.snapshots.find(snapshot => snapshot.selectionKey === 'BHV-01-L2-01')?.selectedWording)
      .toBe('Approved example 1');
  });

  it('preserves trusted predecessor history after reassignment, denies the former manager and appends for the new manager', async () => {
    const formerManager: IOptionEBehaviourManagerActor = {
      personKey: 'PERSON-FORMER', principalId: 'PRINCIPAL-FORMER',
      email: 'former@example.invalid', effectiveRole: 'Manager'
    };
    const predecessorEvent: IOptionEBehaviourManagerEvent = {
      auditKey: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', sequence: 1,
      workplanKey: 'PERSON-EMPLOYEE|2027', performanceYear: 2027, submittedSnapshotKey: 'SUBMIT-001',
      selectionKey: 'BHV-01-L2-01', disposition: 'AGREED', managerPersonKey: formerManager.personKey,
      managerPrincipalId: formerManager.principalId, managerEmail: formerManager.email, hierarchyVersion: 3,
      workplanRowVersion: 7, occurredAt: '2026-09-22T10:00:00.000Z', changeReference: 'REVIEW-FORMER'
    };
    const reassigned = submitted();
    reassigned.events = [predecessorEvent];
    const store = new MemoryStore(reassigned, [receipt(predecessorEvent)]);

    const before = await processor(store).read('PERSON-EMPLOYEE');
    expect(before.state).toBe('Available');
    if (before.state !== 'Available') throw new Error('Expected predecessor history for the current manager.');
    expect(before.events).toEqual([predecessorEvent]);
    expect(before.snapshots.find(item => item.selectionKey === predecessorEvent.selectionKey)).toMatchObject({
      selectedWording: 'Approved example 1', catalogueVersion: 'KCF-BHV-PD03-2026.09-v2',
      catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64)
    });
    expect(await processor(store, formerManager).read('PERSON-EMPLOYEE')).toMatchObject({ state: 'Unavailable' });
    expect(await processor(store, formerManager).review(intent())).toMatchObject({ outcome: 'Denied' });

    expect(await processor(store).review(intent({
      idempotencyKey: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', selectionKey: 'BHV-02-L2-01'
    }))).toMatchObject({ outcome: 'Confirmed' });
    const after = await processor(store).read('PERSON-EMPLOYEE');
    expect(after.state).toBe('Available');
    if (after.state !== 'Available') throw new Error('Expected complete history after current-manager append.');
    expect(after.events).toHaveLength(2);
    expect(after.events[0]).toEqual(predecessorEvent);
    expect(after.events[1]).toMatchObject({
      sequence: 2, managerPersonKey: manager.personKey, managerPrincipalId: manager.principalId,
      managerEmail: manager.email, hierarchyVersion: 4, workplanRowVersion: 8
    });
    expect(store.provenance.map(item => item.event)).toEqual(after.events);
  });

  it.each([
    ['missing catalogue version plus extra secret', (snapshot: Record<PropertyKey, unknown>) => {
      delete snapshot.catalogueVersion;
      snapshot.untrustedSecret = 'CROSS-CARRIER-SECRET';
    }],
    ['symbol data', (snapshot: Record<PropertyKey, unknown>) => {
      Object.defineProperty(snapshot, Symbol('secret'), { value: 'CROSS-CARRIER-SECRET', enumerable: true });
    }],
    ['accessor data', (snapshot: Record<PropertyKey, unknown>) => {
      Object.defineProperty(snapshot, 'selectedWording', {
        enumerable: true, configurable: true, get: () => { throw new Error('ACCESSOR-MUST-NOT-RUN'); }
      });
    }],
    ['custom prototype', (snapshot: Record<PropertyKey, unknown>) => {
      Object.setPrototypeOf(snapshot, { untrustedSecret: 'CROSS-CARRIER-SECRET' });
    }]
  ])('withholds every snapshot when submitted snapshot carrier has %s', async (_name, corrupt) => {
    const malformed = submitted();
    const snapshot = malformed.snapshots[0] as unknown as Record<PropertyKey, unknown>;
    corrupt(snapshot);
    const store = new MemoryStore(malformed);
    store.returnReadReference = true;
    const actual = await processor(store).read('PERSON-EMPLOYEE');
    expect(actual).toEqual({ state: 'Unavailable',
      reason: 'Governed Behaviour review is unavailable. Reload or contact KPI support.' });
    expect(JSON.stringify(actual)).not.toMatch(/CROSS-CARRIER-SECRET|Approved example 1/);
  });

  it('denies malformed snapshot append before any event or receipt mutation', async () => {
    const malformed = submitted() as unknown as Record<string, unknown>;
    const snapshots = malformed.snapshots as Array<Record<string, unknown>>;
    delete snapshots[0].catalogueVersion;
    snapshots[0].untrustedSecret = 'CROSS-CARRIER-SECRET';
    const store = new MemoryStore(malformed as unknown as IOptionEBehaviourSubmittedRecord);
    expect(await processor(store).review(intent())).toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(store.current.events).toHaveLength(0);
    expect(store.provenance).toHaveLength(0);
  });

  it('re-authorises the exact current assignment after provenance and before read or append', async () => {
    const readStore = new MemoryStore(submitted());
    readStore.returnReadReference = true;
    readStore.provenanceHook = () => {
      readStore.current = { ...readStore.current, assignedManagerPersonKey: 'PERSON-NEW-MANAGER',
        hierarchyVersion: readStore.current.hierarchyVersion + 1 };
    };
    expect(await processor(readStore).read('PERSON-EMPLOYEE')).toMatchObject({ state: 'Unavailable' });

    const appendStore = new MemoryStore(submitted());
    appendStore.provenanceHook = () => {
      appendStore.current = { ...appendStore.current, assignedManagerPersonKey: 'PERSON-NEW-MANAGER',
        hierarchyVersion: appendStore.current.hierarchyVersion + 1 };
    };
    expect(await processor(appendStore).review(intent())).toMatchObject({ outcome: 'Conflict' });
    expect(appendStore.appendCalls).toBe(0);

    const casStore = new MemoryStore(submitted());
    casStore.reauthorisationHook = () => {
      casStore.current = { ...casStore.current, assignedManagerPersonKey: 'PERSON-NEW-MANAGER',
        hierarchyVersion: casStore.current.hierarchyVersion + 1 };
    };
    expect(await processor(casStore).review(intent())).toMatchObject({ outcome: 'Conflict' });
    expect(casStore.appendCalls).toBe(0);
  });

  it('denies reversed chronology while allowing equal and future canonical trusted instants', async () => {
    const first: IOptionEBehaviourManagerEvent = {
      auditKey: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', sequence: 1,
      workplanKey: 'PERSON-EMPLOYEE|2027', performanceYear: 2027, submittedSnapshotKey: 'SUBMIT-001',
      selectionKey: 'BHV-01-L2-01', disposition: 'AGREED', managerPersonKey: 'PERSON-FORMER',
      managerPrincipalId: 'PRINCIPAL-FORMER', managerEmail: 'former@example.invalid', hierarchyVersion: 3,
      workplanRowVersion: 7, occurredAt: '2026-09-22T10:00:00.000Z', changeReference: 'REVIEW-FORMER'
    };
    const withSecond = (occurredAt: string): IOptionEBehaviourSubmittedRecord => {
      const current = submitted();
      const second: IOptionEBehaviourManagerEvent = {
        ...first, auditKey: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', sequence: 2,
        selectionKey: 'BHV-02-L2-01', managerPersonKey: manager.personKey,
        managerPrincipalId: manager.principalId, managerEmail: manager.email, hierarchyVersion: 4,
        workplanRowVersion: 8, occurredAt, changeReference: 'REVIEW-CURRENT'
      };
      return { ...current, rowVersion: 9, events: [first, second] };
    };
    const read = async (occurredAt: string): Promise<string> => {
      const current = withSecond(occurredAt);
      const store = new MemoryStore(current, current.events.map(item => receipt(item)));
      return (await processor(store).read('PERSON-EMPLOYEE')).state;
    };
    expect(await read('2026-09-21T10:00:00.000Z')).toBe('Unavailable');
    expect(await read(first.occurredAt)).toBe('Available');
    expect(await read('2099-01-01T00:00:00.000Z')).toBe('Available');
  });

  it.each([
    '2026-09-26',
    '2026-09-23T22:30:00+01:00',
    '2026-09-23T21:30:00',
    '2026-09-23T21:30:00Z'
  ])('denies noncanonical trusted time %s before append with unchanged history', async badTime => {
    const store = new MemoryStore(submitted());
    expect(await processor(store, manager, () => badTime).review(intent())).toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(store.current.events).toHaveLength(0);
    expect(store.provenance).toHaveLength(0);
    expect(await processor(store).read('PERSON-EMPLOYEE')).toMatchObject({ state: 'Available' });
  });

  it('returns controlled denial for absent, wrong-shape, accessor and throwing direct-write carriers', async () => {
    const intentAccessor = clone(intent()) as unknown as Record<string, unknown>;
    Object.defineProperty(intentAccessor, 'contract', {
      enumerable: true, configurable: true, get: () => { throw new Error('INTENT-ACCESSOR-MUST-NOT-RUN'); }
    });
    const throwingIntent = new Proxy({}, { ownKeys: () => { throw new Error('INTENT-PROXY-MUST-NOT-RUN'); } });
    const intentCarriers: unknown[] = [undefined, null, {}, intentAccessor, throwingIntent];
    for (const carrier of intentCarriers) {
      const store = new MemoryStore(submitted());
      await expect(processor(store).review(carrier as IOptionEBehaviourManagerIntent))
        .resolves.toMatchObject({ outcome: 'Denied' });
      expect(store.appendCalls).toBe(0);
    }

    const actorAccessor = clone(manager) as unknown as Record<string, unknown>;
    Object.defineProperty(actorAccessor, 'effectiveRole', {
      enumerable: true, configurable: true, get: () => { throw new Error('ACTOR-ACCESSOR-MUST-NOT-RUN'); }
    });
    const throwingActor = new Proxy({}, { ownKeys: () => { throw new Error('ACTOR-PROXY-MUST-NOT-RUN'); } });
    const actorCarriers: unknown[] = [undefined, null, {}, { ...manager, effectiveRole: 'Root' },
      actorAccessor, throwingActor];
    for (const carrier of actorCarriers) {
      const store = new MemoryStore(submitted());
      const service = new OptionEBehaviourManagerProcessor(store,
        async () => carrier as IOptionEBehaviourManagerActor,
        () => '2026-09-23T21:30:00.000Z', () => 'KCF-KPI-PM36-A010');
      await expect(service.review(intent())).resolves.toMatchObject({ outcome: 'Denied' });
      expect(store.appendCalls).toBe(0);
    }
  });

  it('fails closed for missing comment, duplicate-key collision, stale/former manager and uncertain effect', async () => {
    const store = new MemoryStore(submitted());
    const service = processor(store);
    expect(await service.review(intent({ disposition: 'CHANGES REQUESTED' }))).toMatchObject({ outcome: 'Denied' });
    expect(await service.review(intent())).toMatchObject({ outcome: 'Confirmed' });
    expect(await service.review(intent({ disposition: 'CHANGES REQUESTED', commentary: 'Different' })))
      .toMatchObject({ outcome: 'Denied' });
    expect(await service.review(intent({ idempotencyKey: 'a43afb76-f56b-4016-a860-8b8039ace574',
      expectedRowVersion: 8 }))).toMatchObject({ outcome: 'Denied' });
    const former = { ...manager, personKey: 'FORMER-MANAGER', effectiveRole: 'FormerManager' as const };
    expect(await processor(new MemoryStore(submitted()), former).review(intent())).toMatchObject({ outcome: 'Denied' });
    const uncertainStore = new MemoryStore(submitted());
    uncertainStore.appendMode = 'UnknownEffect';
    expect(await processor(uncertainStore).review(intent())).toMatchObject({ outcome: 'Uncertain' });
    uncertainStore.applyBeforeUnknown = true;
    expect(await processor(uncertainStore).review(intent())).toMatchObject({ outcome: 'Confirmed' });
  });

  it.each([
    ['sequence gap', (event: Record<string, unknown>) => { event.sequence = 2; }],
    ['duplicate audit key', (event: Record<string, unknown>, raw: Record<string, unknown>) => {
      raw.events = [event, { ...event, sequence: 2 }];
    }],
    ['foreign workplan', (event: Record<string, unknown>) => { event.workplanKey = 'FOREIGN|2027'; }],
    ['foreign year', (event: Record<string, unknown>) => { event.performanceYear = 2028; }],
    ['foreign snapshot', (event: Record<string, unknown>) => { event.submittedSnapshotKey = 'SUBMIT-FOREIGN'; }],
    ['unknown selection', (event: Record<string, unknown>) => { event.selectionKey = 'BHV-05-L2-99'; }],
    ['invalid disposition', (event: Record<string, unknown>) => { event.disposition = 'APPROVED'; }],
    ['missing requested-change comment', (event: Record<string, unknown>) => {
      event.disposition = 'CHANGES REQUESTED'; delete event.commentary;
    }],
    ['foreign manager person', (event: Record<string, unknown>) => { event.managerPersonKey = 'PERSON-FOREIGN'; }],
    ['foreign manager principal', (event: Record<string, unknown>) => { event.managerPrincipalId = 'PRINCIPAL-FOREIGN'; }],
    ['foreign manager email', (event: Record<string, unknown>) => { event.managerEmail = 'foreign@example.invalid'; }],
    ['foreign hierarchy', (event: Record<string, unknown>) => { event.hierarchyVersion = 5; }],
    ['invalid time', (event: Record<string, unknown>) => { event.occurredAt = 'not-a-time'; }],
    ['blank change reference', (event: Record<string, unknown>) => { event.changeReference = ' '; }],
    ['missing field', (event: Record<string, unknown>) => { delete event.managerPrincipalId; }],
    ['extra field', (event: Record<string, unknown>) => { event.untrusted = true; }]
  ])('withholds all governed content when canonical manager history has a %s', async (_name, corrupt) => {
    const store = new MemoryStore(submitted());
    expect(await processor(store).review(intent())).toMatchObject({ outcome: 'Confirmed' });
    const raw = clone(store.current) as unknown as Record<string, unknown>;
    const events = raw.events as Array<Record<string, unknown>>;
    corrupt(events[0], raw);
    store.current = raw as unknown as IOptionEBehaviourSubmittedRecord;
    const result = await processor(store).read('PERSON-EMPLOYEE');
    expect(result).toEqual({ state: 'Unavailable',
      reason: 'Governed Behaviour review is unavailable. Reload or contact KPI support.' });
    expect(JSON.stringify(result)).not.toMatch(/Approved example|Commitment|Evidence/);
  });

  it.each([
    ['missing receipt', (receipts: Array<Record<string, unknown>>) => { receipts.splice(0, 1); }],
    ['duplicate receipt', (receipts: Array<Record<string, unknown>>) => { receipts.push(clone(receipts[0])); }],
    ['untrusted receipt contract', (receipts: Array<Record<string, unknown>>) => {
      receipts[0].contract = 'KCF.OptionEBehaviourManagerEventProvenance/forged';
    }],
    ['mutable receipt', (receipts: Array<Record<string, unknown>>) => { receipts[0].immutable = false; }],
    ['crossed event key', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).auditKey = 'b8227015-77b3-41da-a43c-666e87da3238';
    }],
    ['changed event sequence', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).sequence = 2;
    }],
    ['changed event-time actor', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).managerPersonKey = 'PERSON-FORGED';
    }],
    ['changed event-time hierarchy', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).hierarchyVersion = 99;
    }],
    ['changed event-time instant', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).occurredAt = '2026-09-23T21:31:00.000Z';
    }],
    ['changed Workplan row version', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).workplanRowVersion = 99;
    }],
    ['foreign snapshot', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).submittedSnapshotKey = 'SUBMIT-FOREIGN';
    }],
    ['foreign selection', (receipts: Array<Record<string, unknown>>) => {
      (receipts[0].event as Record<string, unknown>).selectionKey = 'BHV-05-L2-99';
    }]
  ])('withholds the complete history when trusted event provenance has a %s', async (_name, corrupt) => {
    const store = new MemoryStore(submitted());
    expect(await processor(store).review(intent())).toMatchObject({ outcome: 'Confirmed' });
    const raw = clone(store.provenance) as unknown as Array<Record<string, unknown>>;
    corrupt(raw);
    store.provenance = raw as unknown as IOptionEBehaviourManagerEventProvenance[];
    expect(await processor(store).read('PERSON-EMPLOYEE')).toEqual({
      state: 'Unavailable', reason: 'Governed Behaviour review is unavailable. Reload or contact KPI support.'
    });
  });

  it('denies success when post-append readback contains malformed history', async () => {
    const store = new MemoryStore(submitted());
    store.corruptAfterAppend = record => {
      const raw = clone(record) as unknown as Record<string, unknown>;
      const events = raw.events as Array<Record<string, unknown>>;
      events[0].sequence = 7;
      return raw as unknown as IOptionEBehaviourSubmittedRecord;
    };
    const result = await processor(store).review(intent());
    expect(result).toMatchObject({ outcome: 'Denied' });
    expect(result.event).toBeUndefined();
  });
});
