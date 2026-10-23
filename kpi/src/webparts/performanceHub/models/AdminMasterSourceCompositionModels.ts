import type { IAdminKpiMasterRecord } from '../services/AdminKpiMasterDomain';
import type { IAdminDataQualityIssue } from '../services/AdminDataQualityDomain';
import type { IStrategicCoreCoverageSource } from '../services/StrategicCoreCoverageFeed';
import type { IStrategyOutcomeVersion, IStrategyCycleVersion } from '../services/yearLifecycle/YearLifecycleModels';

export interface IAdminMasterCoordinates { readonly actor: string; readonly person: string; readonly year: number; }
export interface IAdminMasterMapping {
  readonly kpiId: string; readonly kpiVersionKey: string; readonly strategyId: string;
  readonly strategyVersion: string; readonly activePeriod: string; readonly sourceReference: string;
  readonly outcome: Pick<IStrategyOutcomeVersion, 'outcomeId' | 'outcomeVersion'> | 'Unmapped';
}
export interface IAdminMasterAssignment {
  readonly assignmentId: string; readonly kpiId: string; readonly kpiVersionKey: string;
  readonly person: string; readonly role: string; readonly activePeriod: string;
  readonly current: boolean; readonly sourceReference: string;
}
/** Explicit read-only capture. It conveys no installed, mutation, approval or reporting authority. */
export interface IAdminMasterSourceCapture {
  readonly coordinates: IAdminMasterCoordinates;
  readonly sourceVersion: string; readonly masterVersion: string; readonly mappingVersion: string;
  readonly assignmentVersion: string; readonly coverageVersion: string; readonly sourceReference: string;
  readonly asOfDate: string; readonly activePeriod: string;
  readonly records: readonly IAdminKpiMasterRecord[];
  readonly mappings: readonly IAdminMasterMapping[];
  readonly assignments: readonly IAdminMasterAssignment[];
  readonly coverage: IStrategicCoreCoverageSource;
  readonly dataQualityIssues: readonly IAdminDataQualityIssue[];
  /** Retained only; the committed strategy engine remains explicitly 2029. */
  readonly strategyHistory?: readonly IStrategyCycleVersion[];
}
export type AdminMasterReadResult =
  | { readonly status: 'READY_SOURCE'; readonly nativeAdmission: 'NOT_ADMITTED'; readonly capture: IAdminMasterSourceCapture }
  | { readonly status: 'DENIED' | 'HOLD'; readonly nativeAdmission: 'NOT_ADMITTED'; readonly reason: string };
export interface IAdminMasterSourceReader {
  read(coordinates: IAdminMasterCoordinates): Promise<IAdminMasterSourceCapture | undefined>;
}
export interface IAdminMasterFilters {
  search?: string; status?: 'All' | 'Active' | 'Inactive'; owner?: string;
  role?: string; strategy?: string; outcome?: string; activePeriod?: string;
}
