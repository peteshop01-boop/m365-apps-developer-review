import type { IAdminReportingControlSnapshot } from './AdminReportingControlDataService';
import type { IAdminConfigSourceRecord } from './AdminConfigDomain';
import type { EmployeeContributionMethodV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { ReportingMembership } from './StrategicCoreCoverageFeed';

export type IntegratedCoreRole = 'Owner' | 'Delivery' | 'Support';

const fnv32 = (value: string, seed: number): string => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (`00000000${hash.toString(16)}`).slice(-8);
};

/**
 * Produces the same lower-case UUID for the same command boundary. The current
 * canonical row token is deliberately part of the caller's boundary so a retry
 * reuses its receipt while the next accepted edit receives a different key.
 */
export const integratedEmployeeCommandKey = (...parts: Array<string | number | undefined>): string => {
  const source = parts.map(part => String(part ?? '')).join('\u001f');
  const raw = [
    fnv32(source, 0x811c9dc5), fnv32(source, 0x9e3779b9),
    fnv32(source, 0x85ebca6b), fnv32(source, 0xc2b2ae35)
  ].join('');
  const versioned = `${raw.slice(0, 12)}5${raw.slice(13, 16)}8${raw.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

export const resolveIntegratedContributionMethod = (
  role: IntegratedCoreRole,
  ownerDirect: boolean | undefined,
  existing?: EmployeeContributionMethodV2
): EmployeeContributionMethodV2 => {
  if (existing === 'SharedTarget' || existing === 'WeightedDenominator') return existing;
  if (role === 'Owner') return ownerDirect ? 'AdditiveDirect' : 'AccountableOwner';
  return role === 'Delivery' ? 'AdditiveDirect' : 'CompletionOversight';
};

export interface IIntegratedReportingCounts {
  kpis: number;
  targets: number;
  memberships: number;
  officialActuals: number;
}

export const getIntegratedReportingReadinessReasons = (
  counts: IIntegratedReportingCounts,
  reporting: IAdminReportingControlSnapshot | undefined,
  configs: readonly IAdminConfigSourceRecord[]
): string[] => [
  counts.kpis !== 109 ? `Core catalogue has ${counts.kpis} of 109 KPIs.` : '',
  counts.targets === 0 ? 'No approved organisation targets are configured for the current performance year.' : '',
  counts.memberships === 0 ? 'No confirmed current Reporting Map memberships are configured.' : '',
  counts.officialActuals === 0 ? 'No approved or published Official Actuals are available.' : '',
  !reporting ? 'The authorised Reporting Control snapshot is unavailable.' : '',
  reporting && reporting.outputDefinitions.length === 0 ? 'No approved reporting output definitions are configured.' : '',
  configs.length === 0 ? 'Required current-year application configuration could not be confirmed.' : '',
  ...(reporting?.warnings || [])
].filter(Boolean);

export interface IIntegratedMembershipOption {
  key: ReportingMembership;
  label: string;
  enabled: boolean;
}

export const getConfirmedCoverageMembershipOptions = (
  reporting: IAdminReportingControlSnapshot | undefined
): IIntegratedMembershipOption[] => {
  const supported: readonly ReportingMembership[] = ['CORE_CWOP', 'LONDON_CITIES_CWOP', 'WOMEN_GIRLS_CWOP', 'CWSP'];
  const codes = Array.from(new Set((reporting?.reportingMaps || [])
    .filter(row => row.active && row.approvalStatus === 'Approved')
    .map(row => row.outputCode.trim())
    .filter((code): code is ReportingMembership => supported.indexOf(code as ReportingMembership) >= 0))).sort();
  return codes.map(code => ({ key: code, label: code.replace(/_/g, ' '), enabled: true }));
};
