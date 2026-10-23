import { createHash } from 'node:crypto';
import { APPROVED_BEHAVIOUR_V1_SOURCE_ROWS } from '../testing/BehaviourFrameworkV1ApprovedData';
import {
  createBehaviourFrameworkV2Catalogue,
  getBehaviourFrameworkV2Choices,
  type IBehaviourFrameworkV2Catalogue
} from './BehaviourFrameworkV2';
import {
  BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
  BehaviourCatalogueAdministrationProcessor,
  createBehaviourCatalogueAdministrationBaseline,
  type BehaviourCatalogueAdminAppendOutcome,
  type BehaviourCatalogueAdminMutationAction,
  type IBehaviourCatalogueAdministrationStore,
  type IBehaviourCatalogueAdminAppendIntegrity,
  type IBehaviourCatalogueAdminAppendReceipt,
  type IBehaviourCatalogueAdminActor,
  type IBehaviourCatalogueAdminAuthority,
  type IBehaviourCatalogueAdminCommand,
  type IBehaviourCatalogueAdminEvent,
  type IBehaviourCatalogueAdminState,
  type IBehaviourCatalogueAdminVersion
} from './BehaviourCatalogueAdministration';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type DeepMutable<T> = T extends readonly (infer U)[] ? Array<DeepMutable<U>>
  : T extends object ? { -readonly [P in keyof T]: DeepMutable<T[P]> } : T;
type MutableCatalogue = DeepMutable<IBehaviourFrameworkV2Catalogue>;
const sha = async (value: string): Promise<string> =>
  createHash('sha256').update(value).digest('hex').toUpperCase();
const approved = (): IBehaviourFrameworkV2Catalogue => createBehaviourFrameworkV2Catalogue(
  APPROVED_BEHAVIOUR_V1_SOURCE_ROWS,
  { catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', revision: 1,
    status: 'Published', effectiveFrom: '2026-11-01' }
);

class MemoryStore implements IBehaviourCatalogueAdministrationStore {
  public appendMode: BehaviourCatalogueAdminAppendOutcome = 'Appended';
  public applyBeforeUnknown = false;
  public mutateDuringAppend = false;
  public forceIntegrityFailure = false;
  public beforeRead: (() => void) | undefined;
  public appendCalls = 0;
  public constructor(public state: IBehaviourCatalogueAdminState) {}
  public async readCanonical(): Promise<IBehaviourCatalogueAdminState> {
    this.beforeRead?.();
    return clone(this.state);
  }
  public async appendSuccessorExact(
    expected: Readonly<{ etag: string; rowVersion: number; currentVersionKey: string }>,
    version: Readonly<IBehaviourCatalogueAdminVersion>, event: Readonly<IBehaviourCatalogueAdminEvent>,
    integrity: Readonly<IBehaviourCatalogueAdminAppendIntegrity>
  ): Promise<Readonly<IBehaviourCatalogueAdminAppendReceipt>> {
    this.appendCalls += 1;
    const makeReceipt = (
      outcome: BehaviourCatalogueAdminAppendOutcome
    ): Readonly<IBehaviourCatalogueAdminAppendReceipt> => ({
      outcome,
      atomic: outcome === 'Appended' || outcome === 'Replay' ? 'Committed'
        : outcome === 'UnknownEffect' ? 'Unknown' : 'NotCommitted',
      versionKey: version.versionKey,
      auditKey: event.auditKey,
      contentSha256: version.contentSha256
    });
    const integrityValid = !this.forceIntegrityFailure
      && integrity.contentSha256 === version.contentSha256
      && JSON.stringify(version.catalogue) === integrity.canonicalCatalogueJson
      && await sha(integrity.canonicalCatalogueJson) === integrity.contentSha256
      && event.after.catalogueVersion === version.catalogue.catalogueVersion
      && event.after.catalogueRevision === version.catalogue.revision
      && event.after.contentSha256 === version.contentSha256;
    if (!integrityValid) return makeReceipt('IntegrityFailure');
    if (this.mutateDuringAppend) {
      try {
        const mutable = version.catalogue as unknown as MutableCatalogue;
        mutable.rows[0].suggestedTarget = 'Store mutation must not persist.';
      } catch { /* The immutable prepared version rejects this attack. */ }
      return makeReceipt('IntegrityFailure');
    }
    const existingEvent = this.state.events.find(item => item.auditKey === event.auditKey);
    if (existingEvent) {
      const existingVersion = this.state.versions.find(item => item.versionKey === version.versionKey);
      return makeReceipt(JSON.stringify(existingEvent) === JSON.stringify(event)
        && JSON.stringify(existingVersion) === JSON.stringify(version) ? 'Replay' : 'Collision');
    }
    if (expected.etag !== this.state.etag || expected.rowVersion !== this.state.rowVersion
      || expected.currentVersionKey !== this.state.currentVersionKey) return makeReceipt('Conflict');
    if (this.appendMode === 'Appended' || (this.appendMode === 'UnknownEffect' && this.applyBeforeUnknown)) {
      this.state = { ...this.state, rowVersion: this.state.rowVersion + 1,
        etag: `"catalogue-admin-${this.state.rowVersion + 1}"`, currentVersionKey: version.versionKey,
        versions: [...this.state.versions, clone(version)], events: [...this.state.events, clone(event)] };
    }
    return makeReceipt(this.appendMode);
  }
}

