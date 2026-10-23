import * as React from 'react';
import type { IAdminUatContext } from '../models/AdminFoundationModels';
import type { IOrganisationalWeightRecord } from '../services/ProductionPolicyStructures';
import type { IOrganisationalWeightExpectation } from '../services/OrganisationalWeightingPolicy';
import type {
  IAdminAnnualTargetRecord,
  IAdminAnnualTargetsUatState
} from '../services/AdminAnnualTargetsDomain';
import {
  addAnnualTargetSafeUat,
  createAnnualTargetsUatState,
  editAnnualTargetSafeUat
} from '../services/AdminAnnualTargetsDomain';
import type {
  IAdminBehaviourDefinitionRecord,
  IAdminBehaviourDefinitionsUatState
} from '../services/AdminBehaviourDefinitionsDomain';
import {
  createBehaviourDefinitionRevisionSafeUat,
  createBehaviourDefinitionsUatState
} from '../services/AdminBehaviourDefinitionsDomain';
import type {
  IAdminKpiMasterRecord,
  IAdminKpiMasterUatState
} from '../services/AdminKpiMasterDomain';
import {
  addKpiSafeUat,
  createAdminKpiMasterUatState,
  editKpiSafeUat,
  setKpiActiveSafeUat
} from '../services/AdminKpiMasterDomain';
import type {
  IAdminAuditRecord,
  IAdminOutputDefinition,
  IAdminReportingMapRecord
} from '../services/AdminReportingControlDomain';
import { validateAdminOutputDefinitionDraft } from '../services/AdminReportingControlDomain';
import type { IAdminOrganisationalWeightingUatState } from '../services/AdminOrganisationalWeightingUat';
import {
  buildAdminOrganisationalWeightingExpectations,
  createAdminOrganisationalWeightingUatState,
  selectAdminOrganisationalWeightingPeriod,
  setAdminOrganisationalWeightSafeUat
} from '../services/AdminOrganisationalWeightingUat';
import AdminReportingControlPage from './AdminReportingControlPage';

export const ADMIN_REPORTING_CONTROL_UAT_ACTOR = 'synthetic.reporting.admin@example.invalid';
export const ADMIN_REPORTING_CONTROL_UAT_AS_OF = '2026-08-22T12:00:00.000Z';
export const ADMIN_REPORTING_CONTROL_UAT_MUTATION_AT = '2026-08-22T12:30:00.000Z';
export const ADMIN_REPORTING_CONTROL_UAT_YEAR = '2026/27';

export interface IAdminReportingControlReadOnlySnapshot {
  mode?: 'ProductionReadOnly';
  performanceYear?: number;
  loadedAt?: string;
  kpis?: readonly IAdminKpiMasterRecord[];
  annualTargets?: readonly IAdminAnnualTargetRecord[];
  behaviourDefinitions?: readonly IAdminBehaviourDefinitionRecord[];
  weightingPerformanceYear?: number;
  weightingVersion?: string;
  weightingExpectations?: readonly IOrganisationalWeightExpectation[];
  organisationalWeights?: readonly IOrganisationalWeightRecord[];
  reportingMaps?: readonly IAdminReportingMapRecord[];
  outputDefinitions?: readonly IAdminOutputDefinition[];
  auditRecords?: readonly IAdminAuditRecord[];
  auditEvents?: readonly IAdminAuditRecord[];
  auditReadRequest?: {
    dateFrom?: string;
    dateTo?: string;
    maximumRangeDays: number;
  };
  warnings?: readonly string[];
  unresolvedDataQualityCount?: number;
  sourceMessage?: string;
}

export interface IAdminReportingControlUatHarnessProps {
  productionIdentity: string;
  baseline?: IAdminReportingControlReadOnlySnapshot;
  liveReadOnlySnapshot?: IAdminReportingControlReadOnlySnapshot;
  asOfDate?: string;
  editablePerformanceYear?: string;
  loadMessage?: string;
}

