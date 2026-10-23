import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Recreated synthetic design inputs: independent sorted JSON and standard UTF8 SHA256.
// No production codec, processor, native identity, permission or approval is invoked.
const output = path.resolve('temp/test-fixtures/review');
fs.mkdirSync(output, { recursive: true });
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value !== null && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
    : JSON.stringify(value);
const digest = body => crypto.createHash('sha256').update(body, 'utf8').digest('hex').toUpperCase();
const clone = value => JSON.parse(JSON.stringify(value));
const captureBytes = fs.readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-global-r3-receipt.json', 'utf8');
const capture = JSON.parse(captureBytes);
const authority = capture.snapshot.admission.authority;
const headerNative = authority.workplan.native;
const key = capture.key;
const commandKey = '7cd2b366-aa4d-4d2c-a046-a5ca92624918';
const native = (listId, itemId) => ({ ...headerNative, listId, itemId, version: '1.0', etag: '"1"' });
const command = { schemaVersion: 'kcf.kpi.option-e.review-command/v1', commandKey, command: 'ApproveLock',
  expectedWorkplanKey: authority.control.workplan, expectedControlEtag: '"review-control-7"',
  expectedControlVersion: 7, expectedSubmittedSnapshotKey: key };
const commandSource = { native: native('ed561fbf-15f4-4f29-abba-f51ac5937d4b', 5), bodySha256: digest(canonical(command)) };
const sourceCapture = { encoding: 'captured-native-request/v1', kind: 'receipt', key,
  native: native('499d5823-66c5-44cb-aa04-88c200efd902', 700), sha256: digest(captureBytes) };
const ordinalSource = { native: headerNative, field: 'WorkplanVersion', value: 2 };
const submitted = { snapshotKey: key, workplanKey: authority.control.workplan, personKey: authority.control.person,
  performanceYear: authority.control.year, version: 2, payloadSha256: digest(capture.snapshot.body),
  sourceSubmittedSnapshotKey: key, immutable: true };
const approved = { ...submitted, snapshotKey: 'oe-review:' + commandKey + ':approved' };
const approvedFrame = { schemaVersion: 'kcf.kpi.option-e.review-approved/v1', commandKey, approved, sourceCapture, ordinalSource };
const receipt = { schemaVersion: 'kcf.kpi.option-e.review-receipt/v1', receipt: {
  receiptKey: 'oe-review:' + commandKey + ':receipt', commandKey, command: 'ApproveLock', workplanKey: authority.control.workplan,
  actorPersonKey: authority.manager.key, submittedSnapshotKey: key, approvedSnapshotKey: approved.snapshotKey,
  controlVersionBefore: 7, controlVersionAfter: 8, processorIdentity: 'KCFKPIOptionEReviewProcessorV1',
  auditKey: 'oe-review:' + commandKey + ':receipt' }, commandSource, sourceCapture,
  approvedReference: { key: approved.snapshotKey, native: native('5269ebee-565a-4093-a666-00c98cfc5f68', 701), sha256: digest(canonical(approvedFrame)) } };
const before = { workplanKey: authority.control.workplan, personKey: authority.control.person, performanceYear: authority.control.year,
  state: 'Submitted', transitionStatus: 'Ready', etag: '"review-control-7"', rowVersionToken: 7,
  currentSubmittedSnapshotKey: key, managerPersonKey: authority.manager.key, hierarchyEpoch: 4, aclEpoch: 4 };
const withoutEtag = clone(before); delete withoutEtag.etag;
const journal = { schemaVersion: 'kcf.kpi.option-e.review-journal/v1', operationKey: 'oe-review:' + commandKey,
  journalRevision: 1, command, commandSource, actorBinding: { personKey: authority.manager.key,
    principalId: authority.manager.principal, email: 'manager@kcf-test.invalid',
    personNative: native('4d0bdfb4-b383-4e06-a381-1f55d60a21fa', 12), subjectPersonKey: authority.control.person,
    managerPersonKey: authority.manager.key, hierarchyEpoch: 4, aclEpoch: 4 }, before, currentControl: before,
  headerNative: { ...headerNative, version: '7.0', etag: '"review-control-7"' },
  desired: { ...withoutEtag, state: 'Locked', transitionStatus: 'Ready', rowVersionToken: 8, currentApprovedSnapshotKey: approved.snapshotKey },
  submitted, sourceCapture, ordinalSource, phase: 'Validated', outcome: 'Running', confirmedEffects: [] };
