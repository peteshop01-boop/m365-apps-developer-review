jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'admin-remediation-guid' }) }
}));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import type { ICoreKpiCatalogueItem } from '../models/ProductionModels';
import type { IAuthoritativeAdminKpiRemediationQueueCapability } from './IProductionDataService';
import SharePointProductionDataService from './SharePointProductionDataService';
import * as KpiMasterApi from './AdminKpiMasterDomain';
import {
  ADMIN_KPI_MASTER_EXPECTED_RECORD_COUNT,
  ADMIN_KPI_MASTER_READ_PATH,
  type IAdminKpiControlledRemediationCommand,
  type IAdminKpiMasterRecord,
  type IAdminKpiRemediationSourceIssue,
  type IAdminKpiMasterUatState,
  addKpiSafeUat,
  applyAdminKpiControlledRemediationSafeUat,
  assessAdminKpiScoringReadiness,
  createAdminKpiMasterUatState,
  editKpiSafeUat,
  filterAdminKpis,
  getAdminKpiDefinitionIdentity,
  inspectAdminKpiMasterReadPath,
  setKpiActiveSafeUat
} from './AdminKpiMasterDomain';

const context = {
  actorEmail: 'admin.uat@example.invalid',
  occurredAt: '2026-08-22T09:00:00.000Z'
};

const ownerKnownIssue = (
  sourceReference: string,
  kpiId: string = 'SYN-001'
): IAdminKpiRemediationSourceIssue => ({
  scope: 'KPI',
  issueKey: `KPI|${kpiId}|UNKNOWN_OWNER_CODE`,
  issueType: 'OwnerResolution',
  sourceIssueCode: 'UNKNOWN_OWNER_CODE',
  kpiId,
  status: 'ControlDecisionRequired',
  sourceReference
});

const ownerCommand = (
  expectedDefinition: ReturnType<typeof getAdminKpiDefinitionIdentity>,
  sourceReference: string,
  actionKey: string
): IAdminKpiControlledRemediationCommand => ({
  actionKey,
  issueKey: `KPI|${expectedDefinition.kpiId}|UNKNOWN_OWNER_CODE`,
  issueType: 'OwnerResolution',
  sourceIssueCode: 'UNKNOWN_OWNER_CODE',
  issueKpiId: expectedDefinition.kpiId,
  issueStatus: 'ControlDecisionRequired',
  issueSourceReference: sourceReference,
  resolutionEvidenceReference: 'EVIDENCE/owner-resolution.json',
  expectedDefinition,
  patch: { owner: 'resolved.owner@example.invalid' }
});

const issueQueueCapability = async (
  sourceReference: string,
  kpiId: string = 'SYN-001'
): Promise<IAuthoritativeAdminKpiRemediationQueueCapability> => {
  const response = {
    ok: true,
    status: 200,
    json: async () => ({ value: [{
      Id: 1,
      PersonKey: 'ADMIN-001',
      Title: 'Synthetic authorised Admin',
      Email: 'admin.uat@example.invalid',
      AppRoles: ['SystemAdmin'],
      Active: true
    }] })
  } as unknown as SPHttpClientResponse;
  const client = { get: jest.fn(async () => response), post: jest.fn() } as unknown as SPHttpClient;
  const service = new SharePointProductionDataService(
    client,
    'https://example.invalid/sites/kpi',
    'admin.uat@example.invalid'
  );
  const catalogue: ICoreKpiCatalogueItem[] = [{
    kpiId,
    kpiVersionKey: `${kpiId}-2026-v1`,
    targetVersionKey: `${kpiId}-2026-target-v1`,
    wording: 'Synthetic KPI',
    pillar: 'Synthetic pillar',
    workstream: 'Synthetic workstream',
    accountableOwnerEmail: 'old.owner@example.invalid',
    scoringDirection: 'HigherIsBetter',
    metricType: 'Count',
    unitLabel: 'Count',
    classificationSource: sourceReference,
    ownerSourceCode: 'UNKNOWN',
    dataQualityFlags: 'Unknown owner code',
    kpiWeightWithinWorkstream: 100,
    yearEndTargetValue: 1,
    q1TargetValue: 1,
    q2TargetValue: 1,
    q3TargetValue: 1,
    q4TargetValue: 1
  }];
  jest.spyOn(service, 'getCoreKpiCatalogue').mockResolvedValue(catalogue);
  return service.getAuthoritativeAdminKpiRemediationQueueCapability(2026);
};

