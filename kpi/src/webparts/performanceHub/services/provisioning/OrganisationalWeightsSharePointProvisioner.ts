/* eslint-disable require-atomic-updates -- Each call owns one evidence object; awaited schema reads/writes are deliberately serial. */
import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import {
  ORGANISATIONAL_WEIGHTS_INITIAL_ROWS,
  ORGANISATIONAL_WEIGHTS_LIST_DEFINITION,
  productionPolicyFieldSchemaXml,
  validateProductionPolicySchemaReadback,
  type IProductionPolicyFieldDefinition,
  type IProductionPolicyFieldReadback
} from '../ProductionPolicyStructures';

export const ORGANISATIONAL_WEIGHTS_APPROVED_SITE =
  'https://example.invalid/sites/REVIEW-TEST-SITE';
export const ORGANISATIONAL_WEIGHTS_APPROVED_ACTOR = 'person003@example.invalid';

const LIST_SETTINGS = {
  baseTemplate: 100,
  enableVersioning: true,
  enableFolderCreation: false,
  onQuickLaunch: false,
  hidden: false
} as const;

type ProvisioningMode = 'Preflight' | 'Provision';
export type OrganisationalWeightsProvisioningStatus = 'Running' | 'Ready' | 'Pass' | 'Failed';

export interface IOrganisationalWeightsProvisioningAuthorisation {
  allowSchemaWrite: true;
  changeReference: 'KCF-KPI-020B';
  confirmNoSeedRows: true;
}

interface IODataCollection<T> { value: T[]; }

interface IListRow {
  Id: string;
  BaseTemplate: number;
  Description?: string;
  EnableVersioning: boolean;
  EnableFolderCreation: boolean;
  OnQuickLaunch: boolean;
  Hidden: boolean;
  ItemCount: number;
  RootFolder?: { ServerRelativeUrl?: string };
}

interface IFieldRow {
  Id: string;
  InternalName: string;
  TypeAsString: string;
  Required: boolean;
  Hidden: boolean;
  Indexed: boolean;
  EnforceUniqueValues: boolean;
  DefaultValue?: string;
  SchemaXml?: string;
  Choices?: readonly string[] | { results?: readonly string[] };
}

export interface IOrganisationalWeightsProvisioningEvidence {
  mode: ProvisioningMode;
  status: OrganisationalWeightsProvisioningStatus;
  siteUrl: string;
  actorEmail: string;
  startedAt: string;
  completedAt?: string;
  listTitle: 'KCFKPI_OrganisationalWeights';
  listId?: string;
  listUrl?: string;
  existedBefore: boolean;
  createdList: boolean;
  settingsChanged: boolean;
  titleFieldChanged: boolean;
  titleFieldVerified: boolean;
  itemCountBefore: number;
  itemCountAfter: number;
  configurationState: 'NOT CONFIGURED / NOT READY';
  initialSeedCount: 0;
  createdItemCount: 0;
  missingFieldsBefore: string[];
  createdFields: string[];
  verifiedFields: string[];
  repairableSettingMismatches: string[];
  blockingMismatches: string[];
  actions: string[];
  error?: string;
}

export class OrganisationalWeightsProvisioningError extends Error {
  public readonly evidence: IOrganisationalWeightsProvisioningEvidence;

  public constructor(message: string, evidence: IOrganisationalWeightsProvisioningEvidence) {
    super(message);
    this.name = 'OrganisationalWeightsProvisioningError';
    this.evidence = evidence;
    Object.setPrototypeOf(this, OrganisationalWeightsProvisioningError.prototype);
  }
}

