import type {
  IApprovedBaselineImportRecord,
  IHistoricalGoldImportRecord,
  IYearLifecycleActor,
  IYearLifecycleImportManifest,
  IYearLifecycleImportRequest,
  IYearLifecycleManifestExpectation,
  IYearLifecycleState
} from './YearLifecycleModels';
import {
  applyYearLifecycleImport,
  createEmptyYearLifecycleState,
  planYearLifecycleImport,
  readYearLifecycleYear,
  rollbackYearLifecycleImport,
  sealYearLifecycleImportManifest,
  sha256Hex,
  yearLifecycleStateSha256
} from './YearLifecycleImportEngine';

const actor: Readonly<IYearLifecycleActor> = Object.freeze({
  actorId: 'lifecycle-admin-synthetic',
  actorEmail: 'lifecycle.admin@example.invalid',
  role: 'LifecycleAdministrator',
  active: true
});

const request = (idempotencyKey: string, minute = 0): Readonly<IYearLifecycleImportRequest> => Object.freeze({
  idempotencyKey,
  requestedAt: `2026-09-22T20:${String(minute).padStart(2, '0')}:00.000Z`,
  actor
});

const historicalRecords = (): IHistoricalGoldImportRecord[] => [{
  recordType: 'HistoricalGold',
  recordKey: 'SYNTH-GOLD-KPI-001',
  performanceYear: 2026,
  entityType: 'GoldKpiSnapshot',
  sourceRecordKey: 'SYNTH-SOURCE-GOLD-001',
  version: 'GOLD-2026-FROZEN-V1',
  classification: 'Impact',
  closedYearSnapshot: true,
  snapshotValue: 'Synthetic closed-year GOLD value'
}, {
  recordType: 'HistoricalGold',
  recordKey: 'SYNTH-GOLD-CLASS-001',
  performanceYear: 2026,
  entityType: 'GoldClassificationSnapshot',
  sourceRecordKey: 'SYNTH-SOURCE-CLASS-001',
  version: 'GOLD-2026-FROZEN-V1',
  classification: 'Core',
  closedYearSnapshot: true,
  snapshotValue: 'Synthetic closed-year classification'
}];

const baselineRecords = (): IApprovedBaselineImportRecord[] => [{
  recordType: 'ApprovedBaseline',
  recordKey: 'SYNTH-2027-KPI-NEW',
  performanceYear: 2027,
  entityType: 'KPI',
  sourceRecordKey: 'SYNTH-BASELINE-KPI-NEW',
  version: 'BASELINE-2027-V1',
  classification: 'Core',
  approvalStatus: 'Approved',
  lifecycleStatus: 'Current'
}, {
  recordType: 'ApprovedBaseline',
  recordKey: 'SYNTH-2027-POPULATION',
  performanceYear: 2027,
  entityType: 'Population',
  sourceRecordKey: 'SYNTH-BASELINE-POPULATION',
  version: 'POPULATION-2027-V1',
  classification: 'NotApplicable',
  approvalStatus: 'Approved',
  lifecycleStatus: 'Current'
}, {
  recordType: 'ApprovedBaseline',
  recordKey: 'SYNTH-2027-FRAMEWORK',
  performanceYear: 2027,
  entityType: 'Framework',
  sourceRecordKey: 'SYNTH-BASELINE-FRAMEWORK',
  version: 'FRAMEWORK-2027-V1',
  classification: 'NotApplicable',
  approvalStatus: 'Approved',
  lifecycleStatus: 'Current'
}];

