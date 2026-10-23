import type {
  IAnnualWorkplan,
  ICoreWorkplanItem,
  IProductionPerson,
  IWorkplanAuditEvent,
  IWorkplanAuditWrite
} from '../models/ProductionModels';

jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: class {} }));
jest.mock('@microsoft/sp-core-library', () => ({ Guid: { newGuid: (): string => 'test-guid' } }));

import SharePointProductionDataService from './SharePointProductionDataService';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, encodeBehaviourSelectionSnapshotsV2 }
  from './BehaviourSelectionSnapshotsV2';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_PLANNING_LEVELS_VERSION }
  from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_ITEM_SELECT, BEHAVIOUR_V2_ITEM_SELECT, QUARTER_ITEM_BEHAVIOUR_V2_SELECT } from './ProductionQueryFieldContracts';

describe('quarter Behaviour Target source readback contract', () => {
  it('selects the additive frozen fields only for v02 and maps persisted values without preview fallback', async () => {
    const service = new SharePointProductionDataService(
      {} as ConstructorParameters<typeof SharePointProductionDataService>[0],
      'https://kcf.example/sites/test', 'employee@kcf.example'
    );
    const row = { Id: 17, '@odata.etag': '"quarter-17"', QuarterReviewItemKey: 'person|2026|Q1|BHV-01',
      QuarterReviewKey: 'person|2026|Q1', WorkplanItemKey: 'BHV-01', WorkplanKey: 'person|2026',
      PersonKey: 'person', PerformanceYear: 2026, Quarter: 'Q1', ItemType: 'Behaviour',
      ItemWordingSnapshot: 'Synthetic Value One', EvidenceCount: 0, ManagerApproved: false, Locked: false,
      BehaviourIDSnapshot: 'BHV-01', BehaviourFrameworkVersionSnapshot: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      BehaviourValueTitleSnapshot: 'Synthetic Value One', BehaviourCorporateValueSnapshot: 'Synthetic corporate value',
      BehaviourRoleTierSnapshot: 'IC_OFFICER', BehaviourDescriptorSnapshot: 'Synthetic descriptor',
      BehaviourCadenceSnapshot: 'Quarterly',
      BehaviourPeriodKeysSnapshotJSON: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4']),
      BehaviourPeriodSnapshot: 'Q1', BehaviourRatingLabelsSnapshotJSON: JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS),
      BehaviourAnnualTargetLevelV2: 'Exceptional',
      BehaviourAnnualTargetJustificationV2: 'Approved annual reason',
      BehaviourAnnualTargetSourceWorkplanItemKeyV2: 'BHV-01',
      BehaviourAnnualTargetSourceEtagV2: '"annual-3"',
      BehaviourAnnualTargetSourceWorkplanVersionV2: 3,
      BehaviourAnnualTargetSourceApprovalKeyV2: 'approval-3' };
    const getItems = jest.fn().mockResolvedValue([row]);
    Object.defineProperty(service, 'getItems', { configurable: true, writable: true, value: getItems });
    const target = service as unknown as {
      getQuarterReviewItemsByKey(key: string, recovery: boolean, v02: boolean): Promise<unknown[]>;
      mapStoredQuarterReviewItem(value: unknown): { behaviourAnnualTargetLevelV2?: string;
        behaviourAnnualTargetSourceEtagV2?: string; behaviourAnnualTargetSourceWorkplanVersionV2?: number };
    };
    const rows = await target.getQuarterReviewItemsByKey(row.QuarterReviewItemKey, false, true);
    expect(getItems.mock.calls[0][1]).toBe(QUARTER_ITEM_BEHAVIOUR_V2_SELECT);
    const mapped = target.mapStoredQuarterReviewItem(rows[0]);
    expect(mapped).toEqual(expect.objectContaining({ behaviourAnnualTargetLevelV2: 'Exceptional',
      behaviourAnnualTargetSourceEtagV2: '"annual-3"', behaviourAnnualTargetSourceWorkplanVersionV2: 3 }));
    expect(() => target.mapStoredQuarterReviewItem({ ...row, BehaviourAnnualTargetLevelV2: undefined })).toThrow(/frozen annual/);
    for (const [key, value] of [
      ['BehaviourAnnualTargetLevelV2', 'Unknown'], ['BehaviourAnnualTargetSourceWorkplanVersionV2', -1],
      ['BehaviourAnnualTargetSourceEtagV2', '*'], ['BehaviourAnnualTargetSourceApprovalKeyV2', ' '],
      ['BehaviourAnnualTargetSourceWorkplanItemKeyV2', 'crossed'], ['BehaviourAnnualTargetJustificationV2', 17]
    ]) expect(() => target.mapStoredQuarterReviewItem({ ...row, [key as string]: value })).toThrow(/frozen annual/);
    const historic = { ...row, BehaviourAnnualTargetLevelV2: null, BehaviourAnnualTargetJustificationV2: null,
      BehaviourAnnualTargetSourceWorkplanItemKeyV2: null, BehaviourAnnualTargetSourceEtagV2: null,
      BehaviourAnnualTargetSourceWorkplanVersionV2: null, BehaviourAnnualTargetSourceApprovalKeyV2: null };
    expect(target.mapStoredQuarterReviewItem(historic).behaviourAnnualTargetLevelV2).toBeUndefined();
    const getter = jest.fn(() => 'Exceptional');
    const accessor = { ...row };
    Object.defineProperty(accessor, 'BehaviourAnnualTargetLevelV2', { get: getter });
    expect(() => target.mapStoredQuarterReviewItem(accessor)).toThrow(/frozen annual/);
    expect(getter).not.toHaveBeenCalled();
  });
});

