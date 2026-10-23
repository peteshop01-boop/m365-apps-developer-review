import type { IAdminAnnualTargetRecord } from './AdminAnnualTargetsDomain';
import type { IAdminBehaviourDefinitionRecord } from './AdminBehaviourDefinitionsDomain';
import type { IAdminKpiMasterRecord } from './AdminKpiMasterDomain';
import type {
  IAdminAuditRecord,
  IAdminBoundedAuditReadRequest,
  IAdminOutputDefinition,
  IAdminReportingMapRecord
} from './AdminReportingControlDomain';
import type { IOrganisationalWeightRecord } from './ProductionPolicyStructures';

export interface IAdminOfficialKpiResult {
  kpiResultKey: string;
  kpiId: string;
  performanceYear: number;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  finalActual?: number | string;
  resultStatus: 'Approved' | 'Published';
  approvedByEmail?: string;
  approvedAt?: string;
  publishedAt?: string;
}

export interface IAdminReportingControlSnapshot {
  mode: 'ProductionReadOnly';
  performanceYear: number;
  loadedAt: string;
  kpis: readonly IAdminKpiMasterRecord[];
  annualTargets: readonly IAdminAnnualTargetRecord[];
  behaviourDefinitions: readonly IAdminBehaviourDefinitionRecord[];
  organisationalWeights: readonly IOrganisationalWeightRecord[];
  reportingMaps: readonly IAdminReportingMapRecord[];
  outputDefinitions: readonly IAdminOutputDefinition[];
  officialResults: readonly IAdminOfficialKpiResult[];
  auditEvents: readonly IAdminAuditRecord[];
  auditReadRequest: IAdminBoundedAuditReadRequest;
  warnings: readonly string[];
}

export interface IAdminReportingControlDataService {
  getAdminReportingControlSnapshot(performanceYear?: number): Promise<IAdminReportingControlSnapshot>;
}
