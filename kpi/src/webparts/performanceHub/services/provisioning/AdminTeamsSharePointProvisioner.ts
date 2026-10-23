import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import {
  ADMIN_TEAMS_FIELDS,
  ADMIN_TEAMS_INITIAL_ROWS,
  ADMIN_TEAMS_LIST_DESCRIPTION,
  ADMIN_TEAMS_LIST_SETTINGS,
  ADMIN_TEAMS_LIST_TITLE,
  ADMIN_TEAMS_TITLE_FIELD,
  adminTeamsFieldSchemaXml,
  type IAdminTeamsFieldDefinition,
  type IAdminTeamsFieldReadback,
  type IAdminTeamsListReadback,
  validateAdminTeamsFields,
  validateAdminTeamsListSettings,
  validateAdminTeamsTitleField
} from '../AdminTeamsSchema';

export const ADMIN_TEAMS_APPROVED_SITE =
  'https://example.invalid/sites/REVIEW-TEST-SITE';
export const ADMIN_TEAMS_APPROVED_ACTOR = 'person003@example.invalid';

type AdminTeamsProvisioningMode = 'Preflight' | 'Provision';
export type AdminTeamsProvisioningStatus = 'Running' | 'Ready' | 'Pass' | 'Failed';

export interface IAdminTeamsProvisioningAuthorisation {
  allowSchemaWrite: true;
  changeReference: 'KCF-KPI-020A';
  confirmNoSeedRows: true;
}

interface IODataCollection<T> { value: T[]; }

interface ISharePointListRow {
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

interface ISharePointFieldRow {
  Id: string;
  InternalName: string;
  TypeAsString: string;
  Required: boolean;
  Hidden: boolean;
  Indexed: boolean;
  EnforceUniqueValues: boolean;
  DefaultValue?: string;
  SchemaXml?: string;
}

export interface IAdminTeamsProvisioningEvidence {
  mode: AdminTeamsProvisioningMode;
  status: AdminTeamsProvisioningStatus;
  siteUrl: string;
  actorEmail: string;
  startedAt: string;
  completedAt?: string;
  listTitle: typeof ADMIN_TEAMS_LIST_TITLE;
  listId?: string;
  listUrl?: string;
  existedBefore: boolean;
  createdList: boolean;
  settingsChanged: boolean;
  titleFieldChanged: boolean;
  titleFieldVerified: boolean;
  itemCountBefore: number;
  itemCountAfter: number;
  configurationState: 'Unconfigured' | 'Configured';
  emptyInitialStateSupported: true;
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

export class AdminTeamsProvisioningError extends Error {
  public readonly evidence: IAdminTeamsProvisioningEvidence;

  public constructor(message: string, evidence: IAdminTeamsProvisioningEvidence) {
    super(message);
    this.name = 'AdminTeamsProvisioningError';
    this.evidence = evidence;
    Object.setPrototypeOf(this, AdminTeamsProvisioningError.prototype);
  }
}

const escapeOData = (value: string): string => value.replace(/'/g, "''");

const mapField = (row: ISharePointFieldRow): IAdminTeamsFieldReadback => ({
  id: row.Id,
  internalName: row.InternalName,
  type: row.TypeAsString,
  required: Boolean(row.Required),
  hidden: Boolean(row.Hidden),
  indexed: Boolean(row.Indexed),
  enforceUniqueValues: Boolean(row.EnforceUniqueValues),
  defaultValue: row.DefaultValue,
  schemaXml: row.SchemaXml || ''
});

const mapList = (row: ISharePointListRow): IAdminTeamsListReadback => ({
  baseTemplate: row.BaseTemplate,
  description: row.Description || '',
  enableVersioning: Boolean(row.EnableVersioning),
  enableFolderCreation: Boolean(row.EnableFolderCreation),
  onQuickLaunch: Boolean(row.OnQuickLaunch),
  hidden: Boolean(row.Hidden),
  itemCount: row.ItemCount
});

export default class AdminTeamsSharePointProvisioner {
  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly actorEmail: string
  ) {}

  public async preflight(): Promise<IAdminTeamsProvisioningEvidence> {
    return this.execute('Preflight');
  }

  public async provision(
    authorisation: IAdminTeamsProvisioningAuthorisation
  ): Promise<IAdminTeamsProvisioningEvidence> {
    const evidence = this.createEvidence('Provision');
    try {
      this.assertWriteAuthorisation(authorisation);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Invalid Teams schema write authorisation.';
      evidence.status = 'Failed';
      evidence.error = message;
      evidence.completedAt = new Date().toISOString();
      throw new AdminTeamsProvisioningError(message, evidence);
    }
    return this.execute('Provision', evidence);
  }

  private async execute(
    mode: AdminTeamsProvisioningMode,
    suppliedEvidence?: IAdminTeamsProvisioningEvidence
  ): Promise<IAdminTeamsProvisioningEvidence> {
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
      const message = caught instanceof Error ? caught.message : 'Unknown KCFKPI_Teams provisioning failure.';
      evidence.status = 'Failed';
      evidence.error = message;
      evidence.completedAt = new Date().toISOString();
      throw caught instanceof AdminTeamsProvisioningError
        ? caught
        : new AdminTeamsProvisioningError(message, evidence);
    }
  }

