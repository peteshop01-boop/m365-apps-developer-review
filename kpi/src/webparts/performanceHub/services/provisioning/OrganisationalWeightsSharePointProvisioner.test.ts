jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import {
  ORGANISATIONAL_WEIGHTS_LIST_DEFINITION,
  productionPolicyFieldSchemaXml,
  type IProductionPolicyFieldDefinition
} from '../ProductionPolicyStructures';
import OrganisationalWeightsSharePointProvisioner, {
  OrganisationalWeightsProvisioningError,
  type IOrganisationalWeightsProvisioningAuthorisation
} from './OrganisationalWeightsSharePointProvisioner';

const approvedSite = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const approvedActor = 'person003@example.invalid';
const approvedWrite: IOrganisationalWeightsProvisioningAuthorisation = {
  allowSchemaWrite: true,
  changeReference: 'KCF-KPI-020B',
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
  wrongFieldId?: string;
  fillInChoiceField?: string;
  wrongChoiceFormatField?: string;
  itemCount?: number;
}

const getDefinition = (internalName: string): IProductionPolicyFieldDefinition => {
  const field = ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.fields
    .filter(candidate => candidate.internalName === internalName)[0];
  if (!field) throw new Error(`Unknown test field ${internalName}.`);
  return field;
};

const fieldRow = (
  internalName: string,
  options: Pick<IMockOptions, 'wrongFieldId' | 'fillInChoiceField' | 'wrongChoiceFormatField'> = {}
): object => {
  const field = getDefinition(internalName);
  let schemaXml = productionPolicyFieldSchemaXml(field);
  if (internalName === options.fillInChoiceField) {
    schemaXml = schemaXml.replace('FillInChoice="FALSE"', 'FillInChoice="TRUE"');
  }
  if (internalName === options.wrongChoiceFormatField) {
    schemaXml = schemaXml.replace('Format="Dropdown"', 'Format="RadioButtons"');
  }
  return {
    Id: internalName === options.wrongFieldId ? '00000000-0000-0000-0000-000000000000' : field.id,
    InternalName: field.internalName,
    TypeAsString: field.type === 'DateOnly' ? 'DateTime' : field.type,
    Required: field.required,
    Hidden: false,
    Indexed: field.indexed,
    EnforceUniqueValues: Boolean(field.enforceUniqueValues),
    Choices: field.choices || [],
    SchemaXml: schemaXml
  };
};

const mockClient = (options: IMockOptions): {
  client: SPHttpClient;
  get: jest.Mock;
  post: jest.Mock;
} => {
  let listExists = options.listExists;
  let titleRequired = !options.listExists;
  let titleHidden = options.listExists;
  const itemCount = options.itemCount === undefined ? 0 : options.itemCount;
  const rows: object[] = listExists
    ? ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.fields
      .filter(field => field.internalName !== options.omitField)
      .map(field => fieldRow(field.internalName, options))
    : [];

  const get = jest.fn(async (url: string) => {
    if (!listExists) return response(404);
    if (url.indexOf('/fields?') >= 0) {
      const fieldRows: object[] = [{
        Id: '387dc6b4-3ee6-4761-a6a0-ea83b95538d8',
        InternalName: 'Title',
        TypeAsString: 'Text',
        Required: titleRequired,
        Hidden: titleHidden,
        Indexed: false,
        EnforceUniqueValues: false,
        Choices: []
      }];
      fieldRows.push.apply(fieldRows, rows);
      return response(200, { value: fieldRows });
    }
    return response(200, {
      Id: 'organisational-weights-list-id',
      BaseTemplate: 100,
      Description: ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.description,
      EnableVersioning: true,
      EnableFolderCreation: false,
      OnQuickLaunch: false,
      Hidden: false,
      ItemCount: itemCount,
      RootFolder: { ServerRelativeUrl: '/sites/REVIEW-TEST-SITE/Lists/KCFKPI_OrganisationalWeights' }
    });
  });

  const post = jest.fn(async (url: string, _configuration: unknown, request?: {
    headers?: { [name: string]: string };
    body?: string;
  }) => {
    const body = request?.body ? JSON.parse(request.body) as {
      Required?: boolean;
      Hidden?: boolean;
      parameters?: { SchemaXml?: string };
    } : {};
    if (url.slice(-15) === '/_api/web/lists') {
      listExists = true;
      titleRequired = true;
      titleHidden = false;
    } else if (url.indexOf('/fields/createfieldasxml') >= 0) {
      const schemaXml = body.parameters?.SchemaXml || '';
      const match = /Name="([^"]+)"/.exec(schemaXml);
      if (!match) return response(400, { error: 'Missing field name.' });
      rows.push(fieldRow(match[1]));
    } else if (url.indexOf("/fields/getbyinternalnameortitle('Title')") >= 0) {
      titleRequired = Boolean(body.Required);
      titleHidden = Boolean(body.Hidden);
    }
    return response(204);
  });

  return { client: { get, post } as unknown as SPHttpClient, get, post };
};

