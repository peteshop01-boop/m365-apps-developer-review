import { createHash } from 'node:crypto';
import {
  canonicaliseOptionEDraft,
  type IOptionEWorkplanDraftAggregate
} from '../models/OptionEWorkplanDraftModels';
import type {
  IOptionECanonicalDraftDto,
  IOptionELocalDraftBuffer,
  IOptionEProtectedWorkplanDto,
  IOptionESubmitRequestFields,
  IOptionESubmitRequestReadback
} from '../models/OptionEWorkplanSubmitModels';
import {
  OptionESubmitConflictError,
  OptionESubmitValidationError,
  OptionESubmitWriteTimeoutError,
  OptionEWorkplanSubmitGateway,
  type IOptionESubmitGatewayInput,
  type IOptionESubmitRequestTransport
} from './OptionEWorkplanSubmitGateway';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex').toUpperCase();
const aggregate = (): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1',
  core: {
    weightingMode: 'Equal', entries: [{
      coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1',
      role: 'Owner', contributionMethod: 'AdditiveDirect', weightPercent: 100,
      annual: { value: 10 }, q1: { value: 1 }, q2: { value: 2 }, q3: { value: 3 }, q4: { value: 4 }
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
        valueId, descriptorKey: `KCCC-BEHAVIOUR|v02|IC_OFFICER|${valueId}`,
        guidancePromptKeys: Array.from({ length: 5 }, (__, promptIndex) => `${valueId}|L1|${promptIndex + 1}`),
        selectedPromptKeys: [`${valueId}|L1|1`], commitment: `Commitment ${index + 1}`,
        periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' }
      };
    })
  }
});
const payload = (): string => canonicaliseOptionEDraft(aggregate());
const catalogueVersion = (): string => sha('KPI-1|KPI-1|v1|KPI-1|2027|v1|2027');

const input = (payloadJson = payload()): IOptionESubmitGatewayInput => {
  const canonicalDraft: IOptionECanonicalDraftDto = {
    itemId: 41, etag: '"draft-4"', version: '4.0', schemaVersion: 'kcf.workplan-draft/v1',
    payloadJson, payloadSha256: sha(payloadJson), frameworkVersion: 'KCCC-BEHAVIOUR|v02',
    catalogueVersion: catalogueVersion()
  };
  const localBuffer: IOptionELocalDraftBuffer = { ...canonicalDraft };
  const protectedWorkplan: IOptionEProtectedWorkplanDto = {
    workplanKey: 'EMP-001|2027', personKey: 'EMP-001', performanceYear: 2027, draftItemId: 41,
    draftSchemaVersion: 'kcf.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
    hierarchyEpoch: 4, aclEpoch: 4, etag: '"control-9"'
  };
  return {
    canonicalDraft, localBuffer, protectedWorkplan,
    intent: { clientSubmitId: 'fb1f6035-236e-434c-ae05-a78003badd47', clientSubmittedAt: '2026-09-18T03:00:00.000Z' }
  };
};

class Transport implements IOptionESubmitRequestTransport {
  public readonly creates: IOptionESubmitRequestFields[] = [];
  public row?: IOptionESubmitRequestReadback;
  public timeoutCreates = 0;

  public async createImmutableRequest(fields: IOptionESubmitRequestFields): Promise<void> {
    this.creates.push({ ...fields });
    if (this.timeoutCreates > 0) {
      this.timeoutCreates -= 1;
      throw new OptionESubmitWriteTimeoutError();
    }
    if (!this.row) this.row = { ...fields, id: 9, etag: '"request-1"', createdByEmail: 'employee@example.invalid' };
  }
  public async getRequestByUniqueKey(): Promise<IOptionESubmitRequestReadback | undefined> {
    return this.row ? { ...this.row } : undefined;
  }
}