const employee: IProductionPerson = {
  id: 1, personKey: 'person', displayName: 'Employee', email: 'employee@kcf.example',
  appRoles: ['Employee'], active: true
};

const systemAdmin: IProductionPerson = {
  id: 2, personKey: 'admin', displayName: 'System Admin', email: 'admin@kcf.example',
  appRoles: ['SystemAdmin'], active: true
};

const approved: IAnnualWorkplan = {
  id: 101, etag: '"7"', workplanKey: 'person|2026', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
  managerPersonKey: 'manager', managerDisplayName: 'Manager', managerEmail: 'manager@kcf.example',
  state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'Ready', transitionCorrelationKey: 'approval-1',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
  approvedAt: '2026-09-19T10:00:00.000Z', approvedByEmail: 'manager@kcf.example', rowVersionToken: 7
};

const locked: IAnnualWorkplan = {
  ...approved,
  etag: '"9"',
  state: 'Locked',
  lockedAt: '2026-09-20T09:00:00.000Z',
  lockedByEmail: systemAdmin.email,
  rowVersionToken: 9
};

const defineMock = (target: object, name: string, value: unknown): void => {
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
};

const createService = (authenticatedEmail: string): SharePointProductionDataService =>
  new SharePointProductionDataService(
    {} as ConstructorParameters<typeof SharePointProductionDataService>[0],
    'https://kcf.example/sites/test',
    authenticatedEmail
  );

