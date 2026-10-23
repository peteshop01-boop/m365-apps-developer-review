import { canonicaliseOptionEDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import { EXACT_BODY_V4, type V4Admission, type V4Control, type V4NativeRequest,
  type V4Operation, type V4Receipt, type V4ReferenceRow } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import type { IOptionEDraftSaveSnapshot } from '../components/OptionEDraftSaveController';
import { OptionEWorkplanSubmitExactBodyV4Client, type IOptionEV4ClientPorts, type V4ClientSource } from './OptionEWorkplanSubmitExactBodyV4Client';
import { parseV4Request, v4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';
const command = 'fb1f6035-236e-434c-ae05-a78003badd47';
const clone = <T,>(v: T): T => JSON.parse(v4Canonical(v)) as T;

/** Ordinary full synthetic source. No authentication, native admission or installed proof. */
const aggregate = (): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1',
  core: { weightingMode: 'Equal', entries: [{ coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1',
    targetVersionKey: 'KPI-1|2027|v1', role: 'Owner', contributionMethod: 'AdditiveDirect', weightPercent: 100,
    annual: { value: 10 }, q1: { value: 1 }, q2: { value: 2 }, q3: { value: 3 }, q4: { value: 4 } }] },
  impact: [], behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: (['BHV-01','BHV-02','BHV-03','BHV-04','BHV-05'] as const).map(valueId => ({
      valueId, descriptorKey: `descriptor|${valueId}`, guidancePromptKeys: Array.from({ length: 5 }, (_, i) => `${valueId}|${i + 1}`),
      selectedPromptKeys: [`${valueId}|1`], commitment: `Commitment ${valueId}`,
      periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' }
    })) }
});
function fixture(): { source: V4ClientSource; saved: IOptionEDraftSaveSnapshot } {
  const payload = aggregate(), body = canonicaliseOptionEDraft(payload);
  const entries = payload.core.entries;
  const groups: [V4ReferenceRow['kind'], object[]][] = [
    ['Kpi', entries.map(e => ({ kpiId: e.kpiId, kpiVersionKey: e.kpiVersionKey, active: true }))],
    ['Target', entries.map(e => ({ targetVersionKey: e.targetVersionKey, kpiId: e.kpiId, performanceYear: 2027,
      status: 'Approved', role: e.role, annual: e.annual, q1: e.q1, q2: e.q2, q3: e.q3, q4: e.q4 }))],
    ['Framework', [{ frameworkVersion: payload.behaviours.frameworkVersion, published: true, immutable: true }]],
    ['Assignment', [{ personKey: 'EMP-001', frameworkVersion: payload.behaviours.frameworkVersion,
      roleTier: 'IC_OFFICER', roleLevelCode: 'L1', active: true }]],
    ['Value', payload.behaviours.entries.map((e, i) => ({ frameworkValueKey: `${payload.behaviours.frameworkVersion}|${e.valueId}`,
      frameworkVersion: payload.behaviours.frameworkVersion, valueId: e.valueId, governedOrder: i + 1,
      roleTier: 'IC_OFFICER', descriptorKey: e.descriptorKey }))],
    ['Prompt', payload.behaviours.entries.flatMap(e => e.guidancePromptKeys.map(promptKey => ({ promptKey, behaviourKey: e.valueId,
      roleTier: 'IC_OFFICER', active: true })))]
  ];
  let itemId = 100;
  const source: V4ClientSource = {
    draft: { itemId: 41, etag: '"d1"', version: '1.0', schema: 'kcf.workplan-draft/v1', body },
    references: { asOf: '2026-10-02T20:00:00.000Z', rows: groups.flatMap(([kind, rows]) => rows.map((row, i) => ({
      kind, key: `${kind}-${i}`, itemId: ++itemId, etag: '"r1"', version: '1.0', body: v4Canonical(row)
    }))) },
    actor: { key: 'EMP-001', principal: 201, active: true, manager: 'MGR-001', version: '1.0' },
    manager: { key: 'MGR-001', principal: 202, active: true, version: '1.0' },
    control: { workplan: 'EMP-001|2027', person: 'EMP-001', year: 2027, draftId: 41, manager: 'MGR-001',
      hierarchyEpoch: 4, aclEpoch: 4, etag: '"c1"', state: 'Draft', transition: 'Ready' }
  };
  const saved: IOptionEDraftSaveSnapshot = { status: 'Saved', visibleStatus: 'Saved', buffer: payload,
    retainedBuffer: false, canResolveConflict: false, requiresCanonicalReopen: false,
    canonical: { itemId: 41, etag: '"d1"', aggregate: payload, payloadJson: body, payloadSha256: 'A'.repeat(64), binding: {
      peopleItemId: 1, peopleUniqueId: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', email: 'employee@example.invalid',
      personKey: 'EMP-001', workplanItemId: 2, workplanUniqueId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08',
      workplanEtag: '"c1"', workplanKey: 'EMP-001|2027', performanceYear: 2027, draftItemId: 41,
      draftSchemaVersion: 'kcf.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready', pendingRequestKey: '', rowVersionToken: 1
    } } };
  return { source, saved };
}
class SyntheticPorts implements IOptionEV4ClientPorts {
  public binding: IOptionEV4ClientPorts['binding'] = { kind: 'domain-test', capability: EXACT_BODY_V4,
    protectedOrigin: true, principals: { content: 301, acl: 302, recovery: 303 } };
  public bodies: string[] = [];
  public native?: V4NativeRequest;
  public operation?: V4Operation;
  public receipt?: V4Receipt;
  public control: V4Control;
  public constructor(public source: V4ClientSource) { this.control = clone(source.control); }
  public async readCurrentSource(): Promise<V4ClientSource> { return clone(this.source); }
  public async createImmutableRequest(body: string): Promise<void> {
    this.bodies.push(body); const query = parseV4Request(body);
    this.native = { itemId: 42, etag: '"request-1"', version: '1.0', createdBy: 201, body, query };
  }
  public async readImmutableRequest(): Promise<V4NativeRequest | undefined> { return this.native && clone(this.native); }
  public async readOperation(): Promise<V4Operation | undefined> { return this.operation && clone(this.operation); }
  public async readControl(): Promise<V4Control> { return clone(this.control); }
  public async readReceipt(): Promise<V4Receipt | undefined> { return this.receipt && clone(this.receipt); }
  public complete(): void {
    const key = `EMP-001|2027|${command}`;
    const admission: V4Admission = { key, eventAt: '2026-10-02T20:00:00.000Z', authority: { ...clone(this.source), request: clone(this.native!) } };
    this.operation = { admission, checkpoint: 'Completed', outcome: 'Completed', etag: '"op-7"' };
    this.control = { ...this.source.control, etag: '"c7"', state: 'Submitted', transition: 'Ready', snapshot: key };
    this.receipt = { key, admission, snapshot: { key, admission, body: this.source.draft.body,
      referencesBody: v4Canonical(this.source.references) }, nativeCreated: '2026-10-02T20:00:01.000Z' };
  }
}

