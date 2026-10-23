import type { C2bCommandEffect } from '../TestPilotCommandAdmissionC2b';
import { hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import { C2B_CONTROL_CASE_PHYSICAL_FIELDS, SharePointC2bControlCaseStore,
  c2bControlCaseContentSha256, deserialiseC2bControlCase,
  type IC2bControlCasePhysicalPort, type IC2bControlCasePhysicalRecord }
  from './SharePointC2bControlCaseStore';

const sourceListId = 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d';
const physical = (): IC2bControlCasePhysicalRecord => {
  const fields: Record<string, unknown> = { ControlCaseKey: 'CONTROL-00001', ControlReference: 'CONTROL-00001',
    AuthorisedAction: 'CreateWorkplanAmendmentV2', SubjectKey: 'WORKPLAN-1', WorkplanKey: 'WORKPLAN-1',
    WorkplanVersion: 2, ExpectedETag: '"workplan-2"', ExpectedRowVersionToken: 2, Active: true,
    ValidFromUtc: '2026-09-14T00:00:00Z', ValidToUtc: '2026-09-15T00:00:00Z', Revoked: false,
    RevokedAtUtc: null, RevocationReason: null, ConsumedAtUtc: null, ConsumedCommandKey: null,
    ConsumedSourceListId: null, ConsumedSourceItemId: null, ConsumedSourceItemVersion: null,
    RecoveryHoldAtUtc: null, RecoveryHoldReason: null, RowVersionToken: 1, ControlCaseContentSHA256: '' };
  fields.ControlCaseContentSHA256 = c2bControlCaseContentSha256(fields);
  return { itemId: 41, etag: '"1"', itemVersion: '1.0', fields };
};
const mutation = (record: IC2bControlCasePhysicalRecord): C2bCommandEffect => {
  const before = deserialiseC2bControlCase(record);
  const desired = { operation: 'CompareAndSwapConsume', controlCaseKey: before.controlCaseKey,
    controlReference: before.controlReference, authorisedAction: before.authorisedAction, subjectKey: before.subjectKey,
    workplanKey: before.workplanKey, workplanVersion: before.workplanVersion, expectedETag: before.expectedETag,
    expectedRowVersionToken: before.expectedRowVersionToken, expectedStorageETag: before.storageETag,
    expectedStorageRowVersionToken: before.storageRowVersionToken, trustedUtc: '2026-09-14T01:00:00Z',
    consumedAtUtc: '2026-09-14T01:00:00Z', consumedCommandKey: 'COMMAND-1',
    consumedSourceListId: sourceListId, consumedSourceItemId: 7, consumedSourceItemVersion: '1.0' };
  return { sequence: 1, effectKey: 'EFFECT-CONTROL-1', kind: 'ControlCaseConsume', target: 'AuthoritativeControlCase',
    naturalKey: before.controlCaseKey, expectedETag: before.storageETag, expectedETagFromEffectKey: null,
    expectedRowVersionToken: before.storageRowVersionToken,
    beforeFields: before as unknown as Readonly<Record<string, unknown>>,
    beforeSha256: hashC2bCanonical(before), desiredFields: desired, desiredSha256: hashC2bCanonical(desired),
    effectSha256: 'A'.repeat(64), disposition: 'Issued', confirmation: null, confirmationSha256: null };
};
const harness = (initial: IC2bControlCasePhysicalRecord = physical()): { store: SharePointC2bControlCaseStore;
  record: IC2bControlCasePhysicalRecord; patches: Array<Readonly<Record<string, unknown>>> } => {
  const state = { record: initial, patches: [] as Array<Readonly<Record<string, unknown>>> };
  const port: IC2bControlCasePhysicalPort = { readByKey: key => Promise.resolve(
    state.record.fields.ControlCaseKey === key ? [state.record] : []),
  patchIfMatch: (itemId, etag, fields) => {
    if (itemId !== state.record.itemId || etag !== state.record.etag) throw new Error('STALE_TEST_WRITE');
    state.patches.push(fields); state.record = { ...state.record, etag: '"2"', itemVersion: '2.0',
      fields: { ...state.record.fields, ...fields } };
    return Promise.resolve({ outcome: 'Confirmed', providerReference: `item:${itemId}` });
  } };
  const result = { store: new SharePointC2bControlCaseStore(port), record: state.record, patches: state.patches };
  Object.defineProperty(result, 'record', { get: () => state.record }); return result;
};

describe('PM11 authoritative SharePoint control-case store', () => {
  it('uses the exact dedicated shape and validates its canonical content hash', async () => {
    const item = physical();
    expect(Object.keys(item.fields).sort()).toEqual([...C2B_CONTROL_CASE_PHYSICAL_FIELDS].sort());
    await expect(harness(item).store.readExact('CONTROL-00001')).resolves.toMatchObject({
      controlCaseKey: 'CONTROL-00001', storageETag: '"1"', storageRowVersionToken: 1 });
    await expect(harness({ ...item, fields: { ...item.fields, WorkplanVersion: 3 } }).store.readExact('CONTROL-00001'))
      .rejects.toThrow(/C2B_CONTROL_CASE_PHYSICAL_INVALID/);
  });

  it('rejects duplicate, wildcard, stale and already-consumed authority before mutation', async () => {
    const item = physical(); const effect = mutation(item);
    const duplicate: IC2bControlCasePhysicalPort = { readByKey: () => Promise.resolve([item, item]),
      patchIfMatch: jest.fn() };
    await expect(new SharePointC2bControlCaseStore(duplicate).readExact('CONTROL-00001'))
      .rejects.toThrow(/C2B_CONTROL_CASE_DUPLICATE/);
    await expect(harness(item).store.consume({ ...effect, expectedETag: '*' }))
      .rejects.toThrow(/C2B_CONTROL_CASE_EFFECT_INVALID/);
    await expect(harness(item).store.consume({ ...effect, expectedRowVersionToken: 2 }))
      .rejects.toThrow(/C2B_CONTROL_CASE_CAS_STALE/);
    const consumed = { ...item.fields, Active: false, ConsumedAtUtc: '2026-09-14T01:00:00Z',
      ConsumedCommandKey: 'OLD', ConsumedSourceListId: sourceListId, ConsumedSourceItemId: 1,
      ConsumedSourceItemVersion: '1.0', RowVersionToken: 2, ControlCaseContentSHA256: '' };
    consumed.ControlCaseContentSHA256 = c2bControlCaseContentSha256(consumed);
    const consumedRecord = { ...item, etag: '"2"', itemVersion: '2.0', fields: consumed };
    await expect(harness(consumedRecord).store.consume(mutation(consumedRecord)))
      .rejects.toThrow(/C2B_CONTROL_CASE_CONSUMPTION_REJECTED/);
  });

  it('performs one exact If-Match consumption and classifies NotApplied then Applied', async () => {
    const h = harness(); const effect = mutation(h.record);
    await expect(h.store.recover(effect)).resolves.toBe('NotApplied');
    await expect(h.store.consume(effect)).resolves.toMatchObject({ outcome: 'Confirmed' });
    expect(h.patches).toHaveLength(1); expect(h.patches[0]).toMatchObject({ Active: false,
      ConsumedCommandKey: 'COMMAND-1', ConsumedSourceListId: sourceListId, RowVersionToken: 2 });
    await expect(h.store.recover(effect)).resolves.toBe('Applied');
  });

  it('holds an unknown third image and returns StillUnknown', async () => {
    const original = physical(); const effect = mutation(original);
    const thirdFields = { ...original.fields, ExpectedETag: '"third"', ControlCaseContentSHA256: '' };
    thirdFields.ControlCaseContentSHA256 = c2bControlCaseContentSha256(thirdFields);
    const h = harness({ ...original, etag: '"third"', fields: thirdFields });
    await expect(h.store.recover(effect)).resolves.toBe('StillUnknown');
    expect(h.patches).toHaveLength(1); expect(h.patches[0]).toMatchObject({ Active: false,
      RecoveryHoldAtUtc: '2026-09-14T01:00:00Z', RecoveryHoldReason: 'C2B_CONTROL_CASE_RECOVERY_UNKNOWN' });
  });
});
