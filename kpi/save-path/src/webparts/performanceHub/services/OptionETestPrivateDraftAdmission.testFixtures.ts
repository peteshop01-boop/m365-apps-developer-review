import { createHash } from 'node:crypto';
import type { SPHttpClient, SPHttpClientConfiguration, SPHttpClientResponse } from '@microsoft/sp-http';
import type { IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import type { IProductionPerson, IProductionConfig } from '../models/ProductionModels';
import type { IEmployeeWorkplanReadbackV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import { canonicaliseOptionEPartialDraftV3 } from './OptionEWorkplanDraftV3Wire';
import { createTestPrivateDraftAdmission, type IReviewedTestPrivateDraftAdmission } from './OptionETestPrivateDraftAdmission';
import { OPTION_E_PRIVATE_DRAFT_OWNER_ROLE } from './OptionEPrivateDraftOwnerPermissions';

// Fictional IDs and content only. The SP-shaped client below has no network fallback.
export const ADMISSION_SITE = 'https://review-tenant.example.invalid/sites/demo-automation';
export const cloneAdmissionFixture = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const admissionFixtureHash = (value: string): string => createHash('sha256').update(value).digest('hex').toUpperCase();
const guid = (id: number): string => `f1000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const targets = (): IOptionEWorkplanDraftV3Aggregate['impact'][number]['targets'] => ({
  annual: { kind: 'NativePair', numericValue: 0, textValue: 'Retained annual zero' },
  q1: { kind: 'Scalar', value: 'Q1 retained' }, q2: { kind: 'Scalar', value: 'Q2 retained' },
  q3: { kind: 'Scalar', value: 'Q3 retained' }, q4: { kind: 'Scalar', value: 'Q4 retained' }
});
export const admissionFixtureBody = (): IOptionEWorkplanDraftV3Aggregate => ({ schemaVersion: 'demo.workplan-draft/v3',
  core: { weightingMode: 'Custom', entries: [{ coreId: 'FICTION-CORE-A', kpiId: 'FICTION-KPI-A',
    kpiVersionKey: 'FICTION-KPI-A|v1', targetVersionKey: 'FICTION-TARGET-A|v1', role: 'Delivery',
    nativeRole: 'Contributor', contributionMethod: 'SharedTarget', sharedTargetRule: 'ApprovedApportionment',
    sharedApportionmentPercent: 0, governanceReference: 'FICTION-REFERENCE', weightPercent: 0, targets: targets() }] },
  impact: [{ impactId: 'FICTION-IMPACT-A', wording: 'Fictional retained outcome', measure: 'Retained criterion',
    editorDefinition: { measure: 'Number / Quantity', success: '' }, unitLabel: 'items', targets: targets(),
    personalItemWeight: 100, classification: { state: 'Unselected' } }],
  behaviours: { frameworkVersion: 'DEMO-BEHAVIOUR|v02', roleTier: 'IC_OFFICER', entries: [{
    valueId: 'BHV-01', descriptorKey: 'FICTION-DESCRIPTOR', guidancePromptKeys: [], selectedPromptKeys: [],
    commitment: 'Retained commitment', cadenceClaim: 'Quarterly',
    periodCommitments: { Q1: 'Q1 retained', Q2: 'Q2 retained', Q3: 'Q3 retained', Q4: 'Q4 retained', H1: '', H2: '' },
    planningLevels: { contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Developing', targetLevel: 'Effective', targetJustification: '' }
  }] }, employeeNotes: { categoryWeightReason: 'Retained private note', zeroPersonalReason: '' }
});
export const admissionFixtureMultiBody = (): IOptionEWorkplanDraftV3Aggregate => {
  const body = admissionFixtureBody();
  body.core.entries.push({ ...cloneAdmissionFixture(body.core.entries[0]), coreId: 'FICTION-CORE-B', kpiId: 'FICTION-KPI-B',
    kpiVersionKey: 'FICTION-KPI-B|v1', targetVersionKey: 'FICTION-TARGET-B|v1' });
  body.impact.push({ ...cloneAdmissionFixture(body.impact[0]), impactId: 'FICTION-IMPACT-B', wording: 'Second retained outcome' });
  body.behaviours.entries.push({ ...cloneAdmissionFixture(body.behaviours.entries[0]), valueId: 'BHV-02' });
  body.core.entries.forEach(row => { row.weightPercent = 50; });
  body.impact.forEach(row => { row.personalItemWeight = 50; });
  return body;
};
export const admissionFixturePerson: IProductionPerson = { id: 51, personKey: 'FICTION-OWNER',
  displayName: 'Fictional Owner', email: 'owner@draft-fixture.invalid', active: true, appRoles: ['Employee'],
  behaviourFrameworkVersionV2: 'DEMO-BEHAVIOUR|v02', behaviourRoleTierV2: 'IC_OFFICER', behaviourCadenceV2: 'Quarterly' };
export const admissionFixtureConfig: IProductionConfig = { performanceYear: '2027', performanceYearNumber: 2027,
  performanceYearStart: '2027-01-01T00:00:00Z', performanceYearEnd: '2027-12-31T23:59:59Z',
  quarters: { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }, weights: { core: 70, personal: 30, behaviours: 0 },
  rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: [], retentionStatus: 'Fictional only' };
const response = (status: number, body: unknown = {}): SPHttpClientResponse => ({ status,
  ok: status >= 200 && status < 300, json: async () => cloneAdmissionFixture(body), text: async () => JSON.stringify(body)
} as unknown as SPHttpClientResponse);

export class PrivateDraftAdmissionFixture {
  public readonly configuration = {} as SPHttpClientConfiguration;
  public readonly gets: string[] = [];
  public readonly posts: { url: string; body: Record<string, string>; headers: Record<string, string> }[] = [];
  public scope: IReviewedTestPrivateDraftAdmission = {
    webUrl: ADMISSION_SITE, webId: guid(11), lists: { people: guid(21), workplans: guid(22), drafts: guid(23) },
    actor: { principalId: 41, loginName: 'i:0#.f|membership|owner@draft-fixture.invalid', email: admissionFixturePerson.email, isSiteAdmin: false },
    binding: { peopleItemId: 51, peopleUniqueId: guid(51), email: admissionFixturePerson.email, personKey: 'FICTION-OWNER',
      workplanItemId: 61, workplanUniqueId: guid(61), workplanEtag: '"header-1"', workplanKey: 'FICTION-OWNER|2027', performanceYear: 2027,
      draftItemId: 71, draftSchemaVersion: 'demo.workplan-draft/v3', state: 'Draft', transitionStatus: 'Ready', pendingRequestKey: '', rowVersionToken: 1 },
    draftUniqueId: guid(71),
    draftOwnerRole: { id: 107, ...OPTION_E_PRIVATE_DRAFT_OWNER_ROLE },
    reservation: { id: 'FICTION-SOURCE-RESERVATION', notBeforeUtc: new Date(Date.now() - 1000).toISOString(), expiresUtc: new Date(Date.now() + 60000).toISOString() },
    evidence: { authority: 'FICTION-AUTHORITY', technical: 'FICTION-TECHNICAL', security: 'FICTION-SECURITY',
      pointerUniqueness: 'FICTION-POINTER', draftOwnerPermission: 'FICTION-ITEM-ONLY-PERMISSION-RECEIPT' }
  };
  public readonly serverScope = cloneAdmissionFixture(this.scope);
  public readonly header: Record<string, unknown> = { Id: 61, UniqueId: guid(61), '@odata.etag': '"header-1"',
    WorkplanKey: 'FICTION-OWNER|2027', PersonKey: 'FICTION-OWNER', PerformanceYear: 2027, DraftItemId: '71',
    DraftSchemaVersion: 'demo.workplan-draft/v3', State: 'Draft', TransitionStatus: 'Ready', PendingRequestKey: '', RowVersionToken: 1 };
  public readonly fields: Record<string, unknown>[] = [
    { InternalName: 'DraftPayloadJSON', TypeAsString: 'Note', RichText: false },
    { InternalName: 'DraftPayloadSHA256', TypeAsString: 'Text', MaxLength: 64 },
    { InternalName: 'ClientSaveID', TypeAsString: 'Text', MaxLength: 64 },
    { InternalName: 'ClientSavedAt', TypeAsString: 'DateTime' }
  ];
  public readonly pointerField: Record<string, unknown> = {
    InternalName: 'DraftItemId', TypeAsString: 'Text', MaxLength: 20, Indexed: true, EnforceUniqueValues: true
  };
  public readonly draft: Record<string, unknown>;
  public outcome: 'success' | 'deny' | 'commitThen500' | 'uncertainNoCommit' | 'wrongReadback' = 'success';
  public denyReadsAfterWrite = false;
  public beforePost?: () => void;
  public beforeGet?: (url: string) => void;
  public waitBeforeGet?: (url: string) => Promise<void>;
  private version = 1;

  public constructor(body = admissionFixtureBody()) {
    const payload = canonicaliseOptionEPartialDraftV3(body);
    this.draft = { Id: 71, UniqueId: guid(71), '@odata.etag': '"draft-1"',
      HasUniqueRoleAssignments: true, EffectiveBasePermissions: { High: '0', Low: '196613' }, DraftPayloadJSON: payload,
      DraftPayloadSHA256: admissionFixtureHash(payload), ClientSaveID: guid(81), ClientSavedAt: '2026-10-18T00:00:00.000Z',
      Editor: { EMail: admissionFixturePerson.email, Title: admissionFixturePerson.displayName } };
  }
  public readonly client = { get: async (url: string) => { await this.waitBeforeGet?.(url); return this.get(url); },
    post: async (url: string, _configuration: unknown, options: { headers: Record<string, string>; body: string }) => {
      this.beforePost?.();
      const body = JSON.parse(options.body) as Record<string, string>;
      if (url !== `${ADMISSION_SITE}/_api/web/lists/getbytitle('DEMOAPP_WorkplanDrafts')/items(71)`
        || Object.keys(body).sort().join(',') !== 'ClientSaveID,ClientSavedAt,DraftPayloadJSON,DraftPayloadSHA256'
        || options.headers['X-HTTP-Method'] !== 'MERGE' || options.headers['IF-MATCH'] === '*') throw Error('Fictional transport refuses this mutation');
      this.posts.push({ url, body: cloneAdmissionFixture(body), headers: cloneAdmissionFixture(options.headers) });
      if (this.outcome === 'deny') return response(403);
      if (options.headers['IF-MATCH'] !== this.draft['@odata.etag']) return response(412);
      if (this.outcome === 'uncertainNoCommit') return response(500);
      Object.assign(this.draft, body, { '@odata.etag': `"draft-${++this.version}"` });
      if (this.outcome === 'wrongReadback') this.draft.ClientSaveID = guid(99);
      return response(this.outcome === 'commitThen500' ? 500 : 204);
    } } as unknown as SPHttpClient;
  public gateway() {
    const gateway = createTestPrivateDraftAdmission(this.client, ADMISSION_SITE, admissionFixturePerson.email, this.configuration, this.scope);
    if (!gateway) throw Error('Fictional reviewed tuple was denied');
    return gateway;
  }
  public readback(): IEmployeeWorkplanReadbackV2 {
    return { workplan: { id: 61, etag: String(this.header['@odata.etag']), workplanKey: String(this.header.WorkplanKey),
      personKey: String(this.header.PersonKey), employeeEmail: admissionFixturePerson.email, employeeDisplayName: admissionFixturePerson.displayName,
      performanceYear: Number(this.header.PerformanceYear), state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: String(this.header.TransitionStatus),
      rowVersionToken: Number(this.header.RowVersionToken), coreCategoryWeight: 70, personalCategoryWeight: 30, behaviourCategoryWeight: 0,
      coreWeightingMode: 'Custom', workplanVersion: 1 }, coreItems: [], personalItems: [], behaviourItems: [], audits: [] };
  }
  private get(url: string): SPHttpClientResponse {
    this.gets.push(url); this.beforeGet?.(url);
    if (this.denyReadsAfterWrite && this.posts.length) return response(403);
    if (!url.startsWith(`${ADMISSION_SITE}/_api/web`)) throw Error('Fictional transport has no network fallback');
    if (url.includes('/currentuser?')) return response(200, { Id: this.serverScope.actor.principalId, LoginName: this.serverScope.actor.loginName,
      Email: this.serverScope.actor.email, IsSiteAdmin: this.serverScope.actor.isSiteAdmin });
    if (url.startsWith(`${ADMISSION_SITE}/_api/web?`)) return response(200, { Id: this.serverScope.webId, Url: this.serverScope.webUrl });
    if (url === `${ADMISSION_SITE}/_api/web/lists(guid'${this.serverScope.lists.workplans}')/fields/getbyinternalnameortitle('DraftItemId')?$select=InternalName,TypeAsString,MaxLength,Indexed,EnforceUniqueValues`) {
      return response(200, this.pointerField);
    }
    const list = url.match(/getbytitle\('([^']+)'\)(.*)$/);
    if (!list) throw Error('Unexpected fictional GET');
    const [title, suffix] = [list[1], list[2]];
    if (suffix.startsWith('?$select=Id')) {
      const ids: Record<string, string> = { DEMOAPP_People: this.serverScope.lists.people, DEMOAPP_Workplans: this.serverScope.lists.workplans, DEMOAPP_WorkplanDrafts: this.serverScope.lists.drafts };
      return response(200, { Id: ids[title] });
    }
    if (title === 'DEMOAPP_WorkplanDrafts' && suffix.startsWith('/fields?')) return response(200, { value: this.fields });
    if (title === 'DEMOAPP_People') return response(200, { value: [{ Id: 51, UniqueId: guid(51), Email: admissionFixturePerson.email, Active: true, PersonKey: 'FICTION-OWNER' }] });
    if (title === 'DEMOAPP_Workplans') return response(200, { value: [this.header] });
    if (title === 'DEMOAPP_WorkplanDrafts' && suffix.startsWith('/items(71)?')) return response(200, this.draft);
    throw Error('Unspecified fictional GET: ' + url);
  }
}
