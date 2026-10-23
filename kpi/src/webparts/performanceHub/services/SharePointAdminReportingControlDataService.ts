import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import type { IAdminAnnualTargetRecord, AdminAnnualTargetStatus } from './AdminAnnualTargetsDomain';
import type { IAdminBehaviourDefinitionRecord } from './AdminBehaviourDefinitionsDomain';
import type { IAdminKpiMasterRecord } from './AdminKpiMasterDomain';
import type { IAdminOfficialKpiResult, IAdminReportingControlDataService, IAdminReportingControlSnapshot } from './AdminReportingControlDataService';
import {
  buildBoundedAuditReadRequest,
  type AdminControlApprovalStatus,
  type AdminOutputPublicationStatus,
  type IAdminAuditRecord,
  type IAdminOutputDefinition,
  type IAdminReportingMapRecord
} from './AdminReportingControlDomain';
import { isKpiDataQualityAdmin } from './KpiDataQuality';
import { parseProductionScoringMetadata } from './ProductionScoringMetadata';
import type { IOrganisationalWeightRecord } from './ProductionPolicyStructures';

interface IODataCollection<T> { value: T[]; }
interface IEditor { EMail?: string; Title?: string; }
interface IAdminActorRow { Email: string; AppRoles?: readonly string[] | { results?: readonly string[] }; Active: boolean; }
interface IKpiRow {
  Id: number; KPIID: string; KPIVersionKey: string; KPIWording: string; Pillar: string; Workstream: string;
  AccountableOwnerPersonKey?: string; AccountableOwnerEmail?: string; DefinitionStatus: string;
  AggregationMethod: string; ScoringDirection: string; MetricType: string; UnitLabel: string;
  ReportingStatus?: string; RAGParametersJSON?: string; SourceOrigin?: string; ChangeReference?: string;
  Modified?: string; Editor?: IEditor;
}
interface ITargetRow {
  Id: number; KPIID: string; PerformanceYear: number; TargetVersionKey: string;
  YearEndTargetValue?: number; YearEndTargetText?: string; Q1TargetValue?: number; Q1TargetText?: string;
  Q2TargetValue?: number; Q2TargetText?: string; Q3TargetValue?: number; Q3TargetText?: string;
  Q4TargetValue?: number; Q4TargetText?: string; TargetStatus: string;
  ApprovedByEmail?: string; SubmittedByEmail?: string; Modified?: string; Editor?: IEditor;
}
interface IBehaviourRow {
  Id: number; BehaviourID: string; BehaviourVersionKey: string; Title: string; Description: string;
  AssessmentGuidance?: string; Status: string; IsCurrent: boolean; Modified?: string; Editor?: IEditor;
}
interface IWeightRow {
  OrganisationalWeightKey: string; WeightGroupKey: string; PerformanceYear: number;
  WeightLevel: IOrganisationalWeightRecord['weightLevel']; ParentKey: string; ChildKey: string;
  WeightPercent?: number; Active: boolean; ApprovalStatus: IOrganisationalWeightRecord['approvalStatus'];
  EffectiveFrom: string; EffectiveTo?: string; Version: string; ApprovalReference: string; Source: string;
  PublishedSnapshotKey?: string; HistoricSnapshotLocked: boolean;
}
interface IMapRow {
  Id: number; ReportingMapVersionKey: string; ReportingMapNaturalKey: string;
  KPIID: string; OutputCode: string; ExternalKey?: string; AllocationPct?: number;
  Treatment?: IAdminReportingMapRecord['treatment']; TreatmentRuleJSON?: string; ReportingCadence?: string;
  EffectiveFrom: string; EffectiveTo?: string; Status: string; VersionNumber: number;
  ChangeReference?: string; ApprovedByEmail?: string; ApprovedAt?: string;
}
interface IOutputRow {
  Id: number; OutputCode: string; Title: string; Description?: string; MappingRequirement?: string;
  OutputFormat?: string; ReportingCadence: string; SchemaVersion: string; Status: string;
  EffectiveFrom: string; EffectiveTo?: string; OwnerEmail?: string; ChangeReference?: string;
  ApprovedByEmail?: string; ApprovedAt?: string;
}
interface IOfficialResultRow {
  KPIResultKey: string; KPIID: string; PerformanceYear: number; Quarter: string;
  FinalActualValue?: number; FinalActualText?: string; ResultStatus: string;
  ApprovedByEmail?: string; ApprovedAt?: string; PublishedAt?: string;
}
interface IAuditRow {
  Id: number; AuditKey: string; EventType: string; SubjectType: string; SubjectKey: string;
  ActorEmail: string; ActorRole?: string; EventAt: string; Reason?: string; BeforeJSON?: string; AfterJSON?: string;
  CorrelationKey?: string; Source?: string; SourceReference?: string; Success?: boolean;
}
interface IConfigYearRow { DateValue?: string; ValueType?: string; }