export const buildAdminReportingControlUatKpis = (): IAdminKpiMasterRecord[] => {
  const records: IAdminKpiMasterRecord[] = [];
  for (let index = 1; index <= 109; index += 1) {
    const padded = index < 10 ? '00' + index : (index < 100 ? '0' + index : String(index));
    records.push({
      id: index,
      kpiId: 'SYN-' + padded,
      kpiVersionKey: 'SYN-' + padded + '|v01',
      wording: 'Synthetic controlled KPI wording ' + padded,
      wordingSourceReference: 'SYNTHETIC-UAT-GOLD-' + padded,
      pillar: index <= 55 ? 'People' : 'Places',
      workstream: index % 3 === 0 ? 'Schools' : 'Community',
      active: true,
      owner: index % 2 ? 'synthetic.owner.one@example.invalid' : 'synthetic.owner.two@example.invalid',
      measureType: index % 2 ? 'Count' : 'Percentage',
      unit: index % 2 ? 'programmes' : '%',
      direction: index === 1 ? 'LowerIsBetter' : 'HigherIsBetter',
      aggregationMethod: 'DirectMetric',
      reportingStatus: index === 1 ? 'Included' : 'Excluded',
      scoringPolicyApproved: index === 1 ? false : undefined
    });
  }
  return records;
};

export const buildAdminReportingControlUatTargets = (): IAdminAnnualTargetRecord[] => [
  {
    id: 1,
    kpiId: 'SYN-001',
    performanceYear: '2025/26',
    targetVersionKey: 'SYN-001|2025|v01',
    annualTarget: 100,
    q1Target: 25,
    q2Target: 50,
    q3Target: 75,
    q4Target: 100,
    status: 'Approved',
    owner: 'synthetic.owner.one@example.invalid',
    modifiedAt: '2025-08-01T09:00:00.000Z',
    modifiedBy: 'synthetic.control@example.invalid'
  },
  {
    id: 2,
    kpiId: 'SYN-001',
    performanceYear: ADMIN_REPORTING_CONTROL_UAT_YEAR,
    targetVersionKey: 'SYN-001|2026|v01',
    annualTarget: 120,
    q1Target: 30,
    q2Target: 60,
    q3Target: 90,
    q4Target: 120,
    status: 'Draft',
    owner: 'synthetic.owner.one@example.invalid',
    modifiedAt: '2026-08-01T09:00:00.000Z',
    modifiedBy: 'synthetic.control@example.invalid'
  }
];

const promptsFor = (index: number): string[] => [
  'What outcome demonstrates synthetic Behaviour ' + index + '?',
  'What evidence will be retained for synthetic Behaviour ' + index + '?',
  'Who benefits from synthetic Behaviour ' + index + '?',
  'When will synthetic Behaviour ' + index + ' be reviewed?',
  'What support is needed for synthetic Behaviour ' + index + '?'
];

export const buildAdminReportingControlUatBehaviours = (): IAdminBehaviourDefinitionRecord[] => {
  const records: IAdminBehaviourDefinitionRecord[] = [];
  for (let index = 1; index <= 5; index += 1) {
    records.push({
      id: index,
      behaviourId: 'BEH-' + index,
      behaviourVersionKey: 'BEH-' + index + '|v01',
      title: 'Synthetic Behaviour ' + index,
      description: 'Synthetic signed Behaviour description ' + index + '.',
      guidancePrompts: promptsFor(index),
      active: true,
      published: true,
      isCurrent: true,
      modifiedAt: '2026-08-01T09:00:00.000Z',
      modifiedBy: 'synthetic.control@example.invalid'
    });
  }
  return records;
};

export const buildAdminReportingControlUatWeightingExpectations = (): IOrganisationalWeightExpectation[] => [
  { weightLevel: 'KPIWithinWorkstream', parentKey: 'P-PEOPLE|WS-COMMUNITY', childKey: 'SYN-001', active: true },
  { weightLevel: 'KPIWithinWorkstream', parentKey: 'P-PEOPLE|WS-COMMUNITY', childKey: 'SYN-002', active: true },
  { weightLevel: 'WorkstreamWithinPillar', parentKey: 'P-PEOPLE', childKey: 'P-PEOPLE|WS-COMMUNITY', active: true }
];

