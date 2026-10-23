/**
 * Trusted-processor boundary for the annual Option E review. These functions
 * validate canonical readbacks; they do not grant a browser authority to write
 * protected Workplans, snapshots, receipts or reporting rows.
 */
export type OptionEReviewState = 'Draft' | 'ChangesRequested' | 'Submitted' | 'Approved' | 'Locked';
export type OptionEReviewCommand = 'RequestChanges' | 'ApproveLock';

export interface IOptionEReviewControl {
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  state: OptionEReviewState;
  transitionStatus: 'Ready' | 'Submitting' | 'Reviewing' | 'RecoveryHold';
  etag: string;
  rowVersionToken: number;
  currentSubmittedSnapshotKey?: string;
  currentApprovedSnapshotKey?: string;
  managerPersonKey: string;
  hierarchyEpoch: number;
  aclEpoch: number;
}

export interface IOptionEReviewSnapshot {
  snapshotKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  version: number;
  payloadSha256: string;
  sourceSubmittedSnapshotKey: string;
  immutable: true;
}

export interface IOptionEReviewReceipt {
  receiptKey: string;
  commandKey: string;
  command: OptionEReviewCommand;
  workplanKey: string;
  actorPersonKey: string;
  submittedSnapshotKey: string;
  approvedSnapshotKey?: string;
  controlVersionBefore: number;
  controlVersionAfter: number;
  processorIdentity: string;
  auditKey: string;
  nativeCreatedAt: string;
}

export interface IOptionEReviewIntent {
  commandKey: string;
  command: OptionEReviewCommand;
  actorPersonKey: string;
  expectedWorkplanKey: string;
  expectedControlEtag: string;
  expectedControlVersion: number;
  expectedSubmittedSnapshotKey: string;
  reason?: string;
}

export interface IOptionEReviewReadback {
  before: IOptionEReviewControl;
  after: IOptionEReviewControl;
  submitted: IOptionEReviewSnapshot;
  approved?: IOptionEReviewSnapshot;
  receipt: IOptionEReviewReceipt;
}

export class OptionEReviewBoundaryError extends Error {
  public constructor(public readonly code: string) {
    super(`Option E review cannot be confirmed: ${code}`);
    this.name = 'OptionEReviewBoundaryError';
    Object.setPrototypeOf(this, OptionEReviewBoundaryError.prototype);
  }
}

const required = (value: string | undefined): boolean => typeof value === 'string' && Boolean(value.trim());
const digest = (value: string): boolean => /^[0-9A-F]{64}$/.test(value);
const version = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
const fail = (code: string): never => { throw new OptionEReviewBoundaryError(code); };

/** Only an exact, immutable, approved readback may enter annual reporting. */
export function optionEApprovedReportingEligibility(
  control: IOptionEReviewControl,
  submitted: IOptionEReviewSnapshot | undefined,
  approved: IOptionEReviewSnapshot | undefined,
  receipt: IOptionEReviewReceipt | undefined
): boolean {
  return control.state === 'Locked' && control.transitionStatus === 'Ready'
    && required(control.currentApprovedSnapshotKey) && required(control.currentSubmittedSnapshotKey)
    && required(control.managerPersonKey) && required(control.etag) && control.etag !== '*'
    && version(control.rowVersionToken) && version(control.hierarchyEpoch) && version(control.aclEpoch)
    && Boolean(submitted && approved && receipt && submitted.immutable === true
      && approved.immutable === true
      && submitted.snapshotKey === control.currentSubmittedSnapshotKey
      && submitted.workplanKey === control.workplanKey
      && submitted.personKey === control.personKey
      && submitted.performanceYear === control.performanceYear
      && version(submitted.version) && digest(submitted.payloadSha256)
      && approved.payloadSha256 === submitted.payloadSha256
      && approved.version === submitted.version
      && approved.snapshotKey === control.currentApprovedSnapshotKey
      && approved.sourceSubmittedSnapshotKey === control.currentSubmittedSnapshotKey
      && approved.workplanKey === control.workplanKey
      && approved.personKey === control.personKey
      && approved.performanceYear === control.performanceYear
      && version(approved.version) && digest(approved.payloadSha256)
      && receipt.command === 'ApproveLock'
      && receipt.workplanKey === control.workplanKey
      && receipt.actorPersonKey === control.managerPersonKey
      && receipt.submittedSnapshotKey === control.currentSubmittedSnapshotKey
      && receipt.approvedSnapshotKey === approved.snapshotKey
      && version(receipt.controlVersionBefore)
      && receipt.controlVersionBefore + 1 === control.rowVersionToken
      && receipt.controlVersionAfter === control.rowVersionToken
      && required(receipt.receiptKey) && required(receipt.commandKey)
      && required(receipt.processorIdentity) && required(receipt.auditKey)
      && required(receipt.nativeCreatedAt));
}

