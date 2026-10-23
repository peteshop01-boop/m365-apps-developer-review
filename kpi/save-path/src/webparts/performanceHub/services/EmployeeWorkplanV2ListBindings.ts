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
  people: 'DEMOAPP_People',
  employeeCommands: 'DEMOAPP_EmployeeCommands',
  managerCommands: 'DEMOAPP_ManagerCommands',
  commandReceipts: 'DEMOAPP_CommandReceipts',
  workplans: 'DEMOAPP_Workplans',
  workplanItems: 'DEMOAPP_WorkplanItems',
  quarterReviews: 'DEMOAPP_QuarterReviews',
  quarterReviewItems: 'DEMOAPP_QuarterReviewItems',
  progressNotes: 'DEMOAPP_ProgressNotes',
  evidence: 'DEMOAPP_Evidence',
  audit: 'DEMOAPP_Audit',
  clientVersion: 'DEMO-APP-027A',
  supportsBehaviourSelectionFields: false,
  supportsBehaviourFrameworkV2Fields: false
});

export const DEMO_KPI_036_TEST_RUN_KEY = 'DEMO-APP-036|EMPLOYEE-PERSISTENCE|PETE';

export const DEMO_KPI_035_TEST_LIST_IDS: Readonly<IEmployeeWorkplanV2ListIds> = Object.freeze({
  people: 'a5bc9c84-265e-4cfb-b3c3-13fbabb071d4',
  workplans: '252d4a8c-2c5a-4dd0-aa8b-7a104d5e1fdf',
  workplanItems: '43d27e1a-2f7a-49da-8919-59b760e1d496',
  quarterReviews: '5b33502d-26d7-48d4-851c-cafc9f2d5a0a',
  quarterReviewItems: 'd8708301-21b2-41d9-bdb1-bbcc4cc88b70',
  progressNotes: '6f439af1-b189-44da-a7b9-549ae930b5ef',
  evidence: '1c7e1e05-a3f9-4094-b608-a2e8b6209cee',
  audit: 'f05d52e3-832b-4b12-9fc3-bc9945aec359',
  employeeCommands: '8f6f7613-4e86-4dc1-9dec-3ece87f37d99',
  managerCommands: 'a80458f3-2ed5-45f3-8cf1-e7a766678706',
  commandReceipts: '20a9260d-a74f-4c73-88d7-1f70d18df14e'
});

export const DEMO_KPI_036_TEST_LIST_BINDINGS: Readonly<IEmployeeWorkplanV2ListBindings> = Object.freeze({
  people: 'DEMOAPP_TEST_People',
  employeeCommands: 'DEMOAPP_TEST_EmployeeCommands',
  managerCommands: 'DEMOAPP_TEST_ManagerCommands',
  commandReceipts: 'DEMOAPP_TEST_CommandReceipts',
  workplans: 'DEMOAPP_TEST_Workplans',
  workplanItems: 'DEMOAPP_TEST_WorkplanItems',
  quarterReviews: 'DEMOAPP_TEST_QuarterReviews',
  quarterReviewItems: 'DEMOAPP_TEST_QuarterReviewItems',
  progressNotes: 'DEMOAPP_TEST_ProgressNotes',
  evidence: 'DEMOAPP_TEST_Evidence',
  audit: 'DEMOAPP_TEST_Audit',
  listIds: DEMO_KPI_035_TEST_LIST_IDS,
  clientVersion: 'DEMO-APP-036',
  testRunKey: DEMO_KPI_036_TEST_RUN_KEY,
  supportsBehaviourSelectionFields: true,
  supportsBehaviourFrameworkV2Fields: false
});

export const assertDemoApp036TestBindings = (bindings: IEmployeeWorkplanV2ListBindings): void => {
  const expectedTitles: Readonly<Record<keyof IEmployeeWorkplanV2ListIds, string>> = Object.freeze({
    people: 'DEMOAPP_TEST_People',
    workplans: 'DEMOAPP_TEST_Workplans',
    workplanItems: 'DEMOAPP_TEST_WorkplanItems',
    quarterReviews: 'DEMOAPP_TEST_QuarterReviews',
    quarterReviewItems: 'DEMOAPP_TEST_QuarterReviewItems',
    progressNotes: 'DEMOAPP_TEST_ProgressNotes',
    evidence: 'DEMOAPP_TEST_Evidence',
    audit: 'DEMOAPP_TEST_Audit',
    employeeCommands: 'DEMOAPP_TEST_EmployeeCommands',
    managerCommands: 'DEMOAPP_TEST_ManagerCommands',
    commandReceipts: 'DEMOAPP_TEST_CommandReceipts'
  });
  const keys = Object.keys(expectedTitles) as Array<keyof IEmployeeWorkplanV2ListIds>;
  if (!bindings.listIds
    || keys.some(key => bindings[key] !== expectedTitles[key]
      || bindings.listIds?.[key].toLowerCase() !== DEMO_KPI_035_TEST_LIST_IDS[key])
    || bindings.clientVersion !== 'DEMO-APP-036'
    || !bindings.testRunKey?.startsWith('DEMO-APP-036|')
    || !bindings.supportsBehaviourSelectionFields) {
    throw new Error('DEMO-APP-036 TEST persistence bindings must match the exact DEMO-APP-035 title/GUID matrix.');
  }
};

export const assertEmployeeV2BindingsForRuntime = (bindings: IEmployeeWorkplanV2ListBindings): void => {
  const values = [bindings.people, bindings.employeeCommands, bindings.managerCommands,
    bindings.commandReceipts, bindings.workplans, bindings.workplanItems,
    bindings.quarterReviews, bindings.quarterReviewItems, bindings.progressNotes,
    bindings.evidence, bindings.audit];
  const isTestRoute = bindings.clientVersion === 'DEMO-APP-036'
    || Boolean(bindings.testRunKey)
    || values.some(value => value.startsWith('DEMOAPP_TEST_'));
  if (isTestRoute) assertDemoApp036TestBindings(bindings);
};
