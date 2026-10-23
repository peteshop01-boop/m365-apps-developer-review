/* eslint-disable require-atomic-updates -- Each call owns one evidence object; awaited schema reads/writes are deliberately serial. */
import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import {
  ADMIN_REPORTING_CONTROL_FIELDS,
  adminReportingControlFieldSchemaXml,
  validateAdminReportingControlSchemaReadback,
  type IAdminReportingControlFieldDefinition,
  type IAdminReportingControlFieldReadback
} from '../AdminReportingControlSchema';

export const ADMIN_REPORTING_SCHEMA_APPROVED_SITE =
  'https://example.invalid/sites/REVIEW-TEST-SITE';
export const ADMIN_REPORTING_SCHEMA_APPROVED_ACTOR = 'person003@example.invalid';

export interface IAdminReportingSchemaAuthorisation {
  allowSchemaWrite: true;
  changeReference: 'KCF-KPI-020B';
  confirmNoBusinessRows: true;
}

interface IODataCollection<T> { value: T[]; }
interface IListReadback { Id: string; ItemCount: number; RootFolder: { ServerRelativeUrl: string }; }
interface IFieldReadback {
  Id: string;
  InternalName: string;
  TypeAsString: string;
  Required: boolean;
  Hidden: boolean;
  Indexed: boolean;
  EnforceUniqueValues: boolean;
  DefaultValue?: string;
  Choices?: readonly string[] | { results?: readonly string[] };
  SchemaXml?: string;
}

export interface IAdminReportingSchemaEvidence {
  mode: 'Preflight' | 'Provision';
  status: 'Ready' | 'Pass' | 'Failed';
  siteUrl: string;
  actorEmail: string;
  startedAt: string;
  completedAt?: string;
  listIds: { [title: string]: string };
  listUrls: { [title: string]: string };
  itemCountsBefore: { [title: string]: number };
  itemCountsAfter: { [title: string]: number };
  missingFieldsBefore: string[];
  createdFields: string[];
  verifiedFields: string[];
  mismatches: string[];
  createdBusinessRows: 0;
  actions: string[];
  error?: string;
}

export class AdminReportingSchemaProvisioningError extends Error {
  public readonly evidence: IAdminReportingSchemaEvidence;

  public constructor(message: string, evidence: IAdminReportingSchemaEvidence) {
    super(message);
    this.name = 'AdminReportingSchemaProvisioningError';
    this.evidence = evidence;
    Object.setPrototypeOf(this, AdminReportingSchemaProvisioningError.prototype);
  }
}