/** Validate a processor result before the client displays a completed transition. */
export function verifyOptionEReviewReadback(intent: IOptionEReviewIntent, result: IOptionEReviewReadback): void {
  const { before, after, submitted, approved, receipt } = result;
  if (!required(intent.commandKey) || !required(intent.actorPersonKey)
    || !required(intent.expectedControlEtag) || !required(intent.expectedSubmittedSnapshotKey)
    || !version(intent.expectedControlVersion)) fail('InvalidIntent');
  if (before.workplanKey !== intent.expectedWorkplanKey || after.workplanKey !== before.workplanKey
    || submitted.workplanKey !== before.workplanKey || receipt.workplanKey !== before.workplanKey
    || before.personKey !== after.personKey || before.personKey !== submitted.personKey
    || before.performanceYear !== after.performanceYear || before.performanceYear !== submitted.performanceYear) {
    fail('IdentityMismatch');
  }
  if (!required(before.etag) || before.etag === '*'
    || before.etag !== intent.expectedControlEtag || before.rowVersionToken !== intent.expectedControlVersion
    || !required(after.etag) || after.etag === '*' || after.etag === before.etag
    || after.rowVersionToken !== before.rowVersionToken + 1) fail('VersionConflict');
  if (before.state !== 'Submitted' || before.transitionStatus !== 'Ready'
    || before.currentSubmittedSnapshotKey !== intent.expectedSubmittedSnapshotKey
    || submitted.snapshotKey !== before.currentSubmittedSnapshotKey
    || submitted.immutable !== true || !version(submitted.version) || !digest(submitted.payloadSha256)) {
    fail('SubmittedAuthorityAbsent');
  }
  if (!required(before.managerPersonKey) || before.managerPersonKey !== intent.actorPersonKey
    || after.managerPersonKey !== before.managerPersonKey
    || !version(before.hierarchyEpoch) || after.hierarchyEpoch !== before.hierarchyEpoch
    || !version(before.aclEpoch) || after.aclEpoch !== before.aclEpoch) fail('ManagerAuthorityMismatch');
  if (receipt.commandKey !== intent.commandKey || receipt.command !== intent.command
    || receipt.actorPersonKey !== intent.actorPersonKey
    || receipt.submittedSnapshotKey !== submitted.snapshotKey
    || receipt.controlVersionBefore !== before.rowVersionToken
    || receipt.controlVersionAfter !== after.rowVersionToken
    || !required(receipt.receiptKey) || !required(receipt.processorIdentity)
    || !required(receipt.auditKey) || !required(receipt.nativeCreatedAt)) fail('ReceiptAbsentOrMismatched');
  if (after.transitionStatus !== 'Ready' || after.currentSubmittedSnapshotKey !== submitted.snapshotKey) {
    fail('TransitionIncomplete');
  }
  if (intent.command === 'RequestChanges') {
    if (!required(intent.reason) || after.state !== 'ChangesRequested'
      || after.currentApprovedSnapshotKey || approved || receipt.approvedSnapshotKey) fail('ChangesTransitionInvalid');
  } else if (intent.command === 'ApproveLock') {
    if (after.state !== 'Locked' || !approved || approved.immutable !== true
      || approved.version !== submitted.version
      || approved.payloadSha256 !== submitted.payloadSha256
      || !optionEApprovedReportingEligibility(after, submitted, approved, receipt)) {
      fail('ApprovalNotEligible');
    }
  } else fail('UnsupportedCommand');
}
