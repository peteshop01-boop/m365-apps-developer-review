export interface ISec006ControlCase {
  controlCaseKey: string;
  controlReference: string;
  authorisedAction: 'CreateWorkplanAmendmentV2';
  subjectKey: string;
  workplanKey: string;
  workplanVersion: number;
  expectedETag: string;
  expectedRowVersionToken: number;
  storageETag: string;
  storageRowVersionToken: number;
  active: boolean;
  validFromUtc: string;
  validToUtc: string;
  revoked: boolean;
  revokedAtUtc?: string;
  revocationReason?: string;
  consumedAtUtc?: string;
  consumedCommandKey?: string;
  consumedSourceListId?: string;
  consumedSourceItemId?: number;
  consumedSourceItemVersion?: string;
  recoveryHoldAtUtc?: string;
  recoveryHoldReason?: string;
}

export interface ISec006ControlCaseConsumption {
  controlCaseKey: string;
  controlReference: string;
  authorisedAction: 'CreateWorkplanAmendmentV2';
  subjectKey: string;
  workplanKey: string;
  workplanVersion: number;
  expectedETag: string;
  expectedRowVersionToken: number;
  expectedStorageETag: string;
  expectedStorageRowVersionToken: number;
  trustedUtc: string;
  consumedAtUtc: string;
  consumedCommandKey: string;
  consumedSourceListId: string;
  consumedSourceItemId: number;
  consumedSourceItemVersion: string;
}

export type Sec006ControlCaseStoreCode =
  | 'CONSUMED'
  | 'CONTROL_CASE_NOT_FOUND'
  | 'CONTROL_CASE_STALE_WRITE'
  | 'CONTROL_CASE_INACTIVE'
  | 'CONTROL_CASE_ALREADY_CONSUMED'
  | 'CONTROL_CASE_RECOVERY_HOLD'
  | 'CONTROL_CASE_REVOKED'
  | 'CONTROL_CASE_INVALID'
  | 'CONTROL_CASE_NOT_YET_VALID'
  | 'CONTROL_CASE_EXPIRED'
  | 'CONTROL_CASE_BINDING_MISMATCH';

export interface ISec006ControlCaseStoreResult {
  accepted: boolean;
  code: Sec006ControlCaseStoreCode;
  controlCase?: ISec006ControlCase;
}

/**
 * Runtime implementations must execute compareAndSwapConsume as one authoritative
 * server-side conditional write (for SharePoint, an exact If-Match plus the
 * captured storage RowVersionToken). A read followed by an unconditional update
 * is not an implementation of this contract.
 */
export interface ISec006AuthoritativeControlCaseStore {
  compareAndSwapConsume(consumption: ISec006ControlCaseConsumption): ISec006ControlCaseStoreResult;
  markRecoveryHold(consumption: ISec006ControlCaseConsumption, reason: string): ISec006ControlCaseStoreResult;
  read(controlCaseKey: string): ISec006ControlCase | undefined;
}

const cloneCase = (value: ISec006ControlCase): ISec006ControlCase => ({ ...value });

const canonicalUtcInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const parseCanonicalUtcInstant = (value: string): number | undefined => {
  if (!canonicalUtcInstant.test(value)) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z') ? parsed : undefined;
};

const hasConsumedMarker = (controlCase: ISec006ControlCase): boolean =>
  controlCase.consumedAtUtc !== undefined
  || controlCase.consumedCommandKey !== undefined
  || controlCase.consumedSourceListId !== undefined
  || controlCase.consumedSourceItemId !== undefined
  || controlCase.consumedSourceItemVersion !== undefined;

/**
 * Shared fail-closed validation for an authoritative CONTROL-case CAS request.
 * A runtime store must still perform the comparison and mutation atomically.
 */
