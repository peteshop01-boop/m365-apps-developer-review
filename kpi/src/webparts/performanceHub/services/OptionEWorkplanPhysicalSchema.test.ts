import {
  OPTION_E_ACL_RECONCILER_MASKS,
  OPTION_E_CONTENT_PROCESSOR_MASKS,
  OPTION_E_DRAFT_EMPLOYEE_WRITABLE_FIELDS,
  OPTION_E_NATIVE_ROLES,
  OPTION_E_RECOVERY_ROLE,
  OPTION_E_SCHEMA_CONTRACT_VERSION,
  OPTION_E_WORKPLAN_SCHEMA,
  validateOptionEPhysicalSchema
} from './OptionEWorkplanPhysicalSchema';

describe('B13-03 corrected Option-E V3 physical contract', () => {
  it('defines seven stores and exactly 98 contracted fields at the agreed migration split', () => {
    expect(validateOptionEPhysicalSchema()).toEqual([]);
    expect(OPTION_E_WORKPLAN_SCHEMA).toHaveLength(7);
    const newStores = OPTION_E_WORKPLAN_SCHEMA.filter(store => !store.existingAsset);
    const existingStores = OPTION_E_WORKPLAN_SCHEMA.filter(store => store.existingAsset);
    expect(newStores.reduce((count, store) => count + store.fields.length, 0)).toBe(59);
    expect(existingStores.reduce((count, store) => count + store.fields.length, 0)).toBe(39);
    expect(existingStores.map(store => store.title)).toEqual([
      'KCFKPI_Workplans', 'KCFKPI_Audit', 'KCFKPI_People'
    ]);
  });

  it('limits Draft storage to four untrusted non-authoritative employee fields', () => {
    const draft = OPTION_E_WORKPLAN_SCHEMA.find(store => store.title === 'KCFKPI_WorkplanDrafts');
    expect(OPTION_E_DRAFT_EMPLOYEE_WRITABLE_FIELDS).toEqual([
      'DraftPayloadJSON', 'DraftPayloadSHA256', 'ClientSaveID', 'ClientSavedAt'
    ]);
    expect(draft).toEqual(expect.objectContaining({
      attachmentsEnabled: false, contentTypesEnabled: false, enableFolderCreation: false,
      naturalKey: 'System ID/UniqueId bound from protected Workplans.DraftItemId'
    }));
    expect(draft?.fields.every(field => field.employeeWritableUntrusted
      && field.showInNewForm === false && field.showInEditForm === false
      && !field.authoritativeSource)).toBe(true);
    const prohibited = ['DraftKey', 'PersonKey', 'PerformanceYear', 'State', 'TransitionStatus',
      'DraftSchemaVersion', 'ManagerPersonKey', 'HierarchyEpoch', 'AclEpoch'];
    expect(draft?.fields.some(field => prohibited.indexOf(field.internalName) >= 0)).toBe(false);
  });

  it('preserves Workplans lifecycle and declares only the seven additive control fields', () => {
    const workplans = OPTION_E_WORKPLAN_SCHEMA.find(store => store.title === 'KCFKPI_Workplans');
    expect(workplans?.enableFolderCreation).toBe(true);
    expect(workplans?.fields.find(field => field.internalName === 'State')?.choices).toEqual([
      'Draft', 'Submitted', 'ChangesRequested', 'Approved', 'Locked', 'Archived'
    ]);
    expect(workplans?.fields.filter(field => field.action === 'AddIfMissing').map(field => field.internalName)).toEqual([
      'PendingRequestKey', 'CurrentSubmittedSnapshotKey', 'HierarchyEpoch', 'AclEpoch',
      'LastOperationKey', 'DraftItemId', 'DraftSchemaVersion'
    ]);
    expect(workplans?.fields.find(field => field.internalName === 'DraftItemId')).toEqual(expect.objectContaining({
      type: 'Text', maxLength: 20, indexed: true, enforceUniqueValues: true, required: false
    }));
  });

  it('preserves Audit and People while declaring the five optional Audit additions', () => {
    const audit = OPTION_E_WORKPLAN_SCHEMA.find(store => store.title === 'KCFKPI_Audit');
    const people = OPTION_E_WORKPLAN_SCHEMA.find(store => store.title === 'KCFKPI_People');
    expect(audit?.fields.filter(field => field.action === 'AddIfMissing')).toHaveLength(5);
    expect(audit?.fields.filter(field => field.action === 'AddIfMissing')
      .every(field => !field.required && field.applicationRequiredForNewEvent)).toBe(true);
    expect(audit?.fields.find(field => field.internalName === 'Quarter')?.compatibleExistingTypes)
      .toEqual(['Text', 'Choice']);
    expect(audit?.fields.find(field => field.internalName === 'Reason')?.compatibleExistingTypes)
      .toEqual(['Note', 'Text']);
    expect(people?.fields.find(field => field.internalName === 'PersonKey')).toEqual(expect.objectContaining({
      indexed: true, enforceUniqueValues: true, authoritativeSource: 'GovernedPeople'
    }));
    expect(people?.fields.find(field => field.internalName === 'Email')?.action).toBe('ReuseOrAddIndex');
  });

  it('binds exact raw native masks and keeps the ACL reconciler out of Audit', () => {
    expect(OPTION_E_SCHEMA_CONTRACT_VERSION).toBe('KCF-KPI-B13-OPTION-E-V3');
    expect(OPTION_E_NATIVE_ROLES.map(role => [role.name, role.roleTypeKind, role.high, role.low])).toEqual([
      ['KCF KPI Option E Item Reader v1', 0, 0, 1],
      ['KCF KPI Option E Add Read No Edit v1', 0, 0, 3],
      ['KCF KPI Option E Draft Editor v1', 0, 0, 5],
      ['KCF KPI Option E Mutator No Delete v1', 0, 0, 7],
      ['KCF KPI Option E ACL Reconciler v1', 0, 0, 33554433]
    ]);
    expect(OPTION_E_CONTENT_PROCESSOR_MASKS).toEqual({
      KCFKPI_WorkplanDrafts: 7, KCFKPI_WorkplanSubmitRequests: 1,
      KCFKPI_WorkplanSubmittedSnapshots: 3, KCFKPI_Workplans: 5,
      KCFKPI_WorkplanSubmitOperations: 7, KCFKPI_Audit: 3, KCFKPI_People: 1
    });
    expect(OPTION_E_ACL_RECONCILER_MASKS.KCFKPI_Audit).toBeUndefined();
    expect(OPTION_E_RECOVERY_ROLE).toEqual(expect.objectContaining({
      name: 'Full Control', roleTypeKind: 5, high: 2147483647, low: 4294967295
    }));
  });
});