const vector = (name, value) => { const body = canonical(value); return { name, body, utf8Bytes: Buffer.byteLength(body, 'utf8'), sha256: digest(body) }; };
const goldens = Object.entries({ command, approved: approvedFrame, receipt, journal }).map(([name, value]) => vector(name, value));
fs.writeFileSync(path.join(output, 'normal-goldens.json'), JSON.stringify({ scope: 'SYNTHETIC DEVELOPER INPUTS ONLY, NOT NATIVE EVIDENCE', goldens }, null, 2));

const initial = clone(journal);
initial.schemaVersion = 'kcf.kpi.option-e.review-journal/v2';
initial.command.command = 'RequestChanges';
initial.command.reason = '  Keep unfinished target; clarify its evidence.  ';
initial.commandSource.bodySha256 = digest(canonical(initial.command));
initial.desired.state = 'ChangesRequested'; delete initial.desired.currentApprovedSnapshotKey;
const ready = clone(initial);
ready.phase = 'DecisionReady'; ready.journalRevision = 7; ready.currentControl.state = 'ChangesRequested';
ready.currentControl.etag = '"review-control-9"'; ready.headerNative.etag = ready.currentControl.etag; ready.headerNative.version = '9.0';
ready.lease = { owner: 'FICTIONAL-SOURCE-PROCESSOR', epoch: 1, expiresAt: '2026-10-11T04:30:00.000Z' };
const common = { operationKey: initial.operationKey, expectedVersion: initial.before.rowVersionToken,
  hierarchyEpoch: initial.before.hierarchyEpoch, aclEpoch: initial.before.aclEpoch };
const claim = { ...common, mode: 'Claim', expectedEtag: initial.before.etag,
  control: { ...withoutEtag, transitionStatus: 'Reviewing' }, accessState: 'ReadOnly' };
const decision = { ...common, mode: 'DecisionReady', expectedEtag: '"review-control-8"',
  control: { ...withoutEtag, state: 'ChangesRequested', transitionStatus: 'Ready' }, accessState: 'ReadOnly', managerDecisionComment: initial.command.reason };
const changesReceipt = { schemaVersion: 'kcf.kpi.option-e.review-receipt/v1', commandSource: clone(initial.commandSource),
  sourceCapture: clone(initial.sourceCapture), reason: initial.command.reason, receipt: { commandKey, command: 'RequestChanges',
    workplanKey: initial.before.workplanKey, actorPersonKey: initial.actorBinding.personKey, submittedSnapshotKey: initial.sourceCapture.key,
    receiptKey: initial.operationKey + ':receipt', auditKey: initial.operationKey + ':receipt', controlVersionBefore: initial.before.rowVersionToken,
    controlVersionAfter: initial.desired.rowVersionToken, processorIdentity: 'FICTIONAL-REQUESTCHANGES-PROCESSOR' } };
ready.confirmedEffects = [
  { kind: 'ControlClaim', key: initial.before.workplanKey, bodySha256: digest(canonical(claim)), native: { ...initial.headerNative, version: '8.0', etag: '"review-control-8"' } },
  { kind: 'ReceiptCreate', key: initial.operationKey + ':receipt', bodySha256: digest(canonical(changesReceipt)), native: { ...initial.commandSource.native, listId: '46b799c4-c9c1-4473-a82a-38a30d16dc9e', itemId: 800 } },
  { kind: 'DecisionReady', key: initial.before.workplanKey, bodySha256: digest(canonical(decision)), native: clone(ready.headerNative) }
];
const fixtures = Object.entries({ Validated: initial, DecisionReady: ready, RequestChangesReceiptV1: changesReceipt, ClaimPatch: claim, DecisionReadyPatch: decision })
  .map(([name, value]) => vector(name, value));
if ([...goldens, ...fixtures].some(row => row.utf8Bytes > 56000)) throw new Error('Synthetic fixture exceeds fixed codec bound');
fs.writeFileSync(path.join(output, 'journal-v2-normal-fixtures.json'), JSON.stringify({ scope: 'SYNTHETIC DEVELOPER INPUTS ONLY, NOT NATIVE EVIDENCE', fixtures,
  decisionAuthorityRequired: { pendingRequestKey: initial.operationKey, lastOperationKey: initial.operationKey, accessState: 'ReadOnly', managerDecisionComment: initial.command.reason, logicalToken: 7 },
  finalAuthorityRequired: { pendingRequestKey: '', lastOperationKey: initial.operationKey, accessState: 'EmployeeEdit', managerDecisionComment: initial.command.reason, logicalToken: 8 }
}, null, 2));
console.log(JSON.stringify({ reviewVectors: goldens.length, changesVectors: fixtures.length, scope: 'Generated portable synthetic inputs; no private evidence copied' }));
