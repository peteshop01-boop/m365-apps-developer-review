import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import type { IOptionEPeopleRow } from '../models/OptionEWorkplanSubmitModels';
import type { IDeliveryPublicationObservation } from '../models/GovernedDeliveryPublicationV1Models';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import type { V4AclReadback } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import * as reviewContract from './OptionEWorkplanReviewContract';
import type { IOptionEReviewControl, IOptionEReviewIntent, IOptionEReviewSnapshot, IOptionEReviewReceipt,
  OptionEReviewCommand } from './OptionEWorkplanReviewContract';
import { createOptionEWorkplanReviewSourceReadback, type ReadPorts } from './OptionEWorkplanReviewSourceReadback';
import { parseV5CapturedReceipt, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
Object.assign(globalThis, { TextDecoder, TextEncoder });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const digest = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();

/** Fictional processor-state store only. simulateResult is test setup, never a production writer. */
class FictionalReviewStateStore implements ReadPorts {
  public readonly receiptBytes = readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-global-r3-receipt.json', 'utf8');
  public readonly captured = parseV5CapturedReceipt(this.receiptBytes);
  public readonly snapshotBytes = encodeV5CapturedSnapshot(this.captured.snapshot);
  public readonly manager: IOptionEPeopleRow = { personKey: 'manager', principalId: 202, email: 'manager@example.invalid', active: true };
  public people = [this.manager, { personKey: 'employee', principalId: 201, email: 'employee@example.invalid', active: true },
    { personKey: 'fictional-other', principalId: 203, email: 'other@example.invalid', active: true }];
  public readonly before: IOptionEReviewControl = { workplanKey: this.captured.snapshot.admission.authority.control.workplan,
    personKey: 'employee', performanceYear: 2026, managerPersonKey: 'manager', state: 'Submitted', transitionStatus: 'Ready',
    etag: '"control-17"', rowVersionToken: 17, hierarchyEpoch: 2, aclEpoch: 3, currentSubmittedSnapshotKey: this.captured.key };
  public control = copy(this.before);
  public header: IDeliveryPublicationObservation<IAnnualWorkplan> = {
    native: { ...this.captured.snapshot.admission.authority.workplan.native, etag: this.before.etag, version: 'current-native-42' },
    value: { ...this.captured.snapshot.admission.authority.workplan.value, state: 'Submitted', transitionStatus: 'Ready',
      rowVersionToken: 17, etag: this.before.etag } };
  public submitted: IOptionEReviewSnapshot = { snapshotKey: this.captured.key, sourceSubmittedSnapshotKey: this.captured.key,
    workplanKey: this.before.workplanKey, personKey: 'employee', performanceYear: 2026, version: 7, immutable: true,
    payloadSha256: digest(this.captured.snapshot.body) };
  public approved?: IOptionEReviewSnapshot;
  public receipt?: IOptionEReviewReceipt;
  public acl: V4AclReadback = { admissionKey: this.captured.key, hierarchyEpoch: 2, aclEpoch: 3,
    targets: ['Draft', 'Snapshot', 'Operation', 'Control'].map(kind => ({ key: `${this.before.workplanKey}/${kind}/${this.captured.key}`,
      inherited: false, complete: true, grants: [{ principal: 901, role: kind === 'Snapshot' ? 'AppendOnly' : 'MutatorNoDelete' },
        { principal: 902, role: 'AclReconciler' }, { principal: 903, role: 'FullControl' }, { principal: 201, role: 'Read' },
        ...(kind === 'Draft' ? [] : [{ principal: 202, role: 'Read' as const }])] })) };
  public calls: string[] = [];
  public command(command: OptionEReviewCommand): IOptionEReviewIntent {
    return { commandKey: 'FICTIONAL-COMMAND', command, actorPersonKey: 'manager', expectedWorkplanKey: this.before.workplanKey,
      expectedControlEtag: this.before.etag, expectedControlVersion: 17, expectedSubmittedSnapshotKey: this.captured.key,
      ...(command === 'RequestChanges' ? { reason: 'Revise the fictional annual target' } : {}) };
  }
  public simulateResult(intent: IOptionEReviewIntent): void {
    this.control = { ...this.before, state: intent.command === 'ApproveLock' ? 'Locked' : 'ChangesRequested',
      etag: '"control-18"', rowVersionToken: 18,
      ...(intent.command === 'ApproveLock' ? { currentApprovedSnapshotKey: 'FICTIONAL-APPROVED-7' } : {}) };
    this.header = { native: { ...this.header.native, etag: this.control.etag }, value: { ...this.header.value,
      state: this.control.state, rowVersionToken: 18, etag: this.control.etag } };
    this.approved = intent.command === 'ApproveLock' ? { ...this.submitted, snapshotKey: this.control.currentApprovedSnapshotKey! } : undefined;
    this.receipt = { receiptKey: 'FICTIONAL-RECEIPT', commandKey: intent.commandKey, command: intent.command,
      actorPersonKey: 'manager', workplanKey: this.control.workplanKey, submittedSnapshotKey: this.captured.key,
      controlVersionBefore: 17, controlVersionAfter: 18, processorIdentity: 'FICTIONAL-PROCESSOR-ONLY',
      auditKey: 'FICTIONAL-AUDIT', nativeCreatedAt: '2026-10-11T02:00:00.000Z',
      ...(this.approved ? { approvedSnapshotKey: this.approved.snapshotKey } : {}) };
  }
  public async readCurrentActor(): Promise<IOptionEPeopleRow> {
    this.calls.push('actor');
    const matches = this.people.filter(row => row.active && row.personKey === this.manager.personKey);
    if (matches.length !== 1 || this.people.filter(row => row.active && row.principalId === matches[0].principalId).length !== 1) {
      throw new Error('Ambiguous fictional actor');
    }
    return copy(matches[0]);
  }
  public async readCurrentHeader(workplan: string): Promise<IDeliveryPublicationObservation<IAnnualWorkplan>> {
    this.calls.push(`header:${workplan}`); return copy(this.header);
  }
  public async readReviewControl(workplan: string): Promise<IOptionEReviewControl> {
    this.calls.push(`control:${workplan}`); return copy(this.control);
  }
  public async readReviewReceipt(commandKey: string): Promise<IOptionEReviewReceipt | undefined> {
    this.calls.push(`reviewReceipt:${commandKey}`); return this.receipt && copy(this.receipt);
  }
  public async readSubmittedMetadata(key: string): Promise<IOptionEReviewSnapshot | undefined> {
    this.calls.push(`submitted:${key}`); return key === this.submitted.snapshotKey ? copy(this.submitted) : undefined;
  }
  public async readApprovedMetadata(key: string): Promise<IOptionEReviewSnapshot | undefined> {
    this.calls.push(`approved:${key}`); return key === this.approved?.snapshotKey ? copy(this.approved) : undefined;
  }
  public async readAcl(workplan: string): Promise<V4AclReadback> { this.calls.push(`acl:${workplan}`); return copy(this.acl); }
  public async readReceipt(key: string): Promise<string | undefined> {
    this.calls.push(`capturedReceipt:${key}`); return key === this.captured.key ? this.receiptBytes : undefined;
  }
  public async readSnapshot(key: string): Promise<string | undefined> {
    this.calls.push(`capturedSnapshot:${key}`); return key === this.captured.key ? this.snapshotBytes : undefined;
  }
  public async sha256(text: string): Promise<string> { this.calls.push('sha256'); return digest(text); }
}

describe('real source composition into sealed manager verifier', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each(['RequestChanges', 'ApproveLock'] as const)('reads the fictional %s result and calls the actual verifier last', async command => {
    const store = new FictionalReviewStateStore(), intent = store.command(command), before = await store.readReviewControl(store.before.workplanKey);
    store.simulateResult(intent); store.calls = [];
    const verifier = jest.spyOn(reviewContract, 'verifyOptionEReviewReadback');
    const byteHashes = [digest(store.receiptBytes), digest(store.snapshotBytes)];
    const result = await createOptionEWorkplanReviewSourceReadback(store).confirm(intent, before);
    expect(verifier).toHaveBeenCalledTimes(1); expect(verifier).toHaveBeenCalledWith(intent, result);
    expect(result.after.state).toBe(command === 'ApproveLock' ? 'Locked' : 'ChangesRequested');
    expect(result.receipt.processorIdentity).toBe('FICTIONAL-PROCESSOR-ONLY');
    expect(store.calls.slice(0, 6)).toEqual(['actor', `header:${before.workplanKey}`, `control:${before.workplanKey}`,
      `reviewReceipt:${intent.commandKey}`, `capturedReceipt:${store.captured.key}`, `capturedSnapshot:${store.captured.key}`]);
    expect(store.calls.filter(call => call.startsWith('submitted:'))).toHaveLength(2);
    expect(store.calls.filter(call => call.startsWith('acl:'))).toHaveLength(2);
    expect([digest(store.receiptBytes), digest(store.snapshotBytes)]).toEqual(byteHashes);
    expect(store.captured.snapshot.admission.authority.workplan.value.state).toBe('Draft');
    expect(result.after.hierarchyEpoch).not.toBe(result.after.aclEpoch);
    expect(Object.keys(createOptionEWorkplanReviewSourceReadback(store))).toEqual(['confirm']);
  });
  it.each(['person', 'principal'])('holds ambiguous current actor %s from the real fictional provider', async collision => {
    const store = new FictionalReviewStateStore(), intent = store.command('ApproveLock'); store.simulateResult(intent);
    store.people.push({ ...store.manager, ...(collision === 'principal' ? { personKey: 'duplicate-principal' } : { principalId: 204 }) });
    await expect(createOptionEWorkplanReviewSourceReadback(store).confirm(intent, store.before))
      .rejects.toMatchObject({ name: 'OptionEReviewBoundaryError', code: 'ReadUnavailable' });
  });
  it('holds a replaced receipt after actual hashing instead of returning the earlier finished object', async () => {
    const store = new FictionalReviewStateStore(), intent = store.command('ApproveLock'); store.simulateResult(intent);
    const verifier = jest.spyOn(reviewContract, 'verifyOptionEReviewReadback');
    jest.spyOn(store, 'sha256').mockImplementation(async text => { store.receipt!.auditKey = 'REPLACED'; return digest(text); });
    await expect(createOptionEWorkplanReviewSourceReadback(store).confirm(intent, store.before))
      .rejects.toMatchObject({ name: 'OptionEReviewBoundaryError', code: 'SourceChanged' });
    expect(verifier).not.toHaveBeenCalled();
  });
});
