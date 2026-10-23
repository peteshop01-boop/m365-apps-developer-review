import type { OptionEWorkplanListTitle } from './OptionEWorkplanPhysicalSchema';

export interface IOptionEDraftGatewayFieldNames {
  id: 'Id';
  draftPayloadJson: 'DraftPayloadJSON';
  draftPayloadSha256: 'DraftPayloadSHA256';
  clientSaveId: 'ClientSaveID';
  clientSavedAt: 'ClientSavedAt';
  modified: 'Modified';
  editor: 'Editor';
}

/** Draft identity/year/state are deliberately absent: the editable item is untrusted content only. */
export interface IOptionEDraftGatewayBindings {
  draftsListTitle: 'KCFKPI_WorkplanDrafts';
  fieldNames: Readonly<IOptionEDraftGatewayFieldNames>;
}

export interface IOptionEProtectedControlFieldNames {
  workplanKey: 'WorkplanKey';
  personKey: 'PersonKey';
  performanceYear: 'PerformanceYear';
  draftItemId: 'DraftItemId';
  draftSchemaVersion: 'DraftSchemaVersion';
  state: 'State';
  transitionStatus: 'TransitionStatus';
  pendingRequestKey: 'PendingRequestKey';
  currentSubmittedSnapshotKey: 'CurrentSubmittedSnapshotKey';
  managerPersonKeyCache: 'ManagerPersonKey';
  hierarchyEpoch: 'HierarchyEpoch';
  aclEpoch: 'AclEpoch';
  rowVersionToken: 'RowVersionToken';
  lastOperationKey: 'LastOperationKey';
}

export interface IOptionEPeopleAuthorityFieldNames {
  personKey: 'PersonKey';
  email: 'Email';
  managerPersonKey: 'ManagerPersonKey';
  managerEmail: 'ManagerEmail';
  active: 'Active';
}

export interface IOptionEWorkplanListBindings extends IOptionEDraftGatewayBindings {
  submitRequestsListTitle: 'KCFKPI_WorkplanSubmitRequests';
  submittedSnapshotsListTitle: 'KCFKPI_WorkplanSubmittedSnapshots';
  workplansListTitle: 'KCFKPI_Workplans';
  submitOperationsListTitle: 'KCFKPI_WorkplanSubmitOperations';
  auditListTitle: 'KCFKPI_Audit';
  peopleListTitle: 'KCFKPI_People';
  protectedControlFields: Readonly<IOptionEProtectedControlFieldNames>;
  peopleAuthorityFields: Readonly<IOptionEPeopleAuthorityFieldNames>;
}

export const OPTION_E_DRAFT_GATEWAY_BINDINGS: Readonly<IOptionEDraftGatewayBindings> = Object.freeze({
  draftsListTitle: 'KCFKPI_WorkplanDrafts',
  fieldNames: Object.freeze({
    id: 'Id', draftPayloadJson: 'DraftPayloadJSON', draftPayloadSha256: 'DraftPayloadSHA256',
    clientSaveId: 'ClientSaveID', clientSavedAt: 'ClientSavedAt', modified: 'Modified', editor: 'Editor'
  })
});

export const OPTION_E_WORKPLAN_LIST_BINDINGS: Readonly<IOptionEWorkplanListBindings> = Object.freeze({
  ...OPTION_E_DRAFT_GATEWAY_BINDINGS,
  submitRequestsListTitle: 'KCFKPI_WorkplanSubmitRequests',
  submittedSnapshotsListTitle: 'KCFKPI_WorkplanSubmittedSnapshots',
  workplansListTitle: 'KCFKPI_Workplans',
  submitOperationsListTitle: 'KCFKPI_WorkplanSubmitOperations',
  auditListTitle: 'KCFKPI_Audit',
  peopleListTitle: 'KCFKPI_People',
  protectedControlFields: Object.freeze({
    workplanKey: 'WorkplanKey', personKey: 'PersonKey', performanceYear: 'PerformanceYear',
    draftItemId: 'DraftItemId', draftSchemaVersion: 'DraftSchemaVersion', state: 'State',
    transitionStatus: 'TransitionStatus', pendingRequestKey: 'PendingRequestKey',
    currentSubmittedSnapshotKey: 'CurrentSubmittedSnapshotKey', managerPersonKeyCache: 'ManagerPersonKey',
    hierarchyEpoch: 'HierarchyEpoch', aclEpoch: 'AclEpoch', rowVersionToken: 'RowVersionToken',
    lastOperationKey: 'LastOperationKey'
  }),
  peopleAuthorityFields: Object.freeze({
    personKey: 'PersonKey', email: 'Email', managerPersonKey: 'ManagerPersonKey',
    managerEmail: 'ManagerEmail', active: 'Active'
  })
});

export const optionEListTitlesFromBindings = (
  bindings: IOptionEWorkplanListBindings
): readonly OptionEWorkplanListTitle[] => [
  bindings.draftsListTitle, bindings.submitRequestsListTitle, bindings.submittedSnapshotsListTitle,
  bindings.workplansListTitle, bindings.submitOperationsListTitle, bindings.auditListTitle, bindings.peopleListTitle
];