describe('saved Behaviour v02 production readback', () => {
  const savedRow = (): Record<string, unknown> => {
    const envelope = { schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA,
      frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId: 'BHV-01' as const, selections: [] };
    const encoded = encodeBehaviourSelectionSnapshotsV2(envelope);
    return { Id: 31, '@odata.etag': '"v2-31"', WorkplanItemKey: 'BHV-01',
      WorkplanItemNaturalKey: 'person|2026|Behaviour|BHV-01', WorkplanKey: 'person|2026',
      PersonKey: 'person', PerformanceYear: 2026, BehaviourID: 'BHV-01',
      BehaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION, DisplayOrder: 1, ActiveInWorkplan: true,
      BehaviourFrameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      BehaviourValueTitleSnapshot: 'Synthetic Value One', BehaviourCorporateValueSnapshot: 'Synthetic corporate value',
      BehaviourRoleTierSnapshot: 'IC_OFFICER', BehaviourDescriptorSnapshot: 'Synthetic descriptor',
      BehaviourCadenceSnapshot: 'Quarterly',
      BehaviourPeriodKeysSnapshotJSON: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4']),
      BehaviourRatingLabelsSnapshotJSON: JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS),
      BehaviourCommitmentV2: 'Annual commitment',
      BehaviourPeriodCommitmentsV2JSON: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4'].map(period =>
        ({ period, commitment: `${period} commitment` }))),
      BehaviourPlanningContractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
      BehaviourCurrentLevelV2: 'Developing', BehaviourTargetLevelV2: 'Effective',
      BehaviourTargetLevelReasonV2: null, BehaviourV2SelectedSuggestionKeysJSON: '[]',
      BehaviourV2SelectionSnapshotsJSON: encoded.json,
      BehaviourV2SelectionSnapshotsSHA256: encoded.sha256,
      BehaviourV2SelectionSnapshotsUtf8ByteLength: encoded.utf8ByteLength };
  };

  it('uses a v02-only query and returns the exact saved annual levels and selection digest', async () => {
    const service = createService(employee.email); const row = savedRow(); const selects: string[] = [];
    defineMock(service, 'getItems', async (_list: string, select: string) => {
      selects.push(select); return [row];
    });
    const items = await service.getBehaviourWorkplanItems('person|2026');
    expect(selects).toEqual([BEHAVIOUR_ITEM_SELECT, BEHAVIOUR_V2_ITEM_SELECT, BEHAVIOUR_V2_ITEM_SELECT]);
    expect(items[0]).toEqual(expect.objectContaining({
      behaviourPlanningLevelsV1: { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
        currentLevel: 'Developing', targetLevel: 'Effective' },
      behaviourSelectionSnapshotsSha256: row.BehaviourV2SelectionSnapshotsSHA256,
      behaviourSelectionSnapshotsUtf8ByteLength: row.BehaviourV2SelectionSnapshotsUtf8ByteLength
    }));
  });

  it('rejects a missing saved envelope and a changed row between base and v02 reads', async () => {
    const service = createService(employee.email); const row = savedRow();
    defineMock(service, 'getItems', async () => [{ ...row, BehaviourV2SelectionSnapshotsJSON: undefined }]);
    await expect(service.getBehaviourWorkplanItems('person|2026')).rejects.toThrow(/selection snapshot/);
    let calls = 0;
    defineMock(service, 'getItems', async () => ++calls === 1 ? [row] : [{ ...row, WorkplanItemKey: 'crossed' }]);
    await expect(service.getBehaviourWorkplanItems('person|2026')).rejects.toThrow(/changed between/);
  });
});

