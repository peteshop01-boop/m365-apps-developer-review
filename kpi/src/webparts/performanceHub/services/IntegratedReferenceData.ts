/* eslint-disable @rushstack/no-new-null -- the accepted source uses null for unavailable reference values. */
import acceptedImportJson from '../../../../data/KCFKPI_MASTER_IMPORT_R3.json';
import type { IAdminReportingControlSnapshot } from './AdminReportingControlDataService';

export interface IIntegratedKpi {
  kpiId: string;
  wording: string;
  pillarCode: string;
  pillar: string;
  workstream: string;
  owner?: string;
  unit: string;
  annualTarget?: number | string;
  quarterTargets: Array<{ quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'; value?: number | string }>;
  officialActual?: number | string;
  memberships: string[];
}

interface IImportKpi {
  KPIID: string; KPIWording: string; Pillar: string; Workstream: string; IsCurrent: boolean;
  DefinitionStatus: string; UnitLabel?: string | null; AccountableOwnerEmail?: string | null;
  AccountableOwnerPersonKey?: string | null;
}

interface IImportTarget {
  KPIID: string; PerformanceYear: number; PerformanceYearLabel: string; IsCurrent: boolean; TargetStatus: string;
  YearEndTargetValue?: number | null; YearEndTargetText?: string | null;
  Q1TargetValue?: number | null; Q1TargetText?: string | null;
  Q2TargetValue?: number | null; Q2TargetText?: string | null;
  Q3TargetValue?: number | null; Q3TargetText?: string | null;
  Q4TargetValue?: number | null; Q4TargetText?: string | null;
}

interface IAcceptedImport {
  source: { file: string; sha256: string; authoritativeSheet: string; authoritativeTable: string };
  payloadSHA256: string;
  kpiMaster: IImportKpi[];
  annualTargets: IImportTarget[];
}

const accepted = acceptedImportJson as IAcceptedImport;
const clean = (value: string | null | undefined): string => (value || '').trim();
const value = (numeric: number | null | undefined, text: string | null | undefined): number | string | undefined =>
  typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : clean(text) || undefined;
const membership = (code: string): string | undefined => ({
  MAIN_CWOP: 'Core CWOP', CORE_CWOP: 'Core CWOP',
  CITIES_CWOP: 'London Cities CWOP', LONDON_CITIES_CWOP: 'London Cities CWOP',
  WG_CWOP: 'Women & Girls CWOP', WOMEN_GIRLS_CWOP: 'Women & Girls CWOP',
  CWSP: 'CWSP'
} as Record<string, string>)[clean(code).toUpperCase()];

export const INTEGRATED_REFERENCE_SOURCE = {
  file: accepted.source.file,
  sheet: accepted.source.authoritativeSheet,
  table: accepted.source.authoritativeTable,
  sha256: accepted.source.sha256,
  payloadSha256: accepted.payloadSHA256
} as const;

export const buildIntegratedKpis = (
  performanceYear: number,
  reporting?: IAdminReportingControlSnapshot
): IIntegratedKpi[] => {
  const current = accepted.kpiMaster.filter(row => row.IsCurrent && row.DefinitionStatus === 'Active');
  if (current.length !== 109 || new Set(current.map(row => clean(row.KPIID))).size !== 109) {
    throw new Error('The approved Strategic Core source is not the exact 109-row catalogue.');
  }
  const targets = accepted.annualTargets.filter(row => row.IsCurrent && row.TargetStatus === 'Approved'
    && row.PerformanceYear === performanceYear);
  const targetById = new Map(targets.map(row => [clean(row.KPIID), row]));
  const maps = new Map<string, string[]>();
  (reporting?.reportingMaps || []).filter(row => row.active && row.approvalStatus === 'Approved').forEach(row => {
    const label = membership(row.outputCode);
    if (!label) return;
    const values = maps.get(row.kpiId) || [];
    if (values.indexOf(label) < 0) values.push(label);
    maps.set(row.kpiId, values);
  });
  const actuals = new Map<string, number | string>();
  (reporting?.officialResults || []).filter(row => row.performanceYear === performanceYear && row.finalActual !== undefined)
    .sort((left, right) => left.quarter.localeCompare(right.quarter)).forEach(row => actuals.set(row.kpiId, row.finalActual as number | string));
  return current.map(row => {
    const target = targetById.get(clean(row.KPIID));
    const pillar = clean(row.Pillar);
    const pillarMatch = /^SO([1-7])\b/.exec(pillar);
    return {
      kpiId: clean(row.KPIID), wording: clean(row.KPIWording), pillarCode: pillarMatch ? `S0${pillarMatch[1]}` : pillar.slice(0, 3), pillar,
      workstream: clean(row.Workstream),
      owner: clean(row.AccountableOwnerEmail) || clean(row.AccountableOwnerPersonKey) || undefined,
      unit: clean(row.UnitLabel), annualTarget: value(target?.YearEndTargetValue, target?.YearEndTargetText),
      quarterTargets: [
        { quarter: 'Q1', value: value(target?.Q1TargetValue, target?.Q1TargetText) },
        { quarter: 'Q2', value: value(target?.Q2TargetValue, target?.Q2TargetText) },
        { quarter: 'Q3', value: value(target?.Q3TargetValue, target?.Q3TargetText) },
        { quarter: 'Q4', value: value(target?.Q4TargetValue, target?.Q4TargetText) }
      ],
      officialActual: actuals.get(clean(row.KPIID)), memberships: maps.get(clean(row.KPIID)) || []
    };
  });
};

export const integratedReferenceCounts = (kpis: readonly IIntegratedKpi[]): {
  kpis: number; pillars: number; workstreams: number; targets: number; officialActuals: number; memberships: number;
} => ({
  kpis: kpis.length,
  pillars: new Set(kpis.map(row => row.pillar)).size,
  workstreams: new Set(kpis.map(row => row.workstream)).size,
  targets: kpis.filter(row => row.annualTarget !== undefined).length,
  officialActuals: kpis.filter(row => row.officialActual !== undefined).length,
  memberships: kpis.reduce((total, row) => total + row.memberships.length, 0)
});
