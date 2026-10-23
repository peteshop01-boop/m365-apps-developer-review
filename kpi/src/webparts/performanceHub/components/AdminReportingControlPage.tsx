import * as React from 'react';
import type {
  IAdminAnnualTargetDraft,
  IAdminAnnualTargetEdit,
  IAdminAnnualTargetRecord
} from '../services/AdminAnnualTargetsDomain';
import { filterAnnualTargetsByYear } from '../services/AdminAnnualTargetsDomain';
import type {
  IAdminBehaviourDefinitionEdit,
  IAdminBehaviourDefinitionRecord
} from '../services/AdminBehaviourDefinitionsDomain';
import { inspectBehaviourDefinitions } from '../services/AdminBehaviourDefinitionsDomain';
import type {
  IAdminKpiMasterDraft,
  IAdminKpiMasterEdit,
  IAdminKpiMasterRecord
} from '../services/AdminKpiMasterDomain';
import {
  ADMIN_KPI_AGGREGATION_METHODS,
  ADMIN_KPI_METRIC_TYPES,
  ADMIN_KPI_SCORING_DIRECTIONS,
  assessAdminKpiScoringReadiness,
  filterAdminKpis,
  inspectAdminKpiMasterReadPath
} from '../services/AdminKpiMasterDomain';
import type {
  IAdminAuditRecord,
  IAdminOutputDefinition,
  IAdminReportingMapRecord
} from '../services/AdminReportingControlDomain';
import {
  assessReportingReadiness,
  buildBoundedAuditReadRequest,
  filterAuditEventsReadOnly,
  validateAdminOutputDefinitionDraft,
  validateOutputDefinitions,
  validateReportingMaps
} from '../services/AdminReportingControlDomain';
import type {
  IAdminOrganisationalWeightingUatState,
  IAdminOrganisationalWeightTarget
} from '../services/AdminOrganisationalWeightingUat';
import {
  buildAdminOrganisationalWeightingExpectations,
  createAdminOrganisationalWeightingReadOnlyState,
  getAdminOrganisationalWeightingReadiness,
  listAdminOrganisationalWeightRows,
  parseAdminOrganisationalWeightDraft
} from '../services/AdminOrganisationalWeightingUat';
import styles from './AdminReportingControlPage.module.scss';

export type AdminReportingControlArea =
  | 'readiness'
  | 'kpiMaster'
  | 'annualTargets'
  | 'behaviours'
  | 'weighting'
  | 'reportingMap'
  | 'outputs'
  | 'audit';

export interface IAdminReportingControlPageSnapshot {
  performanceYear: number;
  loadedAt: string;
  kpis: readonly IAdminKpiMasterRecord[];
  annualTargets: readonly IAdminAnnualTargetRecord[];
  behaviourDefinitions: readonly IAdminBehaviourDefinitionRecord[];
  organisationalWeights: IAdminOrganisationalWeightingUatState['records'];
  reportingMaps: readonly IAdminReportingMapRecord[];
  outputDefinitions: readonly IAdminOutputDefinition[];
  auditEvents: readonly IAdminAuditRecord[];
  auditReadRequest?: {
    dateFrom?: string;
    dateTo?: string;
    maximumRangeDays: number;
  };
  warnings?: readonly string[];
}

export interface IAdminReportingControlPageProps {
  localUat: boolean;
  productionIdentity: string;
  snapshot?: IAdminReportingControlPageSnapshot;
  actorEmail?: string;
  asOfDate?: string;
  editablePerformanceYear?: string;
  kpis?: readonly IAdminKpiMasterRecord[];
  annualTargets?: readonly IAdminAnnualTargetRecord[];
  behaviourDefinitions?: readonly IAdminBehaviourDefinitionRecord[];
  weightingState?: IAdminOrganisationalWeightingUatState;
  reportingMaps?: readonly IAdminReportingMapRecord[];
  outputDefinitions?: readonly IAdminOutputDefinition[];
  auditRecords?: readonly IAdminAuditRecord[];
  auditReadRequest?: IAdminReportingControlPageSnapshot['auditReadRequest'];
  unresolvedDataQualityCount?: number;
  loadMessage?: string;
  onKpiAdd?(draft: IAdminKpiMasterDraft): void;
  onKpiEdit?(kpiId: string, versionKey: string, patch: IAdminKpiMasterEdit): void;
  onKpiToggle?(kpiId: string, versionKey: string, active: boolean): void;
  onAnnualTargetAdd?(draft: IAdminAnnualTargetDraft): void;
  onAnnualTargetEdit?(
    kpiId: string,
    performanceYear: string,
    targetVersionKey: string,
    patch: IAdminAnnualTargetEdit
  ): void;
  onBehaviourRevision?(
    behaviourId: string,
    newVersionKey: string,
    patch: IAdminBehaviourDefinitionEdit
  ): void;
  onWeightChange?(target: IAdminOrganisationalWeightTarget, weightPercent: number | undefined): void;
  onWeightingVersionChange?(version: string): void;
  onReportingMapAdd?(draft: Omit<IAdminReportingMapRecord, 'id'>): void;
  onReportingMapEdit?(mappingKey: string, patch: Partial<IAdminReportingMapRecord>): void;
  onOutputDefinitionAdd?(draft: Omit<IAdminOutputDefinition, 'id'>): void;
  onOutputDefinitionEdit?(outputCode: string, patch: Partial<IAdminOutputDefinition>): void;
}

const areas: readonly { key: AdminReportingControlArea; label: string; description: string }[] = [
  { key: 'readiness', label: 'Reporting readiness', description: 'Fail-closed publication gates' },
  { key: 'kpiMaster', label: 'KPI Master', description: '109 versioned definitions' },
  { key: 'annualTargets', label: 'Annual Targets', description: 'Year-isolated targets' },
  { key: 'behaviours', label: 'Behaviour Definitions', description: 'Five definitions × five prompts' },
  { key: 'weighting', label: 'Organisational Weighting', description: 'GOLD hierarchy only' },
  { key: 'reportingMap', label: 'Reporting Map', description: 'KPI-to-output mappings' },
  { key: 'outputs', label: 'Output Definitions', description: 'Controlled outputs' },
  { key: 'audit', label: 'Audit Viewer', description: 'Read-only evidence' }
];

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();
const ADMIN_PLACEHOLDER_OWNER = 'synthetic.new.owner@example.invalid';

const uniqueSorted = (values: readonly string[]): string[] => {
  const result: string[] = [];
  values.forEach(value => {
    const cleaned = clean(value);
    if (cleaned && result.map(normalise).indexOf(normalise(cleaned)) < 0) result.push(cleaned);
  });
  return result.sort((left, right) => left.localeCompare(right));
};

const targetText = (value: number | string | undefined): string => (
  value === undefined ? '' : String(value)
);

const targetPatchValue = (value: string): number | string | undefined => {
  const cleaned = clean(value);
  if (!cleaned) return undefined;
  const numeric = Number(cleaned);
  return isFinite(numeric) ? numeric : cleaned;
};

const inputDate = (iso: string): string => clean(iso).slice(0, 10);

