import { OPTION_E_WORKPLAN_SCHEMA } from './OptionEWorkplanPhysicalSchema';
import {
  OPTION_E_DRAFT_GATEWAY_BINDINGS,
  OPTION_E_WORKPLAN_LIST_BINDINGS,
  optionEListTitlesFromBindings
} from './OptionEWorkplanListBindings';

describe('B13-03 corrected Option-E list bindings', () => {
  it('binds all seven tenant-neutral physical stores', () => {
    expect(optionEListTitlesFromBindings(OPTION_E_WORKPLAN_LIST_BINDINGS))
      .toEqual(OPTION_E_WORKPLAN_SCHEMA.map(store => store.title));
    expect(JSON.stringify(OPTION_E_WORKPLAN_LIST_BINDINGS)).not.toContain('KCFKPI_TEST_');
    expect(JSON.stringify(OPTION_E_WORKPLAN_LIST_BINDINGS)).not.toContain('samplefoundation');
  });

  it('keeps editable Draft bindings free of every authority-bearing field', () => {
    expect(OPTION_E_DRAFT_GATEWAY_BINDINGS).toEqual({
      draftsListTitle: 'KCFKPI_WorkplanDrafts',
      fieldNames: {
        id: 'Id', draftPayloadJson: 'DraftPayloadJSON', draftPayloadSha256: 'DraftPayloadSHA256',
        clientSaveId: 'ClientSaveID', clientSavedAt: 'ClientSavedAt', modified: 'Modified', editor: 'Editor'
      }
    });
    const serialised = JSON.stringify(OPTION_E_DRAFT_GATEWAY_BINDINGS.fieldNames);
    ['DraftKey', 'PersonKey', 'PerformanceYear', 'State', 'TransitionStatus', 'DraftSchemaVersion',
      'ManagerPersonKey', 'HierarchyEpoch', 'AclEpoch'].forEach(name => expect(serialised).not.toContain(name));
  });

  it('binds protected Workplans authority and governed People manager resolution separately', () => {
    expect(OPTION_E_WORKPLAN_LIST_BINDINGS.protectedControlFields).toEqual(expect.objectContaining({
      workplanKey: 'WorkplanKey', personKey: 'PersonKey', performanceYear: 'PerformanceYear',
      draftItemId: 'DraftItemId', draftSchemaVersion: 'DraftSchemaVersion', state: 'State',
      transitionStatus: 'TransitionStatus', hierarchyEpoch: 'HierarchyEpoch', aclEpoch: 'AclEpoch',
      rowVersionToken: 'RowVersionToken', lastOperationKey: 'LastOperationKey'
    }));
    expect(OPTION_E_WORKPLAN_LIST_BINDINGS.peopleAuthorityFields).toEqual({
      personKey: 'PersonKey', email: 'Email', managerPersonKey: 'ManagerPersonKey',
      managerEmail: 'ManagerEmail', active: 'Active'
    });
  });
});