const historicalManifest = (): Readonly<IYearLifecycleImportManifest> => sealYearLifecycleImportManifest({
  schema: 'KCF.YearLifecycleImportManifest',
  schemaVersion: '1.0.0',
  manifestId: 'SYNTH-HISTORICAL-GOLD-2026',
  importKind: 'HistoricalGold2026',
  targetYear: 2026,
  configurationVersion: 'HISTORICAL-2026-FROZEN-V1',
  complete: true,
  approved: true,
  approvalReference: 'SYNTH-LIFE-001-APPROVAL',
  approvedBy: 'synthetic.sponsor@example.invalid',
  approvedAt: '2026-09-20T09:00:00.000Z',
  source: {
    sourceId: 'SYNTH-GOLD-ARCHIVE',
    sourceVersion: 'GOLD-EXPORT-V1',
    sourceEtag: '"SYNTH-GOLD-V1"'
  },
  records: historicalRecords()
});

const baselineManifest = (
  suffix = 'V1',
  configurationVersion = `GOVERNED-2027-${suffix}`
): Readonly<IYearLifecycleImportManifest> => sealYearLifecycleImportManifest({
  schema: 'KCF.YearLifecycleImportManifest',
  schemaVersion: '1.0.0',
  manifestId: `SYNTH-APPROVED-BASELINE-2027-${suffix}`,
  importKind: 'ApprovedNewYearBaseline2027',
  targetYear: 2027,
  configurationVersion,
  complete: true,
  approved: true,
  approvalReference: `SYNTH-LIFE-006-APPROVAL-${suffix}`,
  approvedBy: 'synthetic.sponsor@example.invalid',
  approvedAt: '2026-09-21T09:00:00.000Z',
  source: {
    sourceId: 'SYNTH-APPROVED-BASELINE',
    sourceVersion: `BASELINE-${suffix}`,
    sourceEtag: `"SYNTH-BASELINE-${suffix}"`
  },
  records: baselineRecords()
});

const expectation = (
  manifest: Readonly<IYearLifecycleImportManifest>
): Readonly<IYearLifecycleManifestExpectation> => Object.freeze({
  manifestId: manifest.manifestId,
  manifestSha256: manifest.manifestSha256,
  importKind: manifest.importKind,
  targetYear: manifest.targetYear,
  configurationVersion: manifest.configurationVersion,
  approvalReference: manifest.approvalReference,
  sourceId: manifest.source.sourceId,
  sourceVersion: manifest.source.sourceVersion,
  sourceEtag: manifest.source.sourceEtag,
  sourceContentSha256: manifest.source.contentSha256
});

const apply = (
  manifest: Readonly<IYearLifecycleImportManifest>,
  state: Readonly<IYearLifecycleState>,
  idempotencyKey: string,
  minute = 0
): Extract<ReturnType<typeof applyYearLifecycleImport>, { status: 'Applied' }> => {
  const planned = planYearLifecycleImport(manifest, expectation(manifest), state, request(idempotencyKey, minute));
  expect(planned.status).toBe('Planned');
  if (planned.status !== 'Planned') throw new Error('Synthetic plan was unexpectedly rejected.');
  const applied = applyYearLifecycleImport(planned.plan, state);
  expect(applied.status).toBe('Applied');
  if (applied.status !== 'Applied') throw new Error('Synthetic apply was unexpectedly rejected.');
  return applied;
};