test('ordinary closed-v4 request preserves full source/reference bodies and confirms exact status/control/receipt without duplicate request', async () => {
  const { source, saved } = fixture(); const ports = new SyntheticPorts(source);
  const client = new OptionEWorkplanSubmitExactBodyV4Client(ports, () => command);
  expect(client.installedAvailable()).toBe(false);
  expect((await client.submit(saved)).phase).toBe('Processing');
  expect(ports.bodies).toHaveLength(1);
  const request = parseV4Request(ports.bodies[0]);
  expect(request.source).toEqual(source.draft);
  expect(request.referenceBody).toBe(v4Canonical(source.references));
  expect(ports.bodies[0]).not.toContain('PayloadSHA256');
  expect(Object.keys(request).sort()).toEqual(['action','capability','command','person','referenceBody','source','workplan','year']);
  ports.complete();
  expect((await client.submit(saved)).phase).toBe('Submitted');
  expect((await client.refresh()).phase).toBe('Submitted');
  expect(ports.bodies).toHaveLength(1);
});
test('unbound or native-unadmitted ports hold without default Submit activation', async () => {
  const { source, saved } = fixture(); const ports = new SyntheticPorts(source);
  const unbound = new OptionEWorkplanSubmitExactBodyV4Client();
  expect(unbound.installedAvailable()).toBe(false);
  expect((await unbound.submit(saved)).phase).toBe('HOLD');
  ports.binding = { ...ports.binding, kind: 'native' };
  const native = new OptionEWorkplanSubmitExactBodyV4Client(ports);
  expect(native.installedAvailable()).toBe(false);
  expect((await native.submit(saved)).phase).toBe('HOLD');
  expect(ports.bodies).toHaveLength(0);
});
test.each(['version','principal','saved-body','unsaved'])('ordinary unavailable %s input holds before request creation', async missing => {
  const { source, saved } = fixture(); const ports = new SyntheticPorts(source);
  if (missing === 'version') source.draft.version = '';
  if (missing === 'principal') source.actor.principal = 0;
  if (missing === 'saved-body') source.draft.etag = '"d2"';
  if (missing === 'unsaved') saved.status = 'Unsaved';
  expect((await new OptionEWorkplanSubmitExactBodyV4Client(ports, () => command).submit(saved)).phase).toBe('HOLD');
  expect(ports.bodies).toHaveLength(0);
});
test.each(['receipt','control'])('ordinary completed operation lacks %s agreement and remains HOLD', async missing => {
  const { source, saved } = fixture(); const ports = new SyntheticPorts(source);
  const client = new OptionEWorkplanSubmitExactBodyV4Client(ports, () => command);
  await client.submit(saved); ports.complete();
  if (missing === 'receipt') ports.receipt = undefined;
  else ports.control = clone(source.control);
  expect((await client.refresh()).phase).toBe('HOLD');
  expect(ports.bodies).toHaveLength(1);
});
test('changing the open saved Draft retains the original intent and holds its status check', async () => {
  const { source, saved } = fixture(); const ports = new SyntheticPorts(source);
  const client = new OptionEWorkplanSubmitExactBodyV4Client(ports, () => command);
  await client.submit(saved); ports.complete();
  const reopened = clone(saved); reopened.canonical!.etag = '"d2"';
  expect((await client.submit(reopened)).phase).toBe('HOLD');
  expect(ports.bodies).toHaveLength(1);
});