export const assessSec006ControlCaseConsumption = (
  current: ISec006ControlCase,
  consumption: ISec006ControlCaseConsumption
): Exclude<Sec006ControlCaseStoreCode, 'CONSUMED' | 'CONTROL_CASE_NOT_FOUND'> | undefined => {
  if (current.recoveryHoldAtUtc || current.recoveryHoldReason) return 'CONTROL_CASE_RECOVERY_HOLD';
  if (hasConsumedMarker(current)) return 'CONTROL_CASE_ALREADY_CONSUMED';
  if (!current.active) return 'CONTROL_CASE_INACTIVE';
  if (current.revoked || current.revokedAtUtc || current.revocationReason) return 'CONTROL_CASE_REVOKED';
  const trustedAt = parseCanonicalUtcInstant(consumption.trustedUtc);
  const validFrom = parseCanonicalUtcInstant(current.validFromUtc);
  const validTo = parseCanonicalUtcInstant(current.validToUtc);
  if (trustedAt === undefined || validFrom === undefined || validTo === undefined
    || validFrom > validTo || consumption.consumedAtUtc !== consumption.trustedUtc) {
    return 'CONTROL_CASE_INVALID';
  }
  if (validFrom > trustedAt) return 'CONTROL_CASE_NOT_YET_VALID';
  if (validTo < trustedAt) return 'CONTROL_CASE_EXPIRED';
  if (current.controlReference !== consumption.controlReference
    || current.authorisedAction !== consumption.authorisedAction
    || current.subjectKey !== consumption.subjectKey
    || current.workplanKey !== consumption.workplanKey
    || current.workplanVersion !== consumption.workplanVersion
    || current.expectedETag !== consumption.expectedETag
    || current.expectedRowVersionToken !== consumption.expectedRowVersionToken) {
    return 'CONTROL_CASE_BINDING_MISMATCH';
  }
  if (current.storageETag !== consumption.expectedStorageETag
    || current.storageRowVersionToken !== consumption.expectedStorageRowVersionToken) {
    return 'CONTROL_CASE_STALE_WRITE';
  }
  return undefined;
};

/** Deterministic non-production CAS adapter used by processor tests only. */
export class Sec006AtomicControlCaseMemoryStore implements ISec006AuthoritativeControlCaseStore {
  private readonly records = new Map<string, ISec006ControlCase>();

  public constructor(controlCases: readonly ISec006ControlCase[]) {
    controlCases.forEach(controlCase => this.records.set(controlCase.controlCaseKey, cloneCase(controlCase)));
  }

  public read(controlCaseKey: string): ISec006ControlCase | undefined {
    const current = this.records.get(controlCaseKey);
    return current ? cloneCase(current) : undefined;
  }

  public compareAndSwapConsume(consumption: ISec006ControlCaseConsumption): ISec006ControlCaseStoreResult {
    const current = this.records.get(consumption.controlCaseKey);
    if (!current) return { accepted: false, code: 'CONTROL_CASE_NOT_FOUND' };
    const rejection = assessSec006ControlCaseConsumption(current, consumption);
    if (rejection) return { accepted: false, code: rejection, controlCase: cloneCase(current) };
    const nextVersion = current.storageRowVersionToken + 1;
    const consumed: ISec006ControlCase = {
      ...current,
      active: false,
      storageETag: `\"${nextVersion}\"`,
      storageRowVersionToken: nextVersion,
      consumedAtUtc: consumption.consumedAtUtc,
      consumedCommandKey: consumption.consumedCommandKey,
      consumedSourceListId: consumption.consumedSourceListId,
      consumedSourceItemId: consumption.consumedSourceItemId,
      consumedSourceItemVersion: consumption.consumedSourceItemVersion
    };
    this.records.set(consumption.controlCaseKey, consumed);
    return { accepted: true, code: 'CONSUMED', controlCase: cloneCase(consumed) };
  }

  public markRecoveryHold(
    consumption: ISec006ControlCaseConsumption,
    reason: string
  ): ISec006ControlCaseStoreResult {
    const current = this.records.get(consumption.controlCaseKey);
    if (!current) return { accepted: false, code: 'CONTROL_CASE_NOT_FOUND' };
    if (current.consumedAtUtc !== consumption.consumedAtUtc
      || current.consumedCommandKey !== consumption.consumedCommandKey
      || current.consumedSourceListId !== consumption.consumedSourceListId
      || current.consumedSourceItemId !== consumption.consumedSourceItemId
      || current.consumedSourceItemVersion !== consumption.consumedSourceItemVersion) {
      return { accepted: false, code: 'CONTROL_CASE_STALE_WRITE', controlCase: cloneCase(current) };
    }
    if (!current.recoveryHoldAtUtc) {
      const nextVersion = current.storageRowVersionToken + 1;
      this.records.set(consumption.controlCaseKey, {
        ...current,
        storageETag: `\"${nextVersion}\"`,
        storageRowVersionToken: nextVersion,
        recoveryHoldAtUtc: consumption.consumedAtUtc,
        recoveryHoldReason: reason
      });
    }
    return {
      accepted: true,
      code: 'CONTROL_CASE_RECOVERY_HOLD',
      controlCase: cloneCase(this.records.get(consumption.controlCaseKey)!)
    };
  }
}