describe('guarded standalone KCFKPI_OrganisationalWeights provisioner design', () => {
  it('rejects a wrong site or actor before any HTTP request', async () => {
    const mock = mockClient({ listExists: false });
    await expect(new OrganisationalWeightsSharePointProvisioner(
      mock.client, 'https://example.invalid', approvedActor
    ).preflight()).rejects.toBeInstanceOf(OrganisationalWeightsProvisioningError);
    await expect(new OrganisationalWeightsSharePointProvisioner(
      mock.client, approvedSite, 'other@example.invalid'
    ).preflight()).rejects.toBeInstanceOf(OrganisationalWeightsProvisioningError);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('requires the exact KCF-KPI-020B no-seed write guard before HTTP', async () => {
    const mock = mockClient({ listExists: false });
    const invalid = { ...approvedWrite, changeReference: 'WRONG' } as unknown as IOrganisationalWeightsProvisioningAuthorisation;
    await expect(new OrganisationalWeightsSharePointProvisioner(
      mock.client, approvedSite, approvedActor
    ).provision(invalid)).rejects.toThrow(/exact KCF-KPI-020B authorisation guard/);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('preflights absent storage as legitimate NOT CONFIGURED / NOT READY without writing', async () => {
    const mock = mockClient({ listExists: false });
    const evidence = await new OrganisationalWeightsSharePointProvisioner(
      mock.client, `${approvedSite}/`, approvedActor.toUpperCase()
    ).preflight();
    expect(evidence).toEqual(expect.objectContaining({
      status: 'Ready',
      existedBefore: false,
      configurationState: 'NOT CONFIGURED / NOT READY',
      initialSeedCount: 0,
      createdItemCount: 0,
      missingFieldsBefore: ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.fields.map(field => field.internalName)
    }));
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('would create only the empty list and signed custom fields, then exact-read them back', async () => {
    const mock = mockClient({ listExists: false });
    const evidence = await new OrganisationalWeightsSharePointProvisioner(
      mock.client, approvedSite, approvedActor
    ).provision(approvedWrite);
    const expectedFields = ORGANISATIONAL_WEIGHTS_LIST_DEFINITION.fields.map(field => field.internalName);
    expect(evidence).toEqual(expect.objectContaining({
      status: 'Pass',
      createdList: true,
      titleFieldChanged: true,
      titleFieldVerified: true,
      itemCountBefore: 0,
      itemCountAfter: 0,
      initialSeedCount: 0,
      createdItemCount: 0,
      configurationState: 'NOT CONFIGURED / NOT READY',
      createdFields: expectedFields,
      verifiedFields: expectedFields
    }));
    expect(mock.post).toHaveBeenCalledTimes(expectedFields.length + 2);
    expect(mock.post.mock.calls.map(call => String(call[0])).filter(url => /\/items(?:\?|$)/.test(url))).toEqual([]);
    expect(JSON.stringify(mock.post.mock.calls)).not.toMatch(/notification|webhook|subscription|workflow/i);
  });

  it('is idempotent when the exact empty list already exists', async () => {
    const mock = mockClient({ listExists: true });
    const provisioner = new OrganisationalWeightsSharePointProvisioner(mock.client, approvedSite, approvedActor);
    const first = await provisioner.provision(approvedWrite);
    const second = await provisioner.provision(approvedWrite);
    expect(first.status).toBe('Pass');
    expect(second).toEqual(expect.objectContaining({
      status: 'Pass',
      existedBefore: true,
      createdList: false,
      settingsChanged: false,
      titleFieldChanged: false,
      createdFields: [],
      createdItemCount: 0
    }));
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('returns blocking partial evidence for exact field-ID drift and performs no write', async () => {
    const mock = mockClient({ listExists: true, wrongFieldId: 'WeightPercent' });
    try {
      await new OrganisationalWeightsSharePointProvisioner(
        mock.client, approvedSite, approvedActor
      ).provision(approvedWrite);
      throw new Error('Expected field-ID drift to block provisioning.');
    } catch (caught) {
      expect(caught).toBeInstanceOf(OrganisationalWeightsProvisioningError);
      const controlled = caught as OrganisationalWeightsProvisioningError;
      expect(controlled.evidence.status).toBe('Failed');
      expect(controlled.evidence.blockingMismatches).toEqual(expect.arrayContaining([
        expect.stringMatching(/WeightPercent: field ID/)
      ]));
    }
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('blocks an existing Choice field with fill-in values enabled and performs no write', async () => {
    const mock = mockClient({ listExists: true, fillInChoiceField: 'WeightLevel' });
    await expect(new OrganisationalWeightsSharePointProvisioner(
      mock.client, approvedSite, approvedActor
    ).provision(approvedWrite)).rejects.toThrow(/WeightLevel: FillInChoice must be FALSE/);
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('blocks an existing Choice field whose format is not Dropdown and performs no write', async () => {
    const mock = mockClient({ listExists: true, wrongChoiceFormatField: 'ApprovalStatus' });
    await expect(new OrganisationalWeightsSharePointProvisioner(
      mock.client, approvedSite, approvedActor
    ).provision(approvedWrite)).rejects.toThrow(/ApprovalStatus: Choice Format must be Dropdown/);
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('will not reconcile missing fields on a list that already contains rows', async () => {
    const mock = mockClient({ listExists: true, omitField: 'WeightPercent', itemCount: 1 });
    await expect(new OrganisationalWeightsSharePointProvisioner(
      mock.client, approvedSite, approvedActor
    ).provision(approvedWrite)).rejects.toThrow(/automatic reconciliation is unsafe/);
    expect(mock.post).not.toHaveBeenCalled();
  });
});
