import { readAdminMasterSource, filterAdminMasterSource, projectAdminMasterSource } from './AdminMasterSourceComposition';
import { buildStrategicCoreCoverageUatSource, calculateStrategicCoreCoverageFeed } from './StrategicCoreCoverageFeed';
import type { IAdminMasterSourceCapture } from '../models/AdminMasterSourceCompositionModels';

const coordinates = { actor: 'admin@example.invalid', person: 'admin', year: 2027 };
const source = (): IAdminMasterSourceCapture => {
  const coverage = buildStrategicCoreCoverageUatSource();
  const records = coverage.kpis.map((row, index) => ({ id: index, kpiId: row.kpiId, kpiVersionKey: 'v1', wording: row.wording,
    wordingSourceReference: 'synthetic-master/v1', pillar: row.pillar, workstream: row.workstream, active: index !== 1,
    owner: index === 0 ? 'Owner A' : 'Owner B', measureType: 'Count', unit: row.unit, direction: 'HigherIsBetter', aggregationMethod: 'DirectMetric', reportingStatus: 'Included' }));
  return { coordinates, sourceVersion: 'capture1', masterVersion: 'master1', mappingVersion: 'mapping1', assignmentVersion: 'assignment1',
    coverageVersion: 'coverage1', sourceReference: 'Synthetic capture', asOfDate: coverage.asOfDate, activePeriod: '2027 Annual',
    records, coverage, mappings: records.map((row, index) => ({ kpiId: row.kpiId, kpiVersionKey: row.kpiVersionKey, strategyId: 'S1',
      strategyVersion: 'S1v1', activePeriod: '2027 Annual', sourceReference: 'explicit historical mapping1',
      outcome: index === 2 ? 'Unmapped' : { outcomeId: 'O1', outcomeVersion: 1 } })),
    assignments: records.map(row => ({ assignmentId: row.kpiId, kpiId: row.kpiId, kpiVersionKey: row.kpiVersionKey,
      person: 'Person A', role: 'Contributor', activePeriod: '2027 Annual', current: true, sourceReference: 'assignment1' })), dataQualityIssues: [] };
};
describe('captured Admin source composition', () => {
  it('retains detached frozen historical mappings and exact coverage arithmetic', async () => {
    const capture = source();
    const result = await readAdminMasterSource({ read: async () => capture }, coordinates, true);
    expect(result.status).toBe('READY_SOURCE');
    if (result.status !== 'READY_SOURCE') throw Error('Capture unavailable');
    const historical = JSON.stringify(result.capture);
    (capture.mappings[0].outcome as { outcomeVersion: number }).outcomeVersion = 2;
    capture.records[0].wording = 'Later current wording';
    expect(JSON.stringify(result.capture)).toBe(historical);
    expect(Object.isFrozen(result.capture.mappings[0])).toBe(true);
    expect(projectAdminMasterSource(result.capture).coverage).toEqual(calculateStrategicCoreCoverageFeed(result.capture.coverage));
    expect(result.nativeAdmission).toBe('NOT_ADMITTED');
  });
  it.each([
    ['search', 'SC-SCHOOLS-200', 1], ['owner', 'Owner A', 1], ['status', 'Inactive', 1],
    ['role', 'Contributor', 10], ['strategy', 'S1', 10], ['outcome', 'Unmapped', 1], ['activePeriod', '2027 Annual', 10],
    ['outcome', 'invented', 0]
  ])('filters %s from supplied records', (field, value, count) => {
    expect(filterAdminMasterSource(source(), { [field]: value })).toHaveLength(count as number);
  });
  it('projects all three exception families while retaining domain correction outputs', () => {
    const capture = source();
    const projection = projectAdminMasterSource({ ...capture, records: [...capture.records, capture.records[0]] });
    expect(new Set(projection.exceptions.map(row => row.family))).toEqual(new Set(['Duplicate', 'Unmapped', 'InactiveAssigned']));
    expect(projection.exceptions.every(row => Boolean(row.correctionRoute))).toBe(true);
  });
  it.each(['sourceReference', 'mappingVersion', 'activePeriod', 'asOfDate'])('holds missing %s', async field => {
    const capture = { ...source(), [field]: '' };
    expect((await readAdminMasterSource({ read: async () => capture }, coordinates, true)).status).toBe('HOLD');
  });
  it('holds missing mapping, role, assignment provenance and conflicting coordinates', async () => {
    const capture = source();
    for (const changed of [{ ...capture, mappings: [] }, { ...capture, assignments: [{ ...capture.assignments[0], role: '' }] },
      { ...capture, assignments: [{ ...capture.assignments[0], sourceReference: '' }] },
      { ...capture, coordinates: { ...coordinates, year: 2026 } }, { ...capture, coverage: { ...capture.coverage, asOfDate: '2027-10-01' } }]) {
      expect((await readAdminMasterSource({ read: async () => changed }, coordinates, true)).status).toBe('HOLD');
    }
  });
  it('denies unauthorised callers without reading; missing or failing read ports HOLD', async () => {
    const read = jest.fn(async () => source());
    expect((await readAdminMasterSource({ read }, coordinates, false)).status).toBe('DENIED');
    expect(read).not.toHaveBeenCalled();
    expect((await readAdminMasterSource(undefined, coordinates, true)).status).toBe('HOLD');
    expect((await readAdminMasterSource({ read: async () => undefined }, coordinates, true)).status).toBe('HOLD');
    expect((await readAdminMasterSource({ read: async () => { throw Error('unavailable'); } }, coordinates, true)).status).toBe('HOLD');
  });
});
