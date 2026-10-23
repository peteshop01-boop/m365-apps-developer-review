import { SPHttpClient } from '@microsoft/sp-http';
import { behaviourSnapshotsTargetV1 as target, behaviourSnapshotsDefinitionsV1 as definitions,
  behaviourSnapshotsFieldXmlV1, behaviourSnapshotsCapacityHoldV1 } from './BehaviourSelectionSnapshotsSchemaV1';

export interface SnapshotFieldV1 {
  Id: string; InternalName: string; Title: string; TypeAsString: string;
  Required: boolean; Indexed: boolean; EnforceUniqueValues: boolean;
  DefaultValue: string | null; SchemaXml: string;
}
export interface SnapshotMetadataV1 {
  siteId: string; webId: string; webUrl: string;
  list: { Id: string; Title: string; BaseTemplate: number; EnableVersioning: boolean;
    EnableFolderCreation: boolean; HasUniqueRoleAssignments: boolean };
  fields: SnapshotFieldV1[];
}
export interface SnapshotTransportV1 {
  inspect(): Promise<SnapshotMetadataV1>;
  createField(name: string): Promise<void>;
}
/** Caller must obtain these references through a later bounded native action. No grant is supplied here. */
export interface SnapshotApplyGrantV1 {
  actionId: string; mode: 'ADD_ONLY_THREE_COMPANIONS_V1'; candidate: string;
  target: typeof target; expiresUtc: string; beforeState: string;
  exclusiveMetadataLeaseRef: string; rowVersionBaselineApprovalRef: string;
  capacityApprovalRef: string;
}
export interface SnapshotResultV1 {
  version: 'BehaviourSelectionSnapshotsProvisionerV1'; candidate: string; target: typeof target;
  mode: 'Inspect' | 'Apply'; status: 'INSPECTED' | 'APPLIED' | 'HOLD';
  before?: SnapshotMetadataV1; after?: SnapshotMetadataV1; beforeState?: string;
  inspected: string[]; missing: string[]; reused: string[]; created: string[];
  failed: string[]; blockers: string[]; attempted: string[]; recovery: string[];
}

const guid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const requiredKeys = (value: object, keys: string[]): boolean => keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
function validate(metadata: SnapshotMetadataV1): string[] {
  const failures: string[] = [];
  if (!metadata || metadata.siteId !== target.siteId || metadata.webId !== target.webId || metadata.webUrl !== target.url ||
    !metadata.list || metadata.list.Id !== target.listId || metadata.list.Title !== target.title) return ['Exact TEST site/web/list identity mismatch.'];
  if (metadata.list.BaseTemplate !== 100 || metadata.list.EnableVersioning !== true ||
    metadata.list.EnableFolderCreation !== true || metadata.list.HasUniqueRoleAssignments !== false) failures.push('List baseline/settings mismatch.');
  if (!Array.isArray(metadata.fields) || !metadata.fields.length) return failures.concat('Complete field metadata required.');
  const names = new Set<string>(); const ids = new Set<string>();
  metadata.fields.forEach(field => {
    if (!field || !requiredKeys(field, ['Id', 'InternalName', 'Title', 'TypeAsString', 'Required', 'Indexed', 'EnforceUniqueValues', 'DefaultValue', 'SchemaXml']) ||
      !guid(field.Id) || typeof field.InternalName !== 'string' || !field.InternalName || typeof field.Title !== 'string' ||
      typeof field.TypeAsString !== 'string' || typeof field.SchemaXml !== 'string' || !field.SchemaXml ||
      [field.Required, field.Indexed, field.EnforceUniqueValues].some(value => typeof value !== 'boolean') ||
      !(field.DefaultValue === null || typeof field.DefaultValue === 'string')) { failures.push('Incomplete field metadata.'); return; }
    const name = field.InternalName.toLowerCase();
    if (names.has(name) || ids.has(field.Id.toLowerCase())) failures.push('Duplicate field identity.');
    names.add(name); ids.add(field.Id.toLowerCase());
  });
  definitions.forEach(definition => {
    const matches = metadata.fields.filter(field => field.InternalName.toLowerCase() === definition.name.toLowerCase() || field.Title.toLowerCase() === definition.name.toLowerCase());
    if (matches.length && (matches.length !== 1 || !compatible(matches[0], definition.name))) failures.push(`Incompatible/colliding field: ${definition.name}`);
  });
  return failures;
}

