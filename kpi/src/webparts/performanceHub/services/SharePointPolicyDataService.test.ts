jest.mock('@microsoft/sp-http', () => ({
  SPHttpClient: { configurations: { v1: {} } }
}));

import SharePointPolicyDataService from './SharePointPolicyDataService';
import type { IMilestoneStageRecord } from './ScoringPolicy';
import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';

const service = new SharePointPolicyDataService({} as never, 'https://example.invalid');
const base: Omit<IMilestoneStageRecord, 'stageKey' | 'stageName' | 'sortOrder' | 'completionPercent' | 'version'> = {
  performanceYear: '2026', kpiId: 'TEST-001', kpiVersionKey: 'TEST-001|v01', active: true,
  approvalStatus: 'Approved', effectiveFrom: '2026-04-01', source: 'CONTROL', approvalReference: 'CONTROL-001'
};

describe('SharePoint policy data service pure policy selection', () => {
  it('selects one exact current approved Milestone map', () => {
    const rows: IMilestoneStageRecord[] = [
      { ...base, version: 'v01', stageKey: 'START', stageName: 'Started', sortOrder: 1, completionPercent: 0 },
      { ...base, version: 'v01', stageKey: 'DONE', stageName: 'Done', sortOrder: 2, completionPercent: 100 }
    ];
    expect(service.resolveCurrentMilestonePolicy(rows, 2026, 'TEST-001', 'TEST-001|v01', '2026-08-20')?.version).toBe('v01');
    expect(service.resolveCurrentMilestonePolicy(rows, 2027, 'TEST-001', 'TEST-001|v01', '2026-08-20')).toBeUndefined();
  });

  it('fails closed when multiple current versions are approved', () => {
    const rows: IMilestoneStageRecord[] = [];
    ['v01', 'v02'].forEach((version: string) => rows.push(
      { ...base, version, stageKey: 'START', stageName: 'Started', sortOrder: 1, completionPercent: 0 },
      { ...base, version, stageKey: 'DONE', stageName: 'Done', sortOrder: 2, completionPercent: 100 }
    ));
    expect(service.resolveCurrentMilestonePolicy(rows, 2026, 'TEST-001', 'TEST-001|v01', '2026-08-20')).toBeUndefined();
    expect(service.resolveCurrentMilestonePolicy(rows, 2026, 'TEST-001', 'TEST-001|v01', '2026-08-20', 'v02')?.version).toBe('v02');
  });
});

describe('SharePoint organisational-weight canonical read contract', () => {
  it('selects and maps the controlled keys with a numeric physical PerformanceYear', async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ value: [{
        OrganisationalWeightKey: '2026|v01|KPIWithinWorkstream|WS-01|SO1-001',
        WeightGroupKey: '2026|v01|KPIWithinWorkstream|WS-01',
        PerformanceYear: 2026,
        WeightLevel: 'KPIWithinWorkstream',
        ParentKey: 'WS-01',
        ChildKey: 'SO1-001',
        WeightPercent: 100,
        Active: true,
        ApprovalStatus: 'Approved',
        EffectiveFrom: '2026-04-01',
        Version: 'v01',
        ApprovalReference: 'CONTROL-TEST',
        Source: 'CONTROL fixture',
        HistoricSnapshotLocked: false
      }] })
    } as unknown as SPHttpClientResponse;
    const get = jest.fn(async (_url: string) => response);
    const readService = new SharePointPolicyDataService({ get } as unknown as SPHttpClient, 'https://example.invalid');

    const records = await readService.getOrganisationalWeightRecords(2026);
    expect(records[0]).toMatchObject({
      organisationalWeightKey: '2026|v01|KPIWithinWorkstream|WS-01|SO1-001',
      weightGroupKey: '2026|v01|KPIWithinWorkstream|WS-01',
      performanceYear: 2026
    });
    expect(String(get.mock.calls[0][0])).toContain('OrganisationalWeightKey,WeightGroupKey,PerformanceYear');
  });
});
