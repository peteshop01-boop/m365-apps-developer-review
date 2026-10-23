import * as ReportingControlApi from './AdminReportingControlDomain';
import {
  type IAdminAuditRecord,
  type IAdminOutputDefinition,
  type IAdminReportingKpiReference,
  type IAdminReportingMapRecord,
  assessReportingReadiness,
  buildBoundedAuditReadRequest,
  filterAuditEventsReadOnly,
  validateAdminOutputDefinitionDraft,
  validateOutputDefinitions,
  validateReportingMaps
} from './AdminReportingControlDomain';

const asOfDate = '2026-08-22T12:00:00.000Z';

const output = (overrides: Partial<IAdminOutputDefinition> = {}): IAdminOutputDefinition => ({
  id: 1,
  outputCode: 'MAIN_CWOP',
  outputName: 'Main CWOP',
  description: 'Controlled annual reporting output.',
  active: true,
  reportingFrequency: 'Annual',
  mappingRequirement: 'Required',
  outputFormat: 'XLSX',
  effectiveFrom: '2026-04-01T00:00:00.000Z',
  version: 'v1',
  publicationStatus: 'Approved',
  ownerEmail: 'output.owner@example.invalid',
  changeReference: 'CONTROL-020B',
  approvedByEmail: 'output.approver@example.invalid',
  approvedAt: '2026-03-31T12:00:00.000Z',
  ...overrides
});

const mapping = (overrides: Partial<IAdminReportingMapRecord> = {}): IAdminReportingMapRecord => {
  const record: IAdminReportingMapRecord = {
    id: 1,
    mappingKey: 'MAP-001',
    naturalKey: 'SYN-001|MAIN_CWOP',
    kpiId: 'SYN-001',
    outputCode: 'MAIN_CWOP',
    externalKey: 'TotalParticipants',
    sectionKey: 'Participation',
    fieldKey: 'TotalParticipants',
    allocationPercent: 100,
    reportingCadence: 'Annual',
    effectiveFrom: '2026-04-01T00:00:00.000Z',
    active: true,
    treatment: 'Direct',
    version: 'v1',
    approvalStatus: 'Approved',
    changeReference: 'CONTROL-020B',
    approvedByEmail: 'mapping.approver@example.invalid',
    approvedAt: '2026-03-31T12:00:00.000Z',
    ...overrides
  };
  if (overrides.naturalKey === undefined) record.naturalKey = `${record.kpiId}|${record.outputCode}`;
  return record;
};

const kpis: IAdminReportingKpiReference[] = [
  { kpiId: 'SYN-001', active: true, requiredForReporting: true },
  { kpiId: 'SYN-RETIRED', active: false, requiredForReporting: false }
];