const admin: IBehaviourCatalogueAdminActor = {
  personKey: 'PERSON-ADMIN', email: 'admin@example.invalid', appRoles: ['SystemAdmin']
};
const nonAdmin: IBehaviourCatalogueAdminActor = {
  personKey: 'PERSON-EMPLOYEE', email: 'employee@example.invalid', appRoles: ['Employee']
};
let authority: IBehaviourCatalogueAdminAuthority;
let initial: IBehaviourCatalogueAdminState;
let trustedNow = '2026-09-26T12:00:00.000Z';
const DEFAULT_ACTOR = Symbol('DEFAULT_ACTOR');

const processor = (
  store: MemoryStore,
  actor: unknown = DEFAULT_ACTOR,
  hash: (value: string) => Promise<string> = sha,
  authorityCarrier: unknown = authority
): BehaviourCatalogueAdministrationProcessor => new BehaviourCatalogueAdministrationProcessor(
  store, authorityCarrier as IBehaviourCatalogueAdminAuthority,
  async () => actor === DEFAULT_ACTOR ? admin : actor,
  () => trustedNow, () => 'KCF-KPI-PM36-A007', hash
);

const candidate = (
  state: IBehaviourCatalogueAdminState,
  version: string,
  mutate: (catalogue: MutableCatalogue) => void = () => undefined
): IBehaviourFrameworkV2Catalogue => {
  const current = clone(state.versions[state.versions.length - 1].catalogue) as MutableCatalogue;
  current.catalogueVersion = version;
  current.revision += 1;
  current.effectiveFrom = '2026-12-01';
  mutate(current);
  return current;
};

const command = (
  state: IBehaviourCatalogueAdminState,
  next: IBehaviourFrameworkV2Catalogue,
  patch: Partial<IBehaviourCatalogueAdminCommand> = {}
): IBehaviourCatalogueAdminCommand => ({
  contract: BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
  idempotencyKey: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', action: 'PublishSuccessor',
  expectedEtag: state.etag, expectedRowVersion: state.rowVersion,
  expectedCurrentVersionKey: state.currentVersionKey, reason: 'Approved governed catalogue update.',
  candidate: next, ...patch
});

const historicalSuccessor = async (
  action: BehaviourCatalogueAdminMutationAction,
  mutate: (catalogue: MutableCatalogue) => void
): Promise<IBehaviourCatalogueAdminState> => {
  const next = candidate(initial, 'KCF-BHV-PD03-2026.10-v2', mutate);
  const contentSha256 = await sha(JSON.stringify(next));
  const previous = initial.versions[0];
  const version: IBehaviourCatalogueAdminVersion = {
    versionKey: next.catalogueVersion,
    previousVersionKey: previous.versionKey,
    action,
    catalogue: next,
    contentSha256,
    createdByPersonKey: admin.personKey,
    createdByEmail: admin.email,
    createdAt: trustedNow,
    reason: 'Synthetic canonical history entry.',
    changeReference: 'KCF-KPI-PM36-A007'
  };
  const event: IBehaviourCatalogueAdminEvent = {
    auditKey: '38c6938c-885c-44f1-a00b-b119dd40335e',
    idempotencyKey: '38c6938c-885c-44f1-a00b-b119dd40335e',
    sequence: 2,
    action,
    actorPersonKey: admin.personKey,
    actorEmail: admin.email,
    occurredAt: trustedNow,
    reason: version.reason,
    changeReference: version.changeReference,
    before: { catalogueVersion: previous.catalogue.catalogueVersion,
      catalogueRevision: previous.catalogue.revision, contentSha256: previous.contentSha256 },
    after: { catalogueVersion: next.catalogueVersion,
      catalogueRevision: next.revision, contentSha256 }
  };
  return { ...clone(initial), rowVersion: 2, etag: '"catalogue-admin-2"',
    currentVersionKey: version.versionKey, versions: [...clone(initial.versions), version],
    events: [...clone(initial.events), event] };
};

