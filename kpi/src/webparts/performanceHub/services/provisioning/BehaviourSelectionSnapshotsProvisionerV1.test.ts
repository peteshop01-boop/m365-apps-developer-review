jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {
  defaultODataVersion: jest.requireActual('@microsoft/sp-http-base/lib-commonjs/spHttpClient/ODataVersion').default.v4,
  jsonRequest: true, jsonResponse: true
} } } }));
import { readFileSync } from 'fs';
import type { SPHttpClient } from '@microsoft/sp-http';
import { behaviourSnapshotsTargetV1 as target, behaviourSnapshotsDefinitionsV1 as definitions, behaviourSnapshotsFieldXmlV1 } from './BehaviourSelectionSnapshotsSchemaV1';
import { BehaviourSelectionSnapshotsProvisionerV1, BehaviourSelectionSnapshotsSPHttpClientAdapterV1,
  behaviourSnapshotsBeforeStateV1, type SnapshotFieldV1, type SnapshotMetadataV1, type SnapshotApplyGrantV1 } from './BehaviourSelectionSnapshotsProvisionerV1';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
interface RequestConfiguration { defaultODataVersion: { toString(): string }; jsonRequest: boolean; jsonResponse: boolean }
function negotiatedHeaders(configuration: RequestConfiguration, options: { headers: Record<string, string> }): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has('OData-Version')) headers.set('OData-Version', configuration.defaultODataVersion.toString());
  return headers;
}
function supportedV4(headers: Headers, write: boolean): boolean {
  return headers.get('OData-Version') === '4.0' && headers.get('Accept') === 'application/json;odata.metadata=none' &&
    (!write || headers.get('Content-Type') === 'application/json;odata.metadata=none');
}
function field(name: string, index: number): SnapshotFieldV1 {
  const definition = definitions.find(value => value.name === name);
  return { Id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`, InternalName: name, Title: name,
    TypeAsString: definition ? definition.type : 'Text', Required: false, Indexed: false, EnforceUniqueValues: false,
    DefaultValue: null, SchemaXml: definition ? behaviourSnapshotsFieldXmlV1(name) : `<Field Type="Text" Name="${name}" />` };
}
function baseline(): SnapshotMetadataV1 {
  return { siteId: target.siteId, webId: target.webId, webUrl: target.url,
    list: { Id: target.listId, Title: target.title, BaseTemplate: 100, EnableVersioning: true, EnableFolderCreation: true, HasUniqueRoleAssignments: false },
    fields: [field('Title', 1), field('RowVersionToken', 2)] };
}
function fixture() {
  let metadata = baseline();
  const events: string[] = [];
  const transport = {
    inspect: jest.fn(async () => { events.push('inspect'); return clone(metadata); }),
    createField: jest.fn(async (name: string) => { events.push(`create:${name}`); metadata.fields.push(field(name, metadata.fields.length + 1)); })
  };
  const service = new BehaviourSelectionSnapshotsProvisionerV1(transport, 'candidate-r1');
  const grant = (): SnapshotApplyGrantV1 => ({ actionId: 'SYNTHETIC-LATER-ACTION', mode: 'ADD_ONLY_THREE_COMPANIONS_V1', candidate: 'candidate-r1',
    target, expiresUtc: new Date(Date.now() + 60000).toISOString(), beforeState: behaviourSnapshotsBeforeStateV1(metadata),
    exclusiveMetadataLeaseRef: 'synthetic-lease', rowVersionBaselineApprovalRef: 'synthetic-baseline', capacityApprovalRef: 'synthetic-capacity' });
  return { transport, service, events, grant, get: () => metadata, set: (value: SnapshotMetadataV1) => { metadata = value; } };
}

describe('approved companion provisioning ordinary synthetic developer validation', () => {
  it('emits the exact optional definitions without defaults', () => {
    expect(definitions.map(value => behaviourSnapshotsFieldXmlV1(value.name))).toEqual([
      '<Field Type="Text" Name="BehaviourV2SelectionSnapshotsSHA256" StaticName="BehaviourV2SelectionSnapshotsSHA256" DisplayName="BehaviourV2SelectionSnapshotsSHA256" Required="FALSE" Indexed="FALSE" EnforceUniqueValues="FALSE" MaxLength="255" />',
      '<Field Type="Note" Name="BehaviourV2SelectionSnapshotsJSON" StaticName="BehaviourV2SelectionSnapshotsJSON" DisplayName="BehaviourV2SelectionSnapshotsJSON" Required="FALSE" Indexed="FALSE" EnforceUniqueValues="FALSE" RichText="FALSE" AppendOnly="FALSE" VersionHistory="FALSE" />',
      '<Field Type="Number" Name="BehaviourV2SelectionSnapshotsUtf8ByteLength" StaticName="BehaviourV2SelectionSnapshotsUtf8ByteLength" DisplayName="BehaviourV2SelectionSnapshotsUtf8ByteLength" Required="FALSE" Indexed="FALSE" EnforceUniqueValues="FALSE" Decimals="0" Min="1" Max="1000000" />'
    ]);
  });
  it('defaults to inspect and leaves metadata untouched', async () => {
    const f = fixture(); const before = clone(f.get()); const result = await f.service.run();
    expect(result.status).toBe('INSPECTED'); expect(result.missing).toHaveLength(3);
    expect(f.transport.createField).not.toHaveBeenCalled(); expect(f.get()).toEqual(before);
    expect(result.blockers.join(' ')).toContain('63999');
  });
  it.each(['siteId', 'webId'] as const)('rejects wrong %s', async key => {
    const f = fixture(); f.get()[key] = 'other';
    expect((await f.service.run({ mode: 'Apply', grant: f.grant() })).status).toBe('HOLD');
    expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('rejects renamed/replaced list', async () => {
    const f = fixture(); f.get().list.Title = 'Other';
    expect((await f.service.run()).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('requires complete metadata', async () => {
    const f = fixture(); delete (f.get().fields[0] as Partial<SnapshotFieldV1>).SchemaXml;
    expect((await f.service.run()).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('rejects incompatible existing field without writes', async () => {
    const f = fixture(); const existing = field(definitions[0].name, 3); existing.SchemaXml = existing.SchemaXml.replace('255', '100');
    f.get().fields.push(existing);
    expect((await f.service.run({ mode: 'Apply', grant: f.grant() })).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('requires a later grant and RowVersionToken baseline', async () => {
    const f = fixture(); expect((await f.service.run({ mode: 'Apply' })).status).toBe('HOLD');
    f.get().fields = f.get().fields.filter(value => value.InternalName !== 'RowVersionToken');
    expect((await f.service.run({ mode: 'Apply', grant: f.grant() })).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it.each([[1, 'RichText="FALSE"', 'RichText="TRUE"'], [2, 'Decimals="0"', 'Decimals="2"']])('checks physical type-specific definition %s', async (index, expected, changed) => {
    const f = fixture(); const actual = field(definitions[index as number].name, 3);
    actual.SchemaXml = actual.SchemaXml.replace(expected as string, changed as string); f.get().fields.push(actual);
    expect((await f.service.run()).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('retains capacity approval HOLD even with a baseline and otherwise eligible grant', async () => {
    const f = fixture(); const grant = f.grant(); grant.capacityApprovalRef = '';
    expect((await f.service.run({ mode: 'Apply', grant })).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('rejects stale supplied before-state', async () => {
    const f = fixture(); const grant = f.grant(); f.get().fields[0].Title = 'Changed';
    expect((await f.service.run({ mode: 'Apply', grant })).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('rechecks immediately before create', async () => {
    const f = fixture(); const grant = f.grant(); let count = 0;
    f.transport.inspect.mockImplementation(async () => { if (++count === 2) f.get().fields[0].Title = 'Changed'; return clone(f.get()); });
    expect((await f.service.run({ mode: 'Apply', grant })).status).toBe('HOLD'); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('serially creates/readbacks only three fields and repeats without a write', async () => {
    const f = fixture(); const before = clone(f.get()); const result = await f.service.run({ mode: 'Apply', grant: f.grant() });
    expect(result.status).toBe('APPLIED'); expect(result.created).toEqual(definitions.map(value => value.name));
    expect(f.events).toEqual(['inspect', ...definitions.flatMap(value => ['inspect', `create:${value.name}`, 'inspect'])]);
    expect(f.get().list).toEqual(before.list); expect(f.get().fields.slice(0, 2)).toEqual(before.fields);
    f.transport.createField.mockClear(); const repeat = await f.service.run({ mode: 'Apply', grant: f.grant() });
    expect(repeat.status).toBe('APPLIED'); expect(repeat.reused).toHaveLength(3); expect(f.transport.createField).not.toHaveBeenCalled();
  });
  it('stops on failed physical readback and preserves partial recovery details', async () => {
    const f = fixture(); f.transport.createField.mockImplementation(async name => { const actual = field(name, 3); actual.Required = true; f.get().fields.push(actual); });
    const result = await f.service.run({ mode: 'Apply', grant: f.grant() });
    expect(result.status).toBe('HOLD'); expect(result.failed).toEqual([definitions[0].name]); expect(result.attempted).toHaveLength(1);
    expect(result.after!.fields).toHaveLength(3); expect(result.recovery.join(' ')).toContain('No automatic rollback');
    expect(f.transport.createField).toHaveBeenCalledTimes(1);
  });
  it('retains prior success and uncertain partial effects after later failure', async () => {
    const f = fixture(); const ordinary = f.transport.createField.getMockImplementation()!;
    f.transport.createField.mockImplementation(async name => { if (name === definitions[1].name) throw new Error('Synthetic transport failure'); await ordinary(name); });
    const result = await f.service.run({ mode: 'Apply', grant: f.grant() });
    expect(result.created).toEqual([definitions[0].name]); expect(result.failed).toEqual([definitions[1].name]); expect(result.attempted).toHaveLength(2);
  });
  it('holds when unrelated metadata changes during create', async () => {
    const f = fixture(); const ordinary = f.transport.createField.getMockImplementation()!;
    f.transport.createField.mockImplementation(async name => { await ordinary(name); f.get().list.EnableVersioning = false; });
    const result = await f.service.run({ mode: 'Apply', grant: f.grant() });
    expect(result.status).toBe('HOLD'); expect(result.failed).toHaveLength(1); expect(f.transport.createField).toHaveBeenCalledTimes(1);
  });
  it('records uncertain creation if immediate metadata readback is unavailable', async () => {
    const f = fixture(); let count = 0;
    f.transport.inspect.mockImplementation(async () => { if (++count === 3) throw new Error('Synthetic metadata unavailable'); return clone(f.get()); });
    const result = await f.service.run({ mode: 'Apply', grant: f.grant() });
    expect(result.status).toBe('HOLD'); expect(result.attempted).toHaveLength(1); expect(result.failed).toHaveLength(1); expect(result.created).toHaveLength(0);
  });
  it('adapter uses only metadata GETs and approved createfieldasxml POST', async () => {
    const metadata = baseline(); const urls: string[] = [];
    const client = { get: jest.fn(async (url: string) => {
      urls.push(url); const data = url.includes('/fields?') ? { value: metadata.fields } : url.includes('/lists(') ? metadata.list : url.includes('/_api/site?') ? { Id: metadata.siteId } : { Id: metadata.webId, Url: metadata.webUrl };
      return { ok: true, json: async () => data };
    }), post: jest.fn(async () => ({ ok: true })) };
    const adapter = new BehaviourSelectionSnapshotsSPHttpClientAdapterV1(client as unknown as SPHttpClient);
    expect(await adapter.inspect()).toEqual(metadata);
    await adapter.createField(definitions[0].name);
    expect(client.post).toHaveBeenCalledTimes(1);
    const call = client.post.mock.calls[0] as unknown as [string, unknown, { body: string }];
    expect(call[0]).toBe(`${target.url}/_api/web/lists(guid'${target.listId}')/fields/createfieldasxml`);
    expect(JSON.parse(call[2].body)).toEqual({ parameters: { SchemaXml: behaviourSnapshotsFieldXmlV1(definitions[0].name), Options: 0 } });
    expect(urls.every(url => !url.toLowerCase().includes('/items'))).toBe(true);
  });
  it('uses installed SDK v4 configuration and reproduces the original header incompatibility', () => {
    const installed = readFileSync(require.resolve('@microsoft/sp-http-base/lib-commonjs/spHttpClient/SPHttpClientConfiguration.js'), 'utf8');
    expect(installed).toContain('defaultODataVersion: ODataVersion_1.default.v4');
    expect(installed).toContain('jsonRequest: true'); expect(installed).toContain('jsonResponse: true');
    const configuration = { defaultODataVersion: { toString: () => '4.0' }, jsonRequest: true, jsonResponse: true };
    const original = negotiatedHeaders(configuration, { headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' } });
    expect(original.get('OData-Version')).toBe('4.0');
    expect(supportedV4(original, false)).toBe(false); expect(supportedV4(original, true)).toBe(false);
  });
  it('negotiates coordinated SDK v4 GET headers and consumes complete v4 paged metadata', async () => {
    const metadata = baseline(); const contracts: Headers[] = []; let pages = 0;
    const next = `${target.url}/_api/web/lists(guid'${target.listId}')/fields?$skiptoken=ordinary-page2`;
    const client = { get: jest.fn(async (url: string, configuration: RequestConfiguration, options: { headers: Record<string, string> }) => {
      const headers = negotiatedHeaders(configuration, options); contracts.push(headers);
      if (!supportedV4(headers, false)) return { ok: false, status: 406 };
      const data = url.includes('/fields?') ? (++pages === 1 ? { value: [metadata.fields[0]], '@odata.nextLink': next } : { value: [metadata.fields[1]] }) :
        url.includes('/lists(') ? metadata.list : url.includes('/_api/site?') ? { Id: metadata.siteId } : { Id: metadata.webId, Url: metadata.webUrl };
      return { ok: true, json: async () => data };
    }) };
    const adapter = new BehaviourSelectionSnapshotsSPHttpClientAdapterV1(client as unknown as SPHttpClient);
    expect(await adapter.inspect()).toEqual(metadata); expect(pages).toBe(2);
    expect(contracts).toHaveLength(5); expect(contracts.every(headers => supportedV4(headers, false))).toBe(true);
    expect(client.get.mock.calls[4][0]).toBe(next);
  });
  it('negotiates coordinated SDK v4 POST headers and plain JSON create parameters', async () => {
    let observed: Headers | undefined; let body: unknown;
    const client = { post: jest.fn(async (_url: string, configuration: RequestConfiguration, options: { headers: Record<string, string>; body: string }) => {
      observed = negotiatedHeaders(configuration, options); body = JSON.parse(options.body) as unknown;
      return { ok: supportedV4(observed, true), status: supportedV4(observed, true) ? 200 : 406 };
    }) };
    const adapter = new BehaviourSelectionSnapshotsSPHttpClientAdapterV1(client as unknown as SPHttpClient);
    await expect(adapter.createField(definitions[1].name)).resolves.toBeUndefined();
    expect(observed!.get('OData-Version')).toBe('4.0'); expect(supportedV4(observed!, true)).toBe(true);
    expect(body).toEqual({ parameters: { SchemaXml: behaviourSnapshotsFieldXmlV1(definitions[1].name), Options: 0 } });
    expect(JSON.stringify(body)).not.toContain('__metadata');
  });
});