const LISTS = {
  people: 'KCFKPI_People', config: 'KCFKPI_Config', kpis: 'KCFKPI_KPIMaster', targets: 'KCFKPI_AnnualTargets',
  behaviours: 'KCFKPI_Behaviours', weights: 'KCFKPI_OrganisationalWeights',
  maps: 'KCFKPI_ReportingMap', outputs: 'KCFKPI_OutputDefinitions', results: 'KCFKPI_KPIResults', audit: 'KCFKPI_Audit'
} as const;

export const ADMIN_KPI_MASTER_SELECT = 'Id,KPIID,KPIVersionKey,KPIWording,Pillar,Workstream,AccountableOwnerPersonKey,AccountableOwnerEmail,DefinitionStatus,AggregationMethod,ScoringDirection,MetricType,UnitLabel,ReportingStatus,RAGParametersJSON,SourceOrigin,ChangeReference,Modified,Editor/EMail';
export const ADMIN_ANNUAL_TARGET_SELECT = 'Id,KPIID,PerformanceYear,TargetVersionKey,YearEndTargetValue,YearEndTargetText,Q1TargetValue,Q1TargetText,Q2TargetValue,Q2TargetText,Q3TargetValue,Q3TargetText,Q4TargetValue,Q4TargetText,TargetStatus,ApprovedByEmail,SubmittedByEmail,Modified,Editor/EMail';
export const ADMIN_BEHAVIOUR_DEFINITION_SELECT = 'Id,BehaviourID,BehaviourVersionKey,Title,Description,AssessmentGuidance,Status,IsCurrent,Modified,Editor/EMail';
export const ADMIN_ORGANISATIONAL_WEIGHT_SELECT = 'OrganisationalWeightKey,WeightGroupKey,PerformanceYear,WeightLevel,ParentKey,ChildKey,WeightPercent,Active,ApprovalStatus,EffectiveFrom,EffectiveTo,Version,ApprovalReference,Source,PublishedSnapshotKey,HistoricSnapshotLocked';
export const ADMIN_REPORTING_MAP_SELECT = 'Id,ReportingMapVersionKey,ReportingMapNaturalKey,KPIID,OutputCode,ExternalKey,AllocationPct,Treatment,TreatmentRuleJSON,ReportingCadence,EffectiveFrom,EffectiveTo,Status,VersionNumber,ChangeReference,ApprovedByEmail,ApprovedAt';
export const ADMIN_OUTPUT_DEFINITION_SELECT = 'Id,OutputCode,Title,Description,MappingRequirement,OutputFormat,ReportingCadence,SchemaVersion,Status,EffectiveFrom,EffectiveTo,OwnerEmail,ChangeReference,ApprovedByEmail,ApprovedAt';
export const ADMIN_OFFICIAL_RESULT_SELECT = 'KPIResultKey,KPIID,PerformanceYear,Quarter,FinalActualValue,FinalActualText,ResultStatus,ApprovedByEmail,ApprovedAt,PublishedAt';
export const ADMIN_AUDIT_VIEW_SELECT = 'Id,AuditKey,EventType,SubjectType,SubjectKey,ActorEmail,ActorRole,EventAt,Reason,BeforeJSON,AfterJSON,CorrelationKey,Source,SourceReference,Success';