const makeKpi = (index: number): IAdminKpiMasterRecord => {
  const padded = index < 10 ? '00' + index : (index < 100 ? '0' + index : String(index));
  return {
    id: index,
    kpiId: 'SYN-' + padded,
    kpiVersionKey: 'SYN-' + padded + '-2026-v1',
    wording: index % 2 ? 'Increase synthetic participation ' + padded : 'Deliver synthetic plan ' + padded,
    wordingSourceReference: 'SYNTHETIC-GOLD-' + padded,
    pillar: index <= 55 ? 'People' : 'Places',
    workstream: index % 3 ? 'Community' : 'Schools',
    active: true,
    owner: index % 2 ? 'owner.one@example.invalid' : 'owner.two@example.invalid',
    measureType: index % 2 ? 'Count' : 'Percentage',
    unit: index % 2 ? 'programmes' : '%',
    direction: 'HigherIsBetter',
    aggregationMethod: 'DirectMetric',
    reportingStatus: 'Included'
  };
};

const makeKpis = (count: number = ADMIN_KPI_MASTER_EXPECTED_RECORD_COUNT): IAdminKpiMasterRecord[] => {
  const records: IAdminKpiMasterRecord[] = [];
  for (let index = 1; index <= count; index += 1) records.push(makeKpi(index));
  return records;
};

