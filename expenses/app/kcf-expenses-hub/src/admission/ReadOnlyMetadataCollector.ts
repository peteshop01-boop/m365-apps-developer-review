import type { IFieldMetadata, IListMetadata } from './BackendEvidence';

/** Integration owner supplies an already-authorised JSON GET channel. No tokens,
 * cookies, caller roles or write methods are accepted, created or stored here. */
export interface IReadOnlyMetadataTransport { getJson(url: string): Promise<unknown>; }
export interface IMetadataSnapshot {
  readonly capturedAtUtc: string;
  readonly metadataOnly: true;
  readonly tenantWritesAuthorised: false;
  readonly actorContext: 'UNVERIFIED';
  readonly isSiteAdmin?: boolean;
  readonly siteTitle: string;
  readonly expenseList: IListMetadata;
  readonly expenseFields: ReadonlyArray<IFieldMetadata>;
  readonly roleGrants: ReadonlyArray<{ readonly principalType?: number; readonly levels: ReadonlyArray<string> }>;
}
const approvedSite = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const expenseTitle = 'KCFEXP_TEST102_ExpenseLines';
const fieldPageLimit = 200;
const routes = Object.freeze({
  site: '/_api/web?$select=Title',
  list: `/_api/web/lists/getbytitle('${expenseTitle}')?$select=Title,HasUniqueRoleAssignments,ReadSecurity,WriteSecurity,EnableVersioning`,
  fields: `/_api/web/lists/getbytitle('${expenseTitle}')/fields?$select=InternalName,TypeAsString,Required,ReadOnlyField,EnforceUniqueValues&$top=${fieldPageLimit}`,
  actor: '/_api/web/currentuser?$select=IsSiteAdmin',
  roles: '/_api/web/RoleAssignments?$expand=Member,RoleDefinitionBindings&$select=Member/PrincipalType,RoleDefinitionBindings/Name'
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a metadata object; no payload values logged.');
  return value as Record<string, unknown>;
}
function unwrap(value: unknown): Record<string, unknown> {
  const root = record(value);
  if (root.error || root['odata.error']) throw new Error('Metadata request returned an error.');
  return root.d ? record(root.d) : root;
}
function rows(value: unknown): unknown[] {
  const root = unwrap(value);
  if (root['@odata.nextLink'] || root['odata.nextLink'] || root.__next) throw new Error('Incomplete metadata page; bounded paging review required.');
  const result = root.value || root.results;
  if (!Array.isArray(result)) throw new Error('Expected a metadata collection.');
  return result;
}
function boolean(value: unknown): boolean | undefined { return typeof value === 'boolean' ? value : undefined; }
function integer(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined; }
function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Required metadata string is missing.');
  return value;
}

/** Source-only collector, not wired to the web-part factory. Synthetic transport
 * tests do not confer tenant permissions, licence, negative-actor or Save proof. */
export class ReadOnlyMetadataCollector {
  private readonly baseUrl: string;
  public constructor(private readonly transport: IReadOnlyMetadataTransport, siteUrl: string = approvedSite) {
    const url = new URL(siteUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'example.invalid'
      || url.pathname.replace(/\/$/, '').toLowerCase() !== '/sites/REVIEW-TEST-SITE'
      || url.port || url.username || url.password || url.search || url.hash) throw new Error('Only the approved TEST metadata site is allowed.');
    this.baseUrl = approvedSite;
  }
  public async collect(): Promise<IMetadataSnapshot> {
    const [siteRaw, listRaw, fieldsRaw, actorRaw, rolesRaw] = await Promise.all([
      this.transport.getJson(this.baseUrl + routes.site), this.transport.getJson(this.baseUrl + routes.list),
      this.transport.getJson(this.baseUrl + routes.fields), this.transport.getJson(this.baseUrl + routes.actor),
      this.transport.getJson(this.baseUrl + routes.roles)
    ]);
    const site = unwrap(siteRaw); const list = unwrap(listRaw); const actor = unwrap(actorRaw);
    if (list.Title !== expenseTitle) throw new Error('Expense list identity mismatch.');
    const fieldRows = rows(fieldsRaw);
    // A bounded $top response may omit a continuation link. Reaching the cap
    // cannot prove complete schema even when the JSON itself is well formed.
    if (fieldRows.length >= fieldPageLimit) throw new Error('Field metadata reached the bounded page limit; completeness is unverified.');
    const fields = fieldRows.map(raw => {
      const field = record(raw); const internalName = requiredString(field.InternalName);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(internalName)) throw new Error('Unexpected internal field-name format.');
      return Object.freeze({ internalName, type: requiredString(field.TypeAsString), required: boolean(field.Required),
        readOnly: boolean(field.ReadOnlyField), unique: boolean(field.EnforceUniqueValues) });
    });
    if (new Set(fields.map(field => field.internalName)).size !== fields.length) throw new Error('Duplicate metadata field names.');
    const grants = rows(rolesRaw).map(raw => {
      const grant = record(raw); const member = record(grant.Member);
      const bindings = Array.isArray(grant.RoleDefinitionBindings) ? grant.RoleDefinitionBindings : rows(grant.RoleDefinitionBindings);
      const standardNames = ['Full Control', 'Edit', 'Contribute', 'Read', 'Limited Access', 'View Only', 'Design', 'Approve'];
      const levels = bindings.map(binding => {
        const name = record(binding).Name;
        return typeof name === 'string' && standardNames.includes(name) ? name : 'CUSTOM_ROLE_REVIEW_REQUIRED';
      });
      // Principal IDs, names, emails, login names and unknown response properties
      // never leave this parser. Membership/actual effective scope remain unknown.
      return Object.freeze({ principalType: integer(member.PrincipalType), levels: Object.freeze(levels) });
    });
    return Object.freeze({ capturedAtUtc: new Date().toISOString(), metadataOnly: true, tenantWritesAuthorised: false,
      actorContext: 'UNVERIFIED', isSiteAdmin: boolean(actor.IsSiteAdmin), siteTitle: requiredString(site.Title),
      expenseList: Object.freeze({ title: expenseTitle, uniqueAcl: boolean(list.HasUniqueRoleAssignments),
        readSecurity: integer(list.ReadSecurity), writeSecurity: integer(list.WriteSecurity), versioning: boolean(list.EnableVersioning) }),
      expenseFields: Object.freeze(fields), roleGrants: Object.freeze(grants) });
  }
}