const clean = (value: string | undefined): string => (value || '').trim();
const editor = (value: IEditor | undefined): string => clean(value?.EMail) || clean(value?.Title);
const escapeOData = (value: string): string => value.replace(/'/g, "''");
const targetValue = (numeric: number | undefined, text: string | undefined): number | string | undefined => (
  numeric !== undefined ? numeric : clean(text) || undefined
);
const roles = (value: IAdminActorRow['AppRoles']): string[] => {
  if (Array.isArray(value)) return (value as readonly string[]).slice();
  const collection = value as { results?: readonly string[] } | undefined;
  return collection?.results ? collection.results.slice() : [];
};
const status = (value: string): AdminAnnualTargetStatus => {
  if (value === 'Approved') return 'Approved';
  if (value === 'Submitted') return 'Submitted';
  if (value === 'Superseded') return 'Superseded';
  if (value === 'Retired') return 'Retired';
  return 'Draft';
};
const approvalStatus = (value: string): AdminControlApprovalStatus => {
  if (value === 'Approved' || value === 'Active') return 'Approved';
  if (value === 'Submitted') return 'PendingApproval';
  if (value === 'Retired' || value === 'Superseded') return 'Retired';
  return 'Draft';
};
const publicationStatus = (value: string): AdminOutputPublicationStatus => {
  if (value === 'Active' || value === 'Published') return 'Published';
  if (value === 'Approved') return 'Approved';
  if (value === 'Retired') return 'Retired';
  return 'Draft';
};
const behaviourPrompts = (guidance: string | undefined): string[] => clean(guidance)
  .split(/\r?\n/)
  .map(line => /^\s*\d+[.)]\s*(.+?)\s*$/.exec(line))
  .filter((match): match is RegExpExecArray => Boolean(match))
  .map(match => clean(match[1]));

export const mapAdminKpiRow = (row: IKpiRow): IAdminKpiMasterRecord => {
  const metadata = parseProductionScoringMetadata(row.RAGParametersJSON, row.KPIID, row.KPIVersionKey);
  const issues = metadata.issues.slice();
  if (clean(row.UnitLabel).toUpperCase() === 'TBC') issues.push('Unit is unresolved.');
  if (clean(row.MetricType).toUpperCase() === 'TBC') issues.push('Measure Type is unresolved.');
  if (clean(row.MetricType).toLowerCase() === 'percentage' && !metadata.percentageSourceScale) {
    issues.push('Percentage source scale is missing or unapproved.');
  }
  return {
    id: row.Id,
    kpiId: clean(row.KPIID),
    kpiVersionKey: clean(row.KPIVersionKey),
    wording: clean(row.KPIWording),
    wordingSourceReference: clean(row.ChangeReference) || clean(row.SourceOrigin),
    pillar: clean(row.Pillar),
    workstream: clean(row.Workstream),
    active: row.DefinitionStatus === 'Active',
    owner: clean(row.AccountableOwnerEmail) || clean(row.AccountableOwnerPersonKey),
    measureType: clean(row.MetricType),
    unit: clean(row.UnitLabel),
    direction: clean(row.ScoringDirection),
    aggregationMethod: clean(row.AggregationMethod),
    reportingStatus: clean(row.ReportingStatus) || undefined,
    scoringPolicyApproved: metadata.metadata?.status === 'Approved'
      && Boolean(clean(metadata.metadata.approvalReference)),
    scoringPolicyReference: clean(metadata.metadata?.approvalReference) || undefined,
    scoringMetadataIssues: issues
  };
};

export const mapAdminBehaviourRow = (row: IBehaviourRow): IAdminBehaviourDefinitionRecord => ({
  id: row.Id,
  behaviourId: clean(row.BehaviourID),
  behaviourVersionKey: clean(row.BehaviourVersionKey),
  title: clean(row.Title),
  description: clean(row.Description),
  guidancePrompts: behaviourPrompts(row.AssessmentGuidance),
  active: row.IsCurrent && row.Status !== 'Retired',
  published: row.Status === 'Published',
  isCurrent: row.IsCurrent,
  modifiedAt: clean(row.Modified),
  modifiedBy: editor(row.Editor)
});

