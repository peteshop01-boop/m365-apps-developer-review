/** M145 / 2026-09-09. Local TEST wire contract, no installed route. */
import type { IEmployeeCoreContributionInputV2 } from './EmployeeWorkplanV2PersistenceModels';
import type { IEmployeeV2CommandRequest } from '../services/EmployeeWorkplanV2CommandTransport';
export const TEST_COMMAND_WIRE_V2 = 'kcf.kpi.test-command.v2' as const;
export const TEST_ADMISSION_POLICY_V2 = 'kcf.kpi.test-admission.v2' as const;
export interface TestWireBinding {
  commandKey: string; commandType: 'CreateWorkplanDraft' | 'UpsertCoreContributionV2';
  subjectType: 'Workplan' | 'WorkplanItem'; subjectKey: string; personKey: string;
  performanceYear: 2027; workplanKey: string;
}
export type TestExpectedHeader = { presence: 'Absent'; token: '0'; etag: null }
  | { presence: 'Present'; token: string; etag: string };
export type TestExpectedItem = { presence: 'Absent' | 'NotApplicable' } | { presence: 'Present'; etag: string };
export interface TestCommandWireV2 {
  schemaVersion: typeof TEST_COMMAND_WIRE_V2; binding: TestWireBinding;
  expected: { header: TestExpectedHeader; item: TestExpectedItem };
  payload: IEmployeeCoreContributionInputV2 | Record<string, never>;
}
export interface TestCommandRequestV2 extends IEmployeeV2CommandRequest {
  route: 'Employee'; performanceYear: 2027; expectedRowVersionToken?: never; payload: TestCommandWireV2;
}