describe('BT-05 controlled year lifecycle import engine', () => {
  it('uses canonical SHA-256 and seals immutable source/count/hash identity', () => {
    expect(sha256Hex('abc')).toBe('BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD');
    const sourceRecords = historicalRecords();
    const manifest = historicalManifest();
    (sourceRecords[0] as { snapshotValue: string }).snapshotValue = 'Caller mutation after sealing';
    expect(manifest.recordCount).toBe(2);
    expect(manifest.recordsSha256).toBe(manifest.source.contentSha256);
    expect(manifest.recordsSha256).toMatch(/^[A-F0-9]{64}$/);
    expect(manifest.manifestSha256).toMatch(/^[A-F0-9]{64}$/);
    expect(manifest.records[0].recordType).toBe('HistoricalGold');
    if (manifest.records[0].recordType !== 'HistoricalGold') throw new Error('Unexpected synthetic record route.');
    expect(manifest.records[0].snapshotValue).toBe('Synthetic closed-year GOLD value');
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.source)).toBe(true);
    expect(Object.isFrozen(manifest.records)).toBe(true);
    expect(Object.isFrozen(manifest.records[0])).toBe(true);
  });

  it('plans, applies and reads back frozen historical 2026 GOLD without a Workplan', () => {
    const state = createEmptyYearLifecycleState();
    const applied = apply(historicalManifest(), state, 'SYNTH-IMPORT-HISTORY-001');
    const year = readYearLifecycleYear(applied.state, 2026);
    expect(year).toMatchObject({
      performanceYear: 2026,
      configurationVersion: 'HISTORICAL-2026-FROZEN-V1'
    });
    expect(year?.historicalGoldRecords).toHaveLength(2);
    expect(year?.approvedBaselineRecords).toHaveLength(0);
    expect(JSON.stringify(year)).not.toMatch(/Workplan/i);
    expect(applied.receipt).toMatchObject({
      idempotencyKey: 'SYNTH-IMPORT-HISTORY-001',
      importKind: 'HistoricalGold2026',
      targetYear: 2026,
      recordCount: 2,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      beforeRevision: 0,
      afterRevision: 1
    });
    expect(applied.receipt.afterStateSha256).toBe(yearLifecycleStateSha256(applied.state));
  });

  it('creates an isolated 2027 baseline and preserves the exact prior-year snapshot', () => {
    const historical = apply(historicalManifest(), createEmptyYearLifecycleState(), 'SYNTH-HISTORY-002');
    const priorYear = readYearLifecycleYear(historical.state, 2026);
    const priorYearJson = JSON.stringify(priorYear);
    const priorYearHash = sha256Hex(priorYearJson);
    const baseline = apply(baselineManifest(), historical.state, 'SYNTH-BASELINE-001', 1);
    const afterPriorYear = readYearLifecycleYear(baseline.state, 2026);
    const newYear = readYearLifecycleYear(baseline.state, 2027);
    expect(sha256Hex(JSON.stringify(afterPriorYear))).toBe(priorYearHash);
    expect(JSON.stringify(afterPriorYear)).toBe(priorYearJson);
    expect(newYear?.configurationVersion).toBe('GOVERNED-2027-V1');
    expect(newYear?.approvedBaselineRecords.map(record => record.recordKey)).toEqual([
      'SYNTH-2027-KPI-NEW', 'SYNTH-2027-POPULATION', 'SYNTH-2027-FRAMEWORK'
    ]);
    expect(newYear?.approvedBaselineRecords.some(record => record.recordKey === 'SYNTH-GOLD-KPI-001')).toBe(false);
    expect(newYear?.approvedBaselineRecords.some(record => 'priorYearReference' in record)).toBe(false);
  });

  it('rejects wrong-year, forbidden Workplan and unapproved or obsolete content with exception reports', () => {
    const valid = historicalManifest();
    const wrongYear = planYearLifecycleImport({ ...valid, targetYear: 2027 }, expectation(valid),
      createEmptyYearLifecycleState(), request('SYNTH-WRONG-YEAR'));
    expect(wrongYear).toMatchObject({ status: 'Rejected', exception: { code: 'WrongYear', phase: 'Plan' } });

    const workplan = planYearLifecycleImport({
      ...valid,
      records: [{ recordType: 'Workplan', performanceYear: 2026 }],
      recordCount: 1
    }, expectation(valid), createEmptyYearLifecycleState(), request('SYNTH-WORKPLAN'));
    expect(workplan).toMatchObject({
      status: 'Rejected', exception: { code: 'WorkplanImportForbidden', manifestId: 'UNKNOWN' }
    });

    const baseline = baselineManifest();
    const unapproved = planYearLifecycleImport({ ...baseline, approved: false }, expectation(baseline),
      createEmptyYearLifecycleState(), request('SYNTH-UNAPPROVED'));
    expect(unapproved).toMatchObject({ status: 'Rejected', exception: { code: 'UnapprovedContent' } });
    const obsolete = planYearLifecycleImport({
      ...baseline,
      records: baseline.records.map((record, index) => index === 0
        ? { ...record, lifecycleStatus: 'Obsolete' } : record)
    }, expectation(baseline), createEmptyYearLifecycleState(), request('SYNTH-OBSOLETE'));
    expect(obsolete).toMatchObject({ status: 'Rejected', exception: { code: 'UnapprovedContent' } });
  });

  it('rejects partial, count, record hash, manifest hash, schema and source mismatch', () => {
    const manifest = historicalManifest();
    const state = createEmptyYearLifecycleState();
    expect(planYearLifecycleImport({ ...manifest, complete: false }, expectation(manifest), state,
      request('SYNTH-PARTIAL'))).toMatchObject({ status: 'Rejected', exception: { code: 'CountMismatch' } });
    expect(planYearLifecycleImport({ ...manifest, recordCount: 1 }, expectation(manifest), state,
      request('SYNTH-COUNT'))).toMatchObject({ status: 'Rejected', exception: { code: 'CountMismatch' } });
    expect(planYearLifecycleImport({ ...manifest, recordsSha256: 'A'.repeat(64) }, expectation(manifest), state,
      request('SYNTH-RECORD-HASH'))).toMatchObject({ status: 'Rejected', exception: { code: 'HashMismatch' } });
    expect(planYearLifecycleImport({
      ...manifest,
      records: manifest.records.map((record, index) => index === 0 && record.recordType === 'HistoricalGold'
        ? { ...record, snapshotValue: 'Tampered synthetic content' } : record)
    }, expectation(manifest), state, request('SYNTH-CONTENT-HASH'))).toMatchObject({
      status: 'Rejected', exception: { code: 'HashMismatch' }
    });
    expect(planYearLifecycleImport({ ...manifest, manifestSha256: 'A'.repeat(64) }, expectation(manifest), state,
      request('SYNTH-MANIFEST-HASH'))).toMatchObject({ status: 'Rejected', exception: { code: 'HashMismatch' } });
    expect(planYearLifecycleImport({ ...manifest, schemaVersion: '2.0.0' }, expectation(manifest), state,
      request('SYNTH-SCHEMA'))).toMatchObject({ status: 'Rejected', exception: { code: 'UnsupportedSchema' } });
    expect(planYearLifecycleImport(manifest, { ...expectation(manifest), sourceId: 'WRONG-SOURCE' }, state,
      request('SYNTH-SOURCE'))).toMatchObject({ status: 'Rejected', exception: { code: 'SourceMismatch' } });
  });

  it('rejects stale provenance and configuration identity', () => {
    const manifest = baselineManifest();
    const staleVersion = planYearLifecycleImport(manifest, {
      ...expectation(manifest), sourceVersion: 'STALE'
    }, createEmptyYearLifecycleState(), request('SYNTH-STALE-VERSION'));
    expect(staleVersion).toMatchObject({ status: 'Rejected', exception: { code: 'StaleManifest' } });
    const staleConfiguration = planYearLifecycleImport(manifest, {
      ...expectation(manifest), configurationVersion: 'STALE-CONFIG'
    }, createEmptyYearLifecycleState(), request('SYNTH-STALE-CONFIG'));
    expect(staleConfiguration).toMatchObject({ status: 'Rejected', exception: { code: 'StaleManifest' } });
  });

  it('is idempotent for exact replay and rejects duplicate or conflicting replay', () => {
    const manifest = historicalManifest();
    const applied = apply(manifest, createEmptyYearLifecycleState(), 'SYNTH-REPLAY-KEY');
    const exactReplay = planYearLifecycleImport(manifest, expectation(manifest), applied.state,
      request('SYNTH-REPLAY-KEY'));
    expect(exactReplay).toMatchObject({ status: 'Idempotent', receipt: { receiptId: applied.receipt.receiptId } });
    const duplicate = planYearLifecycleImport(manifest, expectation(manifest), applied.state,
      request('SYNTH-DIFFERENT-KEY'));
    expect(duplicate).toMatchObject({ status: 'Rejected', exception: { code: 'DuplicateImport' } });
    const other = baselineManifest('V2');
    const conflict = planYearLifecycleImport(other, expectation(other), applied.state,
      request('SYNTH-REPLAY-KEY'));
    expect(conflict).toMatchObject({ status: 'Rejected', exception: { code: 'IdempotencyConflict' } });
  });

  it('rejects duplicate record identity before planning', () => {
    const records = historicalRecords();
    expect(() => sealYearLifecycleImportManifest({
      schema: 'KCF.YearLifecycleImportManifest',
      schemaVersion: '1.0.0',
      manifestId: 'SYNTH-DUPLICATE',
      importKind: 'HistoricalGold2026',
      targetYear: 2026,
      configurationVersion: 'HISTORICAL-2026-FROZEN-V1',
      complete: true,
      approved: true,
      approvalReference: 'SYNTH-APPROVAL',
      approvedBy: 'synthetic.sponsor@example.invalid',
      approvedAt: '2026-09-20T09:00:00.000Z',
      source: { sourceId: 'SYNTH', sourceVersion: 'V1', sourceEtag: '"V1"' },
      records: [records[0], { ...records[1], recordKey: records[0].recordKey }]
    })).toThrow(/duplicate/);
    const valid = historicalManifest();
    const reported = planYearLifecycleImport({
      ...valid,
      records: [valid.records[0], { ...valid.records[1], recordKey: valid.records[0].recordKey }]
    }, expectation(valid), createEmptyYearLifecycleState(), request('SYNTH-DUPLICATE-REPORT'));
    expect(reported).toMatchObject({
      status: 'Rejected', exception: { phase: 'Plan', code: 'DuplicateImport' }
    });
  });

  it('rejects reuse of the prior-year governed configuration version', () => {
    const historical = apply(historicalManifest(), createEmptyYearLifecycleState(), 'SYNTH-CONFIG-HISTORY');
    const sameConfiguration = baselineManifest('SAME', 'HISTORICAL-2026-FROZEN-V1');
    const result = planYearLifecycleImport(
      sameConfiguration,
      expectation(sameConfiguration),
      historical.state,
      request('SYNTH-CONFIG-REUSE')
    );
    expect(result).toMatchObject({ status: 'Rejected', exception: { code: 'ConfigurationConflict' } });
  });

  it('rejects unauthorised actors and forged plans with attributable exceptions', () => {
    const manifest = historicalManifest();
    const unauthorised = planYearLifecycleImport(manifest, expectation(manifest), createEmptyYearLifecycleState(), {
      ...request('SYNTH-UNAUTHORISED'),
      actor: { ...actor, role: 'Employee' }
    });
    expect(unauthorised).toMatchObject({
      status: 'Rejected',
      exception: { phase: 'Plan', code: 'Unauthorised', idempotencyKey: 'UNKNOWN' }
    });
    const forged = applyYearLifecycleImport({
      planId: 'FORGED', expectedStateRevision: 0
    }, createEmptyYearLifecycleState());
    expect(forged).toMatchObject({ status: 'Rejected', exception: { phase: 'Apply', code: 'Unauthorised' } });
  });

  it('does not execute accessors and rejects custom prototypes and hostile Proxy input', () => {
    const manifest = historicalManifest();
    let getterExecuted = false;
    const accessor = { ...manifest } as Record<string, unknown>;
    Object.defineProperty(accessor, 'manifestId', {
      enumerable: true,
      get: () => {
        getterExecuted = true;
        return manifest.manifestId;
      }
    });
    const accessorResult = planYearLifecycleImport(accessor, expectation(manifest),
      createEmptyYearLifecycleState(), request('SYNTH-ACCESSOR'));
    expect(accessorResult).toMatchObject({ status: 'Rejected', exception: { code: 'MalformedInput' } });
    expect(getterExecuted).toBe(false);

    const customPrototype = Object.assign(Object.create({ inherited: 'unsafe' }), manifest);
    expect(planYearLifecycleImport(customPrototype, expectation(manifest), createEmptyYearLifecycleState(),
      request('SYNTH-PROTOTYPE'))).toMatchObject({ status: 'Rejected', exception: { code: 'MalformedInput' } });

    const hostileProxy = new Proxy(manifest, {
      ownKeys: () => { throw new Error('Hostile ownKeys trap'); }
    });
    expect(planYearLifecycleImport(hostileProxy, expectation(manifest), createEmptyYearLifecycleState(),
      request('SYNTH-PROXY'))).toMatchObject({ status: 'Rejected', exception: { code: 'MalformedInput' } });
  });

  it('rolls back to the exact pre-operation governed state and emits an attributable receipt', () => {
    const before = createEmptyYearLifecycleState();
    const beforeSha = yearLifecycleStateSha256(before);
    const applied = apply(historicalManifest(), before, 'SYNTH-ROLLBACK');
    const rolledBack = rollbackYearLifecycleImport(
      applied.state,
      applied.recovery,
      actor,
      '2026-09-22T20:30:00.000Z',
      'Synthetic controlled recovery.'
    );
    expect(rolledBack.status).toBe('RolledBack');
    if (rolledBack.status !== 'RolledBack') throw new Error('Synthetic rollback was unexpectedly rejected.');
    expect(rolledBack.state).toEqual(before);
    expect(yearLifecycleStateSha256(rolledBack.state)).toBe(beforeSha);
    expect(rolledBack.receipt).toMatchObject({
      receiptId: applied.receipt.receiptId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      reason: 'Synthetic controlled recovery.',
      restoredStateSha256: beforeSha
    });
    expect(rollbackYearLifecycleImport(applied.state, applied.recovery, actor,
      '2026-09-22T20:31:00.000Z', 'Replay recovery.')).toMatchObject({
      status: 'Rejected', exception: { code: 'RollbackAlreadyUsed' }
    });
  });

  it('rejects stale rollback without altering the later state', () => {
    const historical = apply(historicalManifest(), createEmptyYearLifecycleState(), 'SYNTH-STALE-ROLLBACK-HISTORY');
    const baseline = apply(baselineManifest(), historical.state, 'SYNTH-STALE-ROLLBACK-BASELINE', 2);
    const laterSha = yearLifecycleStateSha256(baseline.state);
    const result = rollbackYearLifecycleImport(
      baseline.state,
      historical.recovery,
      actor,
      '2026-09-22T20:32:00.000Z',
      'Stale synthetic recovery.'
    );
    expect(result).toMatchObject({ status: 'Rejected', exception: { code: 'RollbackConflict' } });
    expect(yearLifecycleStateSha256(baseline.state)).toBe(laterSha);
  });

  it('withholds apply when state changes after plan and keeps every accepted snapshot immutable', () => {
    const manifest = baselineManifest();
    const initial = createEmptyYearLifecycleState();
    const planned = planYearLifecycleImport(manifest, expectation(manifest), initial, request('SYNTH-STATE-RACE'));
    expect(planned.status).toBe('Planned');
    if (planned.status !== 'Planned') throw new Error('Synthetic plan was unexpectedly rejected.');
    const historical = apply(historicalManifest(), initial, 'SYNTH-STATE-RACE-HISTORY');
    expect(applyYearLifecycleImport(planned.plan, historical.state)).toMatchObject({
      status: 'Rejected', exception: { code: 'StateConflict' }
    });
    expect(Object.isFrozen(historical.state)).toBe(true);
    expect(Object.isFrozen(historical.state.years)).toBe(true);
    expect(Object.isFrozen(historical.state.years[0])).toBe(true);
    expect(Object.isFrozen(historical.state.years[0].historicalGoldRecords)).toBe(true);
    expect(Object.isFrozen(historical.state.receipts)).toBe(true);
  });
});