export default class SharePointAdminReportingControlDataService
implements IAdminReportingControlDataService {
  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly currentUserEmail: string,
    private readonly allowPeterSafeUatReadOnly: boolean = false
  ) {}

  public async getAdminReportingControlSnapshot(requestedPerformanceYear?: number): Promise<IAdminReportingControlSnapshot> {
    await this.assertCurrentAdmin();
    const performanceYear = requestedPerformanceYear === undefined
      ? await this.getCurrentPerformanceYear()
      : requestedPerformanceYear;
    if (!Number.isInteger(performanceYear) || performanceYear < 2000 || performanceYear > 2100) {
      throw new Error('Admin Reporting Control requires a valid Performance Year.');
    }
    const auditDateTo = new Date();
    const auditReadRequest = buildBoundedAuditReadRequest({
      dateFrom: new Date(auditDateTo.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString(),
      dateTo: auditDateTo.toISOString()
    }, 90);
    const [kpiRows, targetRows, behaviourRows, weightRows, mapRows, outputRows, officialResultRows, auditRows] = await Promise.all([
      this.getItems<IKpiRow>(LISTS.kpis, ADMIN_KPI_MASTER_SELECT, 'IsCurrent eq 1', 'KPIID', 5000, 'Editor'),
      this.getItems<ITargetRow>(LISTS.targets, ADMIN_ANNUAL_TARGET_SELECT,
        undefined, 'PerformanceYear desc,KPIID', 5000, 'Editor'),
      this.getItems<IBehaviourRow>(LISTS.behaviours, ADMIN_BEHAVIOUR_DEFINITION_SELECT,
        'IsCurrent eq 1', 'DisplayOrder', 100, 'Editor'),
      this.getItems<IWeightRow>(LISTS.weights, ADMIN_ORGANISATIONAL_WEIGHT_SELECT,
        `PerformanceYear eq ${performanceYear}`, 'WeightLevel,ParentKey,ChildKey', 5000, undefined, true),
      this.getItems<IMapRow>(LISTS.maps, ADMIN_REPORTING_MAP_SELECT, undefined,
        'KPIID,OutputCode,VersionNumber', 5000),
      this.getItems<IOutputRow>(LISTS.outputs, ADMIN_OUTPUT_DEFINITION_SELECT, undefined,
        'OutputCode', 5000),
      this.getItems<IOfficialResultRow>(LISTS.results, ADMIN_OFFICIAL_RESULT_SELECT,
        `PerformanceYear eq ${performanceYear} and (ResultStatus eq 'Approved' or ResultStatus eq 'Published')`,
        'KPIID,Quarter', 5000),
      this.getItems<IAuditRow>(LISTS.audit, ADMIN_AUDIT_VIEW_SELECT,
        `EventAt ge datetime'${auditReadRequest.dateFrom}' and EventAt le datetime'${auditReadRequest.dateTo}'`,
        'EventAt desc', 500)
    ]);
    const owners: { [key: string]: string } = {};
    kpiRows.forEach(row => {
      owners[clean(row.KPIID).toLowerCase()] = clean(row.AccountableOwnerEmail)
        || clean(row.AccountableOwnerPersonKey);
    });
    return {
      mode: 'ProductionReadOnly',
      performanceYear,
      loadedAt: new Date().toISOString(),
      kpis: kpiRows.map(mapAdminKpiRow),
      annualTargets: targetRows.map(row => ({
        id: row.Id,
        kpiId: clean(row.KPIID),
        performanceYear: String(row.PerformanceYear),
        targetVersionKey: clean(row.TargetVersionKey),
        annualTarget: targetValue(row.YearEndTargetValue, row.YearEndTargetText),
        q1Target: targetValue(row.Q1TargetValue, row.Q1TargetText),
        q2Target: targetValue(row.Q2TargetValue, row.Q2TargetText),
        q3Target: targetValue(row.Q3TargetValue, row.Q3TargetText),
        q4Target: targetValue(row.Q4TargetValue, row.Q4TargetText),
        status: status(row.TargetStatus),
        owner: owners[clean(row.KPIID).toLowerCase()] || clean(row.ApprovedByEmail)
          || clean(row.SubmittedByEmail),
        modifiedAt: clean(row.Modified),
        modifiedBy: editor(row.Editor)
      } as IAdminAnnualTargetRecord)),
      behaviourDefinitions: behaviourRows.map(mapAdminBehaviourRow),
      organisationalWeights: weightRows.map(row => ({
        organisationalWeightKey: clean(row.OrganisationalWeightKey),
        weightGroupKey: clean(row.WeightGroupKey),
        performanceYear: row.PerformanceYear,
        weightLevel: row.WeightLevel,
        parentKey: clean(row.ParentKey),
        childKey: clean(row.ChildKey),
        weightPercent: row.WeightPercent,
        active: row.Active,
        approvalStatus: row.ApprovalStatus,
        effectiveFrom: row.EffectiveFrom,
        effectiveTo: clean(row.EffectiveTo) || undefined,
        version: clean(row.Version),
        approvalReference: clean(row.ApprovalReference),
        source: clean(row.Source),
        publishedSnapshotKey: clean(row.PublishedSnapshotKey) || undefined,
        historicSnapshotLocked: row.HistoricSnapshotLocked
      })),
      reportingMaps: mapRows.map(row => ({
        id: row.Id,
        mappingKey: clean(row.ReportingMapVersionKey),
        naturalKey: clean(row.ReportingMapNaturalKey),
        kpiId: clean(row.KPIID),
        outputCode: clean(row.OutputCode),
        externalKey: clean(row.ExternalKey),
        allocationPercent: row.AllocationPct,
        treatment: row.Treatment,
        treatmentRuleJson: clean(row.TreatmentRuleJSON) || undefined,
        reportingCadence: clean(row.ReportingCadence) as IAdminReportingMapRecord['reportingCadence'],
        effectiveFrom: row.EffectiveFrom,
        effectiveTo: clean(row.EffectiveTo) || undefined,
        active: row.Status === 'Active',
        version: String(row.VersionNumber),
        approvalStatus: approvalStatus(row.Status),
        changeReference: clean(row.ChangeReference),
        approvedByEmail: clean(row.ApprovedByEmail) || undefined,
        approvedAt: clean(row.ApprovedAt) || undefined
      } as IAdminReportingMapRecord)),
      outputDefinitions: outputRows.map(row => ({
        id: row.Id,
        outputCode: clean(row.OutputCode),
        outputName: clean(row.Title),
        description: clean(row.Description),
        active: row.Status === 'Active',
        reportingFrequency: clean(row.ReportingCadence),
        mappingRequirement: row.MappingRequirement === 'Required'
          ? 'Required'
          : row.MappingRequirement === 'Optional' ? 'Optional' : undefined,
        outputFormat: clean(row.OutputFormat) as IAdminOutputDefinition['outputFormat'],
        effectiveFrom: row.EffectiveFrom,
        effectiveTo: clean(row.EffectiveTo) || undefined,
        version: clean(row.SchemaVersion),
        publicationStatus: publicationStatus(row.Status),
        ownerEmail: clean(row.OwnerEmail),
        changeReference: clean(row.ChangeReference),
        approvedByEmail: clean(row.ApprovedByEmail) || undefined,
        approvedAt: clean(row.ApprovedAt) || undefined
      } as IAdminOutputDefinition)),
      officialResults: officialResultRows
        .filter(row => (row.Quarter === 'Q1' || row.Quarter === 'Q2' || row.Quarter === 'Q3' || row.Quarter === 'Q4')
          && (row.ResultStatus === 'Approved' || row.ResultStatus === 'Published'))
        .map(row => ({
          kpiResultKey: clean(row.KPIResultKey),
          kpiId: clean(row.KPIID),
          performanceYear: row.PerformanceYear,
          quarter: row.Quarter,
          finalActual: row.FinalActualValue !== undefined ? row.FinalActualValue : clean(row.FinalActualText) || undefined,
          resultStatus: row.ResultStatus,
          approvedByEmail: clean(row.ApprovedByEmail) || undefined,
          approvedAt: clean(row.ApprovedAt) || undefined,
          publishedAt: clean(row.PublishedAt) || undefined
        } as IAdminOfficialKpiResult)),
      auditEvents: auditRows.map(row => ({
        id: row.Id,
        auditKey: clean(row.AuditKey),
        eventAt: row.EventAt,
        actor: clean(row.ActorEmail),
        eventType: clean(row.EventType),
        entityType: clean(row.SubjectType),
        entityKey: clean(row.SubjectKey),
        correlationKey: clean(row.CorrelationKey) || undefined,
        sourceReference: clean(row.SourceReference) || undefined,
        beforeJson: clean(row.BeforeJSON) || undefined,
        afterJson: clean(row.AfterJSON) || undefined,
        contextJson: JSON.stringify({ actorRole: row.ActorRole, reason: row.Reason, source: row.Source, success: row.Success })
      } as IAdminAuditRecord)),
      auditReadRequest,
      warnings: auditRows.length === 500
        ? ['Audit Viewer is capped at the newest 500 events inside the bounded 90-day read window.']
        : []
    };
  }

  private async assertCurrentAdmin(): Promise<void> {
    const actorRows = await this.getItems<IAdminActorRow>(LISTS.people, 'Email,AppRoles,Active',
      `Email eq '${escapeOData(this.currentUserEmail.trim())}' and Active eq 1`, 'Id', 2);
    const safeUatReadOnly = this.allowPeterSafeUatReadOnly
      && this.currentUserEmail.trim().toLowerCase() === 'person003@example.invalid'
      && this.webAbsoluteUrl.trim().toLowerCase()
        === 'https://example.invalid/sites/REVIEW-TEST-SITE';
    if (actorRows.length !== 1
      || (!isKpiDataQualityAdmin(roles(actorRows[0].AppRoles)) && !safeUatReadOnly)) {
      throw new Error('The current authenticated People record is not authorised for Admin Reporting Control.');
    }
  }

  private async getCurrentPerformanceYear(): Promise<number> {
    const rows = await this.getItems<IConfigYearRow>(LISTS.config, 'DateValue,ValueType',
      "ConfigKey eq 'PerformanceYear.End' and Active eq 1", 'Id desc', 2);
    const dateValue = rows.length === 1 && rows[0].ValueType === 'Date'
      ? rows[0].DateValue
      : undefined;
    const performanceYear = dateValue && !Number.isNaN(Date.parse(dateValue))
      ? new Date(dateValue).getUTCFullYear()
      : NaN;
    if (!Number.isInteger(performanceYear) || performanceYear < 2000 || performanceYear > 2100) {
      throw new Error('Admin Reporting Control could not resolve one active Performance Year from Config.');
    }
    return performanceYear;
  }

  private async getItems<T>(
    listTitle: string,
    select: string,
    filter: string | undefined,
    orderBy: string,
    top: number,
    expand?: string,
    missingListIsEmpty: boolean = false
  ): Promise<T[]> {
    const parameters = [`$select=${select}`];
    if (expand) parameters.push(`$expand=${expand}`);
    if (filter) parameters.push(`$filter=${encodeURIComponent(filter)}`);
    parameters.push(`$orderby=${encodeURIComponent(orderBy)}`, `$top=${top}`);
    const url = `${this.webAbsoluteUrl.replace(/\/$/, '')}/_api/web/lists/getbytitle('${escapeOData(listTitle)}')/items?${parameters.join('&')}`;
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    if (missingListIsEmpty && response.status === 404) return [];
    await this.ensureSuccess(response, `Admin read failed for ${listTitle}.`);
    const data = await response.json() as IODataCollection<T>;
    return data.value;
  }

  private async ensureSuccess(response: SPHttpClientResponse, message: string): Promise<void> {
    if (!response.ok) throw new Error(`${message} SharePoint returned HTTP ${response.status}.`);
  }
}