describe('B13-05 Option-E immutable saved-Draft Submit Request gateway', () => {
  it('creates and canonically reads all 14 immutable Request fields before reporting recorded', async () => {
    const transport = new Transport();
    const result = await new OptionEWorkplanSubmitGateway(transport).record(input());
    expect(result.message).toBe('Submission request recorded; processing.');
    expect(transport.creates).toHaveLength(1);
    expect(Object.keys(transport.creates[0])).toHaveLength(14);
    expect(result.request).toEqual(expect.objectContaining({
      RequestKey: 'EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47', id: 9,
      DraftItemID: 41, DraftETag: '"draft-4"', DraftVersion: '4.0', PayloadJSON: payload()
    }));
  });

  it('rejects missing/unknown saved-Draft fields and creates no Request', async () => {
    const missing = JSON.parse(payload()) as { impact: Array<Record<string, unknown>> };
    delete missing.impact[0].measure;
    const unknown = JSON.parse(payload()) as { behaviours: { entries: Array<Record<string, unknown>> } };
    unknown.behaviours.entries[0].actorEmail = 'attacker@example.invalid';
    for (const candidate of [missing, unknown]) {
      const transport = new Transport();
      await expect(new OptionEWorkplanSubmitGateway(transport).record(input(JSON.stringify(candidate))))
        .rejects.toBeInstanceOf(OptionESubmitValidationError);
      expect(transport.creates).toHaveLength(0);
    }
  });

  it('rejects duplicate members and non-canonical bytes before create', async () => {
    const valid = payload();
    const candidates = [
      valid.replace('{', '{"schemaVersion":"forged",'),
      valid.replace('"coreId":"CORE-1"', '"coreId":"forged","coreId":"CORE-1"'),
      valid.replace('"valueId":"BHV-01"', '"valueId":"forged","valueId":"BHV-01"'),
      ` ${valid}`
    ];
    for (const candidate of candidates) {
      const transport = new Transport();
      await expect(new OptionEWorkplanSubmitGateway(transport).record(input(candidate)))
        .rejects.toBeInstanceOf(OptionESubmitValidationError);
      expect(transport.creates).toHaveLength(0);
    }
  });

  it('enforces approved Core role/method, deterministic weight and five governed Behaviour values', async () => {
    const invalidRole = aggregate() as unknown as { core: { entries: Array<Record<string, unknown>> } };
    invalidRole.core.entries[0].role = 'Administrator';
    const invalidMethod = aggregate() as unknown as { core: { entries: Array<Record<string, unknown>> } };
    invalidMethod.core.entries[0].contributionMethod = 'Invented';
    const invalidWeight = aggregate(); invalidWeight.core.entries[0].weightPercent = 99.99;
    const missingBehaviour = aggregate(); missingBehaviour.behaviours.entries.pop();
    for (const candidate of [invalidRole, invalidMethod, invalidWeight, missingBehaviour]) {
      const transport = new Transport();
      await expect(new OptionEWorkplanSubmitGateway(transport).record(input(JSON.stringify(candidate))))
        .rejects.toBeInstanceOf(OptionESubmitValidationError);
      expect(transport.creates).toHaveLength(0);
    }
    await expect(new OptionEWorkplanSubmitGateway(new Transport()).record(input()))
      .resolves.toMatchObject({ status: 'Recorded' });
  });

  it('requires a lowercase canonical UUID and canonical UTC client timestamp', async () => {
    const upperUuid = input(); upperUuid.intent.clientSubmitId = '7cd2b366-aa4d-4d2c-a046-a5ca92624918';
    const badTime = input(); badTime.intent.clientSubmittedAt = '@{utcNow()}';
    for (const candidate of [upperUuid, badTime]) {
      const transport = new Transport();
      await expect(new OptionEWorkplanSubmitGateway(transport).record(candidate))
        .rejects.toBeInstanceOf(OptionESubmitValidationError);
      expect(transport.creates).toHaveLength(0);
    }
  });

  it('fails before create when canonical Draft readback differs from local or protected binding', async () => {
    const candidate = input(); candidate.localBuffer = { ...candidate.localBuffer, etag: '"stale"' };
    const transport = new Transport();
    await expect(new OptionEWorkplanSubmitGateway(transport).record(candidate)).rejects.toMatchObject({
      details: expect.arrayContaining([expect.objectContaining({ path: '$.draft', code: 'CanonicalDraftMismatch' })])
    });
    expect(transport.creates).toHaveLength(0);
  });

  it('reconciles create timeout by exact unique key without issuing a second create', async () => {
    const transport = new Transport(); const candidate = input();
    transport.timeoutCreates = 1;
    transport.row = {
      RequestKey: 'EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47', PersonKey: 'EMP-001',
      PerformanceYear: 2027, WorkplanKey: 'EMP-001|2027', ClientSubmitID: candidate.intent.clientSubmitId,
      DraftItemID: 41, DraftETag: '"draft-4"', DraftVersion: '4.0', DraftSchemaVersion: 'kcf.workplan-draft/v1',
      PayloadJSON: candidate.canonicalDraft.payloadJson, PayloadSHA256: candidate.canonicalDraft.payloadSha256,
      FrameworkVersion: candidate.canonicalDraft.frameworkVersion, CatalogueVersion: candidate.canonicalDraft.catalogueVersion,
      ClientSubmittedAt: candidate.intent.clientSubmittedAt, id: 9, etag: '"request-1"',
      createdByEmail: 'employee@example.invalid'
    };
    await expect(new OptionEWorkplanSubmitGateway(transport).record(candidate)).resolves.toMatchObject({ status: 'Recorded' });
    expect(transport.creates).toHaveLength(1);
  });

  it('retries an absent timeout with the identical immutable key and fields', async () => {
    const transport = new Transport(); transport.timeoutCreates = 1;
    await new OptionEWorkplanSubmitGateway(transport).record(input());
    expect(transport.creates).toHaveLength(2);
    expect(transport.creates[1]).toEqual(transport.creates[0]);
  });

  it('treats a same-key field mismatch as conflict', async () => {
    const transport = new Transport(); const candidate = input();
    transport.row = {
      ...transport.row,
      RequestKey: 'EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47', PersonKey: 'ATTACKER',
      PerformanceYear: 2027, WorkplanKey: 'EMP-001|2027', ClientSubmitID: candidate.intent.clientSubmitId,
      DraftItemID: 41, DraftETag: '"draft-4"', DraftVersion: '4.0', DraftSchemaVersion: 'kcf.workplan-draft/v1',
      PayloadJSON: candidate.canonicalDraft.payloadJson, PayloadSHA256: candidate.canonicalDraft.payloadSha256,
      FrameworkVersion: candidate.canonicalDraft.frameworkVersion, CatalogueVersion: candidate.canonicalDraft.catalogueVersion,
      ClientSubmittedAt: candidate.intent.clientSubmittedAt, id: 9, etag: '"request-1"',
      createdByEmail: 'employee@example.invalid'
    };
    await expect(new OptionEWorkplanSubmitGateway(transport).record(candidate))
      .rejects.toBeInstanceOf(OptionESubmitConflictError);
  });
});