function attributes(xml: string): Record<string, string> | undefined {
  // Conservative physical readback: no defaults/child XML, duplicate attributes or ambiguous parsing.
  const root = /^\s*<Field\s+([^<>]+?)(?:\s*\/\s*>|>\s*<\/Field>)\s*$/i.exec(xml);
  if (!root) return undefined;
  const result: Record<string, string> = {};
  let remainder = root[1];
  const pattern = /([A-Za-z][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(root[1]))) {
    const key = match[1].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(result, key)) return undefined;
    result[key] = match[2] === undefined ? match[3] : match[2];
    remainder = remainder.replace(match[0], '');
  }
  return remainder.trim() ? undefined : result;
}
function compatible(field: SnapshotFieldV1, name: string): boolean {
  const definition = definitions.find(value => value.name === name)!;
  const attrs = attributes(field.SchemaXml);
  const expected = attributes(behaviourSnapshotsFieldXmlV1(name))!;
  return field.InternalName === name && field.TypeAsString === definition.type && field.Required === false && field.Indexed === false &&
    field.EnforceUniqueValues === false && (field.DefaultValue === null || field.DefaultValue === '') && !!attrs && !('default' in attrs) &&
    Object.keys(expected).every(key => key === 'displayname' ? true : attrs[key] !== undefined && attrs[key].toLowerCase() === expected[key].toLowerCase());
}
/** Full canonical metadata token, not a security digest. Includes unrelated fields and list baseline. */
export function behaviourSnapshotsBeforeStateV1(metadata: SnapshotMetadataV1): string {
  return JSON.stringify({ siteId: metadata.siteId, webId: metadata.webId, webUrl: metadata.webUrl,
    list: { Id: metadata.list.Id, Title: metadata.list.Title, BaseTemplate: metadata.list.BaseTemplate,
      EnableVersioning: metadata.list.EnableVersioning, EnableFolderCreation: metadata.list.EnableFolderCreation,
      HasUniqueRoleAssignments: metadata.list.HasUniqueRoleAssignments },
    fields: metadata.fields.slice().sort((a, b) => a.InternalName.localeCompare(b.InternalName)).map(field => ({
      Id: field.Id, InternalName: field.InternalName, Title: field.Title, TypeAsString: field.TypeAsString,
      Required: field.Required, Indexed: field.Indexed, EnforceUniqueValues: field.EnforceUniqueValues,
      DefaultValue: field.DefaultValue, SchemaXml: field.SchemaXml })) });
}

export class BehaviourSelectionSnapshotsProvisionerV1 {
  public constructor(private readonly transport: SnapshotTransportV1, private readonly candidate: string) {}
  public async run(options: { mode?: 'Inspect' | 'Apply'; grant?: SnapshotApplyGrantV1 } = {}): Promise<SnapshotResultV1> {
    const mode = options.mode || 'Inspect';
    const result: SnapshotResultV1 = { version: 'BehaviourSelectionSnapshotsProvisionerV1', candidate: this.candidate, target,
      mode, status: 'HOLD', inspected: [], missing: [], reused: [], created: [], failed: [], blockers: [], attempted: [], recovery: [] };
    let activeField: string | undefined;
    try {
      let current = await this.transport.inspect();
      result.before = JSON.parse(JSON.stringify(current)) as SnapshotMetadataV1;
      result.after = current;
      result.blockers = validate(current);
      if (result.blockers.length) return result;
      result.beforeState = behaviourSnapshotsBeforeStateV1(current);
      definitions.forEach(field => {
        result.inspected.push(field.name);
        (current.fields.some(value => value.InternalName === field.name) ? result.reused : result.missing).push(field.name);
      });
      if (mode === 'Inspect') {
        result.status = 'INSPECTED';
        result.blockers.push('Native Apply requires a later bounded grant and eligible current before-state.', behaviourSnapshotsCapacityHoldV1);
        if (!current.fields.some(field => field.InternalName === 'RowVersionToken')) result.blockers.push('RowVersionToken baseline is absent; later native baseline approval required.');
        return result;
      }
      const grant = options.grant;
      if (!grant || !grant.actionId || grant.mode !== 'ADD_ONLY_THREE_COMPANIONS_V1' || grant.candidate !== this.candidate ||
        !this.candidate || JSON.stringify(grant.target) !== JSON.stringify(target) || !Number.isFinite(Date.parse(grant.expiresUtc)) ||
        Date.parse(grant.expiresUtc) <= Date.now() || grant.beforeState !== result.beforeState ||
        !grant.exclusiveMetadataLeaseRef || !grant.rowVersionBaselineApprovalRef || !grant.capacityApprovalRef ||
        !current.fields.some(field => field.InternalName === 'RowVersionToken')) {
        result.blockers.push('Missing/ineligible exact bounded grant, current before-state, baseline or capacity approval.'); return result;
      }
      for (const name of result.missing) {
        activeField = name;
        const fresh = await this.transport.inspect();
        if (Date.parse(grant.expiresUtc) <= Date.now() || validate(fresh).length || behaviourSnapshotsBeforeStateV1(fresh) !== behaviourSnapshotsBeforeStateV1(current)) {
          result.blockers.push('Before-state changed or grant expired before create.'); return result;
        }
        result.attempted.push(name);
        result.recovery.push(`Creation attempted for ${name}; preserve before-state and inspect physical effects before any governed recovery. No automatic rollback.`);
        await this.transport.createField(name);
        const after = await this.transport.inspect();
        Object.assign(result, { after });
        const created = after.fields.filter(field => field.InternalName === name);
        const withoutNew = { ...after, fields: after.fields.filter(field => field.InternalName !== name) };
        if (validate(after).length || created.length !== 1 || !compatible(created[0], name) ||
          behaviourSnapshotsBeforeStateV1(withoutNew) !== behaviourSnapshotsBeforeStateV1(current)) {
          result.failed.push(name); result.blockers.push('Create readback failed or unrelated metadata changed; partial effects require governed recovery.'); return result;
        }
        result.created.push(name);
        current = after;
        activeField = undefined;
      }
      result.status = 'APPLIED';
    } catch (error) {
      if (activeField && !result.failed.includes(activeField)) result.failed.push(activeField);
      result.blockers.push(error instanceof Error ? error.message : 'Metadata/create operation failed.');
    }
    return result;
  }
}