export const buildAdminReportingControlUatOutputs = (): IAdminOutputDefinition[] => [{
  id: 1,
  outputCode: 'SYN_OUTPUT',
  outputName: 'Synthetic UAT output',
  description: 'Synthetic governed output used only by the browser-memory Admin UAT fixture.',
  active: true,
  reportingFrequency: 'Annual',
  mappingRequirement: 'Required',
  outputFormat: 'JSON',
  effectiveFrom: '2026-04-01',
  version: 'schema-v01',
  publicationStatus: 'Approved',
  ownerEmail: 'synthetic.reporting.owner@example.invalid',
  changeReference: 'KCF-KPI-020B-UAT-OUTPUT-001',
  approvedByEmail: 'synthetic.reporting.approver@example.invalid',
  approvedAt: '2026-08-20T09:00:00.000Z'
}];

export const buildAdminReportingControlUatMaps = (): IAdminReportingMapRecord[] => [{
  id: 1,
  mappingKey: 'SYN-001|SYN_OUTPUT|v01',
  naturalKey: 'SYN-001|SYN_OUTPUT',
  kpiId: 'SYN-001',
  outputCode: 'SYN_OUTPUT',
  externalKey: 'SyntheticExternalField',
  treatment: 'Direct',
  sectionKey: 'SyntheticSection',
  fieldKey: 'SyntheticField',
  allocationPercent: 100,
  reportingCadence: 'Annual',
  effectiveFrom: '2026-04-01',
  active: true,
  version: 'v01',
  approvalStatus: 'Approved',
  changeReference: 'KCF-KPI-020B-UAT-MAP-001',
  approvedByEmail: 'synthetic.reporting.approver@example.invalid',
  approvedAt: '2026-08-20T09:00:00.000Z'
}];

export const buildAdminReportingControlUatAudit = (): IAdminAuditRecord[] => [{
  id: 1,
  auditKey: 'SYN-UAT-BASELINE-001',
  eventAt: '2026-08-20T09:00:00.000Z',
  actor: 'synthetic.control@example.invalid',
  eventType: 'ReadOnlyBaselineLoaded',
  entityType: 'AdminReportingControl',
  entityKey: 'SYNTHETIC-UAT',
  correlationKey: 'KCF-KPI-020B-UAT',
  sourceReference: 'Synthetic browser-memory fixture',
  contextJson: '{"persistence":"BrowserMemoryOnly"}'
}];

const cloneKpi = (record: IAdminKpiMasterRecord): IAdminKpiMasterRecord => ({
  ...record,
  scoringMetadataIssues: (record.scoringMetadataIssues || []).slice()
});
const cloneTarget = (record: IAdminAnnualTargetRecord): IAdminAnnualTargetRecord => ({ ...record });
const cloneBehaviour = (record: IAdminBehaviourDefinitionRecord): IAdminBehaviourDefinitionRecord => ({
  ...record,
  guidancePrompts: record.guidancePrompts.slice()
});
const cloneWeight = (record: IOrganisationalWeightRecord): IOrganisationalWeightRecord => ({ ...record });
const cloneExpectation = (record: IOrganisationalWeightExpectation): IOrganisationalWeightExpectation => ({ ...record });
const cloneMap = (record: IAdminReportingMapRecord): IAdminReportingMapRecord => ({ ...record });
const cloneOutput = (record: IAdminOutputDefinition): IAdminOutputDefinition => ({ ...record });
const cloneAudit = (record: IAdminAuditRecord): IAdminAuditRecord => ({ ...record });
const normaliseKey = (value: string): string => value.trim().toLowerCase();
const nextCollectionId = (records: readonly { id: number }[]): number => {
  let maximum = 0;
  records.forEach(record => { if (record.id > maximum) maximum = record.id; });
  return maximum + 1;
};

const mutationContext = (): IAdminUatContext => ({
  actorEmail: ADMIN_REPORTING_CONTROL_UAT_ACTOR,
  // Keep safe-UAT events inside the immutable fixture's bounded Audit window.
  // Wall-clock time made this regression fail as soon as the fixture date passed.
  occurredAt: ADMIN_REPORTING_CONTROL_UAT_MUTATION_AT
});