const escapeOData = (value: string): string => value.replace(/'/g, "''");
const normaliseGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const fieldNames = (): string[] => ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.fields
  .map(field => field.internalName);

const readChoices = (row: IFieldRow): readonly string[] => {
  if (Array.isArray(row.Choices)) return row.Choices;
  if (row.Choices && !Array.isArray(row.Choices)) {
    return (row.Choices as { results?: readonly string[] }).results || [];
  }
  return [];
};

const mapField = (row: IFieldRow): IProductionPolicyFieldReadback => ({
  internalName: row.InternalName,
  type: row.TypeAsString,
  required: Boolean(row.Required),
  indexed: Boolean(row.Indexed),
  enforceUniqueValues: Boolean(row.EnforceUniqueValues),
  choices: readChoices(row)
});

const schemaAttribute = (schemaXml: string | undefined, name: string): string | undefined => {
  if (!schemaXml) return undefined;
  const attributes = /\s([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attributes.exec(schemaXml)) !== null) {
    if (match[1].toLowerCase() === name.toLowerCase()) return match[2];
  }
  return undefined;
};

export default class OrganisationalWeightsSharePointProvisioner {
  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly actorEmail: string
  ) {}

  public async preflight(): Promise<IOrganisationalWeightsProvisioningEvidence> {
    return this.execute('Preflight');
  }

  public async provision(
    authorisation: IOrganisationalWeightsProvisioningAuthorisation
  ): Promise<IOrganisationalWeightsProvisioningEvidence> {
    const evidence = this.createEvidence('Provision');
    try {
      this.assertWriteAuthorisation(authorisation);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Invalid organisational-weight schema authorisation.';
      evidence.status = 'Failed';
      evidence.error = message;
      evidence.completedAt = new Date().toISOString();
      throw new OrganisationalWeightsProvisioningError(message, evidence);
    }
    return this.execute('Provision', evidence);
  }

  private async execute(
    mode: ProvisioningMode,
    suppliedEvidence?: IOrganisationalWeightsProvisioningEvidence
  ): Promise<IOrganisationalWeightsProvisioningEvidence> {
    const evidence = suppliedEvidence || this.createEvidence(mode);
    try {
      this.assertExactTarget();
      await this.inspectCurrentState(evidence);
      this.assertPreflightSafe(evidence);
      if (mode === 'Preflight') {
        evidence.status = 'Ready';
      } else {
        await this.ensureList(evidence);
        await this.createMissingFields(evidence);
        await this.verifyFinalState(evidence);
        evidence.status = 'Pass';
      }
      evidence.completedAt = new Date().toISOString();
      return evidence;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown organisational-weight provisioning failure.';
      evidence.status = 'Failed';
      evidence.error = message;
      evidence.completedAt = new Date().toISOString();
      throw caught instanceof OrganisationalWeightsProvisioningError
        ? caught
        : new OrganisationalWeightsProvisioningError(message, evidence);
    }
  }

  private createEvidence(mode: ProvisioningMode): IOrganisationalWeightsProvisioningEvidence {
    return {
      mode,
      status: 'Running',
      siteUrl: this.siteUrl(),
      actorEmail: this.actorEmail.trim().toLowerCase(),
      startedAt: new Date().toISOString(),
      listTitle: ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.title,
      existedBefore: false,
      createdList: false,
      settingsChanged: false,
      titleFieldChanged: false,
      titleFieldVerified: false,
      itemCountBefore: 0,
      itemCountAfter: 0,
      configurationState: 'NOT CONFIGURED / NOT READY',
      initialSeedCount: 0,
      createdItemCount: 0,
      missingFieldsBefore: [],
      createdFields: [],
      verifiedFields: [],
      repairableSettingMismatches: [],
      blockingMismatches: [],
      actions: []
    };
  }

  private assertExactTarget(): void {
    if (this.siteUrl().toLowerCase() !== ORGANISATIONAL_WEIGHTS_APPROVED_SITE.toLowerCase()) {
      throw new Error('KCFKPI_OrganisationalWeights provisioning is restricted to the exact REVIEW-TEST-SITE site.');
    }
    if (this.actorEmail.trim().toLowerCase() !== ORGANISATIONAL_WEIGHTS_APPROVED_ACTOR) {
      throw new Error('KCFKPI_OrganisationalWeights provisioning is restricted to Synthetic Person 02\u2019s authenticated KCF account.');
    }
  }

  private assertWriteAuthorisation(authorisation: IOrganisationalWeightsProvisioningAuthorisation): void {
    if (!authorisation || authorisation.allowSchemaWrite !== true
      || authorisation.changeReference !== 'KCF-KPI-020B'
      || authorisation.confirmNoSeedRows !== true) {
      throw new Error('KCFKPI_OrganisationalWeights schema write requires the exact KCF-KPI-020B authorisation guard.');
    }
    if (ORGANISATIONAL_WEIGHTS_INITIAL_ROWS.length !== 0) {
      throw new Error('Organisational-weight provisioning is blocked because the controlled initial seed is not empty.');
    }
  }

  private async inspectCurrentState(evidence: IOrganisationalWeightsProvisioningEvidence): Promise<void> {
    const list = await this.readList();
    if (!list) {
      evidence.missingFieldsBefore = fieldNames();
      return;
    }
    evidence.existedBefore = true;
    this.setListIdentity(evidence, list);
    evidence.itemCountBefore = list.ItemCount;
    evidence.itemCountAfter = list.ItemCount;
    this.classifyListMismatches(list).forEach(message => {
      if (message.indexOf('BaseTemplate') === 0) evidence.blockingMismatches.push(message);
      else evidence.repairableSettingMismatches.push(message);
    });

    const fields = await this.readFields();
    const exact = this.validateExactFields(fields);
    evidence.missingFieldsBefore = exact.missingFields;
    evidence.blockingMismatches.push.apply(evidence.blockingMismatches, exact.mismatches);
    this.applyTitlePreflight(evidence, fields);
    if (list.ItemCount > 0 && exact.missingFields.length > 0) {
      evidence.blockingMismatches.push(
        'The existing organisational-weight list contains rows and has missing contract fields; automatic reconciliation is unsafe.'
      );
    }
  }

  private assertPreflightSafe(evidence: IOrganisationalWeightsProvisioningEvidence): void {
    if (evidence.blockingMismatches.length > 0) {
      throw new Error(`KCFKPI_OrganisationalWeights preflight failed: ${evidence.blockingMismatches.join(' ')}`);
    }
  }

  private async ensureList(evidence: IOrganisationalWeightsProvisioningEvidence): Promise<void> {
    let list = await this.readList();
    if (!list) {
      await this.postJson(`${this.siteUrl()}/_api/web/lists`, {
        BaseTemplate: LIST_SETTINGS.baseTemplate,
        Description: ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.description,
        EnableFolderCreation: LIST_SETTINGS.enableFolderCreation,
        EnableVersioning: LIST_SETTINGS.enableVersioning,
        OnQuickLaunch: LIST_SETTINGS.onQuickLaunch,
        Title: ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.title
      }, 'KCFKPI_OrganisationalWeights could not be created.');
      evidence.createdList = true;
      evidence.actions.push('Created the empty KCFKPI_OrganisationalWeights generic list.');
      list = await this.readList();
      if (!list) throw new Error('KCFKPI_OrganisationalWeights was not found after creation.');
      this.setListIdentity(evidence, list);
    }

    if (evidence.repairableSettingMismatches.some(message => message.indexOf('Title:') !== 0)) {
      await this.mergeJson(this.listApiUrl(), {
        Description: ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.description,
        EnableFolderCreation: LIST_SETTINGS.enableFolderCreation,
        EnableVersioning: LIST_SETTINGS.enableVersioning,
        Hidden: LIST_SETTINGS.hidden,
        OnQuickLaunch: LIST_SETTINGS.onQuickLaunch
      }, 'KCFKPI_OrganisationalWeights list settings could not be applied.');
      evidence.settingsChanged = true;
      evidence.actions.push('Applied the exact organisational-weight list settings.');
    }
    await this.ensureTitleField(evidence);
  }

  private async createMissingFields(evidence: IOrganisationalWeightsProvisioningEvidence): Promise<void> {
    const missing = evidence.createdList ? fieldNames() : evidence.missingFieldsBefore;
    for (const internalName of missing) {
      const field = ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.fields
        .filter(candidate => candidate.internalName === internalName)[0];
      if (!field) throw new Error(`Missing organisational-weight field definition for ${internalName}.`);
      await this.createField(field);
      evidence.createdFields.push(internalName);
      evidence.actions.push(`Created KCFKPI_OrganisationalWeights.${internalName}.`);
    }
  }

  private async verifyFinalState(evidence: IOrganisationalWeightsProvisioningEvidence): Promise<void> {
    const list = await this.readList();
    if (!list) throw new Error('KCFKPI_OrganisationalWeights was not found during final read-back.');
    const listMismatches = this.classifyListMismatches(list);
    const fields = await this.readFields();
    const exact = this.validateExactFields(fields);
    const titleMismatches = this.titleMismatches(fields);
    const countChanged = list.ItemCount !== evidence.itemCountBefore;
    const messages = listMismatches
      .concat(exact.missingFields.map(name => `Missing ${name}.`))
      .concat(exact.mismatches)
      .concat(titleMismatches);
    if (countChanged) messages.push(
      `ItemCount changed from ${evidence.itemCountBefore} to ${list.ItemCount}; schema provisioning must not create weighting rows.`
    );
    if (messages.length > 0) {
      throw new Error(`KCFKPI_OrganisationalWeights final read-back failed: ${messages.join(' ')}`);
    }
    this.setListIdentity(evidence, list);
    evidence.itemCountAfter = list.ItemCount;
    evidence.createdItemCount = 0;
    evidence.verifiedFields = fieldNames();
    evidence.titleFieldVerified = true;
    evidence.repairableSettingMismatches = [];
  }

  private classifyListMismatches(list: IListRow): string[] {
    const mismatches: string[] = [];
    if (list.BaseTemplate !== LIST_SETTINGS.baseTemplate) mismatches.push(`BaseTemplate ${list.BaseTemplate}, expected 100.`);
    if ((list.Description || '') !== ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.description) mismatches.push('Description does not match the controlled contract.');
    if (Boolean(list.EnableVersioning) !== LIST_SETTINGS.enableVersioning) mismatches.push('EnableVersioning does not match the controlled contract.');
    if (Boolean(list.EnableFolderCreation) !== LIST_SETTINGS.enableFolderCreation) mismatches.push('EnableFolderCreation does not match the controlled contract.');
    if (Boolean(list.OnQuickLaunch) !== LIST_SETTINGS.onQuickLaunch) mismatches.push('OnQuickLaunch does not match the controlled contract.');
    if (Boolean(list.Hidden) !== LIST_SETTINGS.hidden) mismatches.push('Hidden does not match the controlled contract.');
    return mismatches;
  }

  private validateExactFields(rows: readonly IFieldRow[]): { missingFields: string[]; mismatches: string[] } {
    const canonical = validateProductionPolicySchemaReadback(
      ORGANISATIONAL_WEIGHTS_LIST_DEFINITION,
      rows.map(mapField)
    );
    const mismatches = canonical.mismatches.slice();
    ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.fields.forEach(expected => {
      const actual = rows.filter(row => row.InternalName === expected.internalName)[0];
      if (!actual) return;
      if (normaliseGuid(actual.Id) !== normaliseGuid(expected.id)) {
        mismatches.push(`${expected.internalName}: field ID ${actual.Id}, expected ${expected.id}.`);
      }
      if (actual.Hidden) mismatches.push(`${expected.internalName}: Hidden true, expected false.`);
      const actualChoices = readChoices(actual);
      if (expected.choices && (actualChoices.length !== expected.choices.length
        || expected.choices.some((choice, index) => actualChoices[index] !== choice))) {
        mismatches.push(`${expected.internalName}: choice order does not match the controlled contract.`);
      }
      if (expected.type === 'Number') {
        if (schemaAttribute(actual.SchemaXml, 'Decimals') !== String(expected.decimalPlaces ?? 2)) {
          mismatches.push(`${expected.internalName}: Decimals does not match the controlled contract.`);
        }
        if (expected.minimum !== undefined
          && schemaAttribute(actual.SchemaXml, 'Min') !== String(expected.minimum)) {
          mismatches.push(`${expected.internalName}: Min does not match the controlled contract.`);
        }
        if (expected.maximum !== undefined
          && schemaAttribute(actual.SchemaXml, 'Max') !== String(expected.maximum)) {
          mismatches.push(`${expected.internalName}: Max does not match the controlled contract.`);
        }
      }
      if (expected.type === 'DateOnly' && schemaAttribute(actual.SchemaXml, 'Format') !== 'DateOnly') {
        mismatches.push(`${expected.internalName}: Date format does not match DateOnly.`);
      }
      if (expected.type === 'Choice') {
        if (schemaAttribute(actual.SchemaXml, 'Format') !== 'Dropdown') {
          mismatches.push(`${expected.internalName}: Choice Format must be Dropdown.`);
        }
        if ((schemaAttribute(actual.SchemaXml, 'FillInChoice') || '').toUpperCase() !== 'FALSE') {
          mismatches.push(`${expected.internalName}: FillInChoice must be FALSE.`);
        }
      }
    });
    return { missingFields: canonical.missingFields, mismatches };
  }

  private applyTitlePreflight(
    evidence: IOrganisationalWeightsProvisioningEvidence,
    fields: readonly IFieldRow[]
  ): void {
    const mismatches = this.titleMismatches(fields);
    if (!mismatches.length) {
      evidence.titleFieldVerified = true;
      return;
    }
    mismatches.forEach(message => {
      if (message.indexOf('Built-in Title') === 0) evidence.blockingMismatches.push(message);
      else evidence.repairableSettingMismatches.push(message);
    });
  }

  private titleMismatches(fields: readonly IFieldRow[]): string[] {
    const title = fields.filter(field => field.InternalName === 'Title')[0];
    if (!title) return ['Built-in Title field was not returned by SharePoint.'];
    const mismatches: string[] = [];
    if (title.Required) mismatches.push('Title: Required true, expected false.');
    if (!title.Hidden) mismatches.push('Title: Hidden false, expected true.');
    return mismatches;
  }

  private async ensureTitleField(evidence: IOrganisationalWeightsProvisioningEvidence): Promise<void> {
    const fields = await this.readFields();
    const mismatches = this.titleMismatches(fields);
    if (!mismatches.length) return;
    if (mismatches.some(message => message.indexOf('Built-in Title') === 0)) {
      throw new Error('KCFKPI_OrganisationalWeights built-in Title field was not returned; automatic repair is unsafe.');
    }
    await this.mergeJson(
      `${this.listApiUrl()}/fields/getbyinternalnameortitle('Title')`,
      { Required: false, Hidden: true },
      'KCFKPI_OrganisationalWeights built-in Title field could not be made optional and hidden.'
    );
    evidence.settingsChanged = true;
    evidence.titleFieldChanged = true;
    evidence.actions.push('Made the built-in Title field optional and hidden; OrganisationalWeightKey is the natural key.');
  }

  private async createField(field: IProductionPolicyFieldDefinition): Promise<void> {
    await this.postJson(`${this.listApiUrl()}/fields/createfieldasxml`, {
      parameters: { SchemaXml: productionPolicyFieldSchemaXml(field), Options: 0 }
    }, `The approved field KCFKPI_OrganisationalWeights.${field.internalName} could not be created.`);
  }

  private async readList(): Promise<IListRow | undefined> {
    const response = await this.spHttpClient.get(
      `${this.listApiUrl()}?$select=Id,BaseTemplate,Description,EnableVersioning,EnableFolderCreation,OnQuickLaunch,Hidden,ItemCount,RootFolder/ServerRelativeUrl&$expand=RootFolder`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    if (response.status === 404) return undefined;
    await this.ensureSuccess(response, 'KCFKPI_OrganisationalWeights could not be read.');
    return await response.json() as IListRow;
  }

  private async readFields(): Promise<IFieldRow[]> {
    const response = await this.spHttpClient.get(
      `${this.listApiUrl()}/fields?$select=Id,InternalName,TypeAsString,Required,Hidden,Indexed,EnforceUniqueValues,DefaultValue,SchemaXml,Choices&$top=5000`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    await this.ensureSuccess(response, 'KCFKPI_OrganisationalWeights fields could not be read.');
    const data = await response.json() as IODataCollection<IFieldRow>;
    return data.value;
  }

  private async postJson(url: string, body: object, fallback: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata'
      },
      body: JSON.stringify(body)
    });
    await this.ensureSuccess(response, fallback);
  }

  private async mergeJson(url: string, body: object, fallback: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE'
      },
      body: JSON.stringify(body)
    });
    await this.ensureSuccess(response, fallback);
  }

  private async ensureSuccess(response: SPHttpClientResponse, fallback: string): Promise<void> {
    if (response.ok) return;
    let detail = '';
    try {
      detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
    } catch {
      detail = '';
    }
    throw new Error(`${fallback} HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
  }

  private setListIdentity(evidence: IOrganisationalWeightsProvisioningEvidence, list: IListRow): void {
    evidence.listId = list.Id;
    evidence.listUrl = list.RootFolder && list.RootFolder.ServerRelativeUrl;
  }

  private siteUrl(): string {
    return this.webAbsoluteUrl.replace(/\/+$/, '');
  }

  private listApiUrl(): string {
    return `${this.siteUrl()}/_api/web/lists/getbytitle('${escapeOData(ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.title)}')`;
  }
}