/** Supported SPFx REST transport. It never reads Items or changes settings/ACLs. */
export class BehaviourSelectionSnapshotsSPHttpClientAdapterV1 implements SnapshotTransportV1 {
  public constructor(private readonly client: SPHttpClient, private readonly webUrl: string = target.url) {
    if (webUrl !== target.url) throw new Error('Only the exact TEST web URL is supported.');
  }
  private listUrl(): string { return `${this.webUrl}/_api/web/lists(guid'${target.listId}')`; }
  private async get(url: string): Promise<Record<string, unknown>> {
    // SPHttpClient v1 supplies OData-Version 4.0; retain its mode and v4 JSON shape.
    const response = await this.client.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata.metadata=none' } });
    if (!response.ok) throw new Error(`Metadata GET failed (${response.status}).`);
    const data = await response.json() as Record<string, unknown>;
    if (!data || typeof data !== 'object') throw new Error('Incomplete metadata response.');
    return data;
  }
  public async inspect(): Promise<SnapshotMetadataV1> {
    const site = await this.get(`${this.webUrl}/_api/site?$select=Id`);
    const web = await this.get(`${this.webUrl}/_api/web?$select=Id,Url`);
    const list = await this.get(`${this.listUrl()}?$select=Id,Title,BaseTemplate,EnableVersioning,EnableFolderCreation,HasUniqueRoleAssignments`);
    const fields: SnapshotFieldV1[] = [];
    const seen = new Set<string>();
    let url: string | undefined = `${this.listUrl()}/fields?$select=Id,InternalName,Title,TypeAsString,Required,Indexed,EnforceUniqueValues,DefaultValue,SchemaXml&$top=5000`;
    while (url) {
      if (seen.has(url)) throw new Error('Repeated metadata continuation.');
      seen.add(url);
      const data = await this.get(url);
      if (!Array.isArray(data.value)) throw new Error('Complete field collection required.');
      fields.push(...data.value as SnapshotFieldV1[]);
      const next = data['@odata.nextLink'] || data['odata.nextLink'];
      if (next !== undefined && typeof next !== 'string') throw new Error('Invalid metadata continuation.');
      if (next) {
        const parsed = new URL(next as string, this.webUrl);
        const expected = new URL(`${this.listUrl()}/fields`);
        if (parsed.origin !== expected.origin || parsed.pathname !== expected.pathname || parsed.hash || parsed.username || parsed.password) throw new Error('Out-of-scope metadata continuation.');
        url = parsed.href;
      } else url = undefined;
    }
    const metadata = { siteId: site.Id, webId: web.Id, webUrl: web.Url, list, fields } as SnapshotMetadataV1;
    const failures = validate(metadata);
    if (failures.length) throw new Error(failures.join(' '));
    return metadata;
  }
  public async createField(name: string): Promise<void> {
    const response = await this.client.post(`${this.listUrl()}/fields/createfieldasxml`, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata.metadata=none', 'Content-Type': 'application/json;odata.metadata=none' },
      body: JSON.stringify({ parameters: { SchemaXml: behaviourSnapshotsFieldXmlV1(name), Options: 0 } })
    });
    if (!response.ok) throw new Error(`Field creation failed (${response.status}); physical effects need readback.`);
  }
}