const auditFromKpi = (state: IAdminKpiMasterUatState): IAdminAuditRecord[] => state.audit.map(event => ({
  id: 1000 + event.sequence,
  auditKey: 'KPI-UAT-' + event.sequence,
  eventAt: event.occurredAt,
  actor: event.actorEmail,
  eventType: event.action,
  entityType: 'KPI',
  entityKey: event.kpiId + '|' + event.kpiVersionKey,
  correlationKey: 'KCF-KPI-020B-KPI-UAT',
  beforeJson: event.beforeJson,
  afterJson: event.afterJson,
  contextJson: '{"persistence":"BrowserMemoryOnly"}'
}));

const auditFromTargets = (state: IAdminAnnualTargetsUatState): IAdminAuditRecord[] => state.audit.map(event => ({
  id: 2000 + event.sequence,
  auditKey: 'TARGET-UAT-' + event.sequence,
  eventAt: event.occurredAt,
  actor: event.actorEmail,
  eventType: event.action,
  entityType: 'AnnualTarget',
  entityKey: event.kpiId + '|' + event.performanceYear + '|' + event.targetVersionKey,
  correlationKey: 'KCF-KPI-020B-TARGET-UAT',
  beforeJson: event.beforeJson,
  afterJson: event.afterJson,
  contextJson: '{"persistence":"BrowserMemoryOnly"}'
}));

const auditFromBehaviours = (state: IAdminBehaviourDefinitionsUatState): IAdminAuditRecord[] => state.audit.map(event => ({
  id: 3000 + event.sequence,
  auditKey: 'BEHAVIOUR-UAT-' + event.sequence,
  eventAt: event.occurredAt,
  actor: event.actorEmail,
  eventType: event.action,
  entityType: 'BehaviourDefinition',
  entityKey: event.behaviourId + '|' + event.behaviourVersionKey,
  correlationKey: 'KCF-KPI-020B-BEHAVIOUR-UAT',
  beforeJson: event.beforeJson,
  afterJson: event.afterJson,
  contextJson: '{"persistence":"BrowserMemoryOnly"}'
}));

const auditFromWeights = (state: IAdminOrganisationalWeightingUatState): IAdminAuditRecord[] => state.audit.map(event => ({
  id: 4000 + event.sequence,
  auditKey: 'WEIGHT-UAT-' + event.sequence,
  eventAt: event.occurredAt,
  actor: event.actorEmail,
  eventType: event.action,
  entityType: 'OrganisationalWeight',
  entityKey: event.weightLevel + '|' + event.parentKey + '|' + event.childKey,
  correlationKey: 'KCF-KPI-020B-WEIGHT-UAT',
  beforeJson: JSON.stringify({ weightPercent: event.previousWeightPercent }),
  afterJson: JSON.stringify({ weightPercent: event.nextWeightPercent }),
  contextJson: '{"persistence":"BrowserMemoryOnly","autofill":false}'
}));

