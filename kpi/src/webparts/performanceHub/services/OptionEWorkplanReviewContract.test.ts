import {
  optionEApprovedReportingEligibility,
  verifyOptionEReviewReadback,
  type IOptionEReviewControl,
  type IOptionEReviewIntent,
  type IOptionEReviewReadback
} from './OptionEWorkplanReviewContract';

const base = (): IOptionEReviewReadback => {
  const before: IOptionEReviewControl = {
    workplanKey: 'WP-2027-1', personKey: 'EMP-1', performanceYear: 2027,
    state: 'Submitted', transitionStatus: 'Ready', etag: '"17"', rowVersionToken: 17,
    currentSubmittedSnapshotKey: 'SUB-2', managerPersonKey: 'MGR-1', hierarchyEpoch: 2, aclEpoch: 3
  };
  return {
    before,
    after: { ...before, state: 'Locked', etag: '"18"', rowVersionToken: 18,
      currentApprovedSnapshotKey: 'APP-2' },
    submitted: { snapshotKey: 'SUB-2', workplanKey: 'WP-2027-1', personKey: 'EMP-1',
      performanceYear: 2027, version: 2, payloadSha256: 'A'.repeat(64),
      sourceSubmittedSnapshotKey: 'SUB-2', immutable: true },
    approved: { snapshotKey: 'APP-2', workplanKey: 'WP-2027-1', personKey: 'EMP-1',
      performanceYear: 2027, version: 2, payloadSha256: 'A'.repeat(64),
      sourceSubmittedSnapshotKey: 'SUB-2', immutable: true },
    receipt: { receiptKey: 'R-1', commandKey: 'C-1', command: 'ApproveLock',
      workplanKey: 'WP-2027-1', actorPersonKey: 'MGR-1', submittedSnapshotKey: 'SUB-2',
      approvedSnapshotKey: 'APP-2', controlVersionBefore: 17, controlVersionAfter: 18,
      processorIdentity: 'TrustedFlow', auditKey: 'A-1', nativeCreatedAt: '2026-09-29T09:00:00Z' }
  };
};
const intent = (): IOptionEReviewIntent => ({ commandKey: 'C-1', command: 'ApproveLock',
  actorPersonKey: 'MGR-1', expectedWorkplanKey: 'WP-2027-1', expectedControlEtag: '"17"',
  expectedControlVersion: 17, expectedSubmittedSnapshotKey: 'SUB-2' });

describe('Option E trusted review boundary', () => {
  it('accepts exact locked approved provenance and excludes Draft and Submitted reporting', () => {
    const result = base();
    expect(() => verifyOptionEReviewReadback(intent(), result)).not.toThrow();
    expect(optionEApprovedReportingEligibility(result.after, result.submitted, result.approved, result.receipt)).toBe(true);
    expect(optionEApprovedReportingEligibility(result.before, result.submitted, result.approved, result.receipt)).toBe(false);
    expect(optionEApprovedReportingEligibility({ ...result.before, state: 'Draft' }, result.submitted, result.approved, result.receipt)).toBe(false);
  });

  it('requires an assigned manager, exact version, immutable snapshot and matching receipt', () => {
    const variants: IOptionEReviewReadback[] = [
      { ...base(), before: { ...base().before, managerPersonKey: 'OTHER' } },
      { ...base(), before: { ...base().before, etag: '"16"' } },
      { ...base(), before: { ...base().before, etag: '*' }, after: { ...base().after, etag: '"18"' } },
      { ...base(), after: { ...base().after, etag: '"17"' } },
      { ...base(), after: { ...base().after, rowVersionToken: 19 } },
      { ...base(), submitted: { ...base().submitted, immutable: false as true } },
      { ...base(), receipt: { ...base().receipt, auditKey: '' } },
      { ...base(), receipt: { ...base().receipt, submittedSnapshotKey: 'OTHER' } }
    ];
    variants.forEach(result => expect(() => verifyOptionEReviewReadback(intent(), result)).toThrow());
    expect(() => verifyOptionEReviewReadback({ ...intent(), expectedControlEtag: '*' },
      { ...base(), before: { ...base().before, etag: '*' } })).toThrow();
  });

  it('preserves submitted history on Request Changes and denies reporting', () => {
    const result = base();
    result.after = { ...result.after, state: 'ChangesRequested', currentApprovedSnapshotKey: undefined };
    result.approved = undefined;
    result.receipt = { ...result.receipt, command: 'RequestChanges', approvedSnapshotKey: undefined };
    const command = { ...intent(), command: 'RequestChanges' as const, reason: 'Revise annual target' };
    expect(() => verifyOptionEReviewReadback(command, result)).not.toThrow();
    expect(optionEApprovedReportingEligibility(result.after, result.submitted, result.approved, result.receipt)).toBe(false);
    expect(() => verifyOptionEReviewReadback({ ...command, reason: '' }, result)).toThrow();
  });

  it('rejects missing approval provenance and stale or replayed command keys', () => {
    const result = base();
    expect(optionEApprovedReportingEligibility(result.after, result.submitted, undefined, result.receipt)).toBe(false);
    expect(optionEApprovedReportingEligibility(result.after, result.submitted, result.approved, undefined)).toBe(false);
    expect(() => verifyOptionEReviewReadback({ ...intent(), commandKey: 'REPLAY' }, result)).toThrow();
    expect(() => verifyOptionEReviewReadback({ ...intent(), expectedSubmittedSnapshotKey: 'SUB-1' }, result)).toThrow();
    expect(() => verifyOptionEReviewReadback(intent(), { ...result, approved: undefined })).toThrow();
    expect(() => verifyOptionEReviewReadback(intent(), { ...result,
      approved: { ...result.approved!, payloadSha256: 'B'.repeat(64) } })).toThrow();
  });

  it('keeps the standalone reporting helper closed on wrong actor, digest or provenance', () => {
    const result = base();
    const eligible = (candidate: IOptionEReviewReadback): boolean =>
      optionEApprovedReportingEligibility(candidate.after, candidate.submitted,
        candidate.approved, candidate.receipt);
    expect(eligible({ ...result, receipt: { ...result.receipt, actorPersonKey: 'OTHER' } })).toBe(false);
    expect(eligible({ ...result, approved: { ...result.approved!, payloadSha256: 'B'.repeat(64) } })).toBe(false);
    expect(eligible({ ...result, submitted: { ...result.submitted, snapshotKey: 'OTHER' } })).toBe(false);
    expect(eligible({ ...result, receipt: { ...result.receipt, controlVersionBefore: 12 } })).toBe(false);
    expect(eligible({ ...result, receipt: { ...result.receipt, auditKey: '' } })).toBe(false);
    expect(eligible({ ...result, after: { ...result.after, etag: '*' } })).toBe(false);
  });

  it('rejects an otherwise valid Locked approval when only the approved snapshot is mutable', () => {
    const result = base();
    result.approved = { ...result.approved!, immutable: false as true };
    expect(optionEApprovedReportingEligibility(result.after, result.submitted,
      result.approved, result.receipt)).toBe(false);
    expect(() => verifyOptionEReviewReadback(intent(), result)).toThrow('ApprovalNotEligible');
  });
});