const startDateFor = (asOfDate: string): string => {
  const parsed = Date.parse(asOfDate);
  if (!isFinite(parsed)) return '';
  return new Date(parsed - (30 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
};

interface IWeightingIssueSummary {
  category: string;
  count: number;
  example: string;
}

const weightingIssueCategory = (issue: string): string => {
  const level = issue.indexOf('KPIWithinWorkstream ') === 0
    ? 'KPI-within-Workstream'
    : (issue.indexOf('WorkstreamWithinPillar ') === 0
      ? 'Workstream-within-Pillar'
      : (issue.indexOf('PillarWithinBoard ') === 0 ? 'Pillar-within-Board' : 'Other'));
  if (issue.indexOf('has no active weight') >= 0) return level + ': missing active weights';
  if (issue.indexOf('blank or invalid weight') >= 0) return level + ': blank or invalid weights';
  if (issue.indexOf('not CONTROL-approved') >= 0) return level + ': approval governance';
  if (issue.indexOf('incomplete source or effective-date governance') >= 0) return level + ': source/effective-date governance';
  if (issue.indexOf('total ') >= 0 && issue.indexOf('not 100%') >= 0) return level + ': group total is not 100%';
  if (issue.indexOf('duplicat') >= 0) return level + ': duplicates';
  return 'Other configuration issues';
};

const summariseWeightingIssues = (issues: readonly string[]): IWeightingIssueSummary[] => {
  const summaries: { [category: string]: IWeightingIssueSummary } = {};
  issues.forEach(issue => {
    const category = weightingIssueCategory(issue);
    if (!summaries[category]) summaries[category] = { category, count: 0, example: issue };
    summaries[category].count += 1;
  });
  return Object.keys(summaries).sort().map(category => summaries[category]).slice(0, 12);
};

const asIsoStart = (date: string): string | undefined => clean(date) ? clean(date) + 'T00:00:00.000Z' : undefined;
const asIsoEnd = (date: string): string | undefined => clean(date) ? clean(date) + 'T23:59:59.999Z' : undefined;

const buildReadOnlyWeightingState = (
  performanceYear: number,
  version: string,
  asOfDate: string,
  kpis: readonly IAdminKpiMasterRecord[],
  records: IAdminOrganisationalWeightingUatState['records']
): IAdminOrganisationalWeightingUatState => {
  const expectedMembers = buildAdminOrganisationalWeightingExpectations(kpis);
  return createAdminOrganisationalWeightingReadOnlyState(
    performanceYear,
    version || 'NOT-CONFIGURED',
    asOfDate,
    expectedMembers,
    records
  );
};

const AdminReportingControlPage: React.FC<IAdminReportingControlPageProps> = props => {
  const snapshot = props.snapshot;
  const kpis = props.kpis || snapshot?.kpis || [];
  const annualTargets = props.annualTargets || snapshot?.annualTargets || [];
  const behaviourDefinitions = props.behaviourDefinitions || snapshot?.behaviourDefinitions || [];
  const reportingMaps = props.reportingMaps || snapshot?.reportingMaps || [];
  const outputDefinitions = props.outputDefinitions || snapshot?.outputDefinitions || [];
  const auditRecords = props.auditRecords || snapshot?.auditEvents || [];
  const asOfDate = props.asOfDate || snapshot?.loadedAt || new Date().toISOString();
  const currentTargetYear = annualTargets.filter(target => (
    !snapshot?.performanceYear
    || target.performanceYear.indexOf(String(snapshot.performanceYear)) === 0
  ))[0]?.performanceYear;
  const editablePerformanceYear = props.editablePerformanceYear
    || currentTargetYear
    || annualTargets[0]?.performanceYear
    || String(snapshot?.performanceYear || new Date().getUTCFullYear());
  const weightingYear = props.weightingState?.performanceYear
    || snapshot?.performanceYear || new Date().getUTCFullYear();
  const weightingRecords = props.weightingState?.records || snapshot?.organisationalWeights || [];
  const availableWeightingVersions = uniqueSorted(weightingRecords
    .filter(record => record.performanceYear === weightingYear)
    .map(record => record.version));
  const [readOnlyWeightingVersion, setReadOnlyWeightingVersion] = React.useState(
    availableWeightingVersions.length === 1 ? availableWeightingVersions[0] : ''
  );
  React.useEffect(() => {
    if (!props.weightingState && !readOnlyWeightingVersion && availableWeightingVersions.length === 1) {
      setReadOnlyWeightingVersion(availableWeightingVersions[0]);
    }
  }, [availableWeightingVersions.join('|'), props.weightingState, readOnlyWeightingVersion]);
  const weightingState = props.weightingState || buildReadOnlyWeightingState(
    weightingYear,
    readOnlyWeightingVersion,
    asOfDate,
    kpis,
    weightingRecords
  );
  const actorEmail = props.actorEmail || 'read-only production identity';
  const [area, setArea] = React.useState<AdminReportingControlArea>('readiness');
  const [status, setStatus] = React.useState('Choose an Admin reporting-control area.');
  const [kpiSearch, setKpiSearch] = React.useState('');
  const [kpiPillar, setKpiPillar] = React.useState('');
  const [kpiWorkstream, setKpiWorkstream] = React.useState('');
  const [kpiActivity, setKpiActivity] = React.useState<'All' | 'Active' | 'Inactive'>('All');
  const [kpiReadiness, setKpiReadiness] = React.useState<'All' | 'Ready' | 'NotReady'>('All');
  const [selectedKpiIdentity, setSelectedKpiIdentity] = React.useState('');
  const [kpiDraft, setKpiDraft] = React.useState({
    owner: '', measureType: '', unit: '', direction: '', aggregationMethod: '', reportingStatus: ''
  });
  const [newKpiDraft, setNewKpiDraft] = React.useState({
    kpiId: 'SYN-NEW', versionKey: 'SYN-NEW|v01', wording: 'Synthetic new KPI definition',
    sourceReference: 'SYNTHETIC-UAT-SOURCE', pillar: 'People', workstream: 'Community',
    owner: ADMIN_PLACEHOLDER_OWNER, measureType: 'Count', unit: 'items',
    direction: 'HigherIsBetter', aggregationMethod: 'DirectMetric', reportingStatus: 'Excluded'
  });
  const [targetYear, setTargetYear] = React.useState(editablePerformanceYear);
  const [targetSearch, setTargetSearch] = React.useState('');
  const [selectedTargetIdentity, setSelectedTargetIdentity] = React.useState('');
  const [targetDraft, setTargetDraft] = React.useState({
    annualTarget: '', q1Target: '', q2Target: '', q3Target: '', q4Target: '', status: 'Draft'
  });
  const [newTargetDraft, setNewTargetDraft] = React.useState({
    kpiId: 'SYN-NEW', targetVersionKey: 'SYN-NEW|' + editablePerformanceYear + '|v01',
    annualTarget: '', q1Target: '', q2Target: '', q3Target: '', q4Target: '', status: 'Draft'
  });
  const [selectedBehaviourId, setSelectedBehaviourId] = React.useState('');
  const [behaviourDraft, setBehaviourDraft] = React.useState({
    versionKey: '', title: '', description: '', prompts: ['', '', '', '', '']
  });
  const [weightDrafts, setWeightDrafts] = React.useState<{ [key: string]: string }>({});
  const [weightErrors, setWeightErrors] = React.useState<{ [key: string]: string }>({});
  const [weightLevelFilter, setWeightLevelFilter] = React.useState('All');
  const [weightStateFilter, setWeightStateFilter] = React.useState<'All' | 'Configured' | 'Missing'>('All');
  const [selectedMapKey, setSelectedMapKey] = React.useState('');
  const [mapDraft, setMapDraft] = React.useState({
    naturalKey: '', externalKey: '', sectionKey: '', fieldKey: '', allocationPercent: '100',
    treatmentRuleJson: '', reportingCadence: 'Annual', changeReference: '',
    effectiveFrom: '', effectiveTo: '', treatment: 'Direct', approvalStatus: 'Draft',
    approvedByEmail: '', approvedAt: '', active: false
  });
  const [newMapDraft, setNewMapDraft] = React.useState({
    mappingKey: 'SYN-NEW|SYN_OUTPUT|v01', kpiId: 'SYN-002', outputCode: 'SYN_OUTPUT',
    externalKey: 'SyntheticNewField', version: 'v01', treatment: 'Direct', allocationPercent: '100',
    treatmentRuleJson: '', reportingCadence: 'Annual', changeReference: 'KCF-KPI-020B-UAT-MAP-NEW',
    effectiveFrom: inputDate(asOfDate)
  });
  const [selectedOutputCode, setSelectedOutputCode] = React.useState('');
  const [outputDraft, setOutputDraft] = React.useState({
    outputName: '', description: '', reportingFrequency: '', mappingRequirement: '', outputFormat: '',
    ownerEmail: '', changeReference: '', effectiveFrom: '', effectiveTo: '', version: '',
    publicationStatus: 'Draft', approvedByEmail: '', approvedAt: '', active: false
  });
  const [newOutputDraft, setNewOutputDraft] = React.useState({
    outputCode: 'SYN_OUTPUT_NEW', outputName: 'Synthetic new output',
    description: 'Synthetic governed output draft for browser-memory UAT only.', reportingFrequency: 'Annual',
    mappingRequirement: 'Optional', outputFormat: 'JSON',
    ownerEmail: 'synthetic.reporting.owner@example.invalid',
    changeReference: 'KCF-KPI-020B-UAT-OUTPUT-NEW', effectiveFrom: inputDate(asOfDate), version: 'schema-v01'
  });
  const [outputEditErrors, setOutputEditErrors] = React.useState<{ [field: string]: string }>({});
  const [newOutputErrors, setNewOutputErrors] = React.useState<{ [field: string]: string }>({});
  const auditReadRequest = props.auditReadRequest || snapshot?.auditReadRequest;
  const loadedAuditFrom = auditReadRequest?.dateFrom || '';
  const loadedAuditTo = auditReadRequest?.dateTo || '';
  const loadedAuditMaximumDays = auditReadRequest?.maximumRangeDays || 90;
  const [auditFrom, setAuditFrom] = React.useState(inputDate(loadedAuditFrom) || startDateFor(asOfDate));
  const [auditTo, setAuditTo] = React.useState(inputDate(loadedAuditTo) || inputDate(asOfDate));
  const [auditActor, setAuditActor] = React.useState('');
  const [auditEvent, setAuditEvent] = React.useState('');
  const [auditEntity, setAuditEntity] = React.useState('');
  const [auditReference, setAuditReference] = React.useState('');

  const canMutate = props.localUat;
  const kpiRead = inspectAdminKpiMasterReadPath(kpis);
  const behaviourInspection = inspectBehaviourDefinitions(behaviourDefinitions);
  const weighting = getAdminOrganisationalWeightingReadiness(weightingState);
  const outputs = validateOutputDefinitions(outputDefinitions, asOfDate);
  const activeKpisWithUnknownReportingStatus = kpis.filter(kpi => kpi.active
    && kpi.reportingStatus !== 'Included'
    && kpi.reportingStatus !== 'ContextOnly'
    && kpi.reportingStatus !== 'Excluded');
  const reportingEligibilityKnown = kpis.some(kpi => kpi.active)
    && activeKpisWithUnknownReportingStatus.length === 0;
  const mappings = validateReportingMaps(
    reportingMaps,
    outputDefinitions,
    kpis.map(kpi => ({
      kpiId: kpi.kpiId,
      active: kpi.active,
      requiredForReporting: kpi.reportingStatus === 'Included'
    })),
    asOfDate
  );
  const kpiWeightsReady = weighting.publicationReady && weighting.workstreamKpiTotals.length > 0
    && weighting.workstreamKpiTotals.every(total => total.ready);
  const workstreamWeightsReady = weighting.publicationReady && weighting.pillarWorkstreamTotals.length > 0
    && weighting.pillarWorkstreamTotals.every(total => total.ready);
  const boardPillarWeightsRequired = weighting.boardPillarTotals.length > 0;
  const readiness = assessReportingReadiness({
    kpiScoringMetadataReady: kpiRead.valid && kpiRead.activeCount > 0 && kpiRead.activeNotReadyCount === 0,
    kpiWeightsReady,
    workstreamWeightsReady,
    boardPillarWeightsRequired,
    boardPillarWeightsReady: boardPillarWeightsRequired
      ? weighting.boardPillarTotals.every(total => total.ready)
      : undefined,
    reportingMapReady: mappings.ready && reportingEligibilityKnown,
    outputDefinitionsReady: outputs.ready,
    unresolvedDataQualityCount: props.unresolvedDataQualityCount
  });

  const run = (action: () => void, success: string): void => {
    try {
      action();
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The Admin action was blocked.');
    }
  };

  const kpiIdentity = (record: IAdminKpiMasterRecord): string => record.kpiId + '|' + record.kpiVersionKey;
  const targetIdentity = (record: IAdminAnnualTargetRecord): string => (
    record.kpiId + '|' + record.performanceYear + '|' + record.targetVersionKey
  );
  const weightIdentity = (target: IAdminOrganisationalWeightTarget): string => (
    target.weightLevel + '|' + target.parentKey + '|' + target.childKey
  );

  const selectedKpi = kpis.filter(kpi => kpiIdentity(kpi) === selectedKpiIdentity)[0];
  const selectedTarget = annualTargets.filter(target => targetIdentity(target) === selectedTargetIdentity)[0];
  const currentBehaviours = behaviourDefinitions.filter(record => record.isCurrent && record.published);
  const behaviourHistory = behaviourDefinitions.filter(record => !record.isCurrent || !record.published);
  const selectedBehaviour = currentBehaviours.filter(record => record.behaviourId === selectedBehaviourId)[0];
  const selectedMap = reportingMaps.filter(mapping => mapping.mappingKey === selectedMapKey)[0];
  const selectedOutput = outputDefinitions.filter(output => output.outputCode === selectedOutputCode)[0];
  const weightRows = listAdminOrganisationalWeightRows(weightingState);
  const filteredWeightRows = weightRows.filter(row => (
    (weightLevelFilter === 'All' || row.weightLevel === weightLevelFilter)
    && (weightStateFilter === 'All'
      || (weightStateFilter === 'Configured' ? row.stored : !row.stored))
  ));
  const weightingIssueSummaries = summariseWeightingIssues(weighting.errors);
  const filteredKpis = filterAdminKpis(kpis, {
    search: kpiSearch,
    pillars: kpiPillar ? [kpiPillar] : [],
    workstreams: kpiWorkstream ? [kpiWorkstream] : [],
    activity: kpiActivity,
    readiness: kpiReadiness
  });
  const filteredTargets = filterAnnualTargetsByYear(annualTargets, targetYear).filter(target => {
    const needle = normalise(targetSearch);
    return !needle || [target.kpiId, target.targetVersionKey, target.owner, target.status]
      .some(value => normalise(value).indexOf(needle) >= 0);
  });

  const requestedAuditFrom = asIsoStart(auditFrom);
  const requestedAuditTo = asIsoEnd(auditTo);
  const loadedAuditFromMs = Date.parse(loadedAuditFrom);
  const loadedAuditToMs = Date.parse(loadedAuditTo);
  const requestedAuditFromMs = Date.parse(requestedAuditFrom || '');
  const requestedAuditToMs = Date.parse(requestedAuditTo || '');
  const effectiveAuditFrom = isFinite(loadedAuditFromMs)
    ? new Date(isFinite(requestedAuditFromMs)
      ? Math.max(loadedAuditFromMs, requestedAuditFromMs)
      : loadedAuditFromMs).toISOString()
    : requestedAuditFrom;
  const effectiveAuditTo = isFinite(loadedAuditToMs)
    ? new Date(isFinite(requestedAuditToMs)
      ? Math.min(loadedAuditToMs, requestedAuditToMs)
      : loadedAuditToMs).toISOString()
    : requestedAuditTo;
  const auditFilter = {
    dateFrom: effectiveAuditFrom,
    dateTo: effectiveAuditTo,
    actor: auditActor,
    eventType: auditEvent,
    entity: auditEntity,
    correlationOrReference: auditReference
  };
  let boundedAuditIssue = '';
  try {
    const loadedFromDate = inputDate(loadedAuditFrom);
    const loadedToDate = inputDate(loadedAuditTo);
    if ((loadedFromDate && auditFrom && auditFrom < loadedFromDate)
      || (loadedToDate && auditTo && auditTo > loadedToDate)) {
      throw new Error('Audit filters must remain inside the preloaded read-only snapshot window.');
    }
    buildBoundedAuditReadRequest(auditFilter, loadedAuditMaximumDays);
  } catch (error) {
    boundedAuditIssue = error instanceof Error ? error.message : 'Audit date range is invalid.';
  }
  const auditView = boundedAuditIssue
    ? { mode: 'ReadOnly' as const, editAllowed: false as const, records: [] as readonly IAdminAuditRecord[] }
    : filterAuditEventsReadOnly(auditRecords, auditFilter);

  const chooseKpi = (kpi: IAdminKpiMasterRecord): void => {
    setSelectedKpiIdentity(kpiIdentity(kpi));
    setKpiDraft({
      owner: kpi.owner,
      measureType: kpi.measureType,
      unit: kpi.unit,
      direction: kpi.direction,
      aggregationMethod: kpi.aggregationMethod,
      reportingStatus: kpi.reportingStatus || ''
    });
  };

  const chooseTarget = (target: IAdminAnnualTargetRecord): void => {
    setSelectedTargetIdentity(targetIdentity(target));
    setTargetDraft({
      annualTarget: targetText(target.annualTarget),
      q1Target: targetText(target.q1Target),
      q2Target: targetText(target.q2Target),
      q3Target: targetText(target.q3Target),
      q4Target: targetText(target.q4Target),
      status: target.status
    });
  };

  const chooseBehaviour = (record: IAdminBehaviourDefinitionRecord): void => {
    setSelectedBehaviourId(record.behaviourId);
    setBehaviourDraft({
      versionKey: record.behaviourVersionKey + '-DRAFT',
      title: record.title,
      description: record.description,
      prompts: record.guidancePrompts.slice(0, 5) as string[]
    });
  };

  const chooseMap = (record: IAdminReportingMapRecord): void => {
    setSelectedMapKey(record.mappingKey);
    setMapDraft({
      naturalKey: record.naturalKey || [record.kpiId, record.outputCode].join('|'),
      externalKey: record.externalKey || '',
      sectionKey: record.sectionKey || '',
      fieldKey: record.fieldKey || '',
      allocationPercent: record.allocationPercent === undefined ? '' : String(record.allocationPercent),
      treatmentRuleJson: record.treatmentRuleJson || '',
      reportingCadence: record.reportingCadence || '',
      changeReference: record.changeReference || '',
      effectiveFrom: inputDate(record.effectiveFrom),
      effectiveTo: inputDate(record.effectiveTo || ''),
      treatment: record.treatment || 'Direct',
      approvalStatus: record.approvalStatus,
      approvedByEmail: record.approvedByEmail || '',
      approvedAt: record.approvedAt || '',
      active: record.active
    });
  };

  const chooseOutput = (record: IAdminOutputDefinition): void => {
    setSelectedOutputCode(record.outputCode);
    setOutputEditErrors({});
    setOutputDraft({
      outputName: record.outputName,
      description: record.description || '',
      reportingFrequency: record.reportingFrequency,
      mappingRequirement: record.mappingRequirement || '',
      outputFormat: record.outputFormat || '',
      ownerEmail: record.ownerEmail || '',
      changeReference: record.changeReference || '',
      effectiveFrom: inputDate(record.effectiveFrom),
      effectiveTo: inputDate(record.effectiveTo || ''),
      version: record.version,
      publicationStatus: record.publicationStatus,
      approvedByEmail: record.approvedByEmail || '',
      approvedAt: record.approvedAt || '',
      active: record.active
    });
  };

  const renderReadiness = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}>
        <span>Fail-closed publication control</span>
        <h2>Can GOLD, Board or external reporting be published?</h2>
        <p>Every required configuration gate must be positively ready. Unknown, blank or invalid configuration stays NOT READY.</p>
      </div>
      {snapshot?.warnings && snapshot.warnings.length > 0 && <div className={styles.issueBox}>
        <strong>Read-only baseline warnings</strong>
        {snapshot.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      </div>}
      <div className={styles.readinessGrid}>
        {[
          { label: 'GOLD weighted score', value: readiness.gold },
          { label: 'Board reporting', value: readiness.board },
          { label: 'External reporting', value: readiness.external },
          { label: 'Final publication', value: { ...readiness.gold, ready: readiness.publicationStatus === 'READY', status: readiness.publicationStatus, blockers: readiness.blockers } }
        ].map(card => <article className={styles.readinessCard} key={card.label}>
          <h3>{card.label}</h3>
          <span className={card.value.ready ? styles.ready : styles.notReady}>{card.value.status}</span>
          {card.value.blockers.length
            ? card.value.blockers.map(blocker => <p key={blocker}>{blocker}</p>)
            : <p>All required controls are positively ready.</p>}
        </article>)}
      </div>
      <div className={styles.stats}>
        <article className={styles.stat}><strong>{kpiRead.activeReadyCount}/{kpiRead.activeCount}</strong><span>active KPI scoring records ready</span></article>
        <article className={styles.stat}><strong>{weighting.configurationState}</strong><span>organisational weighting</span></article>
        <article className={styles.stat}><strong>{mappings.ready ? 'READY' : 'NOT READY'}</strong><span>Reporting Map</span></article>
        <article className={styles.stat}><strong>{outputs.ready ? 'READY' : 'NOT READY'}</strong><span>Output Definitions</span></article>
      </div>
      {readiness.blockers.length > 0 && <div className={styles.issueBox}>
        <strong>Publication blockers</strong>
        {readiness.blockers.map(blocker => <p key={blocker}>{blocker}</p>)}
        {!reportingEligibilityKnown && <p>KPI ReportingStatus Included/ContextOnly/Excluded is unknown; required mappings are not inferred.</p>}
      </div>}
    </>
  );

  const renderKpiMaster = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}>
        <span>Raw full-version catalogue</span><h2>KPI Master Admin</h2>
        <p>{kpiRead.recordCount} records read; {kpiRead.activeNotReadyCount} active record(s) have incomplete scoring/configuration metadata. Historic definitions are never deleted.</p>
      </div>
      {!kpiRead.valid && <div className={styles.issueBox}>{kpiRead.issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
      <div className={styles.filters}>
        <label className={styles.field}><span>Search KPIs</span><input type="search" value={kpiSearch} onChange={event => setKpiSearch(event.currentTarget.value)} /></label>
        <label className={styles.field}><span>Pillar</span><select value={kpiPillar} onChange={event => { setKpiPillar(event.currentTarget.value); setKpiWorkstream(''); }}><option value="">All Pillars</option>{uniqueSorted(kpis.map(kpi => kpi.pillar)).map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>Workstream</span><select value={kpiWorkstream} onChange={event => setKpiWorkstream(event.currentTarget.value)}><option value="">All Workstreams</option>{uniqueSorted(kpis.filter(kpi => !kpiPillar || kpi.pillar === kpiPillar).map(kpi => kpi.workstream)).map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>Active state</span><select value={kpiActivity} onChange={event => setKpiActivity(event.currentTarget.value as typeof kpiActivity)}><option>All</option><option>Active</option><option>Inactive</option></select></label>
        <label className={styles.field}><span>Scoring readiness</span><select value={kpiReadiness} onChange={event => setKpiReadiness(event.currentTarget.value as typeof kpiReadiness)}><option>All</option><option>Ready</option><option>NotReady</option></select></label>
        <button type="button" onClick={() => { setKpiSearch(''); setKpiPillar(''); setKpiWorkstream(''); setKpiActivity('All'); setKpiReadiness('All'); }}>Clear filters</button>
      </div>
      <div className={styles.twoColumn}>
        <section className={styles.panel}><h3>{filteredKpis.length} KPI(s) shown</h3><div className={styles.list}>
          {filteredKpis.map(kpi => {
            const assessment = assessAdminKpiScoringReadiness(kpi);
            return <button type="button" className={selectedKpiIdentity === kpiIdentity(kpi) ? styles.selectedCard : styles.card} key={kpiIdentity(kpi)} onClick={() => chooseKpi(kpi)}>
              <strong>{kpi.kpiId} · {kpi.active ? 'Active' : 'Inactive'}</strong>
              <span>{kpi.wording}</span><small>{kpi.pillar} / {kpi.workstream} · {assessment.status}</small>
            </button>;
          })}
        </div></section>
        <section className={styles.panel}><h3>Selected KPI controlled metadata</h3>
          {!selectedKpi ? <p>Choose a KPI to inspect its version and metadata.</p> : <>
            <p><strong>{selectedKpi.kpiId}</strong> · <code>{selectedKpi.kpiVersionKey}</code></p>
            <p>{selectedKpi.wording}</p><small>Source: {selectedKpi.wordingSourceReference}. Wording is not editable in this bounded form.</small>
            <div className={styles.form}>
              {([['Owner', 'owner'], ['Unit', 'unit']] as const).map(([label, key]) => <label className={styles.field} key={key}><span>{label}</span><input value={kpiDraft[key]} disabled={!canMutate} onChange={event => {
                const value = event.currentTarget.value;
                setKpiDraft(current => ({ ...current, [key]: value }));
              }} /></label>)}
              <label className={styles.field}><span>Measure Type</span><select value={kpiDraft.measureType} disabled={!canMutate} onChange={event => {
                const value = event.currentTarget.value;
                setKpiDraft(current => ({ ...current, measureType: value }));
              }}><option value="">Choose MetricType</option>{ADMIN_KPI_METRIC_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className={styles.field}><span>Direction</span><select value={kpiDraft.direction} disabled={!canMutate} onChange={event => {
                const value = event.currentTarget.value;
                setKpiDraft(current => ({ ...current, direction: value }));
              }}><option value="">Choose ScoringDirection</option>{ADMIN_KPI_SCORING_DIRECTIONS.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className={styles.field}><span>Aggregation Method</span><select value={kpiDraft.aggregationMethod} disabled={!canMutate} onChange={event => {
                const value = event.currentTarget.value;
                setKpiDraft(current => ({ ...current, aggregationMethod: value }));
              }}><option value="">Choose AggregationMethod</option>{ADMIN_KPI_AGGREGATION_METHODS.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className={styles.field}><span>Reporting Status</span><select value={kpiDraft.reportingStatus} disabled={!canMutate} onChange={event => {
                const value = event.currentTarget.value;
                setKpiDraft(current => ({ ...current, reportingStatus: value }));
              }}><option value="">Choose reporting state</option><option>Included</option><option>ContextOnly</option><option>Excluded</option></select></label>
            </div>
            <div className={styles.issueBox}>{assessAdminKpiScoringReadiness(selectedKpi).issues.length
              ? assessAdminKpiScoringReadiness(selectedKpi).issues.map(issue => <p key={issue}>{issue}</p>)
              : <p>Scoring/configuration metadata is ready.</p>}</div>
            <div className={styles.actions}>
              <button type="button" disabled={!canMutate || !props.onKpiEdit} onClick={() => run(() => props.onKpiEdit?.(selectedKpi.kpiId, selectedKpi.kpiVersionKey, { ...kpiDraft }), 'KPI metadata saved in browser memory only. No production SharePoint write occurred.')}>Save KPI metadata</button>
              <button type="button" className={styles.danger} disabled={!canMutate || !props.onKpiToggle} onClick={() => run(() => props.onKpiToggle?.(selectedKpi.kpiId, selectedKpi.kpiVersionKey, !selectedKpi.active), (selectedKpi.active ? 'KPI deactivated' : 'KPI reactivated') + ' in browser memory only. No historic definition was deleted.')}>{selectedKpi.active ? 'Deactivate KPI' : 'Reactivate KPI'}</button>
            </div>
          </>}
        </section>
      </div>
      <section className={styles.panel}>
        <h3>Add KPI version — safe UAT only</h3>
        <p>A new definition requires an explicit version and wording source. This control never overwrites an existing version.</p>
        <div className={styles.form}>
          {([
            ['KPI ID', 'kpiId'], ['KPI Version Key', 'versionKey'], ['KPI wording', 'wording'],
            ['Wording source reference', 'sourceReference'], ['Pillar', 'pillar'], ['Workstream', 'workstream'],
            ['Owner', 'owner'], ['Unit', 'unit']
          ] as const).map(([label, key]) => <label className={styles.field} key={key}><span>{label}</span><input value={newKpiDraft[key]} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewKpiDraft(current => ({ ...current, [key]: value }));
          }} /></label>)}
          <label className={styles.field}><span>Measure Type</span><select value={newKpiDraft.measureType} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewKpiDraft(current => ({ ...current, measureType: value }));
          }}>{ADMIN_KPI_METRIC_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className={styles.field}><span>Direction</span><select value={newKpiDraft.direction} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewKpiDraft(current => ({ ...current, direction: value }));
          }}>{ADMIN_KPI_SCORING_DIRECTIONS.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className={styles.field}><span>Aggregation Method</span><select value={newKpiDraft.aggregationMethod} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewKpiDraft(current => ({ ...current, aggregationMethod: value }));
          }}>{ADMIN_KPI_AGGREGATION_METHODS.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className={styles.field}><span>Reporting Status</span><select value={newKpiDraft.reportingStatus} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewKpiDraft(current => ({ ...current, reportingStatus: value }));
          }}><option value="">Choose reporting state</option><option>Included</option><option>ContextOnly</option><option>Excluded</option></select></label>
        </div>
        <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onKpiAdd} onClick={() => run(() => props.onKpiAdd?.({
          kpiId: newKpiDraft.kpiId,
          kpiVersionKey: newKpiDraft.versionKey,
          wording: newKpiDraft.wording,
          wordingSourceReference: newKpiDraft.sourceReference,
          pillar: newKpiDraft.pillar,
          workstream: newKpiDraft.workstream,
          owner: newKpiDraft.owner,
          measureType: newKpiDraft.measureType,
          unit: newKpiDraft.unit,
          direction: newKpiDraft.direction,
          aggregationMethod: newKpiDraft.aggregationMethod,
          reportingStatus: newKpiDraft.reportingStatus
        }), 'New KPI version added in browser memory only. No production SharePoint write occurred.')}>Add KPI version</button></div>
      </section>
    </>
  );

  const renderTargets = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}><span>Year-isolated control</span><h2>Annual Targets Admin</h2><p>Only {editablePerformanceYear} is editable in safe UAT. Historic-year rows remain read-only and are never silently replaced.</p></div>
      <div className={styles.filters}>
        <label className={styles.field}><span>Performance Year</span><select value={targetYear} onChange={event => { setTargetYear(event.currentTarget.value); setSelectedTargetIdentity(''); }}>
          {uniqueSorted(annualTargets.map(target => target.performanceYear)).map(year => <option key={year}>{year}</option>)}
        </select></label>
        <label className={styles.field}><span>Search targets</span><input type="search" value={targetSearch} onChange={event => setTargetSearch(event.currentTarget.value)} /></label>
        <button type="button" onClick={() => setTargetSearch('')}>Clear filters</button>
      </div>
      <div className={styles.twoColumn}>
        <section className={styles.panel}><h3>{filteredTargets.length} target version(s)</h3><div className={styles.list}>{filteredTargets.map(target => <button type="button" className={selectedTargetIdentity === targetIdentity(target) ? styles.selectedCard : styles.card} key={targetIdentity(target)} onClick={() => chooseTarget(target)}>
          <strong>{target.kpiId} · {target.performanceYear}</strong><span>{target.status}</span><small>{target.targetVersionKey} · owner {target.owner}</small>
        </button>)}</div></section>
        <section className={styles.panel}><h3>Selected annual and quarterly targets</h3>
          {!selectedTarget ? <p>Choose a year-specific target version.</p> : <>
            <p><strong>{selectedTarget.kpiId}</strong> · <code>{selectedTarget.targetVersionKey}</code></p>
            <div className={styles.form}>
              {(['annualTarget', 'q1Target', 'q2Target', 'q3Target', 'q4Target'] as const).map(key => <label className={styles.field} key={key}><span>{key === 'annualTarget' ? 'Annual Target' : key.replace('Target', ' Target').toUpperCase()}</span><input value={targetDraft[key]} disabled={!canMutate || selectedTarget.performanceYear !== editablePerformanceYear} onChange={event => {
                const value = event.currentTarget.value;
                setTargetDraft(current => ({ ...current, [key]: value }));
              }} /></label>)}
              <label className={styles.field}><span>Approval / status</span><select value={targetDraft.status} disabled={!canMutate || selectedTarget.performanceYear !== editablePerformanceYear} onChange={event => {
                const value = event.currentTarget.value;
                setTargetDraft(current => ({ ...current, status: value }));
              }}><option>Draft</option><option>Submitted</option><option>Approved</option><option>Superseded</option><option>Retired</option></select></label>
              <label className={styles.field}><span>Owner (derived from KPI/approval metadata)</span><input value={selectedTarget.owner} readOnly /></label>
            </div>
            <p>Last update: {selectedTarget.modifiedAt} by {selectedTarget.modifiedBy}</p>
            <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onAnnualTargetEdit || selectedTarget.performanceYear !== editablePerformanceYear} onClick={() => run(() => {
              const patch: IAdminAnnualTargetEdit = {
                annualTarget: targetPatchValue(targetDraft.annualTarget),
                q1Target: targetPatchValue(targetDraft.q1Target),
                q2Target: targetPatchValue(targetDraft.q2Target),
                q3Target: targetPatchValue(targetDraft.q3Target),
                q4Target: targetPatchValue(targetDraft.q4Target),
                clearAnnualTarget: !clean(targetDraft.annualTarget),
                clearQ1Target: !clean(targetDraft.q1Target),
                clearQ2Target: !clean(targetDraft.q2Target),
                clearQ3Target: !clean(targetDraft.q3Target),
                clearQ4Target: !clean(targetDraft.q4Target),
                status: targetDraft.status as IAdminAnnualTargetRecord['status']
              };
              props.onAnnualTargetEdit?.(selectedTarget.kpiId, selectedTarget.performanceYear, selectedTarget.targetVersionKey, patch);
            }, 'Annual Target saved in browser memory only. Historic years and production SharePoint were unchanged.')}>Save year-specific target</button></div>
          </>}
        </section>
      </div>
      <section className={styles.panel}>
        <h3>Add a target version for {editablePerformanceYear}</h3>
        <p>A new version is created only in safe browser memory. Existing and historic target rows are never replaced.</p>
        <div className={styles.form}>
          <label className={styles.field}><span>KPI ID</span><input value={newTargetDraft.kpiId} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewTargetDraft(current => ({ ...current, kpiId: value }));
          }} /></label>
          <label className={styles.field}><span>Target Version Key</span><input value={newTargetDraft.targetVersionKey} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewTargetDraft(current => ({ ...current, targetVersionKey: value }));
          }} /></label>
          {(['annualTarget', 'q1Target', 'q2Target', 'q3Target', 'q4Target'] as const).map(key => <label className={styles.field} key={key}><span>{key === 'annualTarget' ? 'New Annual Target' : 'New ' + key.replace('Target', ' Target').toUpperCase()}</span><input value={newTargetDraft[key]} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewTargetDraft(current => ({ ...current, [key]: value }));
          }} /></label>)}
          <label className={styles.field}><span>New target status</span><select value={newTargetDraft.status} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewTargetDraft(current => ({ ...current, status: value }));
          }}><option>Draft</option><option>Submitted</option></select></label>
          <label className={styles.field}><span>Owner (derived from selected KPI)</span><input value={kpis.filter(kpi => normalise(kpi.kpiId) === normalise(newTargetDraft.kpiId))[0]?.owner || 'KPI owner not resolved'} readOnly /></label>
        </div>
        <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onAnnualTargetAdd} onClick={() => run(() => props.onAnnualTargetAdd?.({
          kpiId: newTargetDraft.kpiId,
          performanceYear: editablePerformanceYear,
          targetVersionKey: newTargetDraft.targetVersionKey,
          annualTarget: targetPatchValue(newTargetDraft.annualTarget),
          q1Target: targetPatchValue(newTargetDraft.q1Target),
          q2Target: targetPatchValue(newTargetDraft.q2Target),
          q3Target: targetPatchValue(newTargetDraft.q3Target),
          q4Target: targetPatchValue(newTargetDraft.q4Target),
          status: newTargetDraft.status as IAdminAnnualTargetRecord['status'],
          owner: kpis.filter(kpi => normalise(kpi.kpiId) === normalise(newTargetDraft.kpiId))[0]?.owner || ''
        }), 'Annual Target version added in browser memory only. No historic row or production SharePoint data was changed.')}>Add Annual Target version</button></div>
      </section>
    </>
  );

  const renderBehaviours = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}><span>Versioned signed framework</span><h2>Behaviour Definitions Admin</h2><p>Exactly five current Behaviour definitions with five guidance prompts each. Published wording is immutable; maintenance creates a distinct draft version.</p></div>
      {!behaviourInspection.valid && <div className={styles.issueBox}>{behaviourInspection.issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
      <div className={styles.twoColumn}>
        <section className={styles.panel}><h3>{behaviourInspection.definitionCount} current definitions · {behaviourInspection.totalGuidancePromptCount} prompts</h3><div className={styles.list}>{currentBehaviours.map(record => <button type="button" className={selectedBehaviourId === record.behaviourId ? styles.selectedCard : styles.card} key={record.behaviourVersionKey} onClick={() => chooseBehaviour(record)}>
          <strong>{record.behaviourId} · {record.published ? 'Published' : 'Draft'}</strong><span>{record.title}</span><small>{record.behaviourVersionKey}</small>
        </button>)}</div>{behaviourHistory.length > 0 && <><h4>Draft and historic versions</h4><div className={styles.list}>{behaviourHistory.map(record => <article className={styles.card} key={record.behaviourVersionKey}><strong>{record.behaviourId} · {record.published ? 'Historic published' : 'Draft'}</strong><span>{record.title}</span><small>{record.behaviourVersionKey} · {record.isCurrent ? 'Current' : 'Not current'}</small></article>)}</div></>}</section>
        <section className={styles.panel}><h3>New controlled revision</h3>{!selectedBehaviour ? <p>Choose a Behaviour definition.</p> : <>
          <div className={styles.form}>
            <label className={styles.field}><span>New Version Key</span><input value={behaviourDraft.versionKey} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setBehaviourDraft(current => ({ ...current, versionKey: value }));
            }} /></label>
            <label className={styles.field}><span>Behaviour title</span><input value={behaviourDraft.title} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setBehaviourDraft(current => ({ ...current, title: value }));
            }} /></label>
            <label className={`${styles.field} ${styles.wide}`}><span>Description</span><textarea value={behaviourDraft.description} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setBehaviourDraft(current => ({ ...current, description: value }));
            }} /></label>
            {behaviourDraft.prompts.map((prompt, index) => <label className={`${styles.field} ${styles.wide}`} key={index}><span>Guidance prompt {index + 1}</span><textarea value={prompt} disabled={!canMutate} onChange={event => {
              const nextPrompt = event.currentTarget.value;
              setBehaviourDraft(current => ({ ...current, prompts: current.prompts.map((value, promptIndex) => (
                promptIndex === index ? nextPrompt : value
              )) }));
            }} /></label>)}
          </div>
          <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onBehaviourRevision} onClick={() => run(() => props.onBehaviourRevision?.(selectedBehaviour.behaviourId, behaviourDraft.versionKey, {
            title: behaviourDraft.title,
            description: behaviourDraft.description,
            guidancePrompts: behaviourDraft.prompts
          }), 'Behaviour draft revision created in browser memory only. The published source version remains in history.')}>Create draft revision</button></div>
        </>}</section>
      </div>
    </>
  );

  const renderWeighting = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}><span>Organisational GOLD weighting only</span><h2>Organisational Weighting Admin</h2><p>Performance Year {weightingState.performanceYear}, version {weightingState.version || 'not selected'}, as at {inputDate(weightingState.asOfDate)}. This is completely separate from employee Workplan weighting. No equal-weight autofill is available.</p></div>
      <div className={styles.stats}>
        <article className={styles.stat}><strong>{weighting.configurationState}</strong><span>publication configuration</span></article>
        <article className={styles.stat}><strong>{weighting.workstreamKpiTotals.length}</strong><span>KPI-within-Workstream groups</span></article>
        <article className={styles.stat}><strong>{weighting.pillarWorkstreamTotals.length}</strong><span>Workstream-within-Pillar groups</span></article>
        <article className={styles.stat}><strong>{weighting.boardPillarTotals.length}</strong><span>optional Board Pillar groups</span></article>
      </div>
      {weighting.errors.length > 0 && <div className={styles.issueBox}>
        <strong>{weighting.errors.length} weighting issue(s) grouped into {weightingIssueSummaries.length} visible categor{weightingIssueSummaries.length === 1 ? 'y' : 'ies'}.</strong>
        {weightingIssueSummaries.map(summary => <p key={summary.category}><strong>{summary.category}: {summary.count}</strong><br />Example: {summary.example}</p>)}
        <p>Individual repeated issues are capped here; use the level/state filters and remediation rows below.</p>
      </div>}
      <div className={styles.filters}>
        <label className={styles.field}><span>Performance Year</span><input value={String(weightingState.performanceYear)} readOnly /></label>
        <label className={styles.field}><span>Weighting version</span><select value={weightingState.version.indexOf('SELECT-') === 0 || weightingState.version === 'NOT-CONFIGURED' ? '' : weightingState.version} onChange={event => {
          const value = event.currentTarget.value;
          if (!value) return;
          if (props.onWeightingVersionChange) props.onWeightingVersionChange(value);
          else setReadOnlyWeightingVersion(value);
        }}><option value="">{availableWeightingVersions.length ? 'Choose version' : 'No production version configured'}</option>{uniqueSorted(availableWeightingVersions.concat(weightingState.version.indexOf('SYNTHETIC-') === 0 ? [weightingState.version] : [])).map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>Weight level</span><select value={weightLevelFilter} onChange={event => setWeightLevelFilter(event.currentTarget.value)}><option>All</option><option>KPIWithinWorkstream</option><option>WorkstreamWithinPillar</option><option>PillarWithinBoard</option></select></label>
        <label className={styles.field}><span>Configuration state</span><select value={weightStateFilter} onChange={event => setWeightStateFilter(event.currentTarget.value as typeof weightStateFilter)}><option>All</option><option>Configured</option><option>Missing</option></select></label>
        <button type="button" onClick={() => { setWeightLevelFilter('All'); setWeightStateFilter('All'); }}>Clear filters</button>
      </div>
      <h3>Group validation</h3>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Level</th><th>Group</th><th>Current total</th><th>Missing weights</th><th>Invalid weights</th><th>State</th></tr></thead><tbody>
        {weighting.workstreamKpiTotals.concat(weighting.pillarWorkstreamTotals, weighting.boardPillarTotals).map(total => <tr key={total.weightLevel + '|' + total.groupKey}><td>{total.weightLevel}</td><td>{total.groupKey}</td><td>{total.total}% / 100%</td><td>{total.missingMemberKeys.length ? total.missingMemberKeys.join(', ') : 'None'}</td><td>{total.invalidMemberKeys.length ? total.invalidMemberKeys.join(', ') : 'None'}</td><td>{total.ready ? 'READY' : 'NOT READY'}</td></tr>)}
      </tbody></table></div>
      <p>{filteredWeightRows.length} of {weightRows.length} hierarchy member row(s) shown.</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Level</th><th>Parent</th><th>Child</th><th>Weight %</th><th>State</th><th>Action</th></tr></thead><tbody>
        {filteredWeightRows.map(row => {
          const identity = weightIdentity(row);
          const draft = weightDrafts[identity] === undefined ? (row.weightPercent === undefined ? '' : String(row.weightPercent)) : weightDrafts[identity];
          const draftError = weightErrors[identity];
          return <tr key={identity}><td>{row.weightLevel}</td><td>{row.parentKey}</td><td>{row.childKey}</td><td><label className={styles.field}><span className={styles.wide}>Controlled weight</span><input aria-label={'Weight ' + row.childKey} value={draft} disabled={!canMutate} aria-invalid={Boolean(draftError)} onChange={event => {
            const value = event.currentTarget.value;
            setWeightDrafts(current => ({ ...current, [identity]: value }));
            setWeightErrors(current => {
              const next = { ...current };
              delete next[identity];
              return next;
            });
          }} />{draftError && <small className={styles.fieldError} role="alert">{draftError}</small>}</label></td><td>{row.stored ? (row.approvalStatus || 'Draft') : 'Missing / NOT READY'}</td><td><div className={styles.actions}><button type="button" disabled={!canMutate || !props.onWeightChange} onClick={() => {
            try {
              const value = parseAdminOrganisationalWeightDraft(draft);
              props.onWeightChange?.({ weightLevel: row.weightLevel, parentKey: row.parentKey, childKey: row.childKey }, value);
              setWeightErrors(current => {
                const next = { ...current };
                delete next[identity];
                return next;
              });
              setStatus('Organisational weight staged in browser memory only. No equal-weight autofill or production write occurred.');
            } catch (error) {
              const numericDraft = Number(clean(draft));
              const groupTotal = weightRows.filter(candidate => candidate.weightLevel === row.weightLevel
                && candidate.parentKey === row.parentKey
                && weightIdentity(candidate) !== identity)
                .reduce((sum, candidate) => sum + (candidate.weightPercent || 0), Number.isFinite(numericDraft) ? numericDraft : 0);
              const displayedTotal = Math.round(groupTotal * 100) / 100;
              const message = Number.isFinite(numericDraft) && numericDraft > 100
                ? 'These ' + (row.weightLevel === 'KPIWithinWorkstream' ? 'KPI' : 'organisational')
                  + ' weights total ' + displayedTotal + '%. They must total exactly 100%.'
                : (error instanceof Error ? error.message : 'The organisational weight is invalid.');
              setWeightErrors(current => ({ ...current, [identity]: message }));
              setStatus(message + ' The draft remains on screen for correction; nothing was saved.');
            }
          }}>Save weight</button><button type="button" className={styles.secondary} disabled={!canMutate || !props.onWeightChange} onClick={() => run(() => props.onWeightChange?.({ weightLevel: row.weightLevel, parentKey: row.parentKey, childKey: row.childKey }, undefined), 'Organisational weight cleared in browser memory only.')}>Clear</button></div></td></tr>;
        })}
      </tbody></table></div>
    </>
  );

  const renderReportingMap = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}><span>Many-to-many configuration</span><h2>Reporting Map Admin</h2><p>Mappings are data-driven; no output code is hard-coded in React. Draft/Exclude rows may have a blank External Key, but active approved publishable rows may not.</p></div>
      {!reportingEligibilityKnown && <div className={styles.issueBox}><p>KPI ReportingStatus Included/ContextOnly/Excluded is unavailable. Required-KPI mapping readiness is unknown and publication therefore remains NOT READY.</p></div>}
      {!mappings.ready && <div className={styles.issueBox}>{mappings.issues.map((issue, index) => <p key={issue.code + index}>{issue.code}: {issue.message}</p>)}</div>}
      <div className={styles.twoColumn}><section className={styles.panel}><h3>{reportingMaps.length} mapping row(s)</h3><div className={styles.list}>{reportingMaps.map(record => <button type="button" className={selectedMapKey === record.mappingKey ? styles.selectedCard : styles.card} key={record.mappingKey} onClick={() => chooseMap(record)}><strong>{record.mappingKey}</strong><span>{record.kpiId} → {record.outputCode}</span><small>{record.approvalStatus} · {record.active ? 'Active' : 'Inactive'}</small></button>)}</div></section>
        <section className={styles.panel}><h3>Selected mapping</h3>{!selectedMap ? <p>No Reporting Map row is configured or selected.</p> : <>
          <div className={styles.form}>
            <label className={styles.field}><span>Natural Key (KPI|Output)</span><input value={mapDraft.naturalKey} readOnly /></label>
            <label className={styles.field}><span>External Key</span><input value={mapDraft.externalKey} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, externalKey: value }));
            }} /></label>
            <label className={styles.field}><span>Treatment</span><select value={mapDraft.treatment} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, treatment: value }));
            }}><option>Direct</option><option>Allocated</option><option>CompositeComponent</option><option>Narrative</option><option>Exclude</option></select></label>
            <label className={styles.field}><span>Allocation percent (0–100)</span><input type="number" min="0" max="100" step="0.01" value={mapDraft.allocationPercent} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, allocationPercent: value }));
            }} /></label>
            <label className={styles.field}><span>Treatment rule JSON (required for complex treatment)</span><textarea value={mapDraft.treatmentRuleJson} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, treatmentRuleJson: value }));
            }} /></label>
            <label className={styles.field}><span>Reporting cadence</span><select value={mapDraft.reportingCadence} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, reportingCadence: value }));
            }}><option value="">Choose cadence</option><option>Quarterly</option><option>Annual</option><option>YearEndNarrative</option><option>AdHoc</option></select></label>
            <label className={styles.field}><span>Change reference</span><input value={mapDraft.changeReference} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, changeReference: value }));
            }} /></label>
            <label className={styles.field}><span>Section (optional UAT metadata)</span><input value={mapDraft.sectionKey} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, sectionKey: value }));
            }} /></label>
            <label className={styles.field}><span>Field (optional UAT metadata)</span><input value={mapDraft.fieldKey} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, fieldKey: value }));
            }} /></label>
            <label className={styles.field}><span>Effective from</span><input type="date" value={mapDraft.effectiveFrom} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, effectiveFrom: value }));
            }} /></label>
            <label className={styles.field}><span>Effective to</span><input type="date" value={mapDraft.effectiveTo} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, effectiveTo: value }));
            }} /></label>
            <label className={styles.field}><span>Approval state</span><select value={mapDraft.approvalStatus} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, approvalStatus: value }));
            }}><option>Draft</option><option>PendingApproval</option><option>Approved</option><option>Retired</option></select></label>
            <label className={styles.field}><span>Approved by email</span><input type="email" value={mapDraft.approvedByEmail} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, approvedByEmail: value }));
            }} /></label>
            <label className={styles.field}><span>Approved at (ISO)</span><input value={mapDraft.approvedAt} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setMapDraft(current => ({ ...current, approvedAt: value }));
            }} /></label>
            <label className={styles.field}><span>Active</span><select value={mapDraft.active ? 'true' : 'false'} disabled={!canMutate} onChange={event => {
              const active = event.currentTarget.value === 'true';
              setMapDraft(current => ({ ...current, active }));
            }}><option value="false">Inactive</option><option value="true">Active</option></select></label>
          </div>
          <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onReportingMapEdit} onClick={() => run(() => props.onReportingMapEdit?.(selectedMap.mappingKey, {
            naturalKey: [selectedMap.kpiId, selectedMap.outputCode].join('|'),
            externalKey: clean(mapDraft.externalKey) || undefined,
            sectionKey: clean(mapDraft.sectionKey) || undefined,
            fieldKey: clean(mapDraft.fieldKey) || undefined,
            treatment: mapDraft.treatment as IAdminReportingMapRecord['treatment'],
            allocationPercent: clean(mapDraft.allocationPercent) ? Number(mapDraft.allocationPercent) : undefined,
            treatmentRuleJson: clean(mapDraft.treatmentRuleJson) || undefined,
            reportingCadence: mapDraft.reportingCadence as IAdminReportingMapRecord['reportingCadence'],
            changeReference: clean(mapDraft.changeReference) || undefined,
            effectiveFrom: mapDraft.effectiveFrom,
            effectiveTo: clean(mapDraft.effectiveTo) || undefined,
            approvalStatus: mapDraft.approvalStatus as IAdminReportingMapRecord['approvalStatus'],
            approvedByEmail: clean(mapDraft.approvedByEmail) || undefined,
            approvedAt: clean(mapDraft.approvedAt) || undefined,
            active: mapDraft.active
          }), 'Reporting Map row saved in browser memory only. No production SharePoint write occurred.')}>Save mapping</button></div>
        </>}</section>
      </div>
      <section className={styles.panel}><h3>Add Reporting Map draft — safe UAT only</h3>
        <div className={styles.form}>
          {([
            ['Mapping Version Key', 'mappingKey'], ['KPI ID', 'kpiId'], ['Output Code', 'outputCode'],
            ['External Key', 'externalKey'], ['Version', 'version'], ['Change reference', 'changeReference']
          ] as const).map(([label, key]) => <label className={styles.field} key={key}><span>{label}</span><input value={newMapDraft[key]} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewMapDraft(current => ({ ...current, [key]: value }));
          }} /></label>)}
          <label className={styles.field}><span>Natural Key (KPI|Output)</span><input value={[newMapDraft.kpiId, newMapDraft.outputCode].join('|')} readOnly /></label>
          <label className={styles.field}><span>Treatment</span><select value={newMapDraft.treatment} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewMapDraft(current => ({ ...current, treatment: value }));
          }}><option>Direct</option><option>Allocated</option><option>CompositeComponent</option><option>Narrative</option><option>Exclude</option></select></label>
          <label className={styles.field}><span>Allocation percent (0–100)</span><input type="number" min="0" max="100" step="0.01" value={newMapDraft.allocationPercent} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewMapDraft(current => ({ ...current, allocationPercent: value }));
          }} /></label>
          <label className={styles.field}><span>Treatment rule JSON (required for complex treatment)</span><textarea value={newMapDraft.treatmentRuleJson} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewMapDraft(current => ({ ...current, treatmentRuleJson: value }));
          }} /></label>
          <label className={styles.field}><span>Reporting cadence</span><select value={newMapDraft.reportingCadence} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewMapDraft(current => ({ ...current, reportingCadence: value }));
          }}><option>Quarterly</option><option>Annual</option><option>YearEndNarrative</option><option>AdHoc</option></select></label>
          <label className={styles.field}><span>Effective from</span><input type="date" value={newMapDraft.effectiveFrom} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewMapDraft(current => ({ ...current, effectiveFrom: value }));
          }} /></label>
        </div>
        <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onReportingMapAdd} onClick={() => run(() => props.onReportingMapAdd?.({
          mappingKey: newMapDraft.mappingKey,
          naturalKey: [newMapDraft.kpiId, newMapDraft.outputCode].join('|'),
          kpiId: newMapDraft.kpiId,
          outputCode: newMapDraft.outputCode,
          externalKey: clean(newMapDraft.externalKey) || undefined,
          treatment: newMapDraft.treatment as IAdminReportingMapRecord['treatment'],
          allocationPercent: clean(newMapDraft.allocationPercent) ? Number(newMapDraft.allocationPercent) : undefined,
          treatmentRuleJson: clean(newMapDraft.treatmentRuleJson) || undefined,
          reportingCadence: newMapDraft.reportingCadence as IAdminReportingMapRecord['reportingCadence'],
          effectiveFrom: newMapDraft.effectiveFrom,
          active: false,
          version: newMapDraft.version,
          approvalStatus: 'Draft',
          changeReference: clean(newMapDraft.changeReference) || undefined
        }), 'Reporting Map draft added in browser memory only. No production SharePoint write occurred.')}>Add Reporting Map draft</button></div>
      </section>
    </>
  );

  const saveSelectedOutputDefinition = (): void => {
    if (!selectedOutput || !props.onOutputDefinitionEdit) return;
    const patch: Partial<IAdminOutputDefinition> = {
      outputName: outputDraft.outputName,
      description: clean(outputDraft.description) || undefined,
      reportingFrequency: outputDraft.reportingFrequency,
      mappingRequirement: outputDraft.mappingRequirement as IAdminOutputDefinition['mappingRequirement'],
      outputFormat: outputDraft.outputFormat as IAdminOutputDefinition['outputFormat'],
      ownerEmail: clean(outputDraft.ownerEmail) || undefined,
      changeReference: clean(outputDraft.changeReference) || undefined,
      effectiveFrom: outputDraft.effectiveFrom,
      effectiveTo: clean(outputDraft.effectiveTo) || undefined,
      version: outputDraft.version,
      publicationStatus: outputDraft.publicationStatus as IAdminOutputDefinition['publicationStatus'],
      approvedByEmail: clean(outputDraft.approvedByEmail) || undefined,
      approvedAt: clean(outputDraft.approvedAt) || undefined,
      active: outputDraft.active
    };
    const validation = validateAdminOutputDefinitionDraft({ ...selectedOutput, ...patch });
    setOutputEditErrors(validation.fieldErrors);
    if (!validation.valid) {
      setStatus('Output Definition was not saved: ' + validation.issues.join(' '));
      return;
    }
    try {
      props.onOutputDefinitionEdit(selectedOutput.outputCode, patch);
      setStatus('Output Definition saved in browser memory only. No production SharePoint write occurred.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The Output Definition save was blocked.');
    }
  };

  const addOutputDefinitionDraft = (): void => {
    if (!props.onOutputDefinitionAdd) return;
    const draft: Omit<IAdminOutputDefinition, 'id'> = {
      outputCode: newOutputDraft.outputCode,
      outputName: newOutputDraft.outputName,
      description: clean(newOutputDraft.description) || undefined,
      active: false,
      reportingFrequency: newOutputDraft.reportingFrequency,
      mappingRequirement: newOutputDraft.mappingRequirement as IAdminOutputDefinition['mappingRequirement'],
      outputFormat: newOutputDraft.outputFormat as IAdminOutputDefinition['outputFormat'],
      effectiveFrom: newOutputDraft.effectiveFrom,
      version: newOutputDraft.version,
      publicationStatus: 'Draft',
      ownerEmail: clean(newOutputDraft.ownerEmail) || undefined,
      changeReference: clean(newOutputDraft.changeReference) || undefined
    };
    const validation = validateAdminOutputDefinitionDraft(draft);
    setNewOutputErrors(validation.fieldErrors);
    if (!validation.valid) {
      setStatus('Output Definition draft was not added: ' + validation.issues.join(' '));
      return;
    }
    try {
      props.onOutputDefinitionAdd(draft);
      setStatus('Output Definition draft added in browser memory only. No production SharePoint write occurred.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The Output Definition draft was blocked.');
    }
  };

  const renderOutputs = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}><span>Controlled output catalogue</span><h2>Output Definitions Admin</h2><p>Required/Optional mapping state must be explicit. Empty or unknown values are never inferred as Optional.</p></div>
      {!outputs.ready && <div className={styles.issueBox}>{outputs.issues.map((issue, index) => <p key={issue.code + index}>{issue.code}: {issue.message}</p>)}</div>}
      <div className={styles.twoColumn}><section className={styles.panel}><h3>{outputDefinitions.length} output definition(s)</h3><div className={styles.list}>{outputDefinitions.map(record => <button type="button" className={selectedOutputCode === record.outputCode ? styles.selectedCard : styles.card} key={record.outputCode} onClick={() => chooseOutput(record)}><strong>{record.outputCode}</strong><span>{record.outputName}</span><small>{record.mappingRequirement || 'Mapping state missing'} · {record.publicationStatus}</small></button>)}</div></section>
        <section className={styles.panel}><h3>Selected Output Definition</h3>{!selectedOutput ? <p>No Output Definition is configured or selected.</p> : <>
          {Object.keys(outputEditErrors).length > 0 && <div className={styles.issueBox} role="alert"><strong>Output Definition was not saved.</strong>{Object.keys(outputEditErrors).sort().map(field => <p key={field}>{outputEditErrors[field]}</p>)}</div>}
          <div className={styles.form}>
            <label className={styles.field}><span>Output Code</span><input value={selectedOutput.outputCode} readOnly /></label>
            <label className={styles.field}><span>Output Name</span><input value={outputDraft.outputName} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, outputName: value }));
            }} /></label>
            <label className={styles.field}><span>Description</span><textarea value={outputDraft.description} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, description: value }));
            }} /></label>
            <label className={styles.field}><span>Reporting frequency</span><select value={outputDraft.reportingFrequency} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, reportingFrequency: value }));
            }}><option value="">Choose cadence</option><option>Quarterly</option><option>Annual</option><option>YearEndNarrative</option><option>AdHoc</option></select></label>
            <label className={styles.field}><span>Mapping state</span><select value={outputDraft.mappingRequirement} disabled={!canMutate} aria-invalid={Boolean(outputEditErrors.mappingRequirement)} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, mappingRequirement: value }));
              setOutputEditErrors(current => {
                const next = { ...current };
                delete next.mappingRequirement;
                return next;
              });
            }}><option value="">Choose Required or Optional</option><option>Required</option><option>Optional</option></select>{outputEditErrors.mappingRequirement && <small className={styles.fieldError}>{outputEditErrors.mappingRequirement}</small>}</label>
            <label className={styles.field}><span>Output format</span><select value={outputDraft.outputFormat} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, outputFormat: value }));
            }}><option value="">Choose format</option><option>XLSX</option><option>CSV</option><option>JSON</option><option>WebFeed</option><option>Other</option></select></label>
            <label className={styles.field}><span>Owner email</span><input type="email" value={outputDraft.ownerEmail} disabled={!canMutate} aria-invalid={Boolean(outputEditErrors.ownerEmail)} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, ownerEmail: value }));
              setOutputEditErrors(current => {
                const next = { ...current };
                delete next.ownerEmail;
                return next;
              });
            }} />{outputEditErrors.ownerEmail && <small className={styles.fieldError}>{outputEditErrors.ownerEmail}</small>}</label>
            <label className={styles.field}><span>Change reference</span><input value={outputDraft.changeReference} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, changeReference: value }));
            }} /></label>
            <label className={styles.field}><span>Effective from</span><input type="date" value={outputDraft.effectiveFrom} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, effectiveFrom: value }));
            }} /></label>
            <label className={styles.field}><span>Effective to</span><input type="date" value={outputDraft.effectiveTo} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, effectiveTo: value }));
            }} /></label>
            <label className={styles.field}><span>Schema version</span><input value={outputDraft.version} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, version: value }));
            }} /></label>
            <label className={styles.field}><span>Publication state</span><select value={outputDraft.publicationStatus} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, publicationStatus: value }));
            }}><option>Draft</option><option>Approved</option><option>Published</option><option>Retired</option></select></label>
            <label className={styles.field}><span>Approved by email</span><input type="email" value={outputDraft.approvedByEmail} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, approvedByEmail: value }));
            }} /></label>
            <label className={styles.field}><span>Approved at (ISO)</span><input value={outputDraft.approvedAt} disabled={!canMutate} onChange={event => {
              const value = event.currentTarget.value;
              setOutputDraft(current => ({ ...current, approvedAt: value }));
            }} /></label>
            <label className={styles.field}><span>Active</span><select value={outputDraft.active ? 'true' : 'false'} disabled={!canMutate} onChange={event => {
              const active = event.currentTarget.value === 'true';
              setOutputDraft(current => ({ ...current, active }));
            }}><option value="false">Inactive</option><option value="true">Active</option></select></label>
          </div>
          <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onOutputDefinitionEdit} onClick={saveSelectedOutputDefinition}>Save Output Definition</button></div>
        </>}</section>
      </div>
      <section className={styles.panel}><h3>Add Output Definition draft — safe UAT only</h3>
        {Object.keys(newOutputErrors).length > 0 && <div className={styles.issueBox} role="alert"><strong>Output Definition draft was not added.</strong>{Object.keys(newOutputErrors).sort().map(field => <p key={field}>{newOutputErrors[field]}</p>)}</div>}
        <div className={styles.form}>
          {([
            ['Output Code', 'outputCode'], ['Output Name', 'outputName'], ['Owner email', 'ownerEmail'],
            ['Change reference', 'changeReference'], ['Schema version', 'version']
          ] as const).map(([label, key]) => <label className={styles.field} key={key}><span>{label}</span><input type={key === 'ownerEmail' ? 'email' : 'text'} value={newOutputDraft[key]} disabled={!canMutate} aria-invalid={Boolean(newOutputErrors[key])} onChange={event => {
            const value = event.currentTarget.value;
            setNewOutputDraft(current => ({ ...current, [key]: value }));
            setNewOutputErrors(current => {
              const next = { ...current };
              delete next[key];
              return next;
            });
          }} />{newOutputErrors[key] && <small className={styles.fieldError}>{newOutputErrors[key]}</small>}</label>)}
          <label className={styles.field}><span>Description</span><textarea value={newOutputDraft.description} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewOutputDraft(current => ({ ...current, description: value }));
          }} /></label>
          <label className={styles.field}><span>Reporting frequency</span><select value={newOutputDraft.reportingFrequency} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewOutputDraft(current => ({ ...current, reportingFrequency: value }));
          }}><option>Quarterly</option><option>Annual</option><option>YearEndNarrative</option><option>AdHoc</option></select></label>
          <label className={styles.field}><span>Mapping state</span><select value={newOutputDraft.mappingRequirement} disabled={!canMutate} aria-invalid={Boolean(newOutputErrors.mappingRequirement)} onChange={event => {
            const value = event.currentTarget.value;
            setNewOutputDraft(current => ({ ...current, mappingRequirement: value }));
            setNewOutputErrors(current => {
              const next = { ...current };
              delete next.mappingRequirement;
              return next;
            });
          }}><option value="">Choose Required or Optional</option><option>Required</option><option>Optional</option></select>{newOutputErrors.mappingRequirement && <small className={styles.fieldError}>{newOutputErrors.mappingRequirement}</small>}</label>
          <label className={styles.field}><span>Output format</span><select value={newOutputDraft.outputFormat} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewOutputDraft(current => ({ ...current, outputFormat: value }));
          }}><option>XLSX</option><option>CSV</option><option>JSON</option><option>WebFeed</option><option>Other</option></select></label>
          <label className={styles.field}><span>Effective from</span><input type="date" value={newOutputDraft.effectiveFrom} disabled={!canMutate} onChange={event => {
            const value = event.currentTarget.value;
            setNewOutputDraft(current => ({ ...current, effectiveFrom: value }));
          }} /></label>
        </div>
        <div className={styles.actions}><button type="button" disabled={!canMutate || !props.onOutputDefinitionAdd} onClick={addOutputDefinitionDraft}>Add Output Definition draft</button></div>
      </section>
    </>
  );

  const renderAudit = (): React.ReactElement => (
    <>
      <div className={styles.sectionHeader}><span>Read-only and date-bounded</span><h2>Audit Viewer</h2><p>Audit history cannot be edited here. Filters apply only to the preloaded {loadedAuditMaximumDays}-day snapshot{loadedAuditFrom && loadedAuditTo ? ` (${inputDate(loadedAuditFrom)} to ${inputDate(loadedAuditTo)})` : ''}; changing a filter never issues a hidden write or unbounded query.</p></div>
      <div className={styles.filters}>
        <label className={styles.field}><span>Date from</span><input type="date" value={auditFrom} onInput={event => {
          const value = event.currentTarget.value;
          setAuditFrom(value);
        }} onChange={event => {
          const value = event.currentTarget.value;
          setAuditFrom(value);
        }} /></label>
        <label className={styles.field}><span>Date to</span><input type="date" value={auditTo} onInput={event => {
          const value = event.currentTarget.value;
          setAuditTo(value);
        }} onChange={event => {
          const value = event.currentTarget.value;
          setAuditTo(value);
        }} /></label>
        <label className={styles.field}><span>Person / actor</span><input value={auditActor} onChange={event => setAuditActor(event.currentTarget.value)} /></label>
        <label className={styles.field}><span>Event type</span><select value={auditEvent} onChange={event => setAuditEvent(event.currentTarget.value)}><option value="">All event types</option>{uniqueSorted(auditRecords.map(record => record.eventType)).map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>Entity</span><input value={auditEntity} onChange={event => setAuditEntity(event.currentTarget.value)} /></label>
        <label className={styles.field}><span>Correlation / reference</span><input value={auditReference} onChange={event => setAuditReference(event.currentTarget.value)} /></label>
        <button type="button" onClick={() => {
          setAuditFrom('');
          setAuditTo('');
          setAuditActor('');
          setAuditEvent('');
          setAuditEntity('');
          setAuditReference('');
        }}>Clear Audit filters</button>
      </div>
      {boundedAuditIssue && <div className={styles.issueBox}><p>{boundedAuditIssue}</p></div>}
      <div className={styles.auditList}>{auditView.records.length ? auditView.records.map(record => <article key={record.auditKey}><header><div><h3>{record.eventType}</h3><small>{record.entityType} · {record.entityKey}</small></div><small>{record.eventAt}</small></header><p>{record.actor}</p><p>Correlation/reference: {record.correlationKey || record.sourceReference || 'not stored'}</p>{record.beforeJson && <code className={styles.auditJson}>Before: {record.beforeJson}</code>}{record.afterJson && <code className={styles.auditJson}>After: {record.afterJson}</code>}{record.contextJson && <code className={styles.auditJson}>Context: {record.contextJson}</code>}</article>) : <div className={styles.empty}><p>No Audit events match the bounded read-only filters.</p></div>}</div>
    </>
  );

  const renderArea = (): React.ReactElement => {
    if (area === 'kpiMaster') return renderKpiMaster();
    if (area === 'annualTargets') return renderTargets();
    if (area === 'behaviours') return renderBehaviours();
    if (area === 'weighting') return renderWeighting();
    if (area === 'reportingMap') return renderReportingMap();
    if (area === 'outputs') return renderOutputs();
    if (area === 'audit') return renderAudit();
    return renderReadiness();
  };

  return <div className={styles.shell} data-layout="admin-reporting-control-responsive">
    <header className={styles.header}><div><span>KCF Performance Hub</span><h1>Admin Configuration &amp; Reporting Control</h1><p>Operational configuration required before GOLD/reporting integration.</p></div><div className={styles.identity}><strong>{props.productionIdentity}</strong><span>Mutation actor: {actorEmail}</span></div></header>
    <div className={styles.boundary}>{props.localUat
      ? 'SAFE ADMIN UAT · Browser memory only · NO production SharePoint writes · NO saves, submits, approvals, deployment or notifications.'
      : 'PRODUCTION READ-ONLY · Live baseline display only · no Admin write callbacks are enabled.'}</div>
    <nav className={styles.nav} aria-label="Admin reporting control areas">{areas.map(item => <button type="button" key={item.key} className={area === item.key ? styles.active : undefined} onClick={() => { setArea(item.key); setStatus(item.label + ' selected.'); }}><strong>{item.label}</strong><small>{item.description}</small></button>)}</nav>
    <div className={styles.status} role="status">{props.loadMessage ? props.loadMessage + ' · ' : ''}{status}</div>
    <main className={styles.content}>{renderArea()}</main>
  </div>;
};

export default AdminReportingControlPage;
