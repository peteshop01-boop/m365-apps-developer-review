import type { IEmployeeCoreContributionInputV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import { TEST_COMMAND_WIRE_V2, TestCommandWireV2, TestCommandRequestV2, TestExpectedItem } from '../models/TestPilotCommandWire';
import { validateEmployeeCoreContributionInputV2 } from './EmployeeWorkplanV2PersistencePolicy';
import { projectEmployeeCoreContributionV2 } from './SharePointEmployeeWorkplanV2PersistenceService';
import { workplanKey } from './TestRuntimeBindings';

export const rejectTestWire = (): never => { throw new Error('TEST wire-v2 admission rejected.'); };
export function exactTestObject(v: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return rejectTestWire();
  const o = v as Record<string, unknown>;
  if (required.some(k => !Object.prototype.hasOwnProperty.call(o, k)) || Object.keys(o).some(k => !required.includes(k) && !optional.includes(k))) return rejectTestWire();
  return o;
}
/** Check the string and range BEFORE converting. No external numeric input can enter here. */
export function parseTestToken(value: unknown, create: boolean): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value)
    || value.length === 16 && value > '9007199254740991') return rejectTestWire();
  if (create ? value !== '0' : value === '0' || value.length === 16 && value > '9007199254740989') return rejectTestWire();
  return Number(value);
}
/** Separate boundary ONLY for already trusted canonical numeric snapshots, never parsed command numbers. */
export function tokenFromTrustedCanonical(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER - 2) return rejectTestWire();
  return String(value);
}
export function exactOpaqueTag(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value === '*') rejectTestWire();
}
export function validateCoreWirePayload(value: unknown): IEmployeeCoreContributionInputV2 {
  const p = exactTestObject(value, ['kpiId', 'role', 'contributionMethod', 'quarterTargets', 'displayOrder', 'activeInWorkplan'],
    ['annualTargetValue', 'annualTargetText', 'sharedTargetRule', 'sharedApportionmentPercent', 'governanceReference',
      'denominatorNumerator', 'denominatorValue', 'denominatorUnit', 'denominatorRuleReference', 'denominatorSourceReference']);
  for (const k of ['kpiId', 'role', 'contributionMethod', 'annualTargetText', 'sharedTargetRule', 'governanceReference', 'denominatorUnit', 'denominatorRuleReference', 'denominatorSourceReference']) {
    if (p[k] !== undefined && typeof p[k] !== 'string') rejectTestWire();
  }
  for (const k of ['displayOrder', 'annualTargetValue', 'sharedApportionmentPercent', 'denominatorNumerator', 'denominatorValue']) {
    if (p[k] !== undefined && (typeof p[k] !== 'number' || !Number.isFinite(p[k]))) rejectTestWire();
  }
  if (typeof p.activeInWorkplan !== 'boolean' || !Array.isArray(p.quarterTargets)) return rejectTestWire();
  for (const v of p.quarterTargets) {
    const q = exactTestObject(v, ['quarter'], ['targetValue', 'targetText', 'commitment', 'successDefinition']);
    if (typeof q.quarter !== 'string' || q.targetValue !== undefined && (typeof q.targetValue !== 'number' || !Number.isFinite(q.targetValue))) rejectTestWire();
    for (const k of ['targetText', 'commitment', 'successDefinition']) if (q[k] !== undefined && (typeof q[k] !== 'string' || k !== 'successDefinition' && (q[k] as string).length > 255)) rejectTestWire();
  }
  if (p.sharedTargetRule !== undefined && !['VisibleOnly', 'ApprovedApportionment'].includes(p.sharedTargetRule as string)) return rejectTestWire();
  if (p.sharedApportionmentPercent !== undefined && ((p.sharedApportionmentPercent as number) < 0 || (p.sharedApportionmentPercent as number) > 100)) return rejectTestWire();
  const input = p as unknown as IEmployeeCoreContributionInputV2;
  validateEmployeeCoreContributionInputV2(input);
  return input;
}
export function validateTestWire(value: unknown): TestCommandWireV2 {
  const w = exactTestObject(value, ['schemaVersion', 'binding', 'expected', 'payload']);
  if (w.schemaVersion !== TEST_COMMAND_WIRE_V2) return rejectTestWire();
  const b = exactTestObject(w.binding, ['commandKey', 'commandType', 'subjectType', 'subjectKey', 'personKey', 'performanceYear', 'workplanKey']);
  if (typeof b.commandKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.commandKey)
    || typeof b.personKey !== 'string' || !/^[A-Za-z0-9_.@-]{1,255}$/.test(b.personKey)
    || b.performanceYear !== 2027 || b.workplanKey !== workplanKey(b.personKey)) return rejectTestWire();
  if (typeof b.subjectKey !== 'string' || b.subjectKey.length > 255 || typeof b.workplanKey !== 'string' || b.workplanKey.length > 255) return rejectTestWire();
  const e = exactTestObject(w.expected, ['header', 'item']);
  const h = exactTestObject(e.header, ['presence', 'token', 'etag']);
  const create = b.commandType === 'CreateWorkplanDraft';
  parseTestToken(h.token, create);
  if (create) {
    if (b.subjectType !== 'Workplan' || b.subjectKey !== b.workplanKey || h.presence !== 'Absent' || h.etag !== null
      || exactTestObject(e.item, ['presence']).presence !== 'NotApplicable') return rejectTestWire();
    exactTestObject(w.payload, []);
  } else {
    if (b.commandType !== 'UpsertCoreContributionV2' || b.subjectType !== 'WorkplanItem' || h.presence !== 'Present') return rejectTestWire();
    exactOpaqueTag(h.etag);
    const p = validateCoreWirePayload(w.payload);
    if (!/^[A-Za-z0-9_.|-]{1,255}$/.test(p.kpiId) || b.subjectKey !== `${b.workplanKey}|CoreGold|${p.kpiId}`) return rejectTestWire();
    const item = exactTestObject(e.item, ['presence'], ['etag']);
    if (item.presence === 'Present') { exactTestObject(item, ['presence', 'etag']); exactOpaqueTag(item.etag); }
    else if (item.presence !== 'Absent' || Object.prototype.hasOwnProperty.call(item, 'etag')) return rejectTestWire();
  }
  return value as TestCommandWireV2;
}
function request(wire: TestCommandWireV2): TestCommandRequestV2 {
  validateTestWire(wire);
  return { route: 'Employee', ...wire.binding, expectedETag: wire.expected.header.etag ?? undefined,
    payload: wire };
}
export function createTestWorkplanDraftRequest(commandKey: string, personKey: string): TestCommandRequestV2 {
  const key = workplanKey(personKey);
  return request({ schemaVersion: TEST_COMMAND_WIRE_V2,
    binding: { commandKey, personKey, commandType: 'CreateWorkplanDraft', subjectType: 'Workplan', subjectKey: key, workplanKey: key, performanceYear: 2027 },
    expected: { header: { presence: 'Absent', token: '0', etag: null }, item: { presence: 'NotApplicable' } }, payload: {} });
}
export function createTestCoreRequest(commandKey: string, personKey: string, token: string, headerETag: string,
  item: TestExpectedItem, input: IEmployeeCoreContributionInputV2): TestCommandRequestV2 {
  validateCoreWirePayload(input);
  const key = workplanKey(personKey);
  return request({ schemaVersion: TEST_COMMAND_WIRE_V2,
    binding: { commandKey, personKey, commandType: 'UpsertCoreContributionV2', subjectType: 'WorkplanItem',
      subjectKey: `${key}|CoreGold|${input.kpiId}`, workplanKey: key, performanceYear: 2027 },
    expected: { header: { presence: 'Present', token, etag: headerETag }, item: { ...item } },
    payload: projectEmployeeCoreContributionV2(input) });
}
