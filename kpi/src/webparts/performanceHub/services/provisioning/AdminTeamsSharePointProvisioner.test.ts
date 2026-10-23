jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import {
  ADMIN_TEAMS_FIELDS,
  ADMIN_TEAMS_LIST_DESCRIPTION,
  adminTeamsFieldSchemaXml
} from '../AdminTeamsSchema';
import AdminTeamsSharePointProvisioner, {
  AdminTeamsProvisioningError,
  type IAdminTeamsProvisioningAuthorisation
} from './AdminTeamsSharePointProvisioner';

const approvedSite = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const approvedActor = 'person003@example.invalid';
const approvedWrite: IAdminTeamsProvisioningAuthorisation = {
  allowSchemaWrite: true,
  changeReference: 'KCF-KPI-020A',
  confirmNoSeedRows: true
};

const response = (status: number, data: unknown = {}): SPHttpClientResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
} as unknown as SPHttpClientResponse);

interface IMockOptions {
  listExists: boolean;
  omitField?: string;
  wrongFieldType?: string;
  itemCount?: number;
  settingsDrift?: boolean;
  titleDrift?: boolean;
  omitTitle?: boolean;
}

interface IMockResult {
  client: SPHttpClient;
  get: jest.Mock;
  post: jest.Mock;
}

const fieldRow = (internalName: string, wrongFieldType?: string): object => {
  const field = ADMIN_TEAMS_FIELDS.filter(candidate => candidate.internalName === internalName)[0];
  if (!field) throw new Error(`Unknown test field ${internalName}.`);
  return {
    Id: field.id,
    InternalName: field.internalName,
    TypeAsString: field.internalName === wrongFieldType ? 'Note' : field.type,
    Required: field.required,
    Hidden: false,
    Indexed: field.indexed,
    EnforceUniqueValues: field.enforceUniqueValues,
    DefaultValue: field.defaultValue,
    SchemaXml: adminTeamsFieldSchemaXml(field)
  };
};

const mockClient = (options: IMockOptions): IMockResult => {
  let listExists = options.listExists;
  let description = options.settingsDrift ? 'Wrong description' : ADMIN_TEAMS_LIST_DESCRIPTION;
  let enableVersioning = !options.settingsDrift;
  let enableFolderCreation = Boolean(options.settingsDrift);
  let onQuickLaunch = Boolean(options.settingsDrift);
  let hidden = Boolean(options.settingsDrift);
  let titleRequired = !options.listExists || Boolean(options.titleDrift);
  let titleHidden = options.listExists && !options.titleDrift;
  const itemCount = options.itemCount === undefined ? 0 : options.itemCount;
  const rows: object[] = listExists
    ? ADMIN_TEAMS_FIELDS
      .filter(field => field.internalName !== options.omitField)
      .map(field => fieldRow(field.internalName, options.wrongFieldType))
    : [];

  const get = jest.fn(async (url: string) => {
    if (!listExists) return response(404);
    if (url.indexOf('/fields?') >= 0) {
      const fieldRows: object[] = options.omitTitle ? [] : [{
        Id: '387dc6b4-3ee6-4761-a6a0-ea83b95538d8',
        InternalName: 'Title',
        TypeAsString: 'Text',
        Required: titleRequired,
        Hidden: titleHidden,
        Indexed: false,
        EnforceUniqueValues: false,
        SchemaXml: `<Field Name="Title" Type="Text" Required="${titleRequired ? 'TRUE' : 'FALSE'}" Hidden="${titleHidden ? 'TRUE' : 'FALSE'}" />`
      }];
      fieldRows.push.apply(fieldRows, rows);
      return response(200, { value: fieldRows });
    }
    return response(200, {
      Id: 'teams-list-id',
      BaseTemplate: 100,
      Description: description,
      EnableVersioning: enableVersioning,
      EnableFolderCreation: enableFolderCreation,
      OnQuickLaunch: onQuickLaunch,
      Hidden: hidden,
      ItemCount: itemCount,
      RootFolder: { ServerRelativeUrl: '/sites/REVIEW-TEST-SITE/Lists/KCFKPI_Teams' }
    });
  });

  const post = jest.fn(async (url: string, _configuration: unknown, request?: {
    headers?: { [name: string]: string };
    body?: string;
  }) => {
    const body = request && request.body ? JSON.parse(request.body) as {
      Description?: string;
      EnableVersioning?: boolean;
      EnableFolderCreation?: boolean;
      OnQuickLaunch?: boolean;
      Hidden?: boolean;
      Required?: boolean;
      parameters?: { SchemaXml?: string };
    } : {};
    if (url.slice(-15) === '/_api/web/lists') {
      listExists = true;
      description = body.Description || '';
      enableVersioning = Boolean(body.EnableVersioning);
      enableFolderCreation = Boolean(body.EnableFolderCreation);
      onQuickLaunch = Boolean(body.OnQuickLaunch);
      hidden = false;
      titleRequired = true;
      titleHidden = false;
    } else if (url.indexOf('/fields/createfieldasxml') >= 0) {
      const schemaXml = body.parameters && body.parameters.SchemaXml
        ? body.parameters.SchemaXml
        : '';
      const match = /Name="([^"]+)"/.exec(schemaXml);
      if (!match) return response(400, { error: 'Missing field name.' });
      rows.push(fieldRow(match[1]));
    } else if (url.indexOf("/fields/getbyinternalnameortitle('Title')") >= 0) {
      titleRequired = Boolean(body.Required);
      titleHidden = Boolean(body.Hidden);
    } else if (request && request.headers && request.headers['X-HTTP-Method'] === 'MERGE') {
      description = body.Description || description;
      enableVersioning = Boolean(body.EnableVersioning);
      enableFolderCreation = Boolean(body.EnableFolderCreation);
      onQuickLaunch = Boolean(body.OnQuickLaunch);
      hidden = Boolean(body.Hidden);
    }
    return response(204);
  });

  return { client: { get, post } as unknown as SPHttpClient, get, post };
};