beforeEach(async () => {
  const baseline = approved();
  authority = { approvalReference: 'KCF-KPI-Sponsor-BEH-V1-001', approvedV1Catalogue: baseline,
    approvedV1ContentSha256: await sha(JSON.stringify(baseline)) };
  initial = await createBehaviourCatalogueAdministrationBaseline(authority,
    { personKey: 'PERSON-SPONSOR', email: 'sponsor@example.invalid' },
    '2026-09-23T12:00:00.000Z', 'KCF-KPI-Sponsor-BEH-V1-001',
    'de8fc527-fa58-4b8a-ae63-818822015746', sha);
  trustedNow = '2026-09-26T12:00:00.000Z';
});

describe('ADM-005 governed Behaviour catalogue administration', () => {
  it('A01/A08/A09 reads the exact approved five headlines, three-label domain and 75 source tuples', async () => {
    const result = await processor(new MemoryStore(initial)).read();
    expect(result.state).toBe('Available');
    if (result.state !== 'Available') throw new Error('Expected available catalogue.');
    expect(result.currentCatalogue.headlineBehaviours.map(row => row.title)).toEqual([
      'WE TAKE RESPONSIBILITY', 'WE UNITE AS ONE CLUB', 'WE BUILD THE NEXT CHAPTER',
      'WE RESPECT THE GAME & EACH OTHER', 'WE WORK & PLAY WITH ENERGY'
    ]);
    expect(result.currentCatalogue.ratingScale).toEqual(['Developing', 'Effective', 'Exceptional']);
    expect(result.currentCatalogue.rows).toHaveLength(75);
    expect(new Set(result.currentCatalogue.rows.map(row => [row.behaviourKey, row.focusKey,
      row.roleLevelCode, row.suggestedTarget].join('|'))).size).toBe(75);
    (['L1', 'L2', 'L3'] as const).forEach(role => {
      expect(getBehaviourFrameworkV2Choices(result.currentCatalogue as IBehaviourFrameworkV2Catalogue,
        role, undefined, new Date('2026-11-01'))).toHaveLength(25);
    });
    expect(JSON.stringify(result.currentCatalogue)).not.toMatch(/targetRating|weightPercent|behaviourWeight|normalisedScore/);
    expect(result.currentCatalogue.selectionGuidance).toEqual({ recommendedMinimum: 3,
      recommendedMaximum: 5, hardMaximum: null });
  });

  it('A01 denies every ordinary Admin headline rename and preserves canonical identity/history', async () => {
    for (let index = 0; index < 5; index += 1) {
      const store = new MemoryStore(initial);
      const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', value => {
        value.headlineBehaviours[index] = { ...value.headlineBehaviours[index], title: 'UNAUTHORISED RENAME' };
      });
      expect(await processor(store).publish(command(store.state, next))).toMatchObject({ outcome: 'Denied' });
      expect(store.state).toEqual(initial);
      expect(store.appendCalls).toBe(0);
    }
  });

  it('A02/A13 publishes a successor while preserving exact V1 and historic snapshot wording', async () => {
    const store = new MemoryStore(initial);
    const historicSnapshot = clone(initial.versions[0].catalogue.rows[0]);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'Successor approved wording.' };
    });
    expect(await processor(store).publish(command(store.state, next))).toMatchObject({ outcome: 'Confirmed' });
    const readback = await processor(store).read();
    expect(readback.state).toBe('Available');
    if (readback.state !== 'Available') throw new Error('Expected available successor.');
    expect(readback.currentCatalogue.rows[0].suggestedTarget).toBe('Successor approved wording.');
    expect(readback.versions[0].catalogue).toEqual(authority.approvedV1Catalogue);
    expect(historicSnapshot).toEqual(authority.approvedV1Catalogue.rows[0]);
    expect(readback.versions[1].previousVersionKey).toBe(readback.versions[0].versionKey);
  });

  it('A03/A07 retires and reactivates through successors while V1 stays addressable', async () => {
    const store = new MemoryStore(initial);
    const retired = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', value => {
      value.rows[0] = { ...value.rows[0], status: 'Retired', effectiveTo: '2026-11-30' };
    });
    expect(await processor(store).publish(command(store.state, retired, { action: 'Retire' })))
      .toMatchObject({ outcome: 'Confirmed' });
    expect(getBehaviourFrameworkV2Choices(store.state.versions[1].catalogue as IBehaviourFrameworkV2Catalogue,
      'L1', undefined, new Date('2026-12-01'))).toHaveLength(24);
    trustedNow = '2026-09-26T12:05:00.000Z';
    const successor = candidate(store.state, 'KCF-BHV-PD03-2026.10-v3', value => {
      value.rows[1] = { ...value.rows[1], suggestedTarget: 'Later governed successor wording.' };
    });
    expect(await processor(store).publish(command(store.state, successor, {
      idempotencyKey: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', action: 'PublishSuccessor'
    }))).toMatchObject({ outcome: 'Confirmed' });
    expect(store.state.versions[2].catalogue.rows.find(row => row.targetKey === retired.rows[0].targetKey))
      .toMatchObject({ targetKey: retired.rows[0].targetKey, status: 'Retired' });
    trustedNow = '2026-09-26T12:10:00.000Z';
    const reactivated = candidate(store.state, 'KCF-BHV-PD03-2026.10-v4', value => {
      value.rows[0] = { ...value.rows[0], status: 'Published', effectiveFrom: '2026-12-01', effectiveTo: undefined };
    });
    expect(await processor(store).publish(command(store.state, reactivated, {
      idempotencyKey: '18c34d67-2dc3-42fe-a66c-e2eddbdfeb39', action: 'Reactivate'
    }))).toMatchObject({ outcome: 'Confirmed' });
    expect(getBehaviourFrameworkV2Choices(store.state.versions[3].catalogue as IBehaviourFrameworkV2Catalogue,
      'L1', undefined, new Date('2026-12-01'))).toHaveLength(25);
    expect(store.state.versions[0].catalogue).toEqual(authority.approvedV1Catalogue);
  });

  it.each<{
    name: string;
    action: BehaviourCatalogueAdminMutationAction;
    mutate: (catalogue: MutableCatalogue) => void;
  }>([
    { name: 'PublishSuccessor omitting a prior target', action: 'PublishSuccessor',
      mutate: value => { value.rows = value.rows.slice(1); } },
    { name: 'Retire omitting one prior target while retiring another', action: 'Retire',
      mutate: value => {
        value.rows = value.rows.slice(1);
        value.rows[0] = { ...value.rows[0], status: 'Retired', effectiveTo: '2026-11-30' };
      } },
    { name: 'Correct replacing a prior target key', action: 'Correct',
      mutate: value => { value.rows[0] = { ...value.rows[0], targetKey: 'BHV-01-L1-06' }; } }
  ])('A02/A07 denies $name before mutation and preserves canonical state/events', async ({ action, mutate }) => {
    const store = new MemoryStore(initial);
    const before = clone(store.state);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', mutate);
    expect(await processor(store).publish(command(store.state, next, { action })))
      .toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(store.state).toEqual(before);
    expect(store.state.versions).toEqual(before.versions);
    expect(store.state.events).toEqual(before.events);
  });

  it.each<{
    name: string;
    mutate: (catalogue: MutableCatalogue) => void;
  }>([
    { name: 'a stable target key rebound to another focus', mutate: value => {
      const alternative = value.rows.find(row => row.behaviourKey === value.rows[0].behaviourKey
        && row.focusKey !== value.rows[0].focusKey);
      if (!alternative) throw new Error('Expected an alternative governed focus.');
      value.rows[0] = { ...value.rows[0], focusKey: alternative.focusKey };
    } },
    { name: 'stable target keys and role pairs swapped', mutate: value => {
      const leftIndex = value.rows.findIndex(row => row.behaviourKey === 'BHV-01' && row.roleLevelCode === 'L1');
      const rightIndex = value.rows.findIndex(row => row.behaviourKey === 'BHV-01'
        && row.roleLevelCode === 'L2' && row.focusKey === value.rows[leftIndex].focusKey);
      const left = value.rows[leftIndex];
      const right = value.rows[rightIndex];
      value.rows[leftIndex] = { ...left, targetKey: right.targetKey, roleLevelCode: right.roleLevelCode };
      value.rows[rightIndex] = { ...right, targetKey: left.targetKey, roleLevelCode: left.roleLevelCode };
    } }
  ])('SEC-R052-F01 denies $name with no append or canonical mutation', async ({ mutate }) => {
    const store = new MemoryStore(initial);
    const before = clone(store.state);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', mutate);
    expect(await processor(store).publish(command(store.state, next, { action: 'Correct' })))
      .toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(store.state).toEqual(before);
  });

  it('SEC-R052-F01 withholds canonical history containing stable-key semantic substitution', async () => {
    const poisoned = await historicalSuccessor('Correct', value => {
      const alternative = value.rows.find(row => row.behaviourKey === value.rows[0].behaviourKey
        && row.focusKey !== value.rows[0].focusKey);
      if (!alternative) throw new Error('Expected an alternative governed focus.');
      value.rows[0] = { ...value.rows[0], focusKey: alternative.focusKey };
    });
    const result = await processor(new MemoryStore(poisoned)).read();
    expect(result).toEqual({ state: 'Unavailable',
      reason: 'Behaviour catalogue administration is unavailable. Reload or contact KPI support.' });
    expect(JSON.stringify(result)).not.toMatch(/WE TAKE RESPONSIBILITY|Deliver what I agree|versions|events/);
  });

  it.each<{
    recordedAction: BehaviourCatalogueAdminMutationAction;
    actual: string;
    mutate: (catalogue: MutableCatalogue) => void;
  }>([
    { recordedAction: 'Correct', actual: 'retirement', mutate: value => {
      value.rows[0] = { ...value.rows[0], status: 'Retired', effectiveTo: '2026-11-30' };
    } },
    { recordedAction: 'PublishSuccessor', actual: 'retirement', mutate: value => {
      value.rows[0] = { ...value.rows[0], status: 'Retired', effectiveTo: '2026-11-30' };
    } },
    { recordedAction: 'Retire', actual: 'ordinary successor', mutate: value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'No retirement occurred.' };
    } },
    { recordedAction: 'Reactivate', actual: 'ordinary successor', mutate: value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'No reactivation occurred.' };
    } }
  ])('SEC-R052-F02 fails closed on poisoned $recordedAction history describing $actual',
    async ({ recordedAction, mutate }) => {
      const poisoned = await historicalSuccessor(recordedAction, mutate);
      const store = new MemoryStore(poisoned);
      const read = await processor(store).read();
      expect(read).toEqual({ state: 'Unavailable',
        reason: 'Behaviour catalogue administration is unavailable. Reload or contact KPI support.' });
      const next = candidate(poisoned, 'KCF-BHV-PD03-2026.10-v3', value => {
        value.rows[1] = { ...value.rows[1], suggestedTarget: 'Write must not pass poisoned history.' };
      });
      const write = await processor(store).publish(command(poisoned, next, {
        idempotencyKey: 'd7d4a814-ffad-4387-adeb-944108b2c1a0', action: 'Correct'
      }));
      expect(write).toMatchObject({ outcome: 'Denied' });
      expect(store.appendCalls).toBe(0);
      expect(JSON.stringify({ read, write })).not.toMatch(/WE TAKE RESPONSIBILITY|Deliver what I agree/);
    });

  it.each([
    ['null', null],
    ['missing fields', { personKey: 'PERSON-ADMIN' }],
    ['malformed roles', { personKey: 'PERSON-ADMIN', email: 'admin@example.invalid', appRoles: 'SystemAdmin' }],
    ['custom prototype', Object.assign(Object.create({ inheritedRole: 'SystemAdmin' }), admin)]
  ])('SEC-R052-F03 controls %s actor carrier without exception or append', async (_name, actorCarrier) => {
    const store = new MemoryStore(initial);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
    const result = await processor(store, actorCarrier).publish(command(store.state, next));
    expect(result).toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(store.state).toEqual(initial);
    expect(JSON.stringify(result)).not.toMatch(/WE TAKE RESPONSIBILITY|Deliver what I agree|TypeError/);
  });

  it('SEC-R052-F03 controls an absent actor carrier without exception or append', async () => {
    const store = new MemoryStore(initial);
    const absentActorProcessor = new BehaviourCatalogueAdministrationProcessor(store, authority,
      async () => undefined, () => trustedNow, () => 'KCF-KPI-PM36-A007', sha);
    const result = await absentActorProcessor.publish(command(store.state,
      candidate(store.state, 'KCF-BHV-PD03-2026.10-v2')));
    expect(result).toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(store.state).toEqual(initial);
    expect(JSON.stringify(result)).not.toMatch(/WE TAKE RESPONSIBILITY|Deliver what I agree|TypeError/);
  });

  it('SEC-R052-F03 rejects actor accessors and throwing carriers without evaluation or leak', async () => {
    const accessorStore = new MemoryStore(initial);
    let accessorCalls = 0;
    const accessorActor: Record<string, unknown> = {
      personKey: 'PERSON-ADMIN', email: 'admin@example.invalid'
    };
    Object.defineProperty(accessorActor, 'appRoles', { enumerable: true, get: () => {
      accessorCalls += 1;
      throw new Error('actor accessor secret');
    } });
    const next = candidate(accessorStore.state, 'KCF-BHV-PD03-2026.10-v2');
    const accessorResult = await processor(accessorStore, accessorActor)
      .publish(command(accessorStore.state, next));
    expect(accessorResult).toMatchObject({ outcome: 'Denied' });
    expect(accessorCalls).toBe(0);
    expect(accessorStore.appendCalls).toBe(0);

    const throwingStore = new MemoryStore(initial);
    const throwingProcessor = new BehaviourCatalogueAdministrationProcessor(throwingStore, authority,
      async () => { throw new Error('provider secret'); }, () => trustedNow,
      () => 'KCF-KPI-PM36-A007', sha);
    const throwingResult = await throwingProcessor.publish(command(throwingStore.state,
      candidate(throwingStore.state, 'KCF-BHV-PD03-2026.10-v2')));
    expect(throwingResult).toMatchObject({ outcome: 'Uncertain' });
    expect(throwingStore.appendCalls).toBe(0);
    expect(JSON.stringify({ accessorResult, throwingResult })).not.toMatch(/secret|TypeError|WE TAKE RESPONSIBILITY/);
  });

  it('SEC-R052-F03 snapshots resolved actor data before awaiting canonical state', async () => {
    const store = new MemoryStore(initial);
    const actorCarrier = clone(admin) as { personKey: string; email: string; appRoles: string[] };
    store.beforeRead = () => { actorCarrier.appRoles = ['Employee']; };
    const guardedProcessor = new BehaviourCatalogueAdministrationProcessor(store, authority,
      async () => actorCarrier, () => trustedNow, () => 'KCF-KPI-PM36-A007', sha);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
    const result = await guardedProcessor.publish(command(store.state, next));
    expect(actorCarrier.appRoles).toEqual(['Employee']);
    expect(result).toMatchObject({ outcome: 'Confirmed' });
    expect(store.state.versions).toHaveLength(2);
  });

  it('SEC-R052-F04 rejects accessor, symbol and custom-prototype command carriers before append', async () => {
    let accessorCalls = 0;
    const attacks: Array<(request: IBehaviourCatalogueAdminCommand) => void> = [
      request => { Object.defineProperty(request, 'reason', { enumerable: true, get: () => {
        accessorCalls += 1;
        throw new Error('command accessor secret');
      } }); },
      request => { Object.defineProperty(request.candidate, Symbol('hidden'), { value: 'unsafe' }); },
      request => { Object.setPrototypeOf(request.candidate, { unsafePrototype: true }); }
    ];
    for (const attack of attacks) {
      const store = new MemoryStore(initial);
      const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
      const request = command(store.state, next);
      attack(request);
      expect(await processor(store).publish(request)).toMatchObject({ outcome: 'Denied' });
      expect(store.appendCalls).toBe(0);
      expect(store.state).toEqual(initial);
    }
    expect(accessorCalls).toBe(0);
  });

  it('SEC-R052-F04 snapshots and rejects an accessor authority carrier without evaluation', async () => {
    const store = new MemoryStore(initial);
    let accessorCalls = 0;
    const unsafeAuthority: Record<string, unknown> = {
      approvalReference: authority.approvalReference,
      approvedV1Catalogue: authority.approvedV1Catalogue
    };
    Object.defineProperty(unsafeAuthority, 'approvedV1ContentSha256', { enumerable: true, get: () => {
      accessorCalls += 1;
      throw new Error('authority accessor secret');
    } });
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
    const result = await processor(store, admin, sha, unsafeAuthority).publish(command(store.state, next));
    expect(result).toMatchObject({ outcome: 'Denied' });
    expect(accessorCalls).toBe(0);
    expect(store.appendCalls).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/secret|WE TAKE RESPONSIBILITY/);
  });

  it('SEC-R052-F04 rejects command mutation during hash with zero append and unchanged history', async () => {
    const store = new MemoryStore(initial);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'Content before mutation.' };
    });
    let mutated = false;
    const mutatingSha = async (serialised: string): Promise<string> => {
      const digest = await sha(serialised);
      if (!mutated && serialised.includes('KCF-BHV-PD03-2026.10-v2')) {
        mutated = true;
        (next as MutableCatalogue).rows[0].suggestedTarget = 'Content after mutation.';
      }
      return digest;
    };
    const result = await processor(store, admin, mutatingSha).publish(command(store.state, next));
    expect(mutated).toBe(true);
    expect(result).toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(store.state).toEqual(initial);
  });

  it.each(['mutation attempt', 'hash mismatch'])
  ('SEC-R052-F04 store-side %s returns an integrity rejection with zero partial append', async mode => {
    const store = new MemoryStore(initial);
    store.mutateDuringAppend = mode === 'mutation attempt';
    store.forceIntegrityFailure = mode === 'hash mismatch';
    const before = clone(store.state);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
    const result = await processor(store).publish(command(store.state, next));
    expect(result).toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(1);
    expect(store.state).toEqual(before);
    expect(store.state.versions).toHaveLength(1);
    expect(store.state.events).toHaveLength(1);
  });

  it('A04/A17 denies non-Admin read, publish and correction direct routes without content leak', async () => {
    const store = new MemoryStore(initial);
    expect(await processor(store, nonAdmin).read()).toEqual({ state: 'Denied',
      reason: 'You are not authorised to administer the Behaviour catalogue.' });
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
    const result = await processor(store, nonAdmin).publish(command(store.state, next, { action: 'Correct' }));
    expect(result).toEqual({ outcome: 'Denied',
      message: 'You are not authorised to administer the Behaviour catalogue.' });
    expect(store.state).toEqual(initial);
    expect(store.appendCalls).toBe(0);
  });

  it('A05 rejects stale CAS state and never silently overwrites the first successor', async () => {
    const store = new MemoryStore(initial);
    const stale = clone(store.state);
    const first = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'First session wording.' };
    });
    expect(await processor(store).publish(command(store.state, first))).toMatchObject({ outcome: 'Confirmed' });
    const second = candidate(stale, 'KCF-BHV-PD03-2026.10-v3', value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'Stale second session wording.' };
    });
    expect(await processor(store).publish(command(stale, second, {
      idempotencyKey: '8f3ae803-2f7c-48e9-a177-de8d5280bd08'
    }))).toMatchObject({ outcome: 'Conflict' });
    expect(store.state.currentVersionKey).toBe(first.catalogueVersion);
    expect(store.state.versions).toHaveLength(2);
  });

  it.each([
    ['date', (value: MutableCatalogue) => { value.effectiveFrom = '2026-02-31'; }],
    ['version', (value: MutableCatalogue) => { value.catalogueVersion = 'latest'; }],
    ['revision', (value: MutableCatalogue) => { value.revision = 9; }],
    ['crossed key', (value: MutableCatalogue) => { value.rows[0] = {
      ...value.rows[0], targetKey: 'BHV-02-L1-01' }; }],
    ['numeric target rating', (value: MutableCatalogue) => {
      (value.rows[0] as unknown as Record<string, unknown>).targetRating = 3;
    }]
  ])('A06/A08/A12 rejects invalid %s with no partial publication', async (_name, mutate) => {
    const store = new MemoryStore(initial);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', mutate);
    expect(await processor(store).publish(command(store.state, next))).toMatchObject({ outcome: 'Denied' });
    expect(store.state).toEqual(initial);
    expect(store.appendCalls).toBe(0);
  });

  it('allows later versioned content growth without hard-coding the approved V1 count', async () => {
    const store = new MemoryStore(initial);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', value => {
      value.rows = [...value.rows, { ...value.rows[0], targetKey: 'BHV-01-L1-06',
        suggestedTarget: 'A later governed example.', sortOrder: 999 }];
    });
    expect(next.rows).toHaveLength(76);
    expect(await processor(store).publish(command(store.state, next))).toMatchObject({ outcome: 'Confirmed' });
    expect(store.state.versions[0].catalogue.rows).toHaveLength(75);
    expect(store.state.versions[1].catalogue.rows).toHaveLength(76);
  });

  it('A14 requires a reason and records exact append-only actor/time/before/after identity', async () => {
    const store = new MemoryStore(initial);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
    expect(await processor(store).publish(command(store.state, next, { reason: ' ' })))
      .toMatchObject({ outcome: 'Denied' });
    expect(store.appendCalls).toBe(0);
    expect(await processor(store).publish(command(store.state, next))).toMatchObject({ outcome: 'Confirmed' });
    const event = store.state.events[1];
    expect(event).toMatchObject({ sequence: 2, actorPersonKey: admin.personKey,
      actorEmail: admin.email, occurredAt: trustedNow, reason: 'Approved governed catalogue update.',
      changeReference: 'KCF-KPI-PM36-A007', before: { catalogueVersion: initial.currentVersionKey },
      after: { catalogueVersion: next.catalogueVersion } });
    expect(store.state.events[0]).toEqual(initial.events[0]);
  });

  it('A15 resolves unknown effects only by canonical reload and retries idempotently once', async () => {
    const store = new MemoryStore(initial);
    const next = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2');
    const request = command(store.state, next);
    store.appendMode = 'UnknownEffect';
    expect(await processor(store).publish(request)).toMatchObject({ outcome: 'Uncertain' });
    expect(store.state.versions).toHaveLength(1);
    store.applyBeforeUnknown = true;
    expect(await processor(store).publish(request)).toMatchObject({ outcome: 'Confirmed' });
    expect(store.state.versions).toHaveLength(2);
    expect(await processor(store).publish(request)).toMatchObject({ outcome: 'ConfirmedReplay' });
    expect(store.state.versions).toHaveLength(2);
  });

  it('A16 corrects through V3 while retaining V1, V2 and their linked events', async () => {
    const store = new MemoryStore(initial);
    const v2 = candidate(store.state, 'KCF-BHV-PD03-2026.10-v2', value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'V2 wording needing correction.' };
    });
    expect(await processor(store).publish(command(store.state, v2))).toMatchObject({ outcome: 'Confirmed' });
    trustedNow = '2026-09-26T12:05:00.000Z';
    const v3 = candidate(store.state, 'KCF-BHV-PD03-2026.10-v3', value => {
      value.rows[0] = { ...value.rows[0], suggestedTarget: 'Corrected V3 wording.' };
    });
    expect(await processor(store).publish(command(store.state, v3, {
      idempotencyKey: 'a43afb76-f56b-4016-a860-8b8039ace574', action: 'Correct',
      reason: 'Correct the successor wording through a new governed event.'
    }))).toMatchObject({ outcome: 'Confirmed' });
    expect(store.state.versions.map(version => version.versionKey)).toEqual([
      'KCF-BHV-PD03-2026.09-v1', 'KCF-BHV-PD03-2026.10-v2', 'KCF-BHV-PD03-2026.10-v3'
    ]);
    expect(store.state.versions[0].catalogue).toEqual(authority.approvedV1Catalogue);
    expect(store.state.versions[1].catalogue.rows[0].suggestedTarget).toBe('V2 wording needing correction.');
    expect(store.state.events.map(event => event.sequence)).toEqual([1, 2, 3]);
  });

  it('A17 withholds the whole catalogue when immutable version or audit history is mutated', async () => {
    const malformed = clone(initial) as unknown as Record<string, unknown>;
    const events = malformed.events as Array<Record<string, unknown>>;
    events[0].untrusted = true;
    const result = await processor(new MemoryStore(malformed as unknown as IBehaviourCatalogueAdminState)).read();
    expect(result).toEqual({ state: 'Unavailable',
      reason: 'Behaviour catalogue administration is unavailable. Reload or contact KPI support.' });
    expect(JSON.stringify(result)).not.toMatch(/WE TAKE RESPONSIBILITY|Deliver what I agree/);
  });
});
