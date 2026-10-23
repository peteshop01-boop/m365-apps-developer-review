import importedJson from '../../../../data/KCFKPI_MASTER_IMPORT_R3.json';
import { buildIntegratedKpis, integratedReferenceCounts, INTEGRATED_REFERENCE_SOURCE } from './IntegratedReferenceData';

describe('KCF-KPI-026 integrated reference contract', () => {
  test('uses the accepted GOLD source and exact current 109 / 7 / 28 catalogue', () => {
    const kpis = buildIntegratedKpis(2026);
    expect(INTEGRATED_REFERENCE_SOURCE.file).toBe('KCFKPI_KPI_GOLD_SOURCE.xlsx');
    expect(INTEGRATED_REFERENCE_SOURCE.sha256).toBe(importedJson.source.sha256);
    expect(integratedReferenceCounts(kpis)).toEqual(expect.objectContaining({ kpis: 109, pillars: 7, workstreams: 28 }));
    expect(new Set(kpis.map(row => row.kpiId)).size).toBe(109);
    const sourceIds = importedJson.kpiMaster.filter(row => row.IsCurrent && row.DefinitionStatus === 'Active').map(row => row.KPIID);
    expect(kpis.map(row => row.kpiId)).toEqual(sourceIds);
    expect(Array.from(new Set(kpis.map(row => row.pillarCode))).sort()).toEqual(['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07']);
  });

  test('projects only real targets and never fabricates missing Actuals or memberships', () => {
    const kpis = buildIntegratedKpis(2026);
    expect(kpis.filter(row => row.annualTarget !== undefined).length).toBe(109);
    expect(kpis.filter(row => row.officialActual !== undefined)).toHaveLength(0);
    expect(kpis.filter(row => row.memberships.length > 0)).toHaveLength(0);
    expect(kpis.some(row => /^(CORE|CORS|SC)-/i.test(row.kpiId))).toBe(false);
  });
});
