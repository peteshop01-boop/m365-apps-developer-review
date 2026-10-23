export interface IEmployeeWorkplanV2ListBindings {
  people: string;
  employeeCommands: string;
  managerCommands: string;
  commandReceipts: string;
  workplans: string;
  workplanItems: string;
  quarterReviews: string;
  quarterReviewItems: string;
  progressNotes: string;
  evidence: string;
  audit: string;
  listIds?: Readonly<IEmployeeWorkplanV2ListIds>;
  clientVersion: string;
  testRunKey?: string;
  supportsBehaviourSelectionFields: boolean;
  /** True only after the separately governed additive v02 schema is observed. */
  supportsBehaviourFrameworkV2Fields?: boolean;
  /** True only after the v3 WorkplanItems receipt proves all three selection snapshot fields. */
  supportsBehaviourV2SelectionSnapshots?: boolean;
}

export interface IEmployeeWorkplanV2ListIds {
  people: string;
  workplans: string;
  workplanItems: string;
  quarterReviews: string;
  quarterReviewItems: string;
  progressNotes: string;
  evidence: string;
  audit: string;
  employeeCommands: string;
  managerCommands: string;
  commandReceipts: string;
}

export const EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS: Readonly<IEmployeeWorkplanV2ListBindings> = Object.freeze({
  people: 'KCFKPI_People',
  employeeCommands: 'KCFKPI_EmployeeCommands',
  managerCommands: 'KCFKPI_ManagerCommands',
  commandReceipts: 'KCFKPI_CommandReceipts',
  workplans: 'KCFKPI_Workplans',
  workplanItems: 'KCFKPI_WorkplanItems',
  quarterReviews: 'KCFKPI_QuarterReviews',
  quarterReviewItems: 'KCFKPI_QuarterReviewItems',
  progressNotes: 'KCFKPI_ProgressNotes',
  evidence: 'KCFKPI_Evidence',
  audit: 'KCFKPI_Audit',
  clientVersion: 'KCF-KPI-027A',
  supportsBehaviourSelectionFields: false,
  supportsBehaviourFrameworkV2Fields: false
});

export const KCF_KPI_036_TEST_RUN_KEY = 'KCF-KPI-036|EMPLOYEE-PERSISTENCE|Sponsor';

export const KCF_KPI_035_TEST_LIST_IDS: Readonly<IEmployeeWorkplanV2ListIds> = Object.freeze({
  people: 'c89a7c3c-4ad7-45ca-ae17-5c108c318598',
  workplans: '47210791-25f1-416e-ab24-832c8b6448ec',
  workplanItems: '98f2a280-46a7-40b5-a37d-db97b02fc826',
  quarterReviews: '71d7058c-d85b-48bb-ac3c-611615fb39dc',
  quarterReviewItems: 'd73c9d53-5ab8-4de3-a5a3-6f76afd05b30',
  progressNotes: 'e3cf10ad-f942-46fa-a40f-1484f8275a9c',
  evidence: '31fe4b7f-f5a0-48fc-a5f4-398822acbdc4',
  audit: '59a00c55-5ceb-4561-a5d5-0942edb5ad6d',
  employeeCommands: '3e05ec37-95ce-4a30-a56c-ff2437bf9bed',
  managerCommands: '40ec1c73-a802-40ec-a6a2-cde0cba1d182',
  commandReceipts: '3eb157c8-6290-4e1b-ad6b-d41e4a2293b9'
});

export const KCF_KPI_036_TEST_LIST_BINDINGS: Readonly<IEmployeeWorkplanV2ListBindings> = Object.freeze({
  people: 'KCFKPI_TEST_People',
  employeeCommands: 'KCFKPI_TEST_EmployeeCommands',
  managerCommands: 'KCFKPI_TEST_ManagerCommands',
  commandReceipts: 'KCFKPI_TEST_CommandReceipts',
  workplans: 'KCFKPI_TEST_Workplans',
  workplanItems: 'KCFKPI_TEST_WorkplanItems',
  quarterReviews: 'KCFKPI_TEST_QuarterReviews',
  quarterReviewItems: 'KCFKPI_TEST_QuarterReviewItems',
  progressNotes: 'KCFKPI_TEST_ProgressNotes',
  evidence: 'KCFKPI_TEST_Evidence',
  audit: 'KCFKPI_TEST_Audit',
  listIds: KCF_KPI_035_TEST_LIST_IDS,
  clientVersion: 'KCF-KPI-036',
  testRunKey: KCF_KPI_036_TEST_RUN_KEY,
  supportsBehaviourSelectionFields: true,
  supportsBehaviourFrameworkV2Fields: false
});

export const assertKcfKpi036TestBindings = (bindings: IEmployeeWorkplanV2ListBindings): void => {
  const expectedTitles: Readonly<Record<keyof IEmployeeWorkplanV2ListIds, string>> = Object.freeze({
    people: 'KCFKPI_TEST_People',
    workplans: 'KCFKPI_TEST_Workplans',
    workplanItems: 'KCFKPI_TEST_WorkplanItems',
    quarterReviews: 'KCFKPI_TEST_QuarterReviews',
    quarterReviewItems: 'KCFKPI_TEST_QuarterReviewItems',
    progressNotes: 'KCFKPI_TEST_ProgressNotes',
    evidence: 'KCFKPI_TEST_Evidence',
    audit: 'KCFKPI_TEST_Audit',
    employeeCommands: 'KCFKPI_TEST_EmployeeCommands',
    managerCommands: 'KCFKPI_TEST_ManagerCommands',
    commandReceipts: 'KCFKPI_TEST_CommandReceipts'
  });
  const keys = Object.keys(expectedTitles) as Array<keyof IEmployeeWorkplanV2ListIds>;
  if (!bindings.listIds
    || keys.some(key => bindings[key] !== expectedTitles[key]
      || bindings.listIds?.[key].toLowerCase() !== KCF_KPI_035_TEST_LIST_IDS[key])
    || bindings.clientVersion !== 'KCF-KPI-036'
    || !bindings.testRunKey?.startsWith('KCF-KPI-036|')
    || !bindings.supportsBehaviourSelectionFields) {
    throw new Error('KCF-KPI-036 TEST persistence bindings must match the exact KCF-KPI-035 title/GUID matrix.');
  }
};

export const assertEmployeeV2BindingsForRuntime = (bindings: IEmployeeWorkplanV2ListBindings): void => {
  const values = [bindings.people, bindings.employeeCommands, bindings.managerCommands,
    bindings.commandReceipts, bindings.workplans, bindings.workplanItems,
    bindings.quarterReviews, bindings.quarterReviewItems, bindings.progressNotes,
    bindings.evidence, bindings.audit];
  const isTestRoute = bindings.clientVersion === 'KCF-KPI-036'
    || Boolean(bindings.testRunKey)
    || values.some(value => value.startsWith('KCFKPI_TEST_'));
  if (isTestRoute) assertKcfKpi036TestBindings(bindings);
};
