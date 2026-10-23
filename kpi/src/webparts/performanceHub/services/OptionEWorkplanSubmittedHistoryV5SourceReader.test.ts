import { readFileSync } from 'fs';
import { TextDecoder, TextEncoder } from 'node:util';
import type { V5ClientSource } from '../models/OptionEWorkplanSubmitExactBodyV5ClientModels';
import type { V4Control } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { V5_AUTHORITY_CONTRACT } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import { createOptionEWorkplanSubmittedHistoryV5SourceReader } from './OptionEWorkplanSubmittedHistoryV5SourceReader';
import { loadOptionEWorkplanSubmittedHistoryV5 } from './OptionEWorkplanSubmittedHistoryV5Loader';
import { encodeV5CapturedReceipt, encodeV5CapturedSnapshot, parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v5Canonical, v5IdentityKey } from './OptionEWorkplanSubmitExactBodyV5Wire';
import { v4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';
Object.assign(globalThis, { TextDecoder, TextEncoder });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Reuse the sealed complete fictional frame; only the new read composition is under test.
const fixture = (person = 'employee'): {
  source: V5ClientSource; control: V4Control; receipt: string; snapshot: string;
  coordinates: { workplan: string; person: string; year: number };
} => {
  const stored = readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-global-r3-receipt.json', 'utf8');
  const receipt = parseV5CapturedReceipt(stored), a = receipt.snapshot.admission.authority;
  if (person !== 'employee') {
    a.actor.key = person; a.control.person = person;
    a.workplan.value = { ...a.workplan.value, personKey: person, employeeEmail: `${person}@example.invalid` };
    a.request.query.person = person; a.request.body = v5Canonical(a.request.query);
    receipt.key = receipt.snapshot.key = receipt.snapshot.admission.key = v5IdentityKey(a.request.query);
  }
  const control: V4Control = { ...a.control, etag: '"control-submitted-9"', state: 'Submitted',
    transition: 'Ready', snapshot: receipt.key, aclEpoch: a.control.hierarchyEpoch };
  const source: V5ClientSource = copy({ contract: a.contract, actor: a.actor, manager: a.manager,
    draft: a.draft, references: a.references, control: a.control, workplan: a.workplan });
  source.control = copy(control);
  source.workplan = { native: { ...a.workplan.native, etag: '"header-submitted-9"', version: '9.0' },
    value: { ...a.workplan.value, state: 'Submitted', transitionStatus: 'Ready', etag: '"header-submitted-9"', rowVersionToken: 9 } };
  return { source, control, receipt: person === 'employee' ? stored : encodeV5CapturedReceipt(receipt),
    snapshot: encodeV5CapturedSnapshot(receipt.snapshot),
    coordinates: { workplan: a.control.workplan, person, year: a.control.year } };
};
const setup = (person = 'employee'): ReturnType<typeof fixture> & {
  ports: { readCurrentSource: jest.Mock<Promise<V5ClientSource>, [string]>;
    readControl: jest.Mock<Promise<V4Control>, [string]>;
    readReceipt: jest.Mock<Promise<string | undefined>, [string]>;
    readSnapshot: jest.Mock<Promise<string | undefined>, [string]> };
} => {
  const f = fixture(person);
  return { ...f, ports: {
    readCurrentSource: jest.fn<Promise<V5ClientSource>, [string]>(async () => f.source),
    readControl: jest.fn<Promise<V4Control>, [string]>(async () => f.control),
    readReceipt: jest.fn<Promise<string | undefined>, [string]>(async () => f.receipt),
    readSnapshot: jest.fn<Promise<string | undefined>, [string]>(async () => f.snapshot)
  } };
};
const load = (f: ReturnType<typeof setup>): ReturnType<typeof loadOptionEWorkplanSubmittedHistoryV5> => loadOptionEWorkplanSubmittedHistoryV5(
  f.coordinates, createOptionEWorkplanSubmittedHistoryV5SourceReader(f.ports));

describe('readonly Submitted capture source composition', () => {
  it('leaves absent ports Unbound', async () => {
    expect(await loadOptionEWorkplanSubmittedHistoryV5(fixture().coordinates,
      createOptionEWorkplanSubmittedHistoryV5SourceReader())).toEqual({ status: 'HOLD', reason: 'Unbound' });
  });
  it.each(['employee', 'fictional-reader-two', 'fictional-reader-three'])(
    'preserves complete paired frames and historical definitions for %s', async person => {
      const f = setup(person), reader = createOptionEWorkplanSubmittedHistoryV5SourceReader(f.ports)!;
      const capture = await reader.readCapture(f.coordinates);
      expect(capture).toEqual({ encoding: 'captured-native-request/v1', kind: 'receipt', canonicalBody: f.receipt });
      const result = await load(f);
      expect(result.status).toBe('DECODED_SOURCE_ONLY');
      if (result.status !== 'DECODED_SOURCE_ONLY') throw new Error(result.reason);
      const h = result.projection.history, original = parseV5CapturedReceipt(f.receipt);
      expect(h.receipt).toEqual(original);
      expect(h.raw.requestBody).toBe(original.snapshot.admission.authority.request.body);
      expect(h.raw.draftBody).toBe(original.snapshot.body);
      expect(h.raw.referenceBody).toBe(original.snapshot.admission.authority.request.query.referenceBody);
      expect(h.snapshot.admission.authority.workplan.value.state).toBe('Draft');
      expect(h.snapshot.admission.authority.workplan.native.version).not.toBe(f.source.workplan.native.version);
      expect(result.projection.deliveryWeights.coreWeight).toBe(70);
      expect(Object.keys(reader)).toEqual(['readCapture']);
      expect(f.ports.readControl.mock.calls.every(([key]) => key === f.coordinates.workplan)).toBe(true);
      expect(f.ports.readReceipt.mock.calls.every(([key]) => key === f.control.snapshot)).toBe(true);
      expect(f.ports.readSnapshot.mock.calls.every(([key]) => key === f.control.snapshot)).toBe(true);
    });
  it('reads in order and rechecks current observations after byte awaits', async () => {
    const f = setup();
    expect((await load(f)).status).toBe('DECODED_SOURCE_ONLY');
    const order = Object.entries(f.ports).flatMap(([name, mock]) => mock.mock.invocationCallOrder.map(call => ({ name, call })))
      .sort((a, b) => a.call - b.call).map(item => item.name);
    expect(order).toEqual(['readCurrentSource', 'readControl', 'readReceipt', 'readSnapshot', 'readCurrentSource', 'readControl']);
  });
  it('keeps a genuinely absent receipt as an exact complete snapshot reference', async () => {
    const f = setup(); f.ports.readReceipt.mockResolvedValue(undefined);
    const result = await load(f);
    expect(result.status).toBe('DECODED_SOURCE_ONLY');
    if (result.status !== 'DECODED_SOURCE_ONLY') throw new Error(result.reason);
    expect(result.projection.history.capture).toEqual({ encoding: 'captured-native-request/v1', kind: 'snapshot', canonicalBody: f.snapshot });
    expect(result.projection.history.receipt).toBeUndefined();
  });
  it('preserves a complete receipt when the separate snapshot is genuinely absent', async () => {
    const f = setup(); f.ports.readSnapshot.mockResolvedValue(undefined);
    const capture = await createOptionEWorkplanSubmittedHistoryV5SourceReader(f.ports)!.readCapture(f.coordinates);
    expect(capture).toEqual({ encoding: 'captured-native-request/v1', kind: 'receipt', canonicalBody: f.receipt });
    expect((await load(f)).status).toBe('DECODED_SOURCE_ONLY');
  });
  it('retains a legitimate pre-Submit ChangesRequested header while current state is Submitted', async () => {
    const f = setup(), r = parseV5CapturedReceipt(f.receipt);
    r.snapshot.admission.authority.workplan.value = { ...r.snapshot.admission.authority.workplan.value, state: 'ChangesRequested' };
    r.snapshot.admission.authority.control.state = 'ChangesRequested';
    const receipt = encodeV5CapturedReceipt(r), snapshot = encodeV5CapturedSnapshot(r.snapshot);
    f.ports.readReceipt.mockResolvedValue(receipt); f.ports.readSnapshot.mockResolvedValue(snapshot);
    const result = await load(f);
    expect(result.status).toBe('DECODED_SOURCE_ONLY');
    if (result.status === 'DECODED_SOURCE_ONLY') {
      expect(result.projection.history.capture.canonicalBody).toBe(receipt);
      expect(result.projection.history.snapshot.admission.authority.workplan.value.state).toBe('ChangesRequested');
    }
  });
  it('reports both genuinely absent frames as MissingCapture after rechecking', async () => {
    const f = setup(); f.ports.readReceipt.mockResolvedValue(undefined); f.ports.readSnapshot.mockResolvedValue(undefined);
    expect(await load(f)).toEqual({ status: 'HOLD', reason: 'MissingCapture' });
    expect(f.ports.readCurrentSource).toHaveBeenCalledTimes(2);
    expect(f.ports.readControl).toHaveBeenCalledTimes(2);
  });
  it('does not resolve captured claims from the current catalogue', async () => {
    const f = setup(); f.source.references = { ...f.source.references, asOf: '2026-10-10T00:00:00.000Z', rows: [] };
    f.source.draft = { ...f.source.draft, version: 'current-private-9' };
    const result = await load(f);
    expect(result.status).toBe('DECODED_SOURCE_ONLY');
    if (result.status === 'DECODED_SOURCE_ONLY') {
      expect(result.projection.history.capture.canonicalBody).toBe(f.receipt);
      expect(result.projection.history.snapshot.admission.authority.references.rows).toHaveLength(48);
    }
  });
  const invalidCurrent: Array<[string, (f: ReturnType<typeof setup>) => void]> = [
    ['actor', f => { f.source.actor.key = 'different'; }],
    ['inactive actor', f => { f.source.actor.active = false as true; }],
    ['workplan person', f => { f.source.workplan.value = { ...f.source.workplan.value, personKey: 'different' }; }],
    ['workplan year', f => { f.source.workplan.value = { ...f.source.workplan.value, performanceYear: 2027 }; }],
    ['workplan key', f => { f.source.workplan.value = { ...f.source.workplan.value, workplanKey: 'different' }; }],
    ['control person', f => { f.control.person = 'different'; f.source.control = copy(f.control); }],
    ['control year', f => { f.control.year++; f.source.control = copy(f.control); }],
    ['control workplan', f => { f.control.workplan = 'different'; f.source.control = copy(f.control); }],
    ['header id', f => { f.source.workplan.value = { ...f.source.workplan.value, id: 999 }; }],
    ['header ETag', f => { f.source.workplan.value = { ...f.source.workplan.value, etag: '"different"' }; }],
    ['header state', f => { f.source.workplan.value = { ...f.source.workplan.value, state: 'Draft' }; }],
    ['header pending', f => { f.source.workplan.value = { ...f.source.workplan.value, transitionStatus: 'Submitting' }; }],
    ['control pending', f => { f.control.command = 'pending'; f.source.control = copy(f.control); }],
    ['control transition', f => { f.control.transition = 'AclPending'; f.source.control = copy(f.control); }],
    ['control state', f => { f.control.state = 'Draft'; f.source.control = copy(f.control); }],
    ['control ETag', f => { f.control.etag = '"*"'; f.source.control = copy(f.control); }],
    ['control observation differs', f => { f.source.control.etag = '"different"'; }],
    ['missing pointer', f => { delete f.control.snapshot; f.source.control = copy(f.control); }],
    ['ACL epoch', f => { f.control.aclEpoch--; f.source.control = copy(f.control); }],
    ['authority contract', f => { f.source.contract = 'wrong' as typeof V5_AUTHORITY_CONTRACT; }]
  ];
  it.each(invalidCurrent)('holds current %s before reading any frames', async (_name, change) => {
    const f = setup(); change(f);
    expect(await load(f)).toEqual({ status: 'HOLD', reason: 'ReadUnavailable' });
    expect(f.ports.readReceipt).not.toHaveBeenCalled(); expect(f.ports.readSnapshot).not.toHaveBeenCalled();
  });
  it.each(['siteId', 'webId', 'listId', 'itemId'] as const)('holds a different stable native %s', async key => {
    const f = setup();
    const native = { ...f.source.workplan.native, [key]: key === 'itemId' ? 999 : '46b799c4-c9c1-4473-a82a-38a30d16dc9e' };
    f.source.workplan = { native, value: { ...f.source.workplan.value, id: native.itemId } };
    expect((await load(f)).status).toBe('HOLD');
  });
  it.each(['readCurrentSource', 'readControl', 'readReceipt', 'readSnapshot'] as const)(
    'never treats a thrown %s as absence or fallback', async name => {
      const f = setup(); f.ports[name].mockRejectedValue(new Error('Fictional read unavailable'));
      expect(await load(f)).toEqual({ status: 'HOLD', reason: 'ReadUnavailable' });
    });
  it.each(['readCurrentSource', 'readControl'] as const)('holds a thrown final %s', async name => {
    const f = setup();
    if (name === 'readCurrentSource') f.ports.readCurrentSource.mockResolvedValueOnce(f.source).mockRejectedValueOnce(new Error('later'));
    else f.ports.readControl.mockResolvedValueOnce(f.control).mockRejectedValueOnce(new Error('later'));
    expect((await load(f)).status).toBe('HOLD');
  });
  it.each(['receipt', 'snapshot'] as const)('holds invalid %s even with the other valid frame', async kind => {
    const f = setup(); f.ports[kind === 'receipt' ? 'readReceipt' : 'readSnapshot'].mockResolvedValue('invalid');
    expect((await load(f)).status).toBe('HOLD');
  });
  it('rejects r2 encoding and body-only wrapping rather than guessing an encoding', async () => {
    for (const body of [v4Canonical(parseV5CapturedReceipt(setup().receipt)), parseV5CapturedReceipt(setup().receipt).snapshot.body]) {
      const f = setup(); f.ports.readReceipt.mockResolvedValue(body);
      expect((await load(f)).status).toBe('HOLD');
    }
    const f = setup(); f.ports.readReceipt.mockResolvedValue(f.receipt.replace('captured-native-request/v1', 'captured-native-request/v0'));
    expect((await load(f)).status).toBe('HOLD');
  });
  it('holds valid frames for a different requested person and pointer', async () => {
    const f = setup(); f.ports.readReceipt.mockResolvedValue(fixture('fictional-reader-two').receipt);
    expect((await load(f)).status).toBe('HOLD');
    const g = setup(); g.control.snapshot += '|different'; g.source.control = copy(g.control);
    expect((await load(g)).status).toBe('HOLD');
  });
  it('holds mismatched valid snapshots sharing the same admission key', async () => {
    const f = setup(), r = parseV5CapturedReceipt(f.receipt);
    r.snapshot.admission.eventAt = new Date(Date.parse(r.snapshot.admission.eventAt) + 60000).toISOString();
    const mismatchedSnapshot = encodeV5CapturedSnapshot(r.snapshot);
    expect(mismatchedSnapshot).not.toBe(f.snapshot);
    f.ports.readSnapshot.mockResolvedValue(mismatchedSnapshot);
    expect((await load(f)).status).toBe('HOLD');
  });
  it.each(['pointer', 'control ETag', 'actor', 'header', 'source control', 'in-place pointer'])(
    'holds %s replacement during byte awaits', async kind => {
      const f = setup();
      f.ports.readSnapshot.mockImplementation(async () => {
        if (kind === 'actor') f.source.actor = { ...f.source.actor, version: 'replacement' };
        else if (kind === 'header') f.source.workplan = { ...f.source.workplan, native: { ...f.source.workplan.native, version: 'replacement' } };
        else if (kind === 'source control') f.source.control.etag = '"replacement"';
        else {
          f.control = { ...f.control, ...(kind === 'control ETag' ? { etag: '"replacement"' } : { snapshot: `${f.control.snapshot}|replacement` }) };
          if (kind === 'in-place pointer') { const observed = await f.ports.readControl(f.coordinates.workplan); observed.snapshot = f.control.snapshot; }
          else f.ports.readControl.mockResolvedValue(f.control);
          f.source.control = copy(f.control);
        }
        return f.snapshot;
      });
      expect((await load(f)).status).toBe('HOLD');
    });
  it('detaches requested coordinates before the first await', async () => {
    const f = setup(), expected = { ...f.coordinates };
    f.ports.readCurrentSource.mockImplementation(async () => { f.coordinates.person = 'replacement'; return f.source; });
    const capture = await createOptionEWorkplanSubmittedHistoryV5SourceReader(f.ports)!.readCapture(f.coordinates);
    expect(capture?.canonicalBody).toBe(f.receipt);
    expect(f.ports.readControl).toHaveBeenCalledWith(expected.workplan);
  });
});
