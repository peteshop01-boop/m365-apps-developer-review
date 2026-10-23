import type { AdminMasterReadResult, IAdminMasterCoordinates, IAdminMasterFilters, IAdminMasterSourceCapture, IAdminMasterSourceReader } from '../models/AdminMasterSourceCompositionModels';
import { filterAdminKpis, inspectAdminKpiMasterReadPath } from './AdminKpiMasterDomain';
import { filterAdminDataQualityIssues } from './AdminDataQualityDomain';
import { calculateStrategicCoreCoverageFeed, type IStrategicCoreCoverageFilter } from './StrategicCoreCoverageFeed';

const present = (value: string): boolean => typeof value === 'string' && Boolean(value.trim());
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.keys(value).forEach(key => freeze((value as Record<string, unknown>)[key]));
    Object.freeze(value);
  }
  return value;
};
const same = (a: IAdminMasterCoordinates, b: IAdminMasterCoordinates): boolean =>
  a.actor === b.actor && a.person === b.person && a.year === b.year;
export const readAdminMasterSource = async (
  reader: IAdminMasterSourceReader | undefined, coordinates: IAdminMasterCoordinates, authorised: boolean
): Promise<AdminMasterReadResult> => {
  const held = (reason: string): AdminMasterReadResult => ({ status: 'HOLD', nativeAdmission: 'NOT_ADMITTED', reason });
  if (!authorised) return { status: 'DENIED', nativeAdmission: 'NOT_ADMITTED', reason: 'Authorised Admin role unavailable' };
  if (!present(coordinates.actor) || !present(coordinates.person) || !Number.isInteger(coordinates.year)) return held('Actor or period unavailable');
  if (!reader) return held('UNBOUND: governed Admin source reader unavailable');
  try {
    const source = await reader.read(Object.freeze({ ...coordinates }));
    if (!source) return held('Captured Admin source unavailable');
    // Detach from the supplied read port before retaining any historical version.
    const capture: IAdminMasterSourceCapture = JSON.parse(JSON.stringify(source));
    if (!same(capture.coordinates, coordinates)) return held('Coordinate mismatch');
    if (![capture.sourceVersion, capture.masterVersion, capture.mappingVersion, capture.assignmentVersion,
      capture.coverageVersion, capture.sourceReference, capture.activePeriod, capture.asOfDate].every(present)
      || !/^\d{4}-\d{2}-\d{2}$/.test(capture.asOfDate) || Number.isNaN(Date.parse(capture.asOfDate))) return held('Source versions, active period or provenance unavailable');
    if (!Array.isArray(capture.records) || !capture.records.length || !Array.isArray(capture.mappings)
      || !Array.isArray(capture.assignments) || !Array.isArray(capture.dataQualityIssues)) return held('Master, mapping or assignment capture unavailable');
    if (!capture.coverage || capture.coverage.performanceYear !== coordinates.year || capture.coverage.asOfDate !== capture.asOfDate)
      return held('Captured coverage period unavailable or conflicting');
    if (capture.records.some(record => !present(record.kpiId) || !present(record.kpiVersionKey)
      || !present(record.wordingSourceReference))) return held('Master identity or provenance unavailable');
    if (capture.mappings.some(mapping => ![mapping.kpiId, mapping.kpiVersionKey, mapping.strategyId, mapping.strategyVersion,
      mapping.activePeriod, mapping.sourceReference].every(present) || (mapping.outcome !== 'Unmapped'
      && (!present(mapping.outcome?.outcomeId) || !Number.isInteger(mapping.outcome?.outcomeVersion) || mapping.outcome.outcomeVersion < 1))))
      return held('Explicit historical mapping or provenance unavailable');
    if (capture.records.some(record => !capture.mappings.some(mapping => mapping.kpiId === record.kpiId
      && mapping.kpiVersionKey === record.kpiVersionKey))) return held('Explicit historical mapping unavailable');
    if (capture.assignments.some(assignment => ![assignment.assignmentId, assignment.kpiId, assignment.kpiVersionKey,
      assignment.person, assignment.role, assignment.activePeriod, assignment.sourceReference].every(present)
      || typeof assignment.current !== 'boolean')) return held('Assignment role, period or provenance unavailable');
    return freeze({ status: 'READY_SOURCE', nativeAdmission: 'NOT_ADMITTED', capture });
  } catch { return held('Captured Admin source read unavailable'); }
};

export const filterAdminMasterSource = (capture: IAdminMasterSourceCapture, filter: IAdminMasterFilters = {}): ReturnType<typeof filterAdminKpis> => {
  const matches = (value: string, wanted?: string): boolean => !wanted || value.toLowerCase().indexOf(wanted.toLowerCase()) >= 0;
  return filterAdminKpis(capture.records, { search: filter.search, activity: filter.status }).filter(record => {
    const mappings = capture.mappings.filter(row => row.kpiId === record.kpiId && row.kpiVersionKey === record.kpiVersionKey);
    const assignments = capture.assignments.filter(row => row.current && row.kpiId === record.kpiId && row.kpiVersionKey === record.kpiVersionKey);
    return matches(record.owner, filter.owner) && (!filter.role || assignments.some(row => matches(row.role, filter.role)))
      && mappings.some(row => matches(row.strategyId, filter.strategy) && matches(row.outcome === 'Unmapped' ? 'Unmapped' : row.outcome.outcomeId, filter.outcome)
        && matches(row.activePeriod, filter.activePeriod));
  });
};

export const projectAdminMasterSource = (capture: IAdminMasterSourceCapture, coverageFilter: IStrategicCoreCoverageFilter = {}): {
  coverage: ReturnType<typeof calculateStrategicCoreCoverageFeed>;
  dataQuality: ReturnType<typeof filterAdminDataQualityIssues>;
  exceptions: Array<{ family: 'Duplicate' | 'Unmapped' | 'InactiveAssigned'; detail: string; correctionRoute: string }>;
} => {
  const exceptions: Array<{ family: 'Duplicate' | 'Unmapped' | 'InactiveAssigned'; detail: string; correctionRoute: string }> = [];
  inspectAdminKpiMasterReadPath(capture.records, capture.records.length).issues.filter(issue => /duplicate|more than one active/i.test(issue))
    .forEach(detail => exceptions.push({ family: 'Duplicate', detail, correctionRoute: 'KPI Master: governed definition owner' }));
  capture.mappings.filter(row => row.outcome === 'Unmapped').forEach(row => exceptions.push({ family: 'Unmapped',
    detail: `${row.kpiId} / ${row.kpiVersionKey}: explicitly unmapped (${row.sourceReference})`, correctionRoute: 'Governed strategy mapping owner' }));
  capture.assignments.filter(row => row.current && capture.records.some(record => record.kpiId === row.kpiId
    && record.kpiVersionKey === row.kpiVersionKey && !record.active)).forEach(row => exceptions.push({ family: 'InactiveAssigned',
    detail: `${row.kpiId} / ${row.kpiVersionKey}: ${row.person}, ${row.role}, ${row.activePeriod}`, correctionRoute: 'Governed Workplan assignment owner' }));
  return { coverage: calculateStrategicCoreCoverageFeed(capture.coverage, coverageFilter),
    dataQuality: filterAdminDataQualityIssues(capture.dataQualityIssues), exceptions };
};