describe('KCF-KPI-020B Reporting Control pure domain', () => {
  it('accepts a complete current Output Definition without hard-coding its output code', () => {
    const future = output({
      outputCode: 'FUTURE_OUTPUT_X',
      outputName: 'Future signed output',
      mappingRequirement: 'Optional'
    });

    expect(validateOutputDefinitions([future], asOfDate)).toEqual({
      ready: true,
      asOfDate,
      activeCurrentOutputCodes: ['FUTURE_OUTPUT_X'],
      requiredCurrentOutputCodes: [],
      issues: []
    });
  });

  it('validates Output Definition completeness, duplicates, dates and publication state', () => {
    const definitions: IAdminOutputDefinition[] = [
      output({ publicationStatus: 'Draft' }),
      output({ id: 2 }),
      output({
        id: 3,
        outputCode: 'EXPIRED',
        outputName: '',
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        effectiveTo: '2026-05-01T00:00:00.000Z',
        publicationStatus: 'Retired'
      })
    ];

    const result = validateOutputDefinitions(definitions, asOfDate);
    const codes = result.issues.map(issue => issue.code);

    expect(result.ready).toBe(false);
    expect(codes).toEqual(expect.arrayContaining([
      'IncompleteDefinition',
      'DuplicateDefinition',
      'OverlappingActiveDefinition',
      'InvalidEffectiveDates',
      'InvalidPublicationState'
    ]));
  });

  it('fails Output Definitions closed when the physical list is empty', () => {
    const result = validateOutputDefinitions([], asOfDate);

    expect(result.ready).toBe(false);
    expect(result.activeCurrentOutputCodes).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'NoCurrentDefinition' })]);
  });

  it('keeps an empty Reporting Map and empty Output Definition set NOT READY', () => {
    const result = validateReportingMaps([], [], kpis, asOfDate);

    expect(result.ready).toBe(false);
    expect(result.currentApprovedMappingCount).toBe(0);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OutputDefinitionsNotReady' }),
      expect.objectContaining({ code: 'UnmappedRequiredKpi' })
    ]));
  });

  it('rejects blank or unknown MappingRequirement instead of inferring Optional', () => {
    const blank = output({ mappingRequirement: '' as IAdminOutputDefinition['mappingRequirement'] });
    const unknown = output({
      id: 2,
      outputCode: 'UNKNOWN-STATE',
      mappingRequirement: 'Sometimes' as IAdminOutputDefinition['mappingRequirement']
    });

    const result = validateOutputDefinitions([blank, unknown], asOfDate);

    expect(result.ready).toBe(false);
    expect(result.issues.filter(issue => issue.code === 'IncompleteDefinition')).toHaveLength(2);
    expect(result.issues.map(issue => issue.message).join(' ')).toContain('explicit Required/Optional mapping state');
  });

  it('blocks invalid Output Definition drafts and preserves exact mixed-case Owner Email', () => {
    ['', 'Sometimes'].forEach(mappingRequirement => {
      const result = validateAdminOutputDefinitionDraft(output({
        mappingRequirement: mappingRequirement as IAdminOutputDefinition['mappingRequirement']
      }));
      expect(result.valid).toBe(false);
      expect(result.fieldErrors.mappingRequirement).toBe('Choose Required or Optional.');
    });

    const malformed = validateAdminOutputDefinitionDraft(output({ ownerEmail: 'not-an-email' }));
    expect(malformed.valid).toBe(false);
    expect(malformed.fieldErrors.ownerEmail).toBe('Enter a valid Owner Email.');

    const mixedCase = 'person010@example.invalid';
    const valid = output({ mappingRequirement: 'Required', ownerEmail: mixedCase });
    expect(validateAdminOutputDefinitionDraft(valid)).toMatchObject({ valid: true, fieldErrors: {} });
    expect(valid.ownerEmail).toBe(mixedCase);
  });

  it('requires every stored Output Definition field and approval metadata before a current output is ready', () => {
    const result = validateOutputDefinitions([output({
      description: '',
      outputFormat: undefined,
      ownerEmail: '',
      changeReference: '',
      approvedByEmail: '',
      approvedAt: 'not-a-date'
    })], asOfDate);

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'IncompleteDefinition',
        message: 'Output Definition requires its stored Description, Output Format, Owner Email and Change Reference.'
      }),
      expect.objectContaining({
        code: 'InvalidPublicationState',
        message: expect.stringContaining('stored approver email and a valid approval timestamp')
      })
    ]));
  });

  it('reports a current approved many-to-many Reporting Map as ready', () => {
    const definitions = [
      output(),
      output({
        id: 2,
        outputCode: 'CITIES_CWOP',
        outputName: 'Cities CWOP',
        mappingRequirement: 'Optional'
      })
    ];
    const mappings = [
      mapping(),
      mapping({
        id: 2,
        mappingKey: 'MAP-002',
        outputCode: 'CITIES_CWOP',
        sectionKey: 'Cities',
        fieldKey: 'Participants'
      })
    ];

    const result = validateReportingMaps(mappings, definitions, kpis, asOfDate);

    expect(result).toEqual({
      ready: true,
      asOfDate,
      currentApprovedMappingCount: 2,
      mappedRequiredKpiCount: 1,
      requiredKpiCount: 1,
      issues: []
    });
  });

  it('uses the physical External Key and does not invent mandatory section/field metadata for direct maps', () => {
    const direct = mapping({
      externalKey: 'DirectOutputRow',
      sectionKey: undefined,
      fieldKey: undefined
    });

    const result = validateReportingMaps([direct], [output()], kpis, asOfDate);

    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('allows a blank External Key on Draft/Exclude rows but requires it before a publishable map is approved', () => {
    const draft = mapping({
      mappingKey: 'MAP-DRAFT',
      externalKey: undefined,
      approvalStatus: 'Draft'
    });
    const approved = mapping({
      mappingKey: 'MAP-APPROVED',
      externalKey: undefined
    });
    const excluded = mapping({
      mappingKey: 'MAP-EXCLUDE',
      externalKey: undefined,
      treatment: 'Exclude'
    });

    expect(validateReportingMaps([draft], [output()], kpis, asOfDate).issues
      .filter(issue => issue.code === 'IncompleteMapping')).toEqual([]);
    expect(validateReportingMaps([approved], [output()], kpis, asOfDate).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        code: 'IncompleteMapping',
        message: 'An approved active publishable Reporting Map requires an External Key.'
      })]));
    expect(validateReportingMaps([excluded], [output()], kpis, asOfDate).issues
      .filter(issue => issue.code === 'IncompleteMapping')).toEqual([]);
  });

  it('requires physical natural-key, allocation, cadence, change and approval metadata on an approved map', () => {
    const incomplete = mapping({
      naturalKey: 'SYN-001|WRONG_OUTPUT',
      allocationPercent: undefined,
      reportingCadence: undefined,
      changeReference: '',
      approvedByEmail: '',
      approvedAt: 'not-a-date'
    });

    const result = validateReportingMaps([incomplete], [output()], kpis, asOfDate);

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'IncompleteMapping',
        message: expect.stringContaining('canonical KPI|Output natural key')
      }),
      expect.objectContaining({
        code: 'IncompleteMapping',
        message: expect.stringContaining('stored approver email and a valid approval timestamp')
      })
    ]));
  });

  it('requires a stored valid rule object for complex non-Direct treatments only', () => {
    const missingRule = mapping({ treatment: 'Allocated', treatmentRuleJson: undefined });
    const invalidRule = mapping({ treatment: 'CompositeComponent', treatmentRuleJson: '["not-an-object"]' });
    const validRule = mapping({ treatment: 'Narrative', treatmentRuleJson: '{"source":"managerNarrative"}' });
    const excluded = mapping({ treatment: 'Exclude', treatmentRuleJson: undefined, externalKey: undefined });

    expect(validateReportingMaps([missingRule], [output()], kpis, asOfDate).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        code: 'IncompleteMapping',
        message: expect.stringContaining('TreatmentRuleJSON')
      })]));
    expect(validateReportingMaps([invalidRule], [output()], kpis, asOfDate).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        code: 'IncompleteMapping',
        message: expect.stringContaining('TreatmentRuleJSON')
      })]));
    expect(validateReportingMaps([validRule], [output()], kpis, asOfDate).ready).toBe(true);
    expect(validateReportingMaps([excluded], [output()], kpis, asOfDate).issues
      .filter(issue => issue.message.indexOf('TreatmentRuleJSON') >= 0)).toEqual([]);
  });

  it('detects duplicate overlapping Reporting Map paths', () => {
    const duplicate = mapping({
      id: 2,
      mappingKey: 'MAP-002',
      externalKey: 'ChangedExternalField',
      version: 'v2'
    });

    const result = validateReportingMaps([mapping(), duplicate], [output()], kpis, asOfDate);

    expect(result.ready).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain('DuplicateMapping');
    expect(result.issues.map(issue => issue.message).join(' ')).toContain('overlapping active periods');
  });

  it('treats DateOnly EffectiveTo as inclusive for the whole as-of day', () => {
    const sameDay = '2026-08-22';
    const sameDayAsOf = '2026-08-22T23:59:59.999Z';
    const definition = output({ effectiveFrom: sameDay, effectiveTo: sameDay });
    const map = mapping({ effectiveFrom: sameDay, effectiveTo: sameDay });

    expect(validateOutputDefinitions([definition], sameDayAsOf)).toMatchObject({
      ready: true,
      activeCurrentOutputCodes: ['MAIN_CWOP'],
      issues: []
    });
    expect(validateReportingMaps([map], [definition], kpis, sameDayAsOf)).toMatchObject({
      ready: true,
      currentApprovedMappingCount: 1,
      issues: []
    });
  });

  it('detects expired mappings, unknown outputs, retired KPIs and unmapped required KPIs', () => {
    const requiredKpis: IAdminReportingKpiReference[] = kpis.concat([
      { kpiId: 'SYN-UNMAPPED', active: true, requiredForReporting: true }
    ]);
    const mappings: IAdminReportingMapRecord[] = [
      mapping({
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2026-05-31T23:59:59.000Z'
      }),
      mapping({
        id: 2,
        mappingKey: 'MAP-UNKNOWN-OUTPUT',
        outputCode: 'NOT_DEFINED',
        fieldKey: 'UnknownOutputField'
      }),
      mapping({
        id: 3,
        mappingKey: 'MAP-RETIRED-KPI',
        kpiId: 'SYN-RETIRED',
        fieldKey: 'RetiredKpiField'
      })
    ];

    const result = validateReportingMaps(mappings, [output()], requiredKpis, asOfDate);
    const issueCodes = result.issues.map(issue => issue.code);

    expect(result.ready).toBe(false);
    expect(issueCodes).toEqual(expect.arrayContaining([
      'ExpiredMapping',
      'UnknownOutput',
      'RetiredKpiMapping',
      'UnmappedRequiredKpi'
    ]));
    expect(result.mappedRequiredKpiCount).toBe(0);
    expect(result.requiredKpiCount).toBe(2);
  });

  it('detects an unapproved current mapping and a required output with no approved mapping', () => {
    const result = validateReportingMaps([
      mapping({ approvalStatus: 'Draft' })
    ], [output()], kpis, asOfDate);

    expect(result.ready).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'UnapprovedMapping',
      'UnmappedRequiredKpi',
      'UnmappedRequiredOutput'
    ]));
  });

  it('filters Audit by date, actor, event, entity and correlation/reference as a read-only view', () => {
    const records: IAdminAuditRecord[] = [
      {
        id: 1,
        auditKey: 'AUD-001',
        eventAt: '2026-08-20T09:00:00.000Z',
        actor: 'admin.one@example.invalid',
        eventType: 'KpiEdited',
        entityType: 'KPI',
        entityKey: 'SYN-001',
        correlationKey: 'CORR-001',
        sourceReference: 'CONTROL-001',
        beforeJson: '{"owner":"old"}',
        afterJson: '{"owner":"new"}',
        contextJson: '{"mode":"SafeLocalUat"}'
      },
      {
        id: 2,
        auditKey: 'AUD-002',
        eventAt: '2026-08-21T10:00:00.000Z',
        actor: 'admin.two@example.invalid',
        eventType: 'TargetEdited',
        entityType: 'AnnualTarget',
        entityKey: 'SYN-002-2026',
        correlationKey: 'CORR-002'
      }
    ];
    const before = JSON.stringify(records);

    const view = filterAuditEventsReadOnly(records, {
      dateFrom: '2026-08-19T00:00:00.000Z',
      dateTo: '2026-08-20T23:59:59.999Z',
      actor: 'admin.one',
      eventType: 'KpiEdited',
      entity: 'SYN-001',
      correlationOrReference: 'CONTROL-001'
    });

    expect(view).toMatchObject({ mode: 'ReadOnly', editAllowed: false });
    expect(view.records).toEqual([records[0]]);
    expect(view.records[0]).not.toBe(records[0]);
    expect(JSON.stringify(records)).toBe(before);
    expect(Object.keys(ReportingControlApi).filter(key => key.toLowerCase().indexOf('editaudit') >= 0)).toEqual([]);
  });

  it('treats date-only Audit bounds as inclusive UTC calendar days', () => {
    const records: IAdminAuditRecord[] = [
      { id: 1, auditKey: 'START', eventAt: '2026-08-19T00:00:00.000Z', actor: 'a', eventType: 'A', entityType: 'KPI', entityKey: '1' },
      { id: 2, auditKey: 'MIDDLE', eventAt: '2026-08-19T22:44:39.000Z', actor: 'b', eventType: 'B', entityType: 'Workplan', entityKey: '2' },
      { id: 3, auditKey: 'END', eventAt: '2026-08-19T23:59:59.999Z', actor: 'c', eventType: 'C', entityType: 'Target', entityKey: '3' },
      { id: 4, auditKey: 'NEXT', eventAt: '2026-08-20T00:00:00.000Z', actor: 'd', eventType: 'D', entityType: 'Target', entityKey: '4' }
    ];

    expect(filterAuditEventsReadOnly(records, { dateFrom: '2026-08-19' }).records.map(row => row.auditKey))
      .toEqual(['NEXT', 'END', 'MIDDLE', 'START']);
    expect(filterAuditEventsReadOnly(records, { dateTo: '2026-08-19' }).records.map(row => row.auditKey))
      .toEqual(['END', 'MIDDLE', 'START']);
    expect(filterAuditEventsReadOnly(records, { dateFrom: '2026-08-19', dateTo: '2026-08-19' })
      .records.map(row => row.auditKey)).toEqual(['END', 'MIDDLE', 'START']);
    expect(filterAuditEventsReadOnly(records, { dateFrom: '2026-08-20', dateTo: '2026-08-19' }).records)
      .toEqual([]);
    expect(filterAuditEventsReadOnly(records, {}).records).toHaveLength(4);
  });

  it('builds only server-bounded read-only Audit requests', () => {
    expect(buildBoundedAuditReadRequest({
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-22T23:59:59.999Z',
      actor: 'admin@example.invalid'
    })).toEqual({
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-22T23:59:59.999Z',
      actor: 'admin@example.invalid',
      operation: 'ReadOnly',
      maximumRangeDays: 93
    });
    expect(() => buildBoundedAuditReadRequest({ actor: 'admin@example.invalid' }))
      .toThrow('require valid dateFrom and dateTo');
    expect(() => buildBoundedAuditReadRequest({
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-08-22T00:00:00.000Z'
    })).toThrow('exceeds the bounded maximum');
  });

  it('fails all publication paths closed when any readiness input is unknown', () => {
    const result = assessReportingReadiness({});

    expect(result.publicationStatus).toBe('NOT READY');
    expect(result.weightedScorePublicationAllowed).toBe(false);
    expect(result.gold.status).toBe('NOT READY');
    expect(result.board.status).toBe('NOT READY');
    expect(result.external.status).toBe('NOT READY');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'KPI scoring metadata is not ready.',
      'KPI organisational weights are not ready.',
      'Workstream organisational weights are not ready.',
      'Reporting Map is not ready.',
      'Output Definitions are not ready.',
      'Unresolved Data Quality could not be confirmed.'
    ]));
  });

  it('allows publication only when every required configuration and data-quality gate is ready', () => {
    const result = assessReportingReadiness({
      kpiScoringMetadataReady: true,
      kpiWeightsReady: true,
      workstreamWeightsReady: true,
      reportingMapReady: true,
      outputDefinitionsReady: true,
      unresolvedDataQualityCount: 0
    });

    expect(result).toEqual({
      publicationStatus: 'READY',
      weightedScorePublicationAllowed: true,
      gold: { ready: true, status: 'READY', blockers: [] },
      board: { ready: true, status: 'READY', blockers: [] },
      external: { ready: true, status: 'READY', blockers: [] },
      blockers: []
    });
  });

  it('keeps Board publication closed when optional future Pillar weighting becomes required but is absent', () => {
    const result = assessReportingReadiness({
      kpiScoringMetadataReady: true,
      kpiWeightsReady: true,
      workstreamWeightsReady: true,
      boardPillarWeightsRequired: true,
      reportingMapReady: true,
      outputDefinitionsReady: true,
      unresolvedDataQualityCount: 0
    });

    expect(result.gold.ready).toBe(true);
    expect(result.external.ready).toBe(true);
    expect(result.board.ready).toBe(false);
    expect(result.publicationStatus).toBe('NOT READY');
    expect(result.board.blockers).toEqual(['Board Pillar weights are required but not ready.']);
  });
});
