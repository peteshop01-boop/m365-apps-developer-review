import type { SPHttpClient, SPHttpClientConfiguration, SPHttpClientResponse } from '@microsoft/sp-http';
import { OPTION_E_DRAFT_SCHEMA_VERSION, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import { OPTION_E_DRAFT_V3_SCHEMA_VERSION } from '../models/OptionEWorkplanDraftV3Models';
import {
  OptionEDraftRouteError,
  optionEItemEtag,
  type IOptionEDraftCanonicalRecord,
  type IOptionEDraftExactUpdate,
  type IOptionEDraftGateway,
  type IOptionEDraftItemStore,
  type IOptionEDraftOpenContext,
  type OptionEDraftPrepared,
  type OptionEPrivateDraftAggregate,
  type OptionEPrivateDraftSchema,
  type IOptionEProtectedDraftBinding
} from './OptionEDraftSharePointGateway';
import type { IOptionEWorkplanListBindings } from './OptionEWorkplanListBindings';

interface IProtectedRow extends Record<string, unknown> {
  Id?: number;
  UniqueId?: string;
  '@odata.etag'?: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const escapeOData = (value: string): string => value.replace(/'/g, "''");
const normaliseEmail = (value: string): string => value.trim().toLowerCase();

const canonicalPositiveInteger = (value: unknown): number | undefined => {
  if (Number.isSafeInteger(value) && Number(value) > 0) return Number(value);
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && String(parsed) === value ? parsed : undefined;
};

const exactBindingKeys: readonly (keyof IOptionEProtectedDraftBinding)[] = [
  'peopleItemId', 'peopleUniqueId', 'email', 'personKey', 'workplanItemId', 'workplanUniqueId',
  'workplanEtag', 'workplanKey', 'performanceYear', 'draftItemId', 'draftSchemaVersion', 'state',
  'transitionStatus', 'pendingRequestKey', 'rowVersionToken'
];

export const optionEProtectedBindingsEqual = (
  left: Readonly<IOptionEProtectedDraftBinding<OptionEPrivateDraftSchema>>,
  right: Readonly<IOptionEProtectedDraftBinding<OptionEPrivateDraftSchema>>
): boolean => exactBindingKeys.every(key => left[key] === right[key]);

export class OptionEProtectedDraftGateway<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> implements IOptionEDraftGateway<T> {
  private readonly authenticatedEmail: string;

  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    authenticatedEmail: string,
    private readonly bindings: IOptionEWorkplanListBindings,
    private readonly spHttpConfiguration: SPHttpClientConfiguration,
    private readonly draftStore: IOptionEDraftItemStore<T>,
    public readonly schemaVersion: T['schemaVersion'] = OPTION_E_DRAFT_SCHEMA_VERSION as T['schemaVersion']
  ) {
    this.authenticatedEmail = normaliseEmail(authenticatedEmail);
    if (schemaVersion !== OPTION_E_DRAFT_SCHEMA_VERSION && schemaVersion !== OPTION_E_DRAFT_V3_SCHEMA_VERSION) {
      throw new OptionEDraftRouteError('CONTROL_SCHEMA_MISMATCH', 'Unsupported private Draft schema.');
    }
    if (!/^https:\/\//i.test(webAbsoluteUrl) || !EMAIL.test(this.authenticatedEmail)) {
      throw new OptionEDraftRouteError('EMPLOYEE_INACCESSIBLE',
        'The authenticated Option E employee context is missing or invalid.');
    }
    this.assertAcceptedBindings();
  }

  public prepare(aggregate: T): Promise<OptionEDraftPrepared<T>> {
    if (aggregate.schemaVersion !== this.schemaVersion) throw new OptionEDraftRouteError('CONTROL_SCHEMA_MISMATCH', 'Private Draft schema mismatch.');
    return this.draftStore.prepare(aggregate);
  }

  public async read(context: IOptionEDraftOpenContext,
    expected?: Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>): Promise<IOptionEDraftCanonicalRecord<T>> {
    const binding = await this.resolveBinding(context);
    if (expected) this.assertExpectedBinding(binding, expected);
    const content = await this.draftStore.readExact(binding.draftItemId);
    if (content.aggregate.schemaVersion !== this.schemaVersion) throw new OptionEDraftRouteError('CONTROL_SCHEMA_MISMATCH', 'The private body does not match its protected schema.');
    return { ...content, binding };
  }

  public async updateExact(request: IOptionEDraftExactUpdate<T>): Promise<void> {
    // Preserve the leaf store's own-data admission across this forwarding boundary.
    // Capture before authority reads so later caller edits cannot replace checked metadata.
    const saveIdDescriptor = Object.getOwnPropertyDescriptor(request, 'clientSaveId');
    const savedAtDescriptor = Object.getOwnPropertyDescriptor(request, 'clientSavedAt');
    const clientSaveId = saveIdDescriptor && Object.prototype.hasOwnProperty.call(saveIdDescriptor, 'value')
      ? saveIdDescriptor.value as unknown : undefined;
    const clientSavedAt = savedAtDescriptor && Object.prototype.hasOwnProperty.call(savedAtDescriptor, 'value')
      ? savedAtDescriptor.value as unknown : undefined;
    if (typeof clientSaveId !== 'string' || typeof clientSavedAt !== 'string') {
      throw new OptionEDraftRouteError('DRAFT_INVALID',
        'Draft save metadata must be supplied as own primitive values.');
    }
    const binding = await this.resolveBinding(request.context);
    this.assertExpectedBinding(binding, request.expectedBinding);
    if (request.itemId !== binding.draftItemId || request.itemId !== request.expectedBinding.draftItemId) {
      throw new OptionEDraftRouteError('DRAFT_ITEM_INVALID',
        'The requested Draft item does not match the fresh protected Workplan binding.');
    }
    await this.draftStore.updateExact({
      itemId: request.itemId, expectedEtag: request.expectedEtag, prepared: request.prepared,
      clientSaveId, clientSavedAt
    });
  }

  private async resolveBinding(context: IOptionEDraftOpenContext): Promise<Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>> {
    if (!Number.isSafeInteger(context.performanceYear) || context.performanceYear < 1000
      || context.performanceYear > 9999) {
      throw new OptionEDraftRouteError('CONTROL_IDENTITY_INVALID',
        'The governed performance year is missing or invalid.');
    }
    const people = await this.readPeople();
    return this.readWorkplan(people, context.performanceYear);
  }

  private async readPeople(): Promise<{ itemId: number; uniqueId: string; email: string; personKey: string }> {
    const fields = this.bindings.peopleAuthorityFields;
    const select = ['Id', 'UniqueId', fields.personKey, fields.email, fields.active].join(',');
    const filter = encodeURIComponent(`${fields.email} eq '${escapeOData(this.authenticatedEmail)}' and ${fields.active} eq 1`);
    const url = `${this.listItemsUrl(this.bindings.peopleListTitle)}?$select=${select}&$filter=${filter}&$top=2`;
    const rows = await this.readCollection(url, 'EMPLOYEE_INACCESSIBLE',
      'The authenticated employee record is inaccessible.');
    if (rows.length === 0) {
      throw new OptionEDraftRouteError('EMPLOYEE_MISSING',
        'No active People record matched the authenticated employee.');
    }
    if (rows.length !== 1) {
      throw new OptionEDraftRouteError('EMPLOYEE_DUPLICATE',
        'More than one active People record matched the authenticated employee.');
    }
    const row = rows[0];
    const itemId = canonicalPositiveInteger(row.Id);
    const uniqueId = row.UniqueId;
    const email = row[fields.email];
    const personKey = row[fields.personKey];
    if (row[fields.active] !== true) {
      throw new OptionEDraftRouteError('EMPLOYEE_INACTIVE', 'The authenticated People record is not active.');
    }
    if (!itemId || !nonBlank(uniqueId) || !GUID.test(uniqueId) || !nonBlank(email)
      || normaliseEmail(email) !== this.authenticatedEmail || !nonBlank(personKey)) {
      throw new OptionEDraftRouteError('CONTROL_IDENTITY_INVALID',
        'The authenticated People identity is incomplete or does not match the page context.');
    }
    return { itemId, uniqueId: uniqueId.toLowerCase(), email: this.authenticatedEmail, personKey: personKey.trim() };
  }

  private async readWorkplan(
    people: { itemId: number; uniqueId: string; email: string; personKey: string },
    performanceYear: number
  ): Promise<Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>> {
    const fields = this.bindings.protectedControlFields;
    const select = ['Id', 'UniqueId', fields.workplanKey, fields.personKey,
      fields.performanceYear, fields.draftItemId, fields.draftSchemaVersion, fields.state,
      fields.transitionStatus, fields.pendingRequestKey, fields.rowVersionToken].join(',');
    const filter = encodeURIComponent(`${fields.personKey} eq '${escapeOData(people.personKey)}' and ${fields.performanceYear} eq ${performanceYear}`);
    const url = `${this.listItemsUrl(this.bindings.workplansListTitle)}?$select=${select}&$filter=${filter}&$top=2`;
    const rows = await this.readCollection(url, 'CONTROL_INACCESSIBLE',
      'The protected Workplan control is inaccessible.');
    if (rows.length === 0) {
      throw new OptionEDraftRouteError('CONTROL_MISSING',
        'No protected Workplan control matched the authenticated employee and governed year.');
    }
    if (rows.length !== 1) {
      throw new OptionEDraftRouteError('CONTROL_DUPLICATE',
        'More than one protected Workplan control matched the authenticated employee and governed year.');
    }
    const row = rows[0];
    const workplanItemId = canonicalPositiveInteger(row.Id);
    const workplanUniqueId = row.UniqueId;
    const workplanEtag = optionEItemEtag(row);
    const workplanKey = row[fields.workplanKey];
    const personKey = row[fields.personKey];
    const returnedYear = row[fields.performanceYear];
    const draftItemId = canonicalPositiveInteger(row[fields.draftItemId]);
    const state = row[fields.state];
    const transitionStatus = row[fields.transitionStatus];
    const pendingRequestKey = row[fields.pendingRequestKey];
    const schemaVersion = row[fields.draftSchemaVersion];
    const rowVersionToken = row[fields.rowVersionToken];
    if (!workplanItemId || !nonBlank(workplanUniqueId) || !GUID.test(workplanUniqueId)
      || !nonBlank(workplanEtag) || workplanEtag === '*' || workplanKey !== `${people.personKey}|${performanceYear}`
      || personKey !== people.personKey || returnedYear !== performanceYear) {
      throw new OptionEDraftRouteError('CONTROL_IDENTITY_INVALID',
        'The protected Workplan identity did not match the authenticated employee and governed year.');
    }
    if (state !== 'Draft' && state !== 'ChangesRequested') {
      throw new OptionEDraftRouteError('CONTROL_NON_EDITABLE',
        'The protected Workplan is not in an editable Draft state.');
    }
    if (transitionStatus !== 'Ready') {
      throw new OptionEDraftRouteError('CONTROL_NOT_READY',
        'The protected Workplan transition is not Ready for Draft Save.');
    }
    if (nonBlank(pendingRequestKey)) {
      throw new OptionEDraftRouteError('CONTROL_PENDING',
        'The protected Workplan has a pending request and cannot accept Draft Save.');
    }
    if (schemaVersion !== this.schemaVersion) {
      throw new OptionEDraftRouteError('CONTROL_SCHEMA_MISMATCH',
        'The protected Workplan Draft schema does not match the selected private route.');
    }
    if (!draftItemId) {
      throw new OptionEDraftRouteError('DRAFT_ITEM_INVALID',
        'The protected Workplan Draft item binding is missing or noncanonical.');
    }
    if (!Number.isSafeInteger(rowVersionToken) || Number(rowVersionToken) < 0) {
      throw new OptionEDraftRouteError('CONTROL_IDENTITY_INVALID',
        'The protected Workplan row-version token is invalid.');
    }
    return Object.freeze({
      peopleItemId: people.itemId, peopleUniqueId: people.uniqueId, email: people.email,
      personKey: people.personKey, workplanItemId, workplanUniqueId: workplanUniqueId.toLowerCase(),
      workplanEtag, workplanKey, performanceYear, draftItemId,
      draftSchemaVersion: this.schemaVersion, state,
      transitionStatus: 'Ready', pendingRequestKey: '', rowVersionToken: Number(rowVersionToken)
    });
  }

  private assertExpectedBinding(
    actual: Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>,
    expected: Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>
  ): void {
    if (!optionEProtectedBindingsEqual(actual, expected)) {
      throw new OptionEDraftRouteError('CONTROL_BINDING_STALE',
        'The protected employee/Workplan/Draft binding changed. Reopen the canonical Draft before saving.');
    }
  }

  private async readCollection(
    url: string,
    code: 'EMPLOYEE_INACCESSIBLE' | 'CONTROL_INACCESSIBLE',
    message: string
  ): Promise<IProtectedRow[]> {
    let response: SPHttpClientResponse;
    try {
      response = await this.spHttpClient.get(url, this.spHttpConfiguration, {
        headers: { Accept: 'application/json;odata.metadata=minimal' }
      });
    } catch {
      throw new OptionEDraftRouteError(code, message);
    }
    if (!response.ok) throw new OptionEDraftRouteError(code, `${message} HTTP ${response.status}.`);
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new OptionEDraftRouteError(code, `${message} Invalid authority collection.`);
    }
    // A bounded page is authority only when it is the complete supported envelope.
    // Reject even malformed/inherited continuation markers without reading getters
    // or following another URL; page cardinality must never stand in for uniqueness.
    if (['@odata.nextLink', 'odata.nextLink', '__next', 'd', 'results'].some(key => key in body)) {
      throw new OptionEDraftRouteError(code, `${message} Incomplete or unsupported authority collection.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(body, 'value');
    const rows: unknown = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value : undefined;
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new OptionEDraftRouteError(code, `${message} Invalid authority collection rows.`);
    }
    return rows as IProtectedRow[];
  }

  private listItemsUrl(listTitle: string): string {
    return `${this.webAbsoluteUrl.replace(/\/$/, '')}/_api/web/lists/getbytitle('${escapeOData(listTitle)}')/items`;
  }

  private assertAcceptedBindings(): void {
    if (this.bindings.draftsListTitle !== 'DEMOAPP_WorkplanDrafts'
      || this.bindings.workplansListTitle !== 'DEMOAPP_Workplans'
      || this.bindings.peopleListTitle !== 'DEMOAPP_People') {
      throw new OptionEDraftRouteError('CONTROL_IDENTITY_INVALID',
        'The Package 2 list binding is not the accepted Option E V2 contract.');
    }
  }
}

export default OptionEProtectedDraftGateway;