describe('guarded standalone KCFKPI_Teams provisioner', () => {
  it('rejects a wrong site or actor before any HTTP call', async () => {
    const mock = mockClient({ listExists: false });
    await expect(new AdminTeamsSharePointProvisioner(
      mock.client,
      'https://example.invalid',
      approvedActor
    ).preflight()).rejects.toBeInstanceOf(AdminTeamsProvisioningError);
    await expect(new AdminTeamsSharePointProvisioner(
      mock.client,
      approvedSite,
      'someone@example.invalid'
    ).preflight()).rejects.toBeInstanceOf(AdminTeamsProvisioningError);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('requires the exact change-reference write guard before any provisioning HTTP', async () => {
    const mock = mockClient({ listExists: false });
    const invalid = {
      allowSchemaWrite: true,
      changeReference: 'WRONG',
      confirmNoSeedRows: true
    } as unknown as IAdminTeamsProvisioningAuthorisation;
    await expect(new AdminTeamsSharePointProvisioner(
      mock.client,
      approvedSite,
      approvedActor
    ).provision(invalid)).rejects.toThrow(/exact KCF-KPI-020A authorisation guard/);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('preflights a missing list as a valid unconfigured state without writing', async () => {
    const mock = mockClient({ listExists: false });
    const evidence = await new AdminTeamsSharePointProvisioner(
      mock.client,
      `${approvedSite}/`,
      approvedActor.toUpperCase()
    ).preflight();
    expect(evidence).toEqual(expect.objectContaining({
      status: 'Ready',
      existedBefore: false,
      configurationState: 'Unconfigured',
      emptyInitialStateSupported: true,
      initialSeedCount: 0,
      createdItemCount: 0,
      missingFieldsBefore: ['TeamKey', 'TeamName', 'TeamLeadPersonKey', 'Active', 'SortOrder']
    }));
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('creates only the list and five custom fields, makes Title optional/hidden, then reads back an empty list', async () => {
    const mock = mockClient({ listExists: false });
    const evidence = await new AdminTeamsSharePointProvisioner(
      mock.client,
      approvedSite,
      approvedActor
    ).provision(approvedWrite);
    expect(evidence).toEqual(expect.objectContaining({
      status: 'Pass',
      createdList: true,
      configurationState: 'Unconfigured',
      itemCountBefore: 0,
      itemCountAfter: 0,
      initialSeedCount: 0,
      createdItemCount: 0,
      titleFieldChanged: true,
      titleFieldVerified: true,
      createdFields: ['TeamKey', 'TeamName', 'TeamLeadPersonKey', 'Active', 'SortOrder'],
      verifiedFields: ['TeamKey', 'TeamName', 'TeamLeadPersonKey', 'Active', 'SortOrder']
    }));
    expect(mock.post).toHaveBeenCalledTimes(7);
    const urls = mock.post.mock.calls.map(call => String(call[0]));
    expect(urls.filter(url => url.indexOf('/items') >= 0)).toEqual([]);
    const fieldCalls = mock.post.mock.calls.filter(call => String(call[0]).indexOf('/fields/createfieldasxml') >= 0);
    expect(fieldCalls).toHaveLength(5);
    fieldCalls.forEach(call => {
      const request = call[2] as { body?: string; headers?: { [name: string]: string } };
      expect(request.body).not.toContain('__metadata');
      expect(request.headers && request.headers['Content-Type']).toBe('application/json;odata=nometadata');
    });
    expect(JSON.stringify(mock.post.mock.calls)).not.toMatch(/notification|webhook|channel/i);
  });

  it('is a no-op when the exact list and fields already exist', async () => {
    const mock = mockClient({ listExists: true });
    const provisioner = new AdminTeamsSharePointProvisioner(mock.client, approvedSite, approvedActor);
    const first = await provisioner.provision(approvedWrite);
    const second = await provisioner.provision(approvedWrite);
    expect(first.status).toBe('Pass');
    expect(second.status).toBe('Pass');
    expect(second).toEqual(expect.objectContaining({
      existedBefore: true,
      createdList: false,
      settingsChanged: false,
      titleFieldChanged: false,
      titleFieldVerified: true,
      createdFields: [],
      configurationState: 'Unconfigured'
    }));
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('marks an exact built-in Title as verified during read-only preflight', async () => {
    const mock = mockClient({ listExists: true });
    const result = await new AdminTeamsSharePointProvisioner(
      mock.client,
      approvedSite,
      approvedActor
    ).preflight();
    expect(result).toEqual(expect.objectContaining({
      status: 'Ready',
      titleFieldVerified: true,
      repairableSettingMismatches: [],
      blockingMismatches: []
    }));
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('repairs only safe list settings and verifies the exact result', async () => {
    const mock = mockClient({ listExists: true, settingsDrift: true });
    const provisioner = new AdminTeamsSharePointProvisioner(mock.client, approvedSite, approvedActor);
    const preflight = await provisioner.preflight();
    expect(preflight.status).toBe('Ready');
    expect(preflight.repairableSettingMismatches.length).toBeGreaterThan(0);
    expect(mock.post).not.toHaveBeenCalled();
    const result = await provisioner.provision(approvedWrite);
    expect(result).toEqual(expect.objectContaining({ status: 'Pass', settingsChanged: true }));
    expect(mock.post).toHaveBeenCalledTimes(1);
  });

  it('repairs and verifies only the built-in Title requirement when it drifts', async () => {
    const mock = mockClient({ listExists: true, titleDrift: true });
    const provisioner = new AdminTeamsSharePointProvisioner(mock.client, approvedSite, approvedActor);
    const preflight = await provisioner.preflight();
    expect(preflight.repairableSettingMismatches).toEqual(expect.arrayContaining([
      'Title: Required true, expected false.',
      'Title: Hidden false, expected true.'
    ]));
    expect(preflight.titleFieldVerified).toBe(false);
    expect(mock.post).not.toHaveBeenCalled();
    const result = await provisioner.provision(approvedWrite);
    expect(result).toEqual(expect.objectContaining({
      status: 'Pass', settingsChanged: true, titleFieldChanged: true, titleFieldVerified: true
    }));
    expect(mock.post).toHaveBeenCalledTimes(1);
    expect(String(mock.post.mock.calls[0][0])).toContain("fields/getbyinternalnameortitle('Title')");
  });

  it('blocks a missing built-in Title before any provisioning write', async () => {
    const mock = mockClient({ listExists: true, settingsDrift: true, omitTitle: true });
    try {
      await new AdminTeamsSharePointProvisioner(
        mock.client,
        approvedSite,
        approvedActor
      ).provision(approvedWrite);
      throw new Error('Expected missing built-in Title to block provisioning.');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AdminTeamsProvisioningError);
      const controlled = caught as AdminTeamsProvisioningError;
      expect(controlled.evidence.blockingMismatches).toContain(
        'Built-in Title field was not returned by SharePoint.'
      );
    }
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('fails closed on an existing field mismatch before writing', async () => {
    const mock = mockClient({ listExists: true, wrongFieldType: 'TeamKey' });
    await expect(new AdminTeamsSharePointProvisioner(
      mock.client,
      approvedSite,
      approvedActor
    ).provision(approvedWrite)).rejects.toThrow(/TeamKey: type Note, expected Text/);
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('will not add a missing required field to a list that already contains Team rows', async () => {
    const mock = mockClient({ listExists: true, omitField: 'TeamKey', itemCount: 2 });
    await expect(new AdminTeamsSharePointProvisioner(
      mock.client,
      approvedSite,
      approvedActor
    ).provision(approvedWrite)).rejects.toThrow(/automatic reconciliation is unsafe/);
    expect(mock.post).not.toHaveBeenCalled();
  });
});