describe('KCF-KPI-020B KPI Master Admin pure domain', () => {
  it('validates the exact read-only 109-record KPI Master baseline', () => {
    const result = inspectAdminKpiMasterReadPath(makeKpis());

    expect(ADMIN_KPI_MASTER_READ_PATH).toEqual({
      listTitle: 'KCFKPI_KPIMaster',
      expectedCurrentRecordCount: 109,
      operation: 'ReadOnly'
    });
    expect(result).toMatchObject({
      expectedCurrentRecordCount: 109,
      recordCount: 109,
      activeCount: 109,
      activeReadyCount: 109,
      activeNotReadyCount: 0,
      matchesCurrentRecordCount: true,
      valid: true
    });
    expect(result.issues).toEqual([]);
  });

  it('fails the read contract on count drift, duplicate versions or multiple active KPI versions', () => {
    const records = makeKpis(108);
    records[107] = { ...records[107], kpiId: records[0].kpiId, kpiVersionKey: records[0].kpiVersionKey };

    const result = inspectAdminKpiMasterReadPath(records);

    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('record-count drift: read 108');
    expect(result.issues.join(' ')).toContain('duplicate KPI/version');
    expect(result.issues.join(' ')).toContain('more than one active version');
  });

  it('combines search, Pillar, Workstream, activity and scoring-readiness filters', () => {
    const records = makeKpis();
    records[0] = { ...records[0], scoringMetadataIssues: ['Controlled policy metadata pending'] };
    records[1] = { ...records[1], active: false };

    expect(filterAdminKpis(records, {
      search: 'participation',
      pillars: ['People'],
      workstreams: ['Community'],
      activity: 'Active',
      owners: ['owner.one@example.invalid'],
      measureTypes: ['Count'],
      units: ['programmes'],
      directions: ['HigherIsBetter'],
      aggregationMethods: ['DirectMetric'],
      readiness: 'Ready'
    }).length).toBeGreaterThan(0);

    expect(filterAdminKpis(records, { readiness: 'NotReady' }).map(record => record.kpiId)).toEqual(['SYN-001']);
    expect(filterAdminKpis(records, { activity: 'Inactive' }).map(record => record.kpiId)).toEqual(['SYN-002']);
    expect(filterAdminKpis(records, { search: 'does not exist' })).toEqual([]);
  });

  it('highlights incomplete and controlled-policy scoring metadata without inferring direction', () => {
    const unresolved = { ...makeKpi(1), owner: '', unit: '', direction: '' };
    const lower = { ...makeKpi(2), direction: 'LowerIsBetter' };
    const approvedLower = {
      ...lower,
      scoringPolicyApproved: true,
      scoringPolicyReference: 'CONTROL-LOWER-001'
    };

    expect(assessAdminKpiScoringReadiness(unresolved)).toEqual({
      status: 'NotReady',
      issues: ['Owner is blank.', 'Unit is blank.', 'Direction is blank.']
    });
    expect(assessAdminKpiScoringReadiness(lower).issues).toContain(
      'Direction requires an approved, auditable scoring policy.'
    );
    expect(assessAdminKpiScoringReadiness(approvedLower)).toEqual({ status: 'Ready', issues: [] });
  });

  it('adds, edits, deactivates and reactivates browser-memory copies while appending history', () => {
    const source = makeKpis(2);
    const before = JSON.stringify(source);
    let state = createAdminKpiMasterUatState(source);

    state = addKpiSafeUat(state, {
      kpiId: 'SYN-NEW',
      kpiVersionKey: 'SYN-NEW-2026-v1',
      wording: 'Synthetic new KPI',
      wordingSourceReference: 'CONTROL-SYN-NEW',
      pillar: 'People',
      workstream: 'Community',
      owner: 'owner.new@example.invalid',
      measureType: 'Count',
      unit: 'people',
      direction: 'HigherIsBetter',
      aggregationMethod: 'DirectMetric',
      reportingStatus: 'Included'
    }, context);
    state = editKpiSafeUat(state, 'SYN-NEW', 'SYN-NEW-2026-v1', {
      owner: 'owner.edited@example.invalid',
      aggregationMethod: 'Additive'
    }, context);
    state = setKpiActiveSafeUat(state, 'SYN-NEW', 'SYN-NEW-2026-v1', false, context);
    state = setKpiActiveSafeUat(state, 'SYN-NEW', 'SYN-NEW-2026-v1', true, context);

    const saved = state.records.filter(record => record.kpiId === 'SYN-NEW')[0];
    expect(saved).toMatchObject({
      id: 3,
      owner: 'owner.edited@example.invalid',
      aggregationMethod: 'Additive',
      active: true
    });
    expect(state.audit.map(event => event.action)).toEqual([
      'KpiAdded', 'KpiEdited', 'KpiDeactivated', 'KpiReactivated'
    ]);
    expect(state.audit[1].beforeJson).toContain('owner.new@example.invalid');
    expect(state.audit[1].afterJson).toContain('owner.edited@example.invalid');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('rejects values outside the exact physical Choice fields', () => {
    const state = createAdminKpiMasterUatState(makeKpis(1));

    [
      { measureType: 'Percent-ish' },
      { direction: 'Score' },
      { aggregationMethod: 'Sum' },
      { reportingStatus: 'Maybe' }
    ].forEach(patch => expect(() => editKpiSafeUat(
      state,
      'SYN-001',
      'SYN-001-2026-v1',
      patch,
      context
    )).toThrow('approved physical choice'));
  });

  it('requires explicit authoritative evidence for any KPI wording change', () => {
    const state = createAdminKpiMasterUatState(makeKpis(1));

    expect(() => editKpiSafeUat(state, 'SYN-001', 'SYN-001-2026-v1', {
      wording: 'Silently changed wording'
    }, context)).toThrow('authoritative source reference');

    const changed = editKpiSafeUat(state, 'SYN-001', 'SYN-001-2026-v1', {
      wording: 'Controlled replacement wording',
      authoritativeWordingChangeReference: 'CONTROL-WORDING-001'
    }, context);
    expect(changed.records[0]).toMatchObject({
      wording: 'Controlled replacement wording',
      wordingSourceReference: 'CONTROL-WORDING-001'
    });
  });

  it('applies an issue-bound repair only to the exact KPI version/state and records attributable provenance', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const expectedDefinition = getAdminKpiDefinitionIdentity(source[0]);
    const knownIssue = ownerKnownIssue('Controlled owner register row 17');
    const command = {
      ...ownerCommand(expectedDefinition, knownIssue.sourceReference, 'ADM-003-REMEDIATION-001'),
      resolutionEvidenceReference: 'EVIDENCE/owner-resolution-001.json'
    };
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);
    const remediated = applyAdminKpiControlledRemediationSafeUat(state, command, context, queueCapability);

    expect(remediated.records[0]).toEqual(expect.objectContaining({
      kpiId: 'SYN-001',
      kpiVersionKey: 'SYN-001-2026-v1',
      active: true,
      owner: 'resolved.owner@example.invalid'
    }));
    expect(remediated.audit).toEqual([expect.objectContaining({
      action: 'KpiRemediated',
      actionKey: 'ADM-003-REMEDIATION-001',
      issueKey: 'KPI|SYN-001|UNKNOWN_OWNER_CODE',
      issueStatus: 'ControlDecisionRequired',
      issueSourceReference: 'Controlled owner register row 17',
      resolutionEvidenceReference: 'EVIDENCE/owner-resolution-001.json',
      expectedDefinition,
      actorEmail: context.actorEmail,
      occurredAt: context.occurredAt
    })]);
    expect(remediated.audit[0].beforeJson).toContain('owner.one@example.invalid');
    expect(remediated.audit[0].afterJson).toContain('resolved.owner@example.invalid');
    expect(source[0].owner).toBe('owner.one@example.invalid');
  });

  it('binds remediation audit attribution to the authoritative queue actor before protected state inspection', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const before = JSON.stringify(state);
    const knownIssue = ownerKnownIssue('Controlled owner register row 17');
    const command = ownerCommand(
      getAdminKpiDefinitionIdentity(source[0]),
      knownIssue.sourceReference,
      'ADM-003-ACTOR-BINDING-001'
    );
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);

    const mismatchedActors = [
      '',
      'victim.user@example.invalid',
      'admin.two@example.invalid',
      'ordinary.employee@example.invalid'
    ];
    mismatchedActors.forEach(actorEmail => {
      let protectedStateInspected = false;
      const protectedState = new Proxy(state, {
        get: (): never => {
          protectedStateInspected = true;
          throw new Error('PROTECTED_STATE_INSPECTED');
        }
      });
      expect(() => applyAdminKpiControlledRemediationSafeUat(
        protectedState,
        command,
        { ...context, actorEmail },
        queueCapability
      )).toThrow(/actor must match the authoritative queue identity/);
      expect(protectedStateInspected).toBe(false);
    });

    const normalisedMatch = applyAdminKpiControlledRemediationSafeUat(
      state,
      command,
      { ...context, actorEmail: '  ADMIN.UAT@EXAMPLE.INVALID  ' },
      queueCapability
    );
    expect(normalisedMatch.audit[0].actorEmail).toBe('admin.uat@example.invalid');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects the exact accessor-backed provenance attack before protected state inspection', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const knownIssue = ownerKnownIssue('Controlled owner register row 17');
    const safeCommand = ownerCommand(
      getAdminKpiDefinitionIdentity(source[0]),
      knownIssue.sourceReference,
      'SEC-R031-REMEDIATION-001'
    );
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);
    const switchingFields = [
      'actionKey', 'issueKey', 'issueStatus', 'issueSourceReference', 'resolutionEvidenceReference'
    ];
    const safeValues = safeCommand as unknown as { [key: string]: unknown };
    const accessCounts: { [key: string]: number } = {};
    const accessorCommand: { [key: string]: unknown } = {};
    Object.keys(safeCommand).forEach(key => {
      if (switchingFields.indexOf(key) < 0) {
        Object.defineProperty(accessorCommand, key, {
          enumerable: true,
          configurable: false,
          writable: false,
          value: safeValues[key]
        });
        return;
      }
      Object.defineProperty(accessorCommand, key, {
        enumerable: true,
        configurable: false,
        get: (): unknown => {
          accessCounts[key] = (accessCounts[key] || 0) + 1;
          return accessCounts[key] === 1 ? safeValues[key] : `FORGED-${key}`;
        }
      });
    });
    let protectedStateInspected = false;
    const protectedState = new Proxy(state, {
      get: (): never => {
        protectedStateInspected = true;
        throw new Error('PROTECTED_STATE_INSPECTED');
      }
    });

    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState,
      accessorCommand as unknown as IAdminKpiControlledRemediationCommand,
      context,
      queueCapability
    )).toThrow(/command integrity/);
    expect(protectedStateInspected).toBe(false);
    expect(accessCounts).toEqual({});

    const nestedAccessor = ownerCommand(
      getAdminKpiDefinitionIdentity(source[0]),
      knownIssue.sourceReference,
      'SEC-R031-NESTED-ACCESSOR-001'
    );
    Object.defineProperty(nestedAccessor.patch, 'owner', {
      enumerable: true,
      configurable: true,
      get: () => 'forged.owner@example.invalid'
    });
    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState,
      nestedAccessor,
      context,
      queueCapability
    )).toThrow(/command integrity/);
    expect(protectedStateInspected).toBe(false);
  });

  it('uses one canonical descriptor snapshot across proxy key order and caller mutation', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const knownIssue = ownerKnownIssue('Controlled owner register row 17');
    const command = ownerCommand(
      getAdminKpiDefinitionIdentity(source[0]),
      knownIssue.sourceReference,
      'SEC-R031-PROXY-ORDER-001'
    );
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);
    let getTrapCount = 0;
    const descriptorReads: string[] = [];
    const mutationValues: { [key: string]: string } = {
      actionKey: 'FORGED-ACTION',
      issueKey: 'FORGED-ISSUE',
      issueStatus: 'FORGED-STATUS',
      issueSourceReference: 'FORGED-SOURCE',
      resolutionEvidenceReference: 'FORGED-EVIDENCE'
    };
    const proxyCommand = new Proxy(command, {
      ownKeys: target => Object.keys(target).reverse(),
      getOwnPropertyDescriptor: (target, property) => {
        const descriptor = Object.getOwnPropertyDescriptor(target, property);
        const key = String(property);
        descriptorReads.push(key);
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && mutationValues[key]) {
          const safeValue = descriptor.value;
          (target as unknown as { [key: string]: unknown })[key] = mutationValues[key];
          return { ...descriptor, value: safeValue };
        }
        return descriptor;
      },
      get: (target, property): unknown => {
        getTrapCount += 1;
        return (target as unknown as { [key: string]: unknown })[String(property)];
      }
    });

    const remediated = applyAdminKpiControlledRemediationSafeUat(
      state,
      proxyCommand,
      context,
      queueCapability
    );
    expect(getTrapCount).toBe(0);
    expect(descriptorReads).toHaveLength(10);
    expect(remediated.records[0].owner).toBe('resolved.owner@example.invalid');
    expect(remediated.audit[0]).toEqual(expect.objectContaining({
      actionKey: 'SEC-R031-PROXY-ORDER-001',
      issueKey: 'KPI|SYN-001|UNKNOWN_OWNER_CODE',
      issueStatus: 'ControlDecisionRequired',
      issueSourceReference: 'Controlled owner register row 17',
      resolutionEvidenceReference: 'EVIDENCE/owner-resolution.json'
    }));
  });

  it('isolates a mutable plain command before state-triggered mutation and accepts an immutable plain command', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const before = JSON.stringify(state);
    const knownIssue = ownerKnownIssue('Controlled owner register row 17');
    const mutableCommand = ownerCommand(
      getAdminKpiDefinitionIdentity(source[0]),
      knownIssue.sourceReference,
      'SEC-R031-MUTABLE-PLAIN-001'
    );
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);
    let mutated = false;
    const mutationState = new Proxy(state, {
      get: (target, property) => {
        if (!mutated) {
          mutated = true;
          mutableCommand.actionKey = 'FORGED-ACTION';
          mutableCommand.issueKey = 'FORGED-ISSUE';
          mutableCommand.issueStatus = 'Open';
          mutableCommand.issueSourceReference = 'FORGED-SOURCE';
          mutableCommand.resolutionEvidenceReference = 'FORGED-EVIDENCE';
          mutableCommand.expectedDefinition.kpiId = 'FORGED-KPI';
          mutableCommand.patch.owner = 'forged.owner@example.invalid';
        }
        return target[property as keyof IAdminKpiMasterUatState];
      }
    });

    const fromMutable = applyAdminKpiControlledRemediationSafeUat(
      mutationState,
      mutableCommand,
      context,
      queueCapability
    );
    expect(mutated).toBe(true);
    expect(fromMutable.records[0].owner).toBe('resolved.owner@example.invalid');
    expect(fromMutable.audit[0]).toEqual(expect.objectContaining({
      actionKey: 'SEC-R031-MUTABLE-PLAIN-001',
      issueKey: 'KPI|SYN-001|UNKNOWN_OWNER_CODE',
      issueStatus: 'ControlDecisionRequired',
      issueSourceReference: 'Controlled owner register row 17',
      resolutionEvidenceReference: 'EVIDENCE/owner-resolution.json',
      expectedDefinition: expect.objectContaining({ kpiId: 'SYN-001' })
    }));
    expect(JSON.stringify(state)).toBe(before);

    const immutableSource = makeKpis(1);
    const immutableState = createAdminKpiMasterUatState(immutableSource);
    const immutableExpected = Object.freeze(getAdminKpiDefinitionIdentity(immutableSource[0]));
    const immutablePatch = Object.freeze({ owner: 'resolved.owner@example.invalid' });
    const immutableCommand = Object.freeze({
      ...ownerCommand(immutableExpected, knownIssue.sourceReference, 'SEC-R031-IMMUTABLE-PLAIN-001'),
      expectedDefinition: immutableExpected,
      patch: immutablePatch
    });
    const fromImmutable = applyAdminKpiControlledRemediationSafeUat(
      immutableState,
      immutableCommand,
      context,
      queueCapability
    );
    expect(fromImmutable.records[0].owner).toBe('resolved.owner@example.invalid');
    expect(fromImmutable.audit[0].actionKey).toBe('SEC-R031-IMMUTABLE-PLAIN-001');
  });

  it('rejects symbol and custom-prototype command shapes before protected state inspection', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const knownIssue = ownerKnownIssue('Controlled owner register row 17');
    const command = ownerCommand(
      getAdminKpiDefinitionIdentity(source[0]),
      knownIssue.sourceReference,
      'SEC-R031-SHAPE-001'
    );
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);
    let protectedStateInspected = false;
    const protectedState = new Proxy(state, {
      get: (): never => {
        protectedStateInspected = true;
        throw new Error('PROTECTED_STATE_INSPECTED');
      }
    });
    const symbolCommand = { ...command } as IAdminKpiControlledRemediationCommand & { [key: symbol]: string };
    symbolCommand[Symbol('unexpected')] = 'forged';
    const prototypeCommand = Object.assign(
      Object.create({ inherited: 'forged' }),
      command
    ) as IAdminKpiControlledRemediationCommand;

    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState, symbolCommand, context, queueCapability
    )).toThrow(/command integrity/);
    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState, prototypeCommand, context, queueCapability
    )).toThrow(/command integrity/);
    expect(protectedStateInspected).toBe(false);
  });

  it('rejects the complete forbidden patch descriptor set before protected state inspection', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const stateBefore = JSON.stringify(state);
    const knownIssue = ownerKnownIssue('Controlled owner register row 17');
    const expectedDefinition = getAdminKpiDefinitionIdentity(source[0]);
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);
    let protectedStateInspected = false;
    const protectedState = new Proxy(state, {
      get: (): never => {
        protectedStateInspected = true;
        throw new Error('PROTECTED_STATE_INSPECTED');
      }
    });
    const patchType = (value: object): IAdminKpiControlledRemediationCommand['patch'] => (
      value as IAdminKpiControlledRemediationCommand['patch']
    );
    const withForbiddenDataProperty = (property: string): IAdminKpiControlledRemediationCommand['patch'] => {
      const patch: { [key: string]: unknown } = { owner: 'resolved.owner@example.invalid' };
      Object.defineProperty(patch, property, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 'forbidden-extra-descriptor'
      });
      return patchType(patch);
    };

    ['__proto__', 'constructor', 'prototype', 'unexpected'].forEach((property, index) => {
      const command = ownerCommand(
        expectedDefinition,
        knownIssue.sourceReference,
        `SEC-R032-FORBIDDEN-DATA-${index}`
      );
      command.patch = withForbiddenDataProperty(property);
      expect(Reflect.ownKeys(command.patch).map(String)).toEqual(['owner', property]);
      expect(() => applyAdminKpiControlledRemediationSafeUat(
        protectedState, command, context, queueCapability
      )).toThrow(/command integrity|allow-list/);
    });

    const symbolCommand = ownerCommand(
      expectedDefinition,
      knownIssue.sourceReference,
      'SEC-R032-FORBIDDEN-SYMBOL'
    );
    const symbolPatch = { owner: 'resolved.owner@example.invalid' } as {
      owner: string;
      [key: symbol]: string;
    };
    symbolPatch[Symbol('unexpected')] = 'forbidden-extra-descriptor';
    symbolCommand.patch = symbolPatch;
    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState, symbolCommand, context, queueCapability
    )).toThrow(/command integrity/);

    let accessorReads = 0;
    const accessorCommand = ownerCommand(
      expectedDefinition,
      knownIssue.sourceReference,
      'SEC-R032-FORBIDDEN-ACCESSOR'
    );
    const accessorPatch = {};
    Object.defineProperty(accessorPatch, 'owner', {
      enumerable: true,
      configurable: true,
      get: (): string => {
        accessorReads += 1;
        return 'forged.owner@example.invalid';
      }
    });
    accessorCommand.patch = patchType(accessorPatch);
    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState, accessorCommand, context, queueCapability
    )).toThrow(/command integrity/);
    expect(accessorReads).toBe(0);

    const nonEnumerableCommand = ownerCommand(
      expectedDefinition,
      knownIssue.sourceReference,
      'SEC-R032-FORBIDDEN-NON-ENUMERABLE'
    );
    const nonEnumerablePatch: { [key: string]: unknown } = { owner: 'resolved.owner@example.invalid' };
    Object.defineProperty(nonEnumerablePatch, 'unexpected', {
      enumerable: false,
      configurable: true,
      writable: true,
      value: 'forbidden-extra-descriptor'
    });
    nonEnumerableCommand.patch = patchType(nonEnumerablePatch);
    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState, nonEnumerableCommand, context, queueCapability
    )).toThrow(/command integrity/);

    const prototypeCommand = ownerCommand(
      expectedDefinition,
      knownIssue.sourceReference,
      'SEC-R032-FORBIDDEN-CUSTOM-PROTOTYPE'
    );
    prototypeCommand.patch = patchType(Object.assign(
      Object.create({ inherited: 'forbidden' }),
      { owner: 'resolved.owner@example.invalid' }
    ));
    expect(() => applyAdminKpiControlledRemediationSafeUat(
      protectedState, prototypeCommand, context, queueCapability
    )).toThrow(/command integrity/);

    expect(protectedStateInspected).toBe(false);
    expect(JSON.stringify(state)).toBe(stateBefore);
    expect(state.audit).toEqual([]);
  });

  it('fails closed on stale version/state identity, missing provenance, no-op repair or replay', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const expectedDefinition = getAdminKpiDefinitionIdentity(source[0]);
    const knownIssue = ownerKnownIssue('Controlled owner register row 18');
    const command: IAdminKpiControlledRemediationCommand = {
      ...ownerCommand(expectedDefinition, knownIssue.sourceReference, 'ADM-003-REMEDIATION-002'),
      resolutionEvidenceReference: 'EVIDENCE/owner-resolution-002.json',
    };
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);

    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      expectedDefinition: { ...expectedDefinition, kpiVersionKey: 'SYN-001-2026-v2' }
    }, context, queueCapability)).toThrow('KPI/version was not found');
    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      expectedDefinition: { ...expectedDefinition, state: 'Inactive' }
    }, context, queueCapability)).toThrow('version/state identity is stale or mismatched');
    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      resolutionEvidenceReference: ''
    }, context, queueCapability)).toThrow('resolution evidence provenance');
    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      patch: { owner: source[0].owner }
    }, context, queueCapability)).toThrow('must change the exact bound KPI version');

    const first = applyAdminKpiControlledRemediationSafeUat(state, command, context, queueCapability);
    expect(() => applyAdminKpiControlledRemediationSafeUat(first, {
      ...command,
      patch: { owner: 'second.owner@example.invalid' }
    }, context, queueCapability)).toThrow('action key has already been used');
  });

  it('rejects forged issue identity, type, provenance, timestamp and command shape without state mutation', async () => {
    const source = makeKpis(2);
    const state = createAdminKpiMasterUatState(source);
    const before = JSON.stringify(state);
    const expectedDefinition = getAdminKpiDefinitionIdentity(source[0]);
    const knownIssue = ownerKnownIssue('Controlled owner register row 19');
    const command = ownerCommand(expectedDefinition, knownIssue.sourceReference, 'ADM-003-REMEDIATION-003');
    const queueCapability = await issueQueueCapability(knownIssue.sourceReference);

    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      issueKey: 'KPI|SYN-002|TBC_SCORING_DIRECTION',
      issueType: 'ScoringMetadata',
      sourceIssueCode: 'TBC_SCORING_DIRECTION',
      issueKpiId: 'SYN-002'
    }, context, queueCapability)).toThrow(/issue\/KPI\/definition identity|known source issue/);
    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      issueType: 'ScoringMetadata'
    }, context, queueCapability)).toThrow(/issue\/KPI\/definition identity/);
    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      issueSourceReference: 'Caller substituted provenance'
    }, context, queueCapability)).toThrow(/known source issue/);
    expect(() => applyAdminKpiControlledRemediationSafeUat(state, command, {
      ...context,
      occurredAt: 'not-a-timestamp'
    }, queueCapability)).toThrow(/canonical UTC timestamp/);
    expect(() => applyAdminKpiControlledRemediationSafeUat(state, {
      ...command,
      callerRole: 'SystemAdmin'
    } as IAdminKpiControlledRemediationCommand, context, queueCapability)).toThrow(/command integrity/);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects the prior caller-forged knownIssues bypass and copied capabilities before any changed candidate', async () => {
    const source = makeKpis(1);
    const state = createAdminKpiMasterUatState(source);
    const before = JSON.stringify(state);
    const knownIssue = ownerKnownIssue('Caller forged source provenance');
    const command = ownerCommand(
      getAdminKpiDefinitionIdentity(source[0]),
      knownIssue.sourceReference,
      'ADM-003-FORGED-BYPASS'
    );

    expect(() => applyAdminKpiControlledRemediationSafeUat(
      state,
      command,
      context,
      [knownIssue] as unknown as IAuthoritativeAdminKpiRemediationQueueCapability
    )).toThrow(/opaque authoritative queue readback capability/);

    const issued = await issueQueueCapability('Controlled owner register row 20');
    expect(() => applyAdminKpiControlledRemediationSafeUat(
      state,
      { ...command, issueSourceReference: 'Controlled owner register row 20' },
      context,
      { ...issued } as IAuthoritativeAdminKpiRemediationQueueCapability
    )).toThrow(/opaque authoritative queue readback capability/);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('exposes deactivate/reactivate but no delete or production persistence operation', () => {
    const exported = Object.keys(KpiMasterApi).map(key => key.toLowerCase());
    expect(exported.filter(key => key.indexOf('delete') >= 0)).toEqual([]);
    expect(exported.filter(key => key.indexOf('sharepoint') >= 0 || key.indexOf('persist') >= 0)).toEqual([]);
  });

  it('blocks a forged persistence boundary', () => {
    const safe = createAdminKpiMasterUatState(makeKpis(1));
    const forged = { ...safe, persistence: 'SharePoint' } as unknown as IAdminKpiMasterUatState;

    expect(() => setKpiActiveSafeUat(forged, 'SYN-001', 'SYN-001-2026-v1', false, context))
      .toThrow('safe local UAT boundary');
  });
});
