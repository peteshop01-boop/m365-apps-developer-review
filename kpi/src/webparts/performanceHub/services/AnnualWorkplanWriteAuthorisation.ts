import type {
  IAnnualWorkplan,
  IBehaviourWorkplanItem,
  ICoreWorkplanItem,
  IPersonalWorkplanItem,
  IProductionPerson
} from '../models/ProductionModels';

export type AnnualWorkplanWriteArea = 'Core KPI' | 'Personal KPI' | 'Behaviour';
export type AnnualWorkplanItem = ICoreWorkplanItem | IPersonalWorkplanItem | IBehaviourWorkplanItem;

export interface IAnnualWorkplanItemDeactivationPlan<T extends AnnualWorkplanItem> {
  operation: 'Deactivate';
  area: AnnualWorkplanWriteArea;
  before: T;
  after: T;
  expectedEtag: string;
}

export interface IAnnualWorkplanItemDeactivationPort<T extends AnnualWorkplanItem> {
  persistDeactivation(item: T, expectedEtag: string): Promise<T>;
}

export const assertCurrentEditableWorkplanSnapshot = (
  loaded: IAnnualWorkplan,
  current: IAnnualWorkplan,
  area: AnnualWorkplanWriteArea
): void => {
  if (loaded.id !== current.id || loaded.workplanKey !== current.workplanKey
    || loaded.personKey !== current.personKey || loaded.performanceYear !== current.performanceYear
    || loaded.employeeEmail.trim().toLowerCase() !== current.employeeEmail.trim().toLowerCase()) {
    throw new Error(`${area} write rejected because the persisted Workplan identity changed. Reload before editing.`);
  }
  if ((current.state !== 'Draft' && current.state !== 'ChangesRequested')
    || current.accessState !== 'EmployeeEdit' || current.transitionStatus !== 'Ready') {
    throw new Error(`${area} write rejected because the Workplan is no longer editable. Reload before editing.`);
  }
  if (!loaded.etag || loaded.etag === '*' || !current.etag || current.etag === '*'
    || loaded.etag !== current.etag || loaded.rowVersionToken !== current.rowVersionToken) {
    throw new Error(`${area} write rejected because the Workplan changed after it was loaded. Reload before editing.`);
  }
};

export const createAnnualWorkplanItemDeactivationPlan = <T extends AnnualWorkplanItem>(
  loaded: IAnnualWorkplan,
  current: IAnnualWorkplan,
  actor: IProductionPerson,
  loadedItem: T,
  currentItem: T,
  area: AnnualWorkplanWriteArea
): IAnnualWorkplanItemDeactivationPlan<T> => {
  if (!actor.active || actor.appRoles.indexOf('Employee') < 0
    || actor.personKey !== current.personKey
    || actor.email.trim().toLowerCase() !== current.employeeEmail.trim().toLowerCase()) {
    throw new Error(`${area} deactivation is restricted to the exact active Workplan Employee.`);
  }
  assertCurrentEditableWorkplanSnapshot(loaded, current, area);
  if (currentItem.workplanKey !== current.workplanKey || currentItem.personKey !== current.personKey
    || currentItem.performanceYear !== current.performanceYear) {
    throw new Error(`${area} deactivation rejected because the item is outside the Workplan boundary.`);
  }
  if (loadedItem.id !== currentItem.id || loadedItem.workplanItemKey !== currentItem.workplanItemKey
    || loadedItem.naturalKey !== currentItem.naturalKey || loadedItem.workplanKey !== currentItem.workplanKey
    || loadedItem.personKey !== currentItem.personKey || loadedItem.performanceYear !== currentItem.performanceYear) {
    throw new Error(`${area} deactivation rejected because the current item snapshot crossed an identity boundary.`);
  }
  if (!loadedItem.etag || loadedItem.etag === '*' || !currentItem.etag || currentItem.etag === '*'
    || loadedItem.etag !== currentItem.etag) {
    throw new Error(`${area} deactivation rejected because the item changed after it was loaded. Reload before editing.`);
  }
  if (!currentItem.activeInWorkplan) throw new Error(`${area} item is already inactive and retained as history.`);
  return {
    operation: 'Deactivate',
    area,
    before: { ...currentItem },
    after: { ...currentItem, activeInWorkplan: false },
    expectedEtag: currentItem.etag
  };
};

export const executeAnnualWorkplanItemDeactivation = async <T extends AnnualWorkplanItem>(
  createPlan: () => IAnnualWorkplanItemDeactivationPlan<T>,
  port: IAnnualWorkplanItemDeactivationPort<T>
): Promise<T> => {
  const plan = createPlan();
  const persisted = await port.persistDeactivation(plan.after, plan.expectedEtag);
  if (persisted.id !== plan.after.id || persisted.workplanItemKey !== plan.after.workplanItemKey
    || persisted.naturalKey !== plan.after.naturalKey || persisted.workplanKey !== plan.after.workplanKey
    || persisted.personKey !== plan.after.personKey || persisted.performanceYear !== plan.after.performanceYear
    || persisted.activeInWorkplan) {
    throw new Error(`${plan.area} deactivation did not preserve the exact item identity and inactive history.`);
  }
  return persisted;
};
