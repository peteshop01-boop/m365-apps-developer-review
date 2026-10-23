jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import type { IBehaviourObjectiveLibraryRecord } from '../../models/BehaviourWorkplanModels';
import type { IAnnualWorkplan, IProductionPerson } from '../../models/ProductionModels';
import type { IQuarterLifecycle } from '../../models/QuarterlyModels';
import { buildQuarterReviewDraft } from '../QuarterReviewFactory';
import { QUARTER_ITEM_BASE_SELECT } from '../ProductionQueryFieldContracts';
import {
  WORKPLAN_018_SCHEMA,
  type Workplan018ListTitle,
  workplan018FieldSchemaXml
} from '../Workplan018Schema';
import { BEHAVIOUR_OBJECTIVE_LIBRARY_SEED } from './BehaviourObjectiveLibrarySeed';
import Workplan018SharePointProvisioner, {
  Workplan018ProvisioningError,
  validateBehaviourObjectiveSeedReadback
} from './Workplan018SharePointProvisioner';

const response = (status: number, data: unknown = {}): SPHttpClientResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
} as unknown as SPHttpClientResponse);

const definitionForUrl = (url: string): typeof WORKPLAN_018_SCHEMA[number] | undefined =>
  WORKPLAN_018_SCHEMA.find(definition => url.indexOf(`getbytitle('${definition.title}')`) >= 0);

const fieldRows = (
  title: Workplan018ListTitle,
  options: { omit?: string; wrongType?: string; wrongBooleanDefault?: boolean } = {}
): object[] => {
  const definition = WORKPLAN_018_SCHEMA.find(item => item.title === title) as typeof WORKPLAN_018_SCHEMA[number];
  return [{
    Id: '8555b9e3-fa94-4fd0-af98-1977f20689b2', InternalName: 'ID', TypeAsString: 'Counter',
    Required: false, Indexed: false, EnforceUniqueValues: false, Choices: [], SchemaXml: '<Field Type="Counter" />'
  }, ...definition.fields.filter(field => field.internalName !== options.omit).map(field => ({
    Id: field.id,
    InternalName: field.internalName,
    TypeAsString: field.internalName === options.wrongType ? 'Text' : field.type === 'DateOnly' ? 'DateTime' : field.type,
    Required: field.required,
    Indexed: field.indexed,
    EnforceUniqueValues: Boolean(field.enforceUniqueValues),
    Choices: field.choices || [],
    SchemaXml: options.wrongBooleanDefault && field.internalName === 'Active'
      ? workplan018FieldSchemaXml(field).replace('Default="1"', 'Default="0"')
      : workplan018FieldSchemaXml(field)
  }))];
};

const libraryRows = (): object[] => BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.map((item, index) => ({
  Id: index + 1,
  BehaviourObjectiveKey: item.behaviourObjectiveKey,
  BehaviourKey: item.behaviourKey,
  ObjectiveTitle: item.objectiveTitle,
  ObjectiveDescription: item.objectiveDescription,
  SuggestedMeasure: item.suggestedMeasure,
  SuggestedUnit: item.suggestedUnit,
  SuggestedEvidence: item.suggestedEvidence,
  Active: item.active,
  SortOrder: item.sortOrder,
  EffectiveFrom: `${item.effectiveFrom}T00:00:00Z`,
  EffectiveTo: item.effectiveTo
}));

const listRow = (title: Workplan018ListTitle): object => ({
  Id: `list-${title}`,
  BaseTemplate: 100,
  EnableVersioning: true,
  EnableFolderCreation: false,
  OnQuickLaunch: false,
  RootFolder: { ServerRelativeUrl: `/sites/REVIEW-TEST-SITE/Lists/${title}` }
});

const mockClient = (
  libraryExists: boolean,
  options: {
    omitWorkplanField?: string;
    wrongWorkplanField?: string;
    wrongBooleanDefault?: boolean;
    postStatus?: number;
  } = {}
): { client: SPHttpClient; get: jest.Mock; post: jest.Mock } => {
  const get = jest.fn(async (url: string) => {
    const definition = definitionForUrl(url);
    if (!definition) return response(404);
    if (definition.title === 'KCFKPI_BehaviourObjectiveLibrary' && !libraryExists) return response(404);
    if (url.indexOf('/fields?') >= 0) {
      return response(200, { value: fieldRows(definition.title, {
        omit: definition.title === 'KCFKPI_Workplans' ? options.omitWorkplanField : undefined,
        wrongType: definition.title === 'KCFKPI_Workplans' ? options.wrongWorkplanField : undefined,
        wrongBooleanDefault: definition.title === 'KCFKPI_BehaviourObjectiveLibrary' && options.wrongBooleanDefault
      }) });
    }
    if (url.indexOf('/items?') >= 0) return response(200, { value: libraryRows() });
    return response(200, listRow(definition.title));
  });
  const post = jest.fn(async () => response(options.postStatus || 204));
  return { client: { get, post } as unknown as SPHttpClient, get, post };
};