const AdminReportingControlUatHarness: React.FC<IAdminReportingControlUatHarnessProps> = props => {
  const snapshot = props.liveReadOnlySnapshot || props.baseline;
  const inferredEditableYear = snapshot?.annualTargets?.filter(target => (
    !snapshot.performanceYear || target.performanceYear.indexOf(String(snapshot.performanceYear)) === 0
  ))[0]?.performanceYear;
  const editableYear = props.editablePerformanceYear
    || inferredEditableYear
    || ADMIN_REPORTING_CONTROL_UAT_YEAR;
  const weightingExpectations = snapshot?.weightingExpectations
    || (snapshot?.kpis
      ? buildAdminOrganisationalWeightingExpectations(snapshot.kpis)
      : buildAdminReportingControlUatWeightingExpectations());
  const [kpiState, setKpiState] = React.useState<IAdminKpiMasterUatState>(() => createAdminKpiMasterUatState(
    (snapshot?.kpis || buildAdminReportingControlUatKpis()).map(cloneKpi)
  ));
  const [targetState, setTargetState] = React.useState<IAdminAnnualTargetsUatState>(() => createAnnualTargetsUatState(
    (snapshot?.annualTargets || buildAdminReportingControlUatTargets()).map(cloneTarget),
    editableYear
  ));
  const [behaviourState, setBehaviourState] = React.useState<IAdminBehaviourDefinitionsUatState>(() => createBehaviourDefinitionsUatState(
    (snapshot?.behaviourDefinitions || buildAdminReportingControlUatBehaviours()).map(cloneBehaviour)
  ));
  const [weightingState, setWeightingState] = React.useState<IAdminOrganisationalWeightingUatState>(() => createAdminOrganisationalWeightingUatState(
    snapshot?.weightingPerformanceYear || snapshot?.performanceYear || 2026,
    snapshot?.weightingVersion || (() => {
      const year = snapshot?.weightingPerformanceYear || snapshot?.performanceYear || 2026;
      const versions = Array.from(new Set((snapshot?.organisationalWeights || [])
        .filter(record => record.performanceYear === year)
        .map(record => record.version))).sort();
      return versions.length === 0 ? 'SYNTHETIC-UAT-v01' : (versions.length === 1 ? versions[0] : 'SELECT-VERSION');
    })(),
    props.asOfDate || snapshot?.loadedAt || ADMIN_REPORTING_CONTROL_UAT_AS_OF,
    weightingExpectations.map(cloneExpectation),
    (snapshot?.organisationalWeights || []).map(cloneWeight)
  ));
  const [reportingMaps, setReportingMaps] = React.useState<IAdminReportingMapRecord[]>(() => (
    snapshot?.reportingMaps === undefined ? buildAdminReportingControlUatMaps() : snapshot.reportingMaps.map(cloneMap)
  ));
  const [outputDefinitions, setOutputDefinitions] = React.useState<IAdminOutputDefinition[]>(() => (
    snapshot?.outputDefinitions === undefined ? buildAdminReportingControlUatOutputs() : snapshot.outputDefinitions.map(cloneOutput)
  ));
  const [localAudit, setLocalAudit] = React.useState<IAdminAuditRecord[]>([]);
  const baselineAudit = (
    snapshot?.auditRecords || snapshot?.auditEvents || buildAdminReportingControlUatAudit()
  ).map(cloneAudit);

  const appendLocalAudit = (
    eventType: string,
    entityType: string,
    entityKey: string,
    before: unknown,
    after: unknown
  ): void => {
    const occurredAt = mutationContext().occurredAt;
    setLocalAudit(current => current.concat([{
      id: 5000 + current.length + 1,
      auditKey: 'LOCAL-UAT-' + (current.length + 1),
      eventAt: occurredAt,
      actor: ADMIN_REPORTING_CONTROL_UAT_ACTOR,
      eventType,
      entityType,
      entityKey,
      correlationKey: 'KCF-KPI-020B-LOCAL-UAT',
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      contextJson: '{"persistence":"BrowserMemoryOnly","productionWrite":false}'
    }]));
  };

  const allAudit = baselineAudit
    .concat(auditFromKpi(kpiState))
    .concat(auditFromTargets(targetState))
    .concat(auditFromBehaviours(behaviourState))
    .concat(auditFromWeights(weightingState))
    .concat(localAudit);

  const addReportingMap = (draft: Omit<IAdminReportingMapRecord, 'id'>): void => {
    if (reportingMaps.some(record => normaliseKey(record.mappingKey) === normaliseKey(draft.mappingKey))) {
      throw new Error('Synthetic Reporting Map key already exists.');
    }
    const next = { ...draft, id: nextCollectionId(reportingMaps) };
    appendLocalAudit('ReportingMapAdded', 'ReportingMap', next.mappingKey, undefined, next);
    setReportingMaps(reportingMaps.map(cloneMap).concat([next]));
  };

  const editReportingMap = (mappingKey: string, patch: Partial<IAdminReportingMapRecord>): void => {
    const existing = reportingMaps.filter(record => record.mappingKey === mappingKey)[0];
    if (!existing) throw new Error('Synthetic Reporting Map row was not found.');
    const replacement = { ...cloneMap(existing), ...patch };
    appendLocalAudit('ReportingMapEdited', 'ReportingMap', mappingKey, existing, replacement);
    setReportingMaps(reportingMaps.map(record => record.mappingKey === mappingKey ? replacement : cloneMap(record)));
  };

  const addOutputDefinition = (draft: Omit<IAdminOutputDefinition, 'id'>): void => {
    if (outputDefinitions.some(record => normaliseKey(record.outputCode) === normaliseKey(draft.outputCode))) {
      throw new Error('Synthetic Output Code already exists.');
    }
    const validation = validateAdminOutputDefinitionDraft(draft);
    if (!validation.valid) {
      throw new Error('Output Definition was not added: ' + validation.issues.join(' '));
    }
    const next = { ...draft, id: nextCollectionId(outputDefinitions) };
    appendLocalAudit('OutputDefinitionAdded', 'OutputDefinition', next.outputCode, undefined, next);
    setOutputDefinitions(outputDefinitions.map(cloneOutput).concat([next]));
  };

  const editOutputDefinition = (outputCode: string, patch: Partial<IAdminOutputDefinition>): void => {
    const existing = outputDefinitions.filter(record => record.outputCode === outputCode)[0];
    if (!existing) throw new Error('Synthetic Output Definition was not found.');
    const replacement = { ...cloneOutput(existing), ...patch };
    const validation = validateAdminOutputDefinitionDraft(replacement);
    if (!validation.valid) {
      throw new Error('Output Definition was not saved: ' + validation.issues.join(' '));
    }
    appendLocalAudit('OutputDefinitionEdited', 'OutputDefinition', outputCode, existing, replacement);
    setOutputDefinitions(outputDefinitions.map(record => (
      record.outputCode === outputCode ? replacement : cloneOutput(record)
    )));
  };

  return <AdminReportingControlPage
    localUat
    productionIdentity={props.productionIdentity}
    actorEmail={ADMIN_REPORTING_CONTROL_UAT_ACTOR}
    asOfDate={props.asOfDate || snapshot?.loadedAt || ADMIN_REPORTING_CONTROL_UAT_AS_OF}
    editablePerformanceYear={editableYear}
    kpis={kpiState.records}
    annualTargets={targetState.records}
    behaviourDefinitions={behaviourState.records}
    weightingState={weightingState}
    reportingMaps={reportingMaps}
    outputDefinitions={outputDefinitions}
    auditRecords={allAudit}
    auditReadRequest={snapshot?.auditReadRequest}
    unresolvedDataQualityCount={snapshot ? snapshot.unresolvedDataQualityCount : 2}
    loadMessage={(props.loadMessage || snapshot?.sourceMessage || 'Synthetic safe-UAT fixture')
      + ' copied into isolated browser memory; refresh naturally resets all local changes'}
    onKpiAdd={draft => setKpiState(current => addKpiSafeUat(current, draft, mutationContext()))}
    onKpiEdit={(kpiId, versionKey, patch) => setKpiState(current => editKpiSafeUat(
      current, kpiId, versionKey, patch, mutationContext()
    ))}
    onKpiToggle={(kpiId, versionKey, active) => setKpiState(current => setKpiActiveSafeUat(
      current, kpiId, versionKey, active, mutationContext()
    ))}
    onAnnualTargetEdit={(kpiId, year, versionKey, patch) => setTargetState(current => editAnnualTargetSafeUat(
      current, kpiId, year, versionKey, patch, mutationContext()
    ))}
    onAnnualTargetAdd={draft => setTargetState(current => addAnnualTargetSafeUat(
      current, draft, mutationContext()
    ))}
    onBehaviourRevision={(behaviourId, versionKey, patch) => setBehaviourState(current => (
      createBehaviourDefinitionRevisionSafeUat(current, behaviourId, versionKey, patch, mutationContext())
    ))}
    onWeightChange={(target, weightPercent) => {
      setWeightingState(current => setAdminOrganisationalWeightSafeUat(
        current, target, weightPercent, mutationContext()
      ));
    }}
    onWeightingVersionChange={version => setWeightingState(current => selectAdminOrganisationalWeightingPeriod(
      current,
      current.performanceYear,
      version,
      current.asOfDate,
      current.expectedMembers
    ))}
    onReportingMapAdd={addReportingMap}
    onReportingMapEdit={editReportingMap}
    onOutputDefinitionAdd={addOutputDefinition}
    onOutputDefinitionEdit={editOutputDefinition}
  />;
};

export default AdminReportingControlUatHarness;