describe('SharePoint production annual lifecycle integration', () => {
  it('uses the authoritative signed-in SystemAdmin for the Approved to Locked route', async () => {
    const service = createService(systemAdmin.email);
    let stored: IAnnualWorkplan = { ...approved };
    let nextEtag = 8;
    const writes: Array<Record<string, unknown>> = [];
    const peopleRead = jest.fn(async () => systemAdmin);
    let appendedAudit: IWorkplanAuditWrite | undefined;
    defineMock(service, 'getPersonByEmail', peopleRead);
    defineMock(service, 'getWorkplansByKey', async () => [stored]);
    defineMock(service, 'mapWorkplan', (row: IAnnualWorkplan) => row);
    defineMock(service, 'getProductionConfig', async () => ({ performanceYearNumber: 2026 }));
    defineMock(service, 'getTransitionAudits', async () => []);
    defineMock(service, 'listItemUrl', () => 'workplan-item');
    defineMock(service, 'mergeJson', async (_url: string, payload: Record<string, unknown>) => {
      writes.push(payload);
      stored = {
        ...stored,
        etag: `"${nextEtag++}"`,
        state: (payload.State as IAnnualWorkplan['state'] | undefined) || stored.state,
        accessState: (payload.AccessState as string | undefined) || stored.accessState,
        transitionStatus: (payload.TransitionStatus as string | undefined) || stored.transitionStatus,
        transitionCorrelationKey: (payload.TransitionCorrelationKey as string | undefined) || stored.transitionCorrelationKey,
        lockedAt: (payload.LockedAt as string | undefined) || stored.lockedAt,
        lockedByEmail: (payload.LockedByEmail as string | undefined) || stored.lockedByEmail,
        rowVersionToken: (payload.RowVersionToken as number | undefined) ?? stored.rowVersionToken
      };
    });
    defineMock(service, 'appendAudit', async (audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent> => {
      appendedAudit = audit;
      return { id: 1, ...audit };
    });
    defineMock(service, 'markTransitionRecoveryHold', async () => undefined);

    const result = await service.lockApprovedWorkplan(
      approved,
      { ...systemAdmin, personKey: 'caller-object-is-not-authority', appRoles: ['Employee'] },
      'CONTROL-YEAR-GATE-2026',
      'stable-lock-1'
    );

    expect(peopleRead).toHaveBeenCalledWith(systemAdmin.email);
    expect(writes).toHaveLength(2);
    expect(result.workplan).toEqual(expect.objectContaining({
      state: 'Locked', accessState: 'ReadOnly', transitionStatus: 'Ready', lockedByEmail: systemAdmin.email
    }));
    expect(appendedAudit).toEqual(expect.objectContaining({
      eventType: 'WorkplanLocked', actorEmail: systemAdmin.email, actorRole: 'SystemAdmin'
    }));
  });

  it('uses the authoritative signed-in SystemAdmin for guarded Locked to Approved reopen', async () => {
    const service = createService(systemAdmin.email);
    let stored: IAnnualWorkplan = { ...locked };
    let nextEtag = 10;
    const writes: Array<Record<string, unknown>> = [];
    const peopleRead = jest.fn(async () => systemAdmin);
    let appendedAudit: IWorkplanAuditWrite | undefined;
    defineMock(service, 'getPersonByEmail', peopleRead);
    defineMock(service, 'getWorkplansByKey', async () => [stored]);
    defineMock(service, 'mapWorkplan', (row: IAnnualWorkplan) => row);
    defineMock(service, 'getItems', async () => []);
    defineMock(service, 'getTransitionAudits', async () => []);
    defineMock(service, 'listItemUrl', () => 'workplan-item');
    defineMock(service, 'mergeJson', async (_url: string, payload: Record<string, unknown>) => {
      writes.push(payload);
      stored = {
        ...stored,
        etag: `"${nextEtag++}"`,
        state: (payload.State as IAnnualWorkplan['state'] | undefined) || stored.state,
        accessState: (payload.AccessState as string | undefined) || stored.accessState,
        transitionStatus: (payload.TransitionStatus as string | undefined) || stored.transitionStatus,
        transitionCorrelationKey: (payload.TransitionCorrelationKey as string | undefined) || stored.transitionCorrelationKey,
        managerDecisionComment: (payload.ManagerDecisionComment as string | undefined) || stored.managerDecisionComment,
        rowVersionToken: (payload.RowVersionToken as number | undefined) ?? stored.rowVersionToken
      };
    });
    defineMock(service, 'appendAudit', async (audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent> => {
      appendedAudit = audit;
      return { id: 1, ...audit };
    });
    defineMock(service, 'markTransitionRecoveryHold', async () => undefined);

    const result = await service.reopenLockedWorkplan(
      locked,
      { ...systemAdmin, personKey: 'caller-object-is-not-authority', appRoles: ['Employee'] },
      'Correct retained approved content.',
      'CONTROL-AWP-023',
      'stable-reopen-1'
    );

    expect(peopleRead).toHaveBeenCalledWith(systemAdmin.email);
    expect(writes).toHaveLength(2);
    expect(result.workplan).toEqual(expect.objectContaining({
      state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'Ready',
      approvedAt: locked.approvedAt, lockedAt: locked.lockedAt, lockedByEmail: locked.lockedByEmail
    }));
    expect(appendedAudit).toEqual(expect.objectContaining({
      eventType: 'WorkplanChangesRequested', actorEmail: systemAdmin.email, actorRole: 'SystemAdmin'
    }));
  });

  it('uses the controlled amendment executor and exact persisted audit before enabling employee editing', async () => {
    const service = createService(systemAdmin.email);
    let stored: IAnnualWorkplan = { ...approved };
    let nextEtag = 8;
    const writes: Array<Record<string, unknown>> = [];
    defineMock(service, 'getPersonByEmail', async () => systemAdmin);
    defineMock(service, 'getWorkplansByKey', async () => [stored]);
    defineMock(service, 'mapWorkplan', (row: IAnnualWorkplan) => row);
    defineMock(service, 'getWorkplanAuditEvents', async () => []);
    defineMock(service, 'listItemUrl', () => 'workplan-item');
    defineMock(service, 'mergeJson', async (_url: string, payload: Record<string, unknown>, expectedEtag: string) => {
      expect(expectedEtag).toBe(stored.etag);
      writes.push(payload);
      stored = {
        ...stored,
        etag: `"${nextEtag++}"`,
        state: (payload.State as IAnnualWorkplan['state'] | undefined) || stored.state,
        accessState: (payload.AccessState as string | undefined) || stored.accessState,
        transitionStatus: (payload.TransitionStatus as string | undefined) || stored.transitionStatus,
        transitionCorrelationKey: (payload.TransitionCorrelationKey as string | undefined) || stored.transitionCorrelationKey,
        managerDecisionComment: (payload.ManagerDecisionComment as string | undefined) || stored.managerDecisionComment,
        rowVersionToken: (payload.RowVersionToken as number | undefined) ?? stored.rowVersionToken
      };
    });
    defineMock(service, 'appendAudit', async (audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent> => ({ id: 1, ...audit }));
    defineMock(service, 'markTransitionRecoveryHold', async () => undefined);

    const result = await service.openApprovedWorkplanAmendment(
      approved, systemAdmin, 'Correct approved content.', 'CONTROL-AWP-023', 'stable-amendment-1'
    );

    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(expect.objectContaining({ AccessState: 'ReadOnly', TransitionStatus: 'InProgress' }));
    expect(writes[1]).toEqual(expect.objectContaining({
      State: 'ChangesRequested', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready'
    }));
    expect(result.workplan).toEqual(expect.objectContaining({
      state: 'ChangesRequested', accessState: 'EmployeeEdit',
      transitionCorrelationKey: 'stable-amendment-1', rowVersionToken: 9
    }));
    expect(result.audits).toHaveLength(1);
    expect(result.audits[0]).toEqual(expect.objectContaining({
      actorEmail: systemAdmin.email, actorRole: 'SystemAdmin'
    }));
  });

  it('fails closed after read-only staging when SharePoint returns a tampered audit tuple', async () => {
    const service = createService(systemAdmin.email);
    let stored: IAnnualWorkplan = { ...approved };
    const writes: Array<Record<string, unknown>> = [];
    const recovery = jest.fn(async () => undefined);
    defineMock(service, 'getPersonByEmail', async () => systemAdmin);
    defineMock(service, 'getWorkplansByKey', async () => [stored]);
    defineMock(service, 'mapWorkplan', (row: IAnnualWorkplan) => row);
    defineMock(service, 'getWorkplanAuditEvents', async () => []);
    defineMock(service, 'listItemUrl', () => 'workplan-item');
    defineMock(service, 'mergeJson', async (_url: string, payload: Record<string, unknown>) => {
      writes.push(payload);
      stored = {
        ...stored, etag: '"8"', accessState: 'ReadOnly', transitionStatus: 'InProgress',
        transitionCorrelationKey: payload.TransitionCorrelationKey as string, rowVersionToken: payload.RowVersionToken as number
      };
    });
    defineMock(service, 'appendAudit', async (audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent> => ({
      id: 1, ...audit, subjectKey: 'other|1999', actorEmail: 'attacker@kcf.example'
    }));
    defineMock(service, 'markTransitionRecoveryHold', recovery);

    await expect(service.openApprovedWorkplanAmendment(
      approved, systemAdmin, 'Correct approved content.', 'CONTROL-AWP-023', 'stable-amendment-2'
    )).rejects.toThrow(/exact planned/);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(expect.objectContaining({ AccessState: 'ReadOnly', TransitionStatus: 'InProgress' }));
    expect(recovery).toHaveBeenCalledWith(approved.workplanKey);
  });

  it.each([
    ['Admin lock', (service: SharePointProductionDataService, actor: IProductionPerson) => service.lockApprovedWorkplan(
      approved, actor, 'CONTROL-YEAR-GATE-2026', 'forged-lock'
    )],
    ['guarded reopen', (service: SharePointProductionDataService, actor: IProductionPerson) => service.reopenLockedWorkplan(
      locked, actor, 'Fabricated authority attack.', 'CONTROL-AWP-023', 'forged-reopen'
    )],
    ['Approved amendment', (service: SharePointProductionDataService, actor: IProductionPerson) => service.openApprovedWorkplanAmendment(
      approved, actor, 'Fabricated authority attack.', 'CONTROL-AWP-023', 'forged-amendment'
    )]
  ])('rejects fabricated Employee-to-SystemAdmin authority before any protected %s write or audit', async (_name, invoke) => {
    const service = createService(employee.email);
    const forgedSystemAdmin: IProductionPerson = {
      ...employee,
      personKey: 'fabricated-admin-person-key',
      appRoles: ['SystemAdmin']
    };
    const peopleRead = jest.fn(async () => employee);
    const workplanRead = jest.fn(async () => [approved]);
    const protectedWrite = jest.fn(async () => undefined);
    const auditAppend = jest.fn(async (audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent> => ({ id: 1, ...audit }));
    defineMock(service, 'getPersonByEmail', peopleRead);
    defineMock(service, 'getWorkplansByKey', workplanRead);
    defineMock(service, 'mergeJson', protectedWrite);
    defineMock(service, 'appendAudit', auditAppend);

    await expect(invoke(service, forgedSystemAdmin)).rejects.toThrow(/active SystemAdmin role/);
    expect(peopleRead).toHaveBeenCalledWith(employee.email);
    expect(workplanRead).not.toHaveBeenCalled();
    expect(protectedWrite).not.toHaveBeenCalled();
    expect(auditAppend).not.toHaveBeenCalled();
  });

  it.each([
    ['Admin lock', (service: SharePointProductionDataService) => service.lockApprovedWorkplan(
      approved, systemAdmin, 'CONTROL-YEAR-GATE-2026', 'inactive-lock'
    )],
    ['guarded reopen', (service: SharePointProductionDataService) => service.reopenLockedWorkplan(
      locked, systemAdmin, 'Inactive authority attack.', 'CONTROL-AWP-023', 'inactive-reopen'
    )],
    ['Approved amendment', (service: SharePointProductionDataService) => service.openApprovedWorkplanAmendment(
      approved, systemAdmin, 'Inactive authority attack.', 'CONTROL-AWP-023', 'inactive-amendment'
    )]
  ])('rejects an inactive authoritative People record before any protected %s write or audit', async (_name, invoke) => {
    const service = createService(systemAdmin.email);
    const workplanRead = jest.fn(async () => [approved]);
    const protectedWrite = jest.fn(async () => undefined);
    const auditAppend = jest.fn(async (audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent> => ({ id: 1, ...audit }));
    defineMock(service, 'getPersonByEmail', async () => ({ ...systemAdmin, active: false }));
    defineMock(service, 'getWorkplansByKey', workplanRead);
    defineMock(service, 'mergeJson', protectedWrite);
    defineMock(service, 'appendAudit', auditAppend);

    await expect(invoke(service)).rejects.toThrow(/active SystemAdmin role/);
    expect(workplanRead).not.toHaveBeenCalled();
    expect(protectedWrite).not.toHaveBeenCalled();
    expect(auditAppend).not.toHaveBeenCalled();
  });

  it('routes Core removal through current-item snapshot and exact-ETag deactivation', async () => {
    const service = createService(employee.email);
    const draft: IAnnualWorkplan = {
      ...approved, state: 'Draft', accessState: 'EmployeeEdit', approvedAt: undefined, approvedByEmail: undefined,
      etag: '"3"', transitionCorrelationKey: undefined, rowVersionToken: 3
    };
    const loadedItem: ICoreWorkplanItem = {
      id: 10, etag: '"2"', workplanItemKey: 'core-1', naturalKey: 'person|2026|CoreGold|SO1-001',
      workplanKey: draft.workplanKey, personKey: draft.personKey, performanceYear: draft.performanceYear,
      kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01',
      displayOrder: 1, activeInWorkplan: true
    };
    let currentItem = { ...loadedItem };
    const etags: string[] = [];
    defineMock(service, 'resolveCurrentEditableWorkplan', async () => ({ ...draft }));
    defineMock(service, 'getCoreItemsByNaturalKey', async () => [currentItem]);
    defineMock(service, 'mapCoreWorkplanItem', (row: ICoreWorkplanItem) => row);
    defineMock(service, 'getPersonByEmail', async () => employee);
    defineMock(service, 'listItemUrl', () => 'core-item');
    defineMock(service, 'mergeJson', async (_url: string, payload: Record<string, unknown>, expectedEtag: string) => {
      etags.push(expectedEtag);
      currentItem = { ...currentItem, etag: '"3"', activeInWorkplan: payload.ActiveInWorkplan as boolean };
    });

    await service.removeCoreWorkplanItem(draft, loadedItem);
    expect(etags).toEqual(['"2"']);
    expect(currentItem).toEqual(expect.objectContaining({
      id: loadedItem.id, naturalKey: loadedItem.naturalKey, workplanItemKey: loadedItem.workplanItemKey,
      activeInWorkplan: false
    }));
  });
});
