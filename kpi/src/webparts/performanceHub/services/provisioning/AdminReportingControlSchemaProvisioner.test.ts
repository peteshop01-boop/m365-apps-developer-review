jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import {
  ADMIN_REPORTING_CONTROL_FIELDS,
  adminReportingControlFieldSchemaXml
} from '../AdminReportingControlSchema';
import AdminReportingControlSchemaProvisioner, {
  AdminReportingSchemaProvisioningError
} from './AdminReportingControlSchemaProvisioner';

const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const actor = 'person003@example.invalid';
const response = (status: number, data: unknown = {}): SPHttpClientResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data
} as unknown as SPHttpClientResponse);

interface IMockOptions { exact?: boolean; itemCount?: number; wrongType?: boolean; }

const makeClient = (options: IMockOptions = {}): { client: SPHttpClient; get: jest.Mock; post: jest.Mock } => {
  const fields: { [title: string]: object[] } = {
    KCFKPI_ReportingMap: [], KCFKPI_OutputDefinitions: []
  };
  if (options.exact) {
    ADMIN_REPORTING_CONTROL_FIELDS.forEach(field => fields[field.listTitle].push({
      Id: field.id,
      InternalName: field.internalName,
      TypeAsString: options.wrongType ? 'Text' : field.type,
      Required: field.required,
      Hidden: false,
      Indexed: field.indexed,
      EnforceUniqueValues: field.enforceUniqueValues,
      DefaultValue: field.defaultValue,
      Choices: field.choices || [],
      SchemaXml: adminReportingControlFieldSchemaXml(field)
    }));
  }
  const titleFrom = (url: string): string => url.indexOf('ReportingMap') >= 0
    ? 'KCFKPI_ReportingMap' : 'KCFKPI_OutputDefinitions';
  const get = jest.fn(async (url: string) => {
    const title = titleFrom(url);
    if (url.indexOf('/fields?') >= 0) return response(200, { value: fields[title] });
    return response(200, {
      Id: title === 'KCFKPI_ReportingMap' ? 'map-list-id' : 'output-list-id',
      ItemCount: options.itemCount || 0,
      RootFolder: { ServerRelativeUrl: `/sites/REVIEW-TEST-SITE/Lists/${title}` }
    });
  });
  const post = jest.fn(async (url: string, _config: unknown, request: { body?: string }) => {
    expect(url).toContain('/fields/createfieldasxml');
    const parsed = JSON.parse(request.body || '{}') as { parameters?: { SchemaXml?: string } };
    const xml = parsed.parameters?.SchemaXml || '';
    const name = /Name="([^"]+)"/.exec(xml)?.[1] || '';
    const definition = ADMIN_REPORTING_CONTROL_FIELDS.filter(field => field.internalName === name)[0];
    if (!definition) return response(400);
    fields[definition.listTitle].push({
      Id: definition.id,
      InternalName: definition.internalName,
      TypeAsString: definition.type,
      Required: definition.required,
      Hidden: false,
      Indexed: definition.indexed,
      EnforceUniqueValues: definition.enforceUniqueValues,
      DefaultValue: definition.defaultValue,
      Choices: definition.choices || [],
      SchemaXml: xml
    });
    return response(204);
  });
  return { client: { get, post } as unknown as SPHttpClient, get, post };
};

describe('guarded KCF-KPI-020B Reporting Control schema provisioner', () => {
  const writeGuard = {
    allowSchemaWrite: true as const,
    changeReference: 'KCF-KPI-020B' as const,
    confirmNoBusinessRows: true as const
  };

  it('fails before HTTP for a wrong actor', async () => {
    const mock = makeClient();
    await expect(new AdminReportingControlSchemaProvisioner(
      mock.client, site, 'person008@example.invalid'
    ).preflight()).rejects.toBeInstanceOf(AdminReportingSchemaProvisioningError);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('creates only the missing MappingRequirement field and verifies zero business rows', async () => {
    const mock = makeClient();
    const evidence = await new AdminReportingControlSchemaProvisioner(mock.client, site, actor)
      .provision(writeGuard);
    expect(evidence).toEqual(expect.objectContaining({
      status: 'Pass',
      createdBusinessRows: 0,
      createdFields: [
        'KCFKPI_OutputDefinitions.MappingRequirement'
      ],
      verifiedFields: [
        'KCFKPI_OutputDefinitions.MappingRequirement'
      ]
    }));
    expect(mock.post).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mock.post.mock.calls)).not.toMatch(/\/items|notification|webhook/i);
  });

  it('is idempotent when all three fields already match', async () => {
    const mock = makeClient({ exact: true });
    const evidence = await new AdminReportingControlSchemaProvisioner(mock.client, site, actor)
      .provision(writeGuard);
    expect(evidence.status).toBe('Pass');
    expect(evidence.createdFields).toEqual([]);
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('blocks adding a required field to a non-empty list and blocks incompatible drift', async () => {
    const nonEmpty = makeClient({ itemCount: 1 });
    await expect(new AdminReportingControlSchemaProvisioner(nonEmpty.client, site, actor)
      .provision(writeGuard)).rejects.toThrow(/non-empty list/);
    expect(nonEmpty.post).not.toHaveBeenCalled();

    const drift = makeClient({ exact: true, wrongType: true });
    await expect(new AdminReportingControlSchemaProvisioner(drift.client, site, actor)
      .preflight()).rejects.toThrow(/type Text, expected Choice/);
    expect(drift.post).not.toHaveBeenCalled();
  });
});