describe('standalone KCF-KPI-018 SharePoint provisioner', () => {
  it('validates exactly 30 distinct seed keys and six objectives per Behaviour', () => {
    const validation = validateBehaviourObjectiveSeedReadback(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED, true);
    expect(validation).toEqual(expect.objectContaining({
      rowCount: 30,
      distinctKeyCount: 30,
      duplicateKeys: [],
      unknownKeys: [],
      missingKeys: [],
      contentMismatches: []
    }));
    expect(validation.countsByBehaviour).toEqual({ 'BHV-01': 6, 'BHV-02': 6, 'BHV-03': 6, 'BHV-04': 6, 'BHV-05': 6 });
  });

  it('detects duplicate, unknown and altered seed content without updating it', () => {
    const changed: IBehaviourObjectiveLibraryRecord = {
      ...BEHAVIOUR_OBJECTIVE_LIBRARY_SEED[0], objectiveTitle: 'Unapproved changed title'
    };
    const validation = validateBehaviourObjectiveSeedReadback([
      changed,
      BEHAVIOUR_OBJECTIVE_LIBRARY_SEED[0],
      { ...BEHAVIOUR_OBJECTIVE_LIBRARY_SEED[1], behaviourObjectiveKey: 'UNKNOWN-KEY' }
    ], false);
    expect(validation.duplicateKeys).toEqual(['BHV-01-OBJ-01']);
    expect(validation.unknownKeys).toEqual(['UNKNOWN-KEY']);
    expect(validation.contentMismatches).toContain('BHV-01-OBJ-01: ObjectiveTitle differs from the approved seed.');
  });

  it('fails before HTTP unless the exact REVIEW-TEST-SITE site and Synthetic User identity guards pass', async () => {
    const { client, get, post } = mockClient(false);
    await expect(new Workplan018SharePointProvisioner(client, 'https://example.invalid', 'person003@example.invalid').preflight())
      .rejects.toBeInstanceOf(Workplan018ProvisioningError);
    await expect(new Workplan018SharePointProvisioner(client, 'https://example.invalid/sites/REVIEW-TEST-SITE', 'person021@example.invalid').provision())
      .rejects.toBeInstanceOf(Workplan018ProvisioningError);
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('preflights the four existing list contracts and a missing isolated library without writing', async () => {
    const { client, post } = mockClient(false);
    const result = await new Workplan018SharePointProvisioner(
      client,
      'https://example.invalid/sites/REVIEW-TEST-SITE/',
      'person003@example.invalid'
    ).preflight();
    expect(result.status).toBe('Ready');
    expect(result.lists.filter(list => list.existedBefore)).toHaveLength(4);
    expect(result.lists.find(list => list.title === 'KCFKPI_BehaviourObjectiveLibrary')?.missingFieldsBefore).toHaveLength(11);
    expect(post).not.toHaveBeenCalled();
  });

  it('is a repeat no-op when every field, list setting and exact seed already exists', async () => {
    const { client, post } = mockClient(true);
    const provisioner = new Workplan018SharePointProvisioner(
      client,
      'https://example.invalid/sites/REVIEW-TEST-SITE',
      'person003@example.invalid'
    );
    const first = await provisioner.provision();
    const second = await provisioner.provision();
    expect(first.status).toBe('Pass');
    expect(second.status).toBe('Pass');
    expect(second.seed).toEqual(expect.objectContaining({ rowCount: 30, distinctKeyCount: 30, createdKeys: [] }));
    expect(second.lists.every(list => list.createdFields.length === 0 && !list.createdList && !list.settingsChanged)).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('fails closed on an existing field mismatch before any SharePoint write', async () => {
    const { client, post } = mockClient(true, { wrongWorkplanField: 'CategoryWeightingReason' });
    await expect(new Workplan018SharePointProvisioner(
      client,
      'https://example.invalid/sites/REVIEW-TEST-SITE',
      'person003@example.invalid'
    ).provision()).rejects.toThrow(/preflight failed/);
    expect(post).not.toHaveBeenCalled();
  });

  it('verifies the Boolean default as part of exact physical schema read-back', async () => {
    const { client, post } = mockClient(true, { wrongBooleanDefault: true });
    await expect(new Workplan018SharePointProvisioner(
      client,
      'https://example.invalid/sites/REVIEW-TEST-SITE',
      'person003@example.invalid'
    ).preflight()).rejects.toThrow(/Boolean default must be Yes\/true/);
    expect(post).not.toHaveBeenCalled();
  });

  it('returns structured partial evidence when authorised missing-field creation fails', async () => {
    const { client } = mockClient(true, { omitWorkplanField: 'CategoryWeightingReason', postStatus: 500 });
    try {
      await new Workplan018SharePointProvisioner(
        client,
        'https://example.invalid/sites/REVIEW-TEST-SITE',
        'person003@example.invalid'
      ).provision();
      throw new Error('Expected controlled provisioning failure.');
    } catch (caught) {
      expect(caught).toBeInstanceOf(Workplan018ProvisioningError);
      const controlled = caught as Workplan018ProvisioningError;
      expect(controlled.evidence.status).toBe('Failed');
      expect(controlled.evidence.lists.find(list => list.title === 'KCFKPI_Workplans')?.missingFieldsBefore).toEqual(['CategoryWeightingReason']);
      expect(controlled.evidence.error).toMatch(/could not be created/);
    }
  });

  it('routes Behaviour objective description through ItemDescriptionSnapshot only', () => {
    const employee: IProductionPerson = { id: 1, personKey: 'employee', displayName: 'Employee', email: 'person012@example.invalid', appRoles: ['Employee'], active: true };
    const manager: IProductionPerson = { id: 2, personKey: 'manager', displayName: 'Manager', email: 'person013@example.invalid', appRoles: ['Employee'], active: true };
    const workplan: IAnnualWorkplan = {
      id: 1, etag: '"1"', workplanKey: 'employee|2026', personKey: employee.personKey,
      employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
      managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
      state: 'Locked', accessState: 'ReadOnly', transitionStatus: 'Ready', coreCategoryWeight: 70,
      personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
    };
    const lifecycle: IQuarterLifecycle = {
      performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q1', quarterName: 'Q1',
      quarterStart: '2025-11-01', quarterEnd: '2026-01-31', isCurrentQuarter: true,
      isOpenForProgressUpdates: true, employeeSubmissionDeadline: '2026-02-07', managerReviewDeadline: '2026-02-14',
      reminderMilestones: { earlyReview: '2026-01-01', preparation: '2026-01-15', final: '2026-01-24' }, status: 'Open'
    };
    const result = buildQuarterReviewDraft({
      workplan, employee, manager, lifecycle, coreCatalogue: [], coreItems: [], personalItems: [],
      behaviours: [{ behaviourId: 'BHV-01', behaviourVersionKey: 'BHV-01|v01', title: 'Work as One Team', description: 'Approved Behaviour', defaultWorkplanWeight: 20, displayOrder: 1 }],
      behaviourItems: [{
        id: 1, etag: '"1"', workplanItemKey: 'behaviour-1', naturalKey: 'behaviour-1',
        workplanKey: workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026,
        behaviourId: 'BHV-01', behaviourVersionKey: 'BHV-01|v01', objectiveSource: 'Library',
        sourceObjectiveKey: 'BHV-01-OBJ-01', objectiveTitle: 'Objective',
        objectiveDescription: 'Persist this approved description', measure: 'Observed examples', unit: 'rating',
        evidenceDefinition: 'Evidence', q1TargetText: 'Commitment', q1TargetRating: 3,
        behaviourItemWeight: 100, displayOrder: 1, activeInWorkplan: true
      }]
    });
    expect(result.items[0]).toEqual(expect.objectContaining({
      itemDescription: 'Persist this approved description',
      behaviourObjectiveDescription: 'Persist this approved description'
    }));
    const physicalNames = (WORKPLAN_018_SCHEMA.find(item => item.title === 'KCFKPI_QuarterReviewItems')?.fields || [])
      .map(field => field.internalName);
    expect(physicalNames).toContain('ItemDescriptionSnapshot');
    expect(physicalNames).not.toContain('BehaviourObjectiveDescriptionSnapshot');
    expect(QUARTER_ITEM_BASE_SELECT).toContain('ItemDescriptionSnapshot');
    expect(QUARTER_ITEM_BASE_SELECT).not.toContain('BehaviourObjectiveDescriptionSnapshot');
  });
});
