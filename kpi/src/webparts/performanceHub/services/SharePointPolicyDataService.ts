import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import type { IOrganisationalWeightRecord } from './ProductionPolicyStructures';
import {
  resolveApprovedMilestonePolicy,
  type IApprovedMilestonePolicy,
  type IMilestoneStageRecord
} from './ScoringPolicy';

interface IODataCollection<T> { value: T[]; }

interface IMilestoneStageListItem {
  PerformanceYear: number;
  KPIID: string;
  KPIVersionKey: string;
  StageKey: string;
  StageName: string;
  SortOrder: number;
  CompletionPercent: number;
  Active: boolean;
  ApprovalStatus: IMilestoneStageRecord['approvalStatus'];
  EffectiveFrom: string;
  EffectiveTo?: string;
  Version: string;
  Source: string;
  ApprovalReference: string;
}

interface IOrganisationalWeightListItem {
  OrganisationalWeightKey: string;
  WeightGroupKey: string;
  PerformanceYear: number;
  WeightLevel: IOrganisationalWeightRecord['weightLevel'];
  ParentKey: string;
  ChildKey: string;
  WeightPercent?: number;
  Active: boolean;
  ApprovalStatus: IOrganisationalWeightRecord['approvalStatus'];
  EffectiveFrom: string;
  EffectiveTo?: string;
  Version: string;
  ApprovalReference: string;
  Source: string;
  PublishedSnapshotKey?: string;
  HistoricSnapshotLocked: boolean;
}

const LISTS = {
  milestoneStages: 'KCFKPI_MilestoneStages',
  organisationalWeights: 'KCFKPI_OrganisationalWeights'
} as const;

const MILESTONE_SELECT = 'PerformanceYear,KPIID,KPIVersionKey,StageKey,StageName,SortOrder,CompletionPercent,Active,ApprovalStatus,EffectiveFrom,EffectiveTo,Version,Source,ApprovalReference';
const WEIGHT_SELECT = 'OrganisationalWeightKey,WeightGroupKey,PerformanceYear,WeightLevel,ParentKey,ChildKey,WeightPercent,Active,ApprovalStatus,EffectiveFrom,EffectiveTo,Version,ApprovalReference,Source,PublishedSnapshotKey,HistoricSnapshotLocked';

export default class SharePointPolicyDataService {
  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string
  ) {}

  public async getMilestoneStageRecords(performanceYear: number): Promise<IMilestoneStageRecord[]> {
    const rows = await this.getItems<IMilestoneStageListItem>(
      LISTS.milestoneStages,
      MILESTONE_SELECT,
      `PerformanceYear eq ${performanceYear} and Active eq 1`,
      'KPIID,Version,SortOrder',
      5000
    );
    return rows.map(row => ({
      performanceYear: String(row.PerformanceYear),
      kpiId: row.KPIID,
      kpiVersionKey: row.KPIVersionKey,
      stageKey: row.StageKey,
      stageName: row.StageName,
      sortOrder: row.SortOrder,
      completionPercent: row.CompletionPercent,
      active: row.Active,
      approvalStatus: row.ApprovalStatus,
      effectiveFrom: row.EffectiveFrom,
      effectiveTo: row.EffectiveTo || undefined,
      version: row.Version,
      source: row.Source,
      approvalReference: row.ApprovalReference
    }));
  }

  public resolveCurrentMilestonePolicy(
    records: readonly IMilestoneStageRecord[],
    performanceYear: number,
    kpiId: string,
    kpiVersionKey: string,
    effectiveAt: string,
    requestedVersion?: string
  ): IApprovedMilestonePolicy | undefined {
    const versions = requestedVersion?.trim()
      ? [requestedVersion.trim()]
      : Array.from(new Set(records
        .filter(record => record.performanceYear === String(performanceYear)
          && record.kpiId.toLowerCase() === kpiId.toLowerCase()
          && record.kpiVersionKey.toLowerCase() === kpiVersionKey.toLowerCase())
        .map(record => record.version)));
    const candidates = versions
      .map(version => resolveApprovedMilestonePolicy(records, {
        performanceYear: String(performanceYear),
        kpiId,
        kpiVersionKey,
        version,
        effectiveAt
      }))
      .filter((policy): policy is IApprovedMilestonePolicy => Boolean(policy));
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  public async getOrganisationalWeightRecords(performanceYear: number): Promise<IOrganisationalWeightRecord[]> {
    const rows = await this.getItems<IOrganisationalWeightListItem>(
      LISTS.organisationalWeights,
      WEIGHT_SELECT,
      `PerformanceYear eq ${performanceYear} and Active eq 1`,
      'Version,WeightLevel,ParentKey,ChildKey',
      5000
    );
    return rows.map(row => ({
      organisationalWeightKey: row.OrganisationalWeightKey,
      weightGroupKey: row.WeightGroupKey,
      performanceYear: row.PerformanceYear,
      weightLevel: row.WeightLevel,
      parentKey: row.ParentKey,
      childKey: row.ChildKey,
      weightPercent: row.WeightPercent,
      active: row.Active,
      approvalStatus: row.ApprovalStatus,
      effectiveFrom: row.EffectiveFrom,
      effectiveTo: row.EffectiveTo || undefined,
      version: row.Version,
      approvalReference: row.ApprovalReference,
      source: row.Source,
      publishedSnapshotKey: row.PublishedSnapshotKey || undefined,
      historicSnapshotLocked: row.HistoricSnapshotLocked
    }));
  }

  private async getItems<T>(listTitle: string, select: string, filter: string, orderBy: string, top: number): Promise<T[]> {
    const url = `${this.webAbsoluteUrl}/_api/web/lists/getbytitle('${listTitle}')/items?$select=${select}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent(orderBy)}&$top=${top}`;
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    // The policy lists are additive KCF-KPI-015E structures. Until physically
    // provisioned, absence must fail closed to no approved policy rather than
    // breaking the existing employee journey.
    if (response.status === 404) return [];
    await this.ensureSuccess(response, `Production policy data could not load from ${listTitle}.`);
    const data = await response.json() as IODataCollection<T>;
    return data.value;
  }

  private async ensureSuccess(response: SPHttpClientResponse, fallbackMessage: string): Promise<void> {
    if (!response.ok) throw new Error(`${fallbackMessage} Please contact the KPI system owner.`);
  }
}