const titles: readonly ('KCFKPI_ReportingMap' | 'KCFKPI_OutputDefinitions')[] = [
  'KCFKPI_ReportingMap', 'KCFKPI_OutputDefinitions'
];
const escapeOData = (value: string): string => value.replace(/'/g, "''");
const choices = (field: IFieldReadback): readonly string[] => {
  if (Array.isArray(field.Choices)) return field.Choices as readonly string[];
  const collection = field.Choices as { results?: readonly string[] } | undefined;
  return collection?.results || [];
};

export default class AdminReportingControlSchemaProvisioner {
  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly actorEmail: string
  ) {}

  public async preflight(): Promise<IAdminReportingSchemaEvidence> {
    return this.execute('Preflight');
  }

  public async provision(authorisation: IAdminReportingSchemaAuthorisation): Promise<IAdminReportingSchemaEvidence> {
    const evidence = this.evidence('Provision');
    try {
      if (!authorisation || authorisation.allowSchemaWrite !== true
        || authorisation.changeReference !== 'KCF-KPI-020B'
        || authorisation.confirmNoBusinessRows !== true) {
        throw new Error('Reporting-control schema writes require the exact KCF-KPI-020B no-business-row guard.');
      }
    } catch (error) {
      return this.fail(error, evidence);
    }
    return this.execute('Provision', evidence);
  }

  private async execute(
    mode: 'Preflight' | 'Provision',
    supplied?: IAdminReportingSchemaEvidence
  ): Promise<IAdminReportingSchemaEvidence> {
    const evidence = supplied || this.evidence(mode);
    try {
      this.assertTarget();
      const before = await this.readState(evidence, true);
      evidence.missingFieldsBefore = before.missingFields.slice();
      evidence.mismatches = before.mismatches.slice();
      if (evidence.mismatches.length) throw new Error(evidence.mismatches.join(' '));
      if (mode === 'Preflight') {
        evidence.status = 'Ready';
      } else {
        for (const field of ADMIN_REPORTING_CONTROL_FIELDS) {
          const label = `${field.listTitle}.${field.internalName}`;
          if (evidence.missingFieldsBefore.indexOf(label) < 0) continue;
          if ((evidence.itemCountsBefore[field.listTitle] || 0) !== 0) {
            throw new Error(`${label} is missing from a non-empty list; automatic required-field addition is blocked.`);
          }
          await this.createField(field);
          evidence.createdFields.push(label);
          evidence.actions.push(`Created ${label}; no list item was created or changed.`);
        }
        const after = await this.readState(evidence, false);
        if (after.missingFields.length || after.mismatches.length) {
          throw new Error(after.missingFields.concat(after.mismatches).join(' '));
        }
        titles.forEach(title => {
          if (evidence.itemCountsAfter[title] !== evidence.itemCountsBefore[title]) {
            throw new Error(`${title} ItemCount changed during schema-only provisioning.`);
          }
        });
        evidence.verifiedFields = ADMIN_REPORTING_CONTROL_FIELDS
          .map(field => `${field.listTitle}.${field.internalName}`);
        evidence.status = 'Pass';
      }
      evidence.completedAt = new Date().toISOString();
      return evidence;
    } catch (error) {
      return this.fail(error, evidence);
    }
  }

  private evidence(mode: 'Preflight' | 'Provision'): IAdminReportingSchemaEvidence {
    return {
      mode,
      status: 'Ready',
      siteUrl: this.siteUrl(),
      actorEmail: this.actorEmail.trim().toLowerCase(),
      startedAt: new Date().toISOString(),
      listIds: {},
      listUrls: {},
      itemCountsBefore: {},
      itemCountsAfter: {},
      missingFieldsBefore: [],
      createdFields: [],
      verifiedFields: [],
      mismatches: [],
      createdBusinessRows: 0,
      actions: []
    };
  }

  private fail(error: unknown, evidence: IAdminReportingSchemaEvidence): never {
    const message = error instanceof Error ? error.message : 'Reporting-control schema provisioning failed.';
    evidence.status = 'Failed';
    evidence.error = message;
    evidence.completedAt = new Date().toISOString();
    throw new AdminReportingSchemaProvisioningError(message, evidence);
  }

  private assertTarget(): void {
    if (this.siteUrl().toLowerCase() !== ADMIN_REPORTING_SCHEMA_APPROVED_SITE.toLowerCase()) {
      throw new Error('Reporting-control schema provisioning is restricted to the exact REVIEW-TEST-SITE site.');
    }
    if (this.actorEmail.trim().toLowerCase() !== ADMIN_REPORTING_SCHEMA_APPROVED_ACTOR) {
      throw new Error('Reporting-control schema provisioning is restricted to Synthetic Person 02’s authenticated KCF account.');
    }
  }

  private async readState(
    evidence: IAdminReportingSchemaEvidence,
    before: boolean
  ): Promise<{ missingFields: string[]; mismatches: string[] }> {
    const readbacks: IAdminReportingControlFieldReadback[] = [];
    for (const title of titles) {
      const list = await this.getJson<IListReadback>(
        `${this.listApi(title)}?$select=Id,ItemCount,RootFolder/ServerRelativeUrl&$expand=RootFolder`,
        `${title} could not be read.`
      );
      evidence.listIds[title] = list.Id;
      evidence.listUrls[title] = list.RootFolder.ServerRelativeUrl;
      if (before) evidence.itemCountsBefore[title] = list.ItemCount;
      evidence.itemCountsAfter[title] = list.ItemCount;
      const fields = await this.getJson<IODataCollection<IFieldReadback>>(
        `${this.listApi(title)}/fields?$select=Id,InternalName,TypeAsString,Required,Hidden,Indexed,EnforceUniqueValues,DefaultValue,Choices,SchemaXml`,
        `${title} fields could not be read.`
      );
      fields.value.forEach(field => readbacks.push({
        id: field.Id,
        listTitle: title,
        internalName: field.InternalName,
        type: field.TypeAsString,
        required: Boolean(field.Required),
        hidden: Boolean(field.Hidden),
        indexed: Boolean(field.Indexed),
        enforceUniqueValues: Boolean(field.EnforceUniqueValues),
        defaultValue: field.DefaultValue,
        choices: choices(field),
        schemaXml: field.SchemaXml
      }));
    }
    return validateAdminReportingControlSchemaReadback(readbacks);
  }

  private async createField(field: IAdminReportingControlFieldDefinition): Promise<void> {
    await this.postJson(`${this.listApi(field.listTitle)}/fields/createfieldasxml`, {
      parameters: {
        AddToDefaultView: false,
        Options: 0,
        SchemaXml: adminReportingControlFieldSchemaXml(field)
      }
    }, `${field.listTitle}.${field.internalName} could not be created.`);
  }

  private listApi(title: string): string {
    return `${this.siteUrl()}/_api/web/lists/getbytitle('${escapeOData(title)}')`;
  }

  private siteUrl(): string { return this.webAbsoluteUrl.replace(/\/$/, ''); }

  private async getJson<T>(url: string, message: string): Promise<T> {
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    await this.ensureSuccess(response, message);
    return response.json() as Promise<T>;
  }

  private async postJson(url: string, body: object, message: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata'
      },
      body: JSON.stringify(body)
    });
    await this.ensureSuccess(response, message);
  }

  private async ensureSuccess(response: SPHttpClientResponse, message: string): Promise<void> {
    if (!response.ok) throw new Error(`${message} SharePoint returned HTTP ${response.status}.`);
  }
}