  private createEvidence(mode: AdminTeamsProvisioningMode): IAdminTeamsProvisioningEvidence {
    return {
      mode,
      status: 'Running',
      siteUrl: this.siteUrl(),
      actorEmail: this.actorEmail.trim().toLowerCase(),
      startedAt: new Date().toISOString(),
      listTitle: ADMIN_TEAMS_LIST_TITLE,
      existedBefore: false,
      createdList: false,
      settingsChanged: false,
      titleFieldChanged: false,
      titleFieldVerified: false,
      itemCountBefore: 0,
      itemCountAfter: 0,
      configurationState: 'Unconfigured',
      emptyInitialStateSupported: true,
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
    if (this.siteUrl().toLowerCase() !== ADMIN_TEAMS_APPROVED_SITE.toLowerCase()) {
      throw new Error('KCFKPI_Teams provisioning is restricted to the exact REVIEW-TEST-SITE site.');
    }
    if (this.actorEmail.trim().toLowerCase() !== ADMIN_TEAMS_APPROVED_ACTOR) {
      throw new Error('KCFKPI_Teams provisioning is restricted to Synthetic Person 02\u2019s authenticated KCF account.');
    }
  }

  private assertWriteAuthorisation(authorisation: IAdminTeamsProvisioningAuthorisation): void {
    if (!authorisation || authorisation.allowSchemaWrite !== true
      || authorisation.changeReference !== 'KCF-KPI-020A'
      || authorisation.confirmNoSeedRows !== true) {
      throw new Error('KCFKPI_Teams schema write requires the exact KCF-KPI-020A authorisation guard.');
    }
    if (ADMIN_TEAMS_INITIAL_ROWS.length !== 0) {
      throw new Error('KCFKPI_Teams provisioning is blocked because the approved initial seed is not empty.');
    }
  }

  private async inspectCurrentState(evidence: IAdminTeamsProvisioningEvidence): Promise<void> {
    const list = await this.readList();
    if (!list) {
      this.setMissingFieldsBefore(evidence, ADMIN_TEAMS_FIELDS.map(field => field.internalName));
      return;
    }

    evidence.existedBefore = true;
    this.setListIdentity(evidence, list);
    evidence.itemCountBefore = list.ItemCount;
    evidence.itemCountAfter = list.ItemCount;
    evidence.configurationState = list.ItemCount === 0 ? 'Unconfigured' : 'Configured';

    const listMismatches = validateAdminTeamsListSettings(mapList(list));
    listMismatches.forEach(message => {
      if (message.indexOf('BaseTemplate') === 0 || message.indexOf('ItemCount') === 0) {
        evidence.blockingMismatches.push(message);
      } else {
        evidence.repairableSettingMismatches.push(message);
      }
    });

    const actualFields = (await this.readFields()).map(mapField);
    const fieldValidation = validateAdminTeamsFields(actualFields);
    this.setMissingFieldsBefore(evidence, fieldValidation.missingFields);
    evidence.blockingMismatches.push.apply(evidence.blockingMismatches, fieldValidation.mismatches);
    this.applyTitlePreflight(evidence, validateAdminTeamsTitleField(actualFields));
    if (list.ItemCount > 0 && fieldValidation.missingFields.length > 0) {
      evidence.blockingMismatches.push(
        'The existing Teams list contains rows and has missing required contract fields; automatic reconciliation is unsafe.'
      );
    }
  }

  private assertPreflightSafe(evidence: IAdminTeamsProvisioningEvidence): void {
    if (evidence.blockingMismatches.length > 0) {
      throw new Error(`KCFKPI_Teams preflight failed: ${evidence.blockingMismatches.join(' ')}`);
    }
  }

  private async ensureList(evidence: IAdminTeamsProvisioningEvidence): Promise<void> {
    let list = await this.readList();
    if (!list) {
      await this.postJson(`${this.siteUrl()}/_api/web/lists`, {
        BaseTemplate: ADMIN_TEAMS_LIST_SETTINGS.baseTemplate,
        Description: ADMIN_TEAMS_LIST_DESCRIPTION,
        EnableFolderCreation: ADMIN_TEAMS_LIST_SETTINGS.enableFolderCreation,
        EnableVersioning: ADMIN_TEAMS_LIST_SETTINGS.enableVersioning,
        OnQuickLaunch: ADMIN_TEAMS_LIST_SETTINGS.onQuickLaunch,
        Title: ADMIN_TEAMS_LIST_TITLE
      }, 'KCFKPI_Teams could not be created.');
      evidence.createdList = true;
      evidence.actions.push('Created the empty KCFKPI_Teams generic list.');
      list = await this.readList();
      if (!list) throw new Error('KCFKPI_Teams was not found after creation.');
    }

    this.setListIdentity(evidence, list);
    if (evidence.repairableSettingMismatches.length > 0) {
      const listSettingMismatches = evidence.repairableSettingMismatches.filter(
        message => message.indexOf('Title:') !== 0 && message.indexOf('Built-in Title') !== 0
      );
      if (listSettingMismatches.length > 0) {
        await this.mergeJson(this.listUrl(), {
          Description: ADMIN_TEAMS_LIST_DESCRIPTION,
          EnableFolderCreation: ADMIN_TEAMS_LIST_SETTINGS.enableFolderCreation,
          EnableVersioning: ADMIN_TEAMS_LIST_SETTINGS.enableVersioning,
          Hidden: ADMIN_TEAMS_LIST_SETTINGS.hidden,
          OnQuickLaunch: ADMIN_TEAMS_LIST_SETTINGS.onQuickLaunch
        }, 'KCFKPI_Teams list settings could not be applied.');
        this.markSettingsChanged(evidence);
        evidence.actions.push('Applied the exact KCFKPI_Teams list settings.');
      }
    }
    await this.ensureTitleField(evidence);
  }

  private async createMissingFields(evidence: IAdminTeamsProvisioningEvidence): Promise<void> {
    const missing = evidence.createdList
      ? ADMIN_TEAMS_FIELDS.map(field => field.internalName)
      : evidence.missingFieldsBefore;
    for (const internalName of missing) {
      const field = ADMIN_TEAMS_FIELDS.filter(candidate => candidate.internalName === internalName)[0];
      if (!field) throw new Error(`Missing KCFKPI_Teams field definition for ${internalName}.`);
      await this.createField(field);
      evidence.createdFields.push(field.internalName);
      evidence.actions.push(`Created KCFKPI_Teams.${field.internalName}.`);
    }
  }

  private setListIdentity(
    evidence: IAdminTeamsProvisioningEvidence,
    list: ISharePointListRow
  ): void {
    evidence.listId = list.Id;
    evidence.listUrl = list.RootFolder && list.RootFolder.ServerRelativeUrl;
  }

  private setMissingFieldsBefore(
    evidence: IAdminTeamsProvisioningEvidence,
    missingFields: string[]
  ): void {
    evidence.missingFieldsBefore = missingFields;
  }

  private markSettingsChanged(evidence: IAdminTeamsProvisioningEvidence): void {
    evidence.settingsChanged = true;
  }

  private applyTitlePreflight(
    evidence: IAdminTeamsProvisioningEvidence,
    mismatches: string[]
  ): void {
    if (mismatches.length === 0) {
      evidence.titleFieldVerified = true;
      return;
    }
    mismatches.forEach(message => {
      if (message.indexOf('Built-in Title') === 0) {
        evidence.blockingMismatches.push(message);
      } else {
        evidence.repairableSettingMismatches.push(message);
      }
    });
  }

  private async verifyFinalState(evidence: IAdminTeamsProvisioningEvidence): Promise<void> {
    const list = await this.readList();
    if (!list) throw new Error('KCFKPI_Teams was not found during final read-back.');
    const listMismatches = validateAdminTeamsListSettings(mapList(list));
    const actualFields = (await this.readFields()).map(mapField);
    const fieldValidation = validateAdminTeamsFields(actualFields);
    const titleMismatches = validateAdminTeamsTitleField(actualFields);
    const countChanged = list.ItemCount !== evidence.itemCountBefore;
    if (listMismatches.length > 0 || fieldValidation.missingFields.length > 0
      || fieldValidation.mismatches.length > 0 || titleMismatches.length > 0 || countChanged) {
      const messages = listMismatches
        .concat(fieldValidation.missingFields.map(name => `Missing ${name}.`))
        .concat(fieldValidation.mismatches)
        .concat(titleMismatches);
      if (countChanged) messages.push(
        `ItemCount changed from ${evidence.itemCountBefore} to ${list.ItemCount}; provisioning must not create Team rows.`
      );
      throw new Error(`KCFKPI_Teams final read-back failed: ${messages.join(' ')}`);
    }
    this.setListIdentity(evidence, list);
    evidence.itemCountAfter = list.ItemCount;
    evidence.configurationState = list.ItemCount === 0 ? 'Unconfigured' : 'Configured';
    evidence.verifiedFields = ADMIN_TEAMS_FIELDS.map(field => field.internalName);
    evidence.titleFieldVerified = true;
    evidence.repairableSettingMismatches = [];
    evidence.createdItemCount = 0;
  }

  private async createField(field: IAdminTeamsFieldDefinition): Promise<void> {
    await this.postJson(`${this.listUrl()}/fields/createfieldasxml`, {
      parameters: {
        SchemaXml: adminTeamsFieldSchemaXml(field),
        Options: 0
      }
    }, `The approved field KCFKPI_Teams.${field.internalName} could not be created.`);
  }

  private async ensureTitleField(evidence: IAdminTeamsProvisioningEvidence): Promise<void> {
    const fields = (await this.readFields()).map(mapField);
    const mismatches = validateAdminTeamsTitleField(fields);
    if (mismatches.length === 0) return;
    if (mismatches.filter(message => message.indexOf('Built-in Title') === 0).length > 0) {
      throw new Error('KCFKPI_Teams built-in Title field was not returned; automatic repair is unsafe.');
    }
    await this.mergeJson(
      `${this.listUrl()}/fields/getbyinternalnameortitle('${ADMIN_TEAMS_TITLE_FIELD.internalName}')`,
      { Required: ADMIN_TEAMS_TITLE_FIELD.required, Hidden: ADMIN_TEAMS_TITLE_FIELD.hidden },
      'KCFKPI_Teams built-in Title field could not be made optional and hidden.'
    );
    evidence.settingsChanged = true;
    evidence.titleFieldChanged = true;
    evidence.actions.push('Made the built-in Title field optional and hidden; TeamName is the business label.');
  }

  private async readList(): Promise<ISharePointListRow | undefined> {
    const response = await this.spHttpClient.get(
      `${this.listUrl()}?$select=Id,BaseTemplate,Description,EnableVersioning,EnableFolderCreation,OnQuickLaunch,Hidden,ItemCount,RootFolder/ServerRelativeUrl&$expand=RootFolder`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    if (response.status === 404) return undefined;
    await this.ensureSuccess(response, 'KCFKPI_Teams could not be read.');
    return await response.json() as ISharePointListRow;
  }

  private async readFields(): Promise<ISharePointFieldRow[]> {
    const response = await this.spHttpClient.get(
      `${this.listUrl()}/fields?$select=Id,InternalName,TypeAsString,Required,Hidden,Indexed,EnforceUniqueValues,DefaultValue,SchemaXml&$top=5000`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    await this.ensureSuccess(response, 'KCFKPI_Teams fields could not be read.');
    const data = await response.json() as IODataCollection<ISharePointFieldRow>;
    return data.value;
  }

  private async postJson(url: string, body: object, fallback: string, verbose: boolean = false): Promise<void> {
    const mediaType = verbose ? 'application/json;odata=verbose' : 'application/json;odata=nometadata';
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: { Accept: mediaType, 'Content-Type': mediaType },
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

  private siteUrl(): string {
    return this.webAbsoluteUrl.replace(/\/+$/, '');
  }

  private listUrl(): string {
    return `${this.siteUrl()}/_api/web/lists/getbytitle('${escapeOData(ADMIN_TEAMS_LIST_TITLE)}')`;
  }
}
