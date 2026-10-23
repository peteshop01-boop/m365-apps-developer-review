import { createHash } from 'node:crypto';
import { canonicaliseOptionEDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import type {
  IOptionECanonicalDraftDto,
  IOptionELocalDraftBuffer,
  IOptionEProtectedWorkplanDto,
  IOptionESubmitOperation,
  IOptionESubmitRequestFields,
  IOptionESubmitRequestReadback
} from '../models/OptionEWorkplanSubmitModels';
import { OptionEWorkplanSubmitGateway, type IOptionESubmitRequestTransport } from '../services/OptionEWorkplanSubmitGateway';
import {
  OptionEWorkplanSubmitController,
  type IOptionESubmitControllerContext,
  type IOptionESubmitStatusReader
} from './OptionEWorkplanSubmitController';

const aggregate: IOptionEWorkplanDraftAggregate = {
  schemaVersion: 'kcf.workplan-draft/v1',
  core: { weightingMode: 'Equal', entries: [{
    coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1',
    role: 'Owner', contributionMethod: 'AdditiveDirect', weightPercent: 100,
    annual: { value: 1 }, q1: { value: 1 }, q2: { value: 1 }, q3: { value: 1 }, q4: { value: 1 }
  }] },
  impact: [{ impactId: 'IMPACT-1', wording: 'Improve service', measure: 'Cases', unit: 'count',
    annual: 1, q1: 1, q2: 1, q3: 1, q4: 1, success: 'Delivered' }],
  behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: Array.from({ length: 5 }, (_, index) => {
      const valueId = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
      return { valueId, descriptorKey: `KCCC-BEHAVIOUR|v02|IC_OFFICER|${valueId}`,
        guidancePromptKeys: Array.from({ length: 5 }, (__, promptIndex) => `${valueId}|L1|${promptIndex + 1}`),
        selectedPromptKeys: [`${valueId}|L1|1`], commitment: `Commitment ${index + 1}`,
        periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' } };
    }) }
};
const payload = canonicaliseOptionEDraft(aggregate);
const sha = (value: string): string => createHash('sha256').update(value).digest('hex').toUpperCase();
const catalogueVersion = sha('KPI-1|KPI-1|v1|KPI-1|2027|v1|2027');
const context = (): IOptionESubmitControllerContext => {
  const draft: IOptionECanonicalDraftDto = {
    itemId: 41, etag: '"draft-4"', version: '4.0', schemaVersion: 'kcf.workplan-draft/v1',
    payloadJson: payload, payloadSha256: sha(payload), frameworkVersion: 'KCCC-BEHAVIOUR|v02', catalogueVersion
  };
  const local: IOptionELocalDraftBuffer = { ...draft };
  const control: IOptionEProtectedWorkplanDto = {
    workplanKey: 'EMP-001|2027', personKey: 'EMP-001', performanceYear: 2027, draftItemId: 41,
    draftSchemaVersion: 'kcf.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
    hierarchyEpoch: 4, aclEpoch: 4, etag: '"control-1"'
  };
  return { canonicalDraft: draft, localBuffer: local, protectedWorkplan: control };
};

class Transport implements IOptionESubmitRequestTransport {
  public creates: IOptionESubmitRequestFields[] = [];
  public release?: () => void;
  private row?: IOptionESubmitRequestReadback;
  public async createImmutableRequest(fields: IOptionESubmitRequestFields): Promise<void> {
    this.creates.push({ ...fields });
    if (this.release === undefined) await new Promise<void>(resolve => { this.release = resolve; });
    this.row = { ...fields, id: 1, etag: '"request-1"', createdByEmail: 'employee@example.invalid' };
  }
  public async getRequestByUniqueKey(): Promise<IOptionESubmitRequestReadback | undefined> { return this.row; }
}

class Status implements IOptionESubmitStatusReader {
  public operation?: IOptionESubmitOperation;
  public control?: IOptionEProtectedWorkplanDto;
  public operationError?: Error;
  public controlError?: Error;
  public operationReads: string[] = [];
  public controlReads: string[] = [];
  public async readOperation(requestKey: string): Promise<IOptionESubmitOperation | undefined> {
    this.operationReads.push(requestKey);
    if (this.operationError) throw this.operationError;
    return this.operation;
  }
  public async readProtectedWorkplan(workplanKey: string): Promise<IOptionEProtectedWorkplanDto | undefined> {
    this.controlReads.push(workplanKey);
    if (this.controlError) throw this.controlError;
    return this.control;
  }
}

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

const deferred = <T>(): IDeferred<T> => {
  let settle!: (value: T) => void;
  let fail!: (reason: Error) => void;
  const promise = new Promise<T>((resolve, reject) => { settle = resolve; fail = reject; });
  return { promise, resolve: settle, reject: fail };
};

class QueuedStatus implements IOptionESubmitStatusReader {
  public operationReads: string[] = [];
  public controlReads: string[] = [];
  public operations: Array<IDeferred<IOptionESubmitOperation | undefined>> = [];
  public controls: Array<IDeferred<IOptionEProtectedWorkplanDto | undefined>> = [];

  public readOperation(requestKey: string): Promise<IOptionESubmitOperation | undefined> {
    const slot = deferred<IOptionESubmitOperation | undefined>();
    this.operationReads.push(requestKey); this.operations.push(slot);
    return slot.promise;
  }

  public readProtectedWorkplan(workplanKey: string): Promise<IOptionEProtectedWorkplanDto | undefined> {
    const slot = deferred<IOptionEProtectedWorkplanDto | undefined>();
    this.controlReads.push(workplanKey); this.controls.push(slot);
    return slot.promise;
  }
}

class RecoveringTransport implements IOptionESubmitRequestTransport {
  public attempts: IOptionESubmitRequestFields[] = [];
  private row?: IOptionESubmitRequestReadback;

  public async createImmutableRequest(fields: IOptionESubmitRequestFields): Promise<void> {
    this.attempts.push({ ...fields });
    if (this.attempts.length === 1) throw new Error('synthetic-transport-failure');
    this.row = { ...fields, id: 2, etag: '"request-2"', createdByEmail: 'employee@example.invalid' };
  }

  public async getRequestByUniqueKey(): Promise<IOptionESubmitRequestReadback | undefined> { return this.row; }
}

class ImmediateTransport implements IOptionESubmitRequestTransport {
  public creates: IOptionESubmitRequestFields[] = [];
  private row?: IOptionESubmitRequestReadback;

  public async createImmutableRequest(fields: IOptionESubmitRequestFields): Promise<void> {
    this.creates.push({ ...fields });
    this.row = { ...fields, id: 3, etag: '"request-3"', createdByEmail: 'employee@example.invalid' };
  }

  public async getRequestByUniqueKey(): Promise<IOptionESubmitRequestReadback | undefined> { return this.row; }
}

const make = (transport: IOptionESubmitRequestTransport, status = new Status()): OptionEWorkplanSubmitController =>
  new OptionEWorkplanSubmitController(
    new OptionEWorkplanSubmitGateway(transport), status,
    () => 'fb1f6035-236e-434c-ae05-a78003badd47', () => '2026-09-18T03:00:00.000Z'
  );

const completedOperation = (
  current: IOptionESubmitControllerContext,
  requestKey: string,
  overrides: Partial<IOptionESubmitOperation> = {}
): IOptionESubmitOperation => ({
  operationKey: requestKey, requestKey, workplanKey: current.protectedWorkplan.workplanKey,
  personKey: current.protectedWorkplan.personKey,
  performanceYear: current.protectedWorkplan.performanceYear,
  attemptCount: 7, processorIdentity: 'processor', checkpoint: 'Completed', outcome: 'Completed',
  etag: '"operation-7"', ...overrides
});

const submittedControl = (
  current: IOptionESubmitControllerContext,
  requestKey: string,
  overrides: Partial<IOptionEProtectedWorkplanDto> = {}
): IOptionEProtectedWorkplanDto => ({
  ...current.protectedWorkplan, state: 'Submitted', transitionStatus: 'Ready',
  currentSubmittedSnapshotKey: requestKey, pendingRequestKey: '', ...overrides
});

describe('B13-04 Option-E Submit client truth state', () => {
  it('disables double-click immediately and reuses one Promise, ClientSubmitID and RequestKey', async () => {
    const transport = new Transport(); const controller = make(transport); const current = context();
    const first = controller.submit(current); const second = controller.submit(current);
    expect(second).toBe(first);
    expect(controller.state()).toMatchObject({ phase: 'Recording', disabled: true });
    expect(transport.creates).toHaveLength(1);
    transport.release?.();
    await expect(first).resolves.toMatchObject({
      phase: 'Processing', disabled: true, message: 'Submission request recorded; processing.',
      requestKey: 'EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47'
    });
    expect(transport.creates).toHaveLength(1);
  });

  it('does not issue a Request when the canonical Draft or Workplans preconditions fail', async () => {
    const transport = new Transport(); const controller = make(transport); const current = context();
    current.localBuffer = { ...current.localBuffer, payloadSha256: 'B'.repeat(64) };
    await expect(controller.submit(current)).resolves.toMatchObject({ phase: 'Blocked', disabled: true });
    expect(transport.creates).toHaveLength(0);
  });

  it('never says Submitted for latency, partial completion or mismatched protected readback', async () => {
    const transport = new Transport(); const status = new Status(); const controller = make(transport, status);
    const current = context(); const pending = controller.submit(current); transport.release?.(); await pending;
    await expect(controller.refresh(current)).resolves.toMatchObject({ phase: 'Processing' });
    const key = controller.state().requestKey as string;
    status.operation = {
      operationKey: key, requestKey: key, workplanKey: current.protectedWorkplan.workplanKey,
      personKey: 'EMP-001', performanceYear: 2027, attemptCount: 7, processorIdentity: 'processor',
      checkpoint: 'Completed', outcome: 'Completed', etag: '"operation-7"'
    };
    status.control = { ...current.protectedWorkplan, state: 'Submitted', transitionStatus: 'AclPending', currentSubmittedSnapshotKey: key };
    await expect(controller.refresh(current)).resolves.toMatchObject({ phase: 'Processing' });
  });

  it('says Submitted only after Completed and exact Submitted/Ready Workplans readback', async () => {
    const transport = new Transport(); const status = new Status(); const controller = make(transport, status);
    const current = context(); const pending = controller.submit(current); transport.release?.(); await pending;
    const key = controller.state().requestKey as string;
    status.operation = {
      operationKey: key, requestKey: key, workplanKey: current.protectedWorkplan.workplanKey,
      personKey: 'EMP-001', performanceYear: 2027, attemptCount: 7, processorIdentity: 'processor',
      checkpoint: 'Completed', outcome: 'Completed', etag: '"operation-7"'
    };
    status.control = {
      ...current.protectedWorkplan, state: 'Submitted', transitionStatus: 'Ready',
      currentSubmittedSnapshotKey: key, pendingRequestKey: ''
    };
    await expect(controller.refresh(current)).resolves.toMatchObject({ phase: 'Submitted', message: 'Submitted' });
  });

  it('reports Rejected and RecoveryHold without promoting either to Submitted', async () => {
    for (const outcome of ['Rejected', 'RecoveryHold'] as const) {
      const transport = new Transport(); const status = new Status(); const controller = make(transport, status);
      const current = context(); const pending = controller.submit(current); transport.release?.(); await pending;
      const key = controller.state().requestKey as string;
      status.operation = {
        operationKey: key, requestKey: key, workplanKey: current.protectedWorkplan.workplanKey,
        personKey: 'EMP-001', performanceYear: 2027, attemptCount: 4, processorIdentity: 'processor',
        checkpoint: 'ControlPointed', outcome, etag: '"operation-4"'
      };
      await expect(controller.refresh(current)).resolves.toMatchObject({ phase: outcome });
    }
  });

  it('fails closed on an unexpected record error and safely retries the same immutable intent', async () => {
    const transport = new RecoveringTransport(); const controller = make(transport); const current = context();

    await expect(controller.submit(current)).rejects.toThrow('synthetic-transport-failure');
    expect(controller.state()).toEqual({
      phase: 'Error', disabled: false,
      message: 'Submission request could not be confirmed. Retry safely; no submitted status has been declared.',
      errors: []
    });

    await expect(controller.submit(current)).resolves.toMatchObject({
      phase: 'Processing', disabled: true,
      requestKey: 'EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47'
    });
    expect(transport.attempts).toHaveLength(2);
    expect(transport.attempts[1]).toMatchObject({
      RequestKey: transport.attempts[0].RequestKey,
      ClientSubmitID: transport.attempts[0].ClientSubmitID,
      ClientSubmittedAt: transport.attempts[0].ClientSubmittedAt
    });
  });

  it('fails closed on an unexpected operation read and retries status without creating another request', async () => {
    const transport = new ImmediateTransport(); const status = new Status(); const controller = make(transport, status);
    const current = context(); await controller.submit(current); const requestKey = controller.state().requestKey;
    status.operationError = new Error('synthetic-status-read-failure');

    await expect(controller.refresh(current)).rejects.toThrow('synthetic-status-read-failure');
    expect(controller.state()).toEqual({
      phase: 'Error', disabled: false,
      message: 'Submission status could not be refreshed. Retry safely; no submitted status has been declared.',
      requestKey, errors: []
    });

    status.operationError = undefined;
    expect(controller.evaluate(current)).toMatchObject({ phase: 'Idle', requestKey });
    await expect(controller.submit(current)).resolves.toMatchObject({ phase: 'Processing', requestKey });
    expect(transport.creates).toHaveLength(1);
  });

  it('fails closed on an unexpected protected read and preserves the recorded request for retry', async () => {
    const transport = new ImmediateTransport(); const status = new Status(); const controller = make(transport, status);
    const current = context(); await controller.submit(current); const requestKey = controller.state().requestKey;
    status.controlError = new Error('synthetic-protected-read-failure');

    await expect(controller.refresh(current)).rejects.toThrow('synthetic-protected-read-failure');
    expect(controller.state()).toEqual({
      phase: 'Error', disabled: false,
      message: 'Submission status could not be refreshed. Retry safely; no submitted status has been declared.',
      requestKey, errors: []
    });

    status.controlError = undefined;
    expect(controller.evaluate(current)).toMatchObject({ phase: 'Idle', requestKey });
    await expect(controller.submit(current)).resolves.toMatchObject({ phase: 'Processing', requestKey });
    expect(transport.creates).toHaveLength(1);
  });

  it('keeps a confirmed request refresh-only after public context evaluation', async () => {
    const transport = new ImmediateTransport(); const status = new Status(); const controller = make(transport, status);
    const current = context(); await controller.submit(current); const requestKey = controller.state().requestKey;
    const refreshedContext = context();
    refreshedContext.canonicalDraft = { ...refreshedContext.canonicalDraft, etag: '"draft-5"', version: '5.0' };
    refreshedContext.localBuffer = { ...refreshedContext.localBuffer, etag: '"draft-5"', version: '5.0' };

    expect(controller.evaluate(refreshedContext)).toMatchObject({ phase: 'Idle', requestKey });
    await expect(controller.submit(refreshedContext)).resolves.toMatchObject({ phase: 'Processing', requestKey });
    expect(transport.creates).toHaveLength(1);
  });

  it('keeps concurrent retries refresh-only after a confirmed request and blocked re-evaluation', async () => {
    const transport = new ImmediateTransport(); const status = new Status(); const controller = make(transport, status);
    const current = context(); await controller.submit(current); const requestKey = controller.state().requestKey;
    const staleContext = context();
    staleContext.localBuffer = { ...staleContext.localBuffer, payloadSha256: 'B'.repeat(64) };

    expect(controller.evaluate(staleContext)).toMatchObject({ phase: 'Blocked', requestKey });
    const first = controller.submit(staleContext); const second = controller.submit(staleContext);
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ phase: 'Processing', requestKey }),
      expect.objectContaining({ phase: 'Processing', requestKey })
    ]);
    expect(transport.creates).toHaveLength(1);
  });

  it('freezes the complete pre-confirmation intent across caller coordinate substitution', async () => {
    const substitutions: Array<(value: IOptionESubmitControllerContext) => void> = [
      value => { value.protectedWorkplan = { ...value.protectedWorkplan, workplanKey: 'EMP-001|2027|OTHER' }; },
      value => {
        value.protectedWorkplan = {
          ...value.protectedWorkplan, personKey: 'EMP-999', performanceYear: 2028, workplanKey: 'EMP-999|2028'
        };
      },
      value => {
        value.canonicalDraft = { ...value.canonicalDraft, itemId: 91, etag: '"draft-91"', version: '1.0' };
        value.localBuffer = { ...value.localBuffer, itemId: 91, etag: '"draft-91"', version: '1.0' };
        value.protectedWorkplan = { ...value.protectedWorkplan, draftItemId: 91 };
      }
    ];

    for (const substitute of substitutions) {
      const transport = new RecoveringTransport(); const controller = make(transport);
      await expect(controller.submit(context())).rejects.toThrow('synthetic-transport-failure');
      const changed = context(); substitute(changed);
      await expect(controller.submit(changed)).resolves.toMatchObject({
        phase: 'Processing', requestKey: 'EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47'
      });
      expect(transport.attempts).toHaveLength(2);
      expect(transport.attempts[1]).toEqual(transport.attempts[0]);
    }
  });

  it('reads only frozen status coordinates and rejects substituted protected readback coordinates', async () => {
    const substitutions: Array<Partial<IOptionEProtectedWorkplanDto>> = [
      { workplanKey: 'EMP-001|2027|OTHER' },
      { personKey: 'EMP-999' },
      { performanceYear: 2028 },
      { draftItemId: 91 },
      { workplanKey: undefined as unknown as string },
      { personKey: undefined as unknown as string },
      { performanceYear: undefined as unknown as number },
      { draftItemId: undefined as unknown as number }
    ];

    for (const substitution of substitutions) {
      const transport = new ImmediateTransport(); const status = new Status(); const controller = make(transport, status);
      const original = context(); await controller.submit(original); const key = controller.state().requestKey as string;
      const caller = context();
      caller.protectedWorkplan = { ...caller.protectedWorkplan, workplanKey: 'ATTACKER|2099' };
      status.operation = completedOperation(original, key);
      status.control = submittedControl(original, key, substitution);
      await expect(controller.refresh(caller)).resolves.toMatchObject({
        phase: 'Error', requestKey: key,
        message: 'Submission status coordinates did not match the recorded request. Retry safely; no submitted status has been declared.'
      });
      expect(status.operationReads).toEqual([key]);
      expect(status.controlReads).toEqual([original.protectedWorkplan.workplanKey]);
      expect(transport.creates).toHaveLength(1);
    }
  });

  it('rejects missing or substituted operation coordinates before any Submitted outcome', async () => {
    const substitutions: Array<Partial<IOptionESubmitOperation>> = [
      { operationKey: 'ATTACK-OP' }, { requestKey: 'ATTACK-REQ' },
      { workplanKey: 'ATTACKER|2099' }, { personKey: 'ATTACKER' }, { performanceYear: 2099 },
      { operationKey: undefined as unknown as string }, { requestKey: undefined as unknown as string },
      { workplanKey: undefined as unknown as string }, { personKey: undefined as unknown as string },
      { performanceYear: undefined as unknown as number }
    ];

    for (const substitution of substitutions) {
      const transport = new ImmediateTransport(); const status = new Status(); const controller = make(transport, status);
      const original = context(); await controller.submit(original); const key = controller.state().requestKey as string;
      status.operation = completedOperation(original, key, substitution);
      status.control = submittedControl(original, key);
      await expect(controller.refresh(original)).resolves.toMatchObject({ phase: 'Error', requestKey: key });
      expect(controller.state().phase).not.toBe('Submitted');
    }
  });

  it('binds caller context to the frozen request while retaining exact pointer and pending-key semantics', async () => {
    const transport = new ImmediateTransport(); const status = new Status(); const controller = make(transport, status);
    const original = context(); await controller.submit(original); const key = controller.state().requestKey as string;
    const changedCaller = context();
    changedCaller.protectedWorkplan = {
      ...changedCaller.protectedWorkplan, personKey: 'EMP-999', performanceYear: 2028,
      workplanKey: 'EMP-999|2028', draftItemId: 91
    };
    status.operation = completedOperation(original, key);
    status.control = submittedControl(original, key);
    await expect(controller.refresh(changedCaller)).resolves.toMatchObject({ phase: 'Submitted', requestKey: key });
    expect(status.controlReads).toEqual([original.protectedWorkplan.workplanKey]);

    status.control = submittedControl(original, key, { currentSubmittedSnapshotKey: 'OTHER' });
    await expect(controller.refresh(changedCaller)).resolves.toMatchObject({ phase: 'Processing', requestKey: key });
    status.control = submittedControl(original, key, { pendingRequestKey: 'OTHER' });
    await expect(controller.refresh(changedCaller)).resolves.toMatchObject({ phase: 'Processing', requestKey: key });
  });

  it('prevents stale refreshes from overwriting newer Rejected or Submitted state in either completion order', async () => {
    for (const terminal of ['Rejected', 'RecoveryHold'] as const) {
      for (const olderCompletesFirst of [false, true]) {
        const transport = new ImmediateTransport(); const status = new QueuedStatus(); const controller = make(transport, status);
        const original = context(); await controller.submit(original); const key = controller.state().requestKey as string;
        const older = controller.refresh(original); const newer = controller.refresh(original);
        if (olderCompletesFirst) {
          status.operations[0].resolve(completedOperation(original, key));
          status.controls[0].resolve(submittedControl(original, key));
          await expect(older).resolves.toMatchObject({ phase: 'Processing', requestKey: key });
        }
        status.operations[1].resolve(completedOperation(original, key, { outcome: terminal, checkpoint: 'ControlPointed' }));
        status.controls[1].resolve(original.protectedWorkplan);
        await expect(newer).resolves.toMatchObject({ phase: terminal, requestKey: key });
        if (!olderCompletesFirst) {
          status.operations[0].resolve(completedOperation(original, key));
          status.controls[0].resolve(submittedControl(original, key));
          await expect(older).resolves.toMatchObject({ phase: terminal, requestKey: key });
        }
        expect(controller.state()).toMatchObject({ phase: terminal, requestKey: key });
      }
    }

    for (const olderCompletesFirst of [false, true]) {
      const transport = new ImmediateTransport(); const status = new QueuedStatus(); const controller = make(transport, status);
      const original = context(); await controller.submit(original); const key = controller.state().requestKey as string;
      const older = controller.refresh(original); const newer = controller.refresh(original);
      if (olderCompletesFirst) {
        status.operations[0].resolve(undefined); status.controls[0].resolve(undefined);
        await expect(older).resolves.toMatchObject({ phase: 'Processing', requestKey: key });
      }
      status.operations[1].resolve(completedOperation(original, key));
      status.controls[1].resolve(submittedControl(original, key));
      await expect(newer).resolves.toMatchObject({ phase: 'Submitted', requestKey: key });
      if (!olderCompletesFirst) {
        status.operations[0].resolve(undefined); status.controls[0].resolve(undefined);
        await expect(older).resolves.toMatchObject({ phase: 'Submitted', requestKey: key });
      }
      expect(controller.state()).toMatchObject({ phase: 'Submitted', requestKey: key });
    }
  });

  it('prevents an older Completed refresh from overwriting a newer status-read Error', async () => {
    const transport = new ImmediateTransport(); const status = new QueuedStatus(); const controller = make(transport, status);
    const original = context(); await controller.submit(original); const key = controller.state().requestKey as string;
    const older = controller.refresh(original); const newer = controller.refresh(original);
    status.operations[1].reject(new Error('synthetic-newer-status-error'));
    status.controls[1].resolve(original.protectedWorkplan);
    await expect(newer).rejects.toThrow('synthetic-newer-status-error');
    expect(controller.state()).toMatchObject({ phase: 'Error', requestKey: key });
    status.operations[0].resolve(completedOperation(original, key));
    status.controls[0].resolve(submittedControl(original, key));
    await expect(older).resolves.toMatchObject({ phase: 'Error', requestKey: key });
    expect(controller.state()).toMatchObject({ phase: 'Error', requestKey: key });
  });
});
