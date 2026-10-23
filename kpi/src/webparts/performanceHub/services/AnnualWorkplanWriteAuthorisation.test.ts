import type { IAnnualWorkplan, ICoreWorkplanItem, IProductionPerson } from '../models/ProductionModels';
import {
  assertCurrentEditableWorkplanSnapshot,
  createAnnualWorkplanItemDeactivationPlan,
  executeAnnualWorkplanItemDeactivation,
  type AnnualWorkplanWriteArea
} from './AnnualWorkplanWriteAuthorisation';

const draft: IAnnualWorkplan = {
  id: 1, etag: '"3"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: 'Employee',
  employeeEmail: 'person012@example.invalid', performanceYear: 2026, state: 'Draft', accessState: 'EmployeeEdit',
  transitionStatus: 'Ready', coreCategoryWeight: 70, personalCategoryWeight: 20,
  behaviourCategoryWeight: 10, rowVersionToken: 3
};

const employee: IProductionPerson = {
  id: 1, personKey: draft.personKey, displayName: draft.employeeDisplayName, email: draft.employeeEmail,
  appRoles: ['Employee'], active: true
};

const coreItem: ICoreWorkplanItem = {
  id: 10, etag: '"2"', workplanItemKey: 'core-1', naturalKey: 'person|2026|CoreGold|SO1-001',
  workplanKey: draft.workplanKey, personKey: draft.personKey, performanceYear: draft.performanceYear,
  kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01',
  displayOrder: 1, activeInWorkplan: true
};

describe('Annual Workplan mutation boundary', () => {
  it.each<AnnualWorkplanWriteArea>(['Core KPI', 'Personal KPI', 'Behaviour'])(
    'rejects a stale %s Draft after the persisted Workplan is Submitted',
    area => expect(() => assertCurrentEditableWorkplanSnapshot(draft, {
      ...draft, etag: '"4"', state: 'Submitted', accessState: 'ManagerDecision', rowVersionToken: 4
    }, area)).toThrow(/no longer editable/)
  );

  it('accepts the exact persisted editable snapshot and rejects stale ETags or identities', () => {
    expect(() => assertCurrentEditableWorkplanSnapshot(draft, { ...draft }, 'Core KPI')).not.toThrow();
    expect(() => assertCurrentEditableWorkplanSnapshot(draft, { ...draft, etag: '"4"' }, 'Personal KPI')).toThrow(/changed after it was loaded/);
    expect(() => assertCurrentEditableWorkplanSnapshot(draft, { ...draft, personKey: 'other' }, 'Behaviour')).toThrow(/identity changed/);
  });

  it('deactivates an editable referenced item without deleting or mutating its retained history', () => {
    const original = JSON.stringify(coreItem);
    const plan = createAnnualWorkplanItemDeactivationPlan(draft, { ...draft }, employee, coreItem, { ...coreItem }, 'Core KPI');
    expect(plan).toEqual({
      operation: 'Deactivate', area: 'Core KPI', before: coreItem,
      after: { ...coreItem, activeInWorkplan: false }, expectedEtag: coreItem.etag
    });
    expect(plan.after.id).toBe(coreItem.id);
    expect(plan.after.naturalKey).toBe(coreItem.naturalKey);
    expect(JSON.stringify(coreItem)).toBe(original);
  });

  it('rejects deactivation by the wrong actor, from protected states or across item boundaries', () => {
    expect(() => createAnnualWorkplanItemDeactivationPlan(draft, { ...draft }, {
      ...employee, personKey: 'other', email: 'person017@example.invalid'
    }, coreItem, { ...coreItem }, 'Core KPI')).toThrow(/exact active Workplan Employee/);
    expect(() => createAnnualWorkplanItemDeactivationPlan(draft, {
      ...draft, state: 'Locked', accessState: 'ReadOnly'
    }, employee, coreItem, { ...coreItem }, 'Core KPI')).toThrow(/no longer editable/);
    expect(() => createAnnualWorkplanItemDeactivationPlan(draft, { ...draft }, employee, {
      ...coreItem, workplanKey: 'other|2026'
    }, { ...coreItem, workplanKey: 'other|2026' }, 'Core KPI')).toThrow(/outside the Workplan boundary/);
    expect(() => createAnnualWorkplanItemDeactivationPlan(draft, { ...draft }, employee, {
      ...coreItem
    }, { ...coreItem, activeInWorkplan: false }, 'Core KPI')).toThrow(/already inactive/);
  });

  it('rejects stale ETag and current-snapshot drift before the deactivation port is called', async () => {
    const persistDeactivation = jest.fn(async (item: ICoreWorkplanItem) => item);
    await expect(executeAnnualWorkplanItemDeactivation(() => createAnnualWorkplanItemDeactivationPlan(
      draft, { ...draft }, employee, coreItem, { ...coreItem, etag: '"3"' }, 'Core KPI'
    ), { persistDeactivation })).rejects.toThrow(/changed after it was loaded/);
    expect(persistDeactivation).not.toHaveBeenCalled();

    await expect(executeAnnualWorkplanItemDeactivation(() => createAnnualWorkplanItemDeactivationPlan(
      draft, { ...draft }, employee, coreItem, { ...coreItem, naturalKey: 'person|2026|CoreGold|SO1-999' }, 'Core KPI'
    ), { persistDeactivation })).rejects.toThrow(/identity boundary/);
    expect(persistDeactivation).not.toHaveBeenCalled();
  });

  it('persists one exact-ETag deactivation and verifies retained ID, natural key and inactive history', async () => {
    const calls: Array<{ id: number; etag: string }> = [];
    const result = await executeAnnualWorkplanItemDeactivation(() => createAnnualWorkplanItemDeactivationPlan(
      draft, { ...draft }, employee, coreItem, { ...coreItem }, 'Core KPI'
    ), {
      persistDeactivation: async (item, expectedEtag) => {
        calls.push({ id: item.id, etag: expectedEtag });
        return { ...item, etag: '"3"' };
      }
    });
    expect(calls).toEqual([{ id: coreItem.id, etag: '"2"' }]);
    expect(result).toEqual(expect.objectContaining({
      id: coreItem.id, naturalKey: coreItem.naturalKey, workplanItemKey: coreItem.workplanItemKey,
      activeInWorkplan: false
    }));
  });

  it('rejects a tampered deactivation readback after the protected write', async () => {
    await expect(executeAnnualWorkplanItemDeactivation(() => createAnnualWorkplanItemDeactivationPlan(
      draft, { ...draft }, employee, coreItem, { ...coreItem }, 'Core KPI'
    ), {
      persistDeactivation: async item => ({ ...item, id: 999 })
    })).rejects.toThrow(/exact item identity/);
  });
});
