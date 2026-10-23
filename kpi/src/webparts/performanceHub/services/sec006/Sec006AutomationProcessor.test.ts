import {
  Sec006AutomationProcessor,
  Sec006PartialFailureError,
  buildSec006ReceiptKey,
  sec006Sha256,
  type ISec006CanonicalSubject,
  type ISec006CommandEnvelope,
  type ISec006ProcessContext,
  type ISec006ProcessorState,
  type ISec006TrustedSource
} from './Sec006AutomationProcessor';
import { Sec006AtomicControlCaseMemoryStore, type ISec006ControlCase } from './Sec006ControlCaseStore';

const employeeListId = '7cd2b366-aa4d-4d2c-a046-a5ca92624918';
const managerListId = 'c506d905-ec56-45ff-a2a0-2a4ee094fa4a';
const trustedUtc = '2026-11-01T12:00:00Z';

const subject = (patch: Partial<ISec006CanonicalSubject> = {}): ISec006CanonicalSubject => ({
  subjectKey: 'WP|E1|2027', subjectType: 'Workplan', personKey: 'E1', performanceYear: 2027,
  etag: '"1"', rowVersionToken: 1, state: 'Draft', workplanVersion: 1, locked: false,
  transitionStatus: 'Ready', values: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 },
  ...patch
});

const controlCase = (): ISec006ControlCase => ({
  controlCaseKey: 'CONTROL-027B-001', controlReference: 'CONTROL-027B-001',
  authorisedAction: 'CreateWorkplanAmendmentV2', subjectKey: 'WP|E1|2027',
  workplanKey: 'WP|E1|2027', workplanVersion: 1, expectedETag: '"1"',
  expectedRowVersionToken: 1, storageETag: '"1"', storageRowVersionToken: 1, active: true,
  validFromUtc: '2026-10-01T00:00:00Z', validToUtc: '2027-10-31T23:59:59Z', revoked: false
});

const state = (canonical: ISec006CanonicalSubject = subject()): ISec006ProcessorState => ({
  trustedSourceListIds: {
    KCFKPI_EmployeeCommands: employeeListId,
    KCFKPI_ManagerCommands: managerListId
  },
  people: [
    { personKey: 'E1', email: 'e1@example.invalid', managerPersonKey: 'M1', active: true, appRoles: ['Employee'] },
    { personKey: 'E2', email: 'e2@example.invalid', managerPersonKey: 'M2', active: true, appRoles: ['Employee'] },
    { personKey: 'M1', email: 'm1@example.invalid', active: true, appRoles: ['Manager'] },
    { personKey: 'M2', email: 'm2@example.invalid', active: true, appRoles: ['Manager'] },
    { personKey: 'D1', email: 'd1@example.invalid', active: true, appRoles: ['DelegatedManager'] },
    { personKey: 'BA1', email: 'ba1@example.invalid', active: true, appRoles: ['BusinessAdmin'] },
    { personKey: 'SA1', email: 'sa1@example.invalid', active: true, appRoles: ['SystemAdmin'] },
    { personKey: 'Synthetic User', email: 'person003@example.invalid', active: true, appRoles: ['Employee'] }
  ],
  delegations: [
    {
      delegationKey: 'DEL-ACTIVE', delegatorPersonKey: 'M1', delegatePersonKey: 'D1',
      subjectPersonKey: 'E1', performanceYear: 2027, partition: 'annual',
      resourceType: 'KCFKPI_Workplans', resourceKey: 'WP|E1|2027',
      subjectType: 'Workplan', subjectKey: 'WP|E1|2027', active: true, revoked: false,
      startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z',
      subjectTypes: ['Workplan'], subjectKeys: ['WP|E1|2027'],
      commandTypes: ['RequestWorkplanChanges'], readbackAllowed: true
    }
  ],
  stableKeyBindings: [
    {
      fieldName: 'workplanItemKey', value: 'WPI|E1|2027|SO1-001',
      subjectKey: canonical.subjectKey, personKey: canonical.personKey,
      performanceYear: canonical.performanceYear, active: true
    }
  ],
  controlCases: [controlCase()],
  controlCaseStore: new Sec006AtomicControlCaseMemoryStore([controlCase()]),
  subjects: new Map([[canonical.subjectKey, canonical]]),
  approvedHistory: [], receipts: [], audit: [], recoveryJournal: []
});

const source = (patch: Partial<ISec006TrustedSource> = {}): ISec006TrustedSource => ({
  listId: employeeListId, listTitle: 'KCFKPI_EmployeeCommands', itemId: 71,
  itemVersion: '1.0', authorEmail: 'e1@example.invalid', createdUtc: '2026-11-01T11:59:00Z',
  ...patch
});

const command = (patch: Partial<ISec006CommandEnvelope> = {}): ISec006CommandEnvelope => ({
  commandKey: 'CMD-001', commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
  subjectKey: 'WP|E1|2027', claimedPersonKey: 'E1', claimedPerformanceYear: 2027,
  expectedETag: '"1"', expectedRowVersionToken: 1,
  payload: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 },
  clientCorrelationKey: 'CORR-001', ...patch
});

const context = (
  sourcePatch: Partial<ISec006TrustedSource> = {},
  commandPatch: Partial<ISec006CommandEnvelope> = {}
): ISec006ProcessContext => ({
  source: source(sourcePatch), command: command(commandPatch),
  automationIdentity: 'a1.synthetic.noninteractive@example.invalid',
  flowRunReference: 'FLOW-RUN-001', trustedUtc
});

describe('KCF-KPI-027B SEC-006 Automation processor', () => {
  it('derives ReceiptKey from trusted source GUID and item ID and records the captured version', () => {
    const current = state();
    const result = new Sec006AutomationProcessor().process(context(), current);
    expect(result.receipt).toEqual(expect.objectContaining({
      receiptKey: `${employeeListId}|71`, sourceListId: employeeListId,
      sourceItemId: 71, sourceItemVersion: '1.0', outcome: 'Accepted'
    }));
    expect(buildSec006ReceiptKey(`{${employeeListId.toUpperCase()}}`, 71)).toBe(`${employeeListId}|71`);
    expect(result.mutationApplied).toBe(true);
    expect(result.receipt.processedByEmail).toBe('a1.synthetic.noninteractive@example.invalid');
  });

  it('trusts SharePoint Author rather than a client actor or role claim', () => {
    const current = state();
    const result = new Sec006AutomationProcessor().process(context({}, {
      payload: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, actorRole: 'SystemAdmin' }
    }), current);
    expect(result.receipt.validationCode).toBe('PROTECTED_FIELD_CLAIM');
    expect(result.receipt.authenticatedActorEmail).toBe('e1@example.invalid');
    expect(result.mutationApplied).toBe(false);
  });

  it('denies unrelated Employee and Business Admin cross-person commands', () => {
    const unrelated = new Sec006AutomationProcessor().process(context({ authorEmail: 'e2@example.invalid' }), state());
    expect(unrelated.receipt.validationCode).toBe('AUTHORITY_DENIED');
    const businessAdmin = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'ba1@example.invalid'
    }, { commandType: 'RequestWorkplanChanges', payload: { reason: 'Attempt.' } }), state(subject({ state: 'Submitted' })));
    expect(businessAdmin.receipt.validationCode).toBe('AUTHORITY_DENIED');
  });

  it('rejects forged PersonKey and cross-year claims before mutation', () => {
    const person = new Sec006AutomationProcessor().process(context({}, { claimedPersonKey: 'E2' }), state());
    expect(person.receipt.validationCode).toBe('SUBJECT_PERSON_MISMATCH');
    const year = new Sec006AutomationProcessor().process(context({}, { claimedPerformanceYear: 2026 }), state());
    expect(year.receipt.validationCode).toBe('SUBJECT_YEAR_MISMATCH');
  });

  it('rejects protected fields at any payload depth', () => {
    const result = new Sec006AutomationProcessor().process(context({}, {
      payload: {
        coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
        zeroPersonalProposal: { employeeReason: 'Proposal', finalRAG: 'Green' }
      }
    }), state());
    expect(result.receipt.validationCode).toBe('PROTECTED_FIELD_CLAIM');
    expect(result.receipt.message).toMatch(/finalRAG/);
  });

  it('rejects Official Actual claims and preserves its independent authority', () => {
    const result = new Sec006AutomationProcessor().process(context({}, {
      payload: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, officialActualValue: 999 }
    }), state());
    expect(result.receipt.validationCode).toBe('PROTECTED_FIELD_CLAIM');
    expect(result.mutationApplied).toBe(false);
  });

  it('requires exact non-wildcard ETag and positive RowVersionToken', () => {
    const wildcard = new Sec006AutomationProcessor().process(context({}, { expectedETag: '*' }), state());
    expect(wildcard.receipt.validationCode).toBe('CONCURRENCY_REQUIRED');
    const zero = new Sec006AutomationProcessor().process(context({}, { expectedRowVersionToken: 0 }), state());
    expect(zero.receipt.validationCode).toBe('CONCURRENCY_REQUIRED');
  });

  it('rejects either stale concurrency value with zero canonical mutation', () => {
    const current = state();
    const before = current.subjects.get('WP|E1|2027');
    const staleEtag = new Sec006AutomationProcessor().process(context({}, { expectedETag: '"0"' }), current);
    expect(staleEtag.receipt.validationCode).toBe('STALE_WRITE');
    expect(current.subjects.get('WP|E1|2027')).toEqual(before);
    const staleToken = new Sec006AutomationProcessor().process(context({ itemId: 72 }, { commandKey: 'CMD-002', expectedRowVersionToken: 2 }), current);
    expect(staleToken.receipt.validationCode).toBe('STALE_WRITE');
  });

  it('returns a durable same-source replay without reapplying the mutation', () => {
    const current = state();
    const processor = new Sec006AutomationProcessor();
    const first = processor.process(context(), current);
    const afterFirst = current.subjects.get('WP|E1|2027');
    const replay = processor.process(context({}, { expectedETag: '"2"', expectedRowVersionToken: 2 }), current);
    expect(first.receipt.outcome).toBe('Accepted');
    expect(replay.replayed).toBe(true);
    expect(replay.mutationApplied).toBe(false);
    expect(replay.receipt).toBe(first.receipt);
    expect(current.receipts).toHaveLength(1);
    expect(current.subjects.get('WP|E1|2027')).toEqual(afterFirst);
    expect(current.audit.some(event => event.validationCode === 'SOURCE_REPLAY')).toBe(true);
  });

  it('does not process an edit of an already captured source item as a new event', () => {
    const current = state();
    const processor = new Sec006AutomationProcessor();
    processor.process(context(), current);
    const replay = processor.process(context({ itemVersion: '2.0' }, {
      expectedETag: '"2"', expectedRowVersionToken: 2,
      payload: { coreCategoryWeight: 60, personalCategoryWeight: 30, behaviourCategoryWeight: 10 }
    }), current);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt.sourceItemVersion).toBe('1.0');
    expect(current.receipts).toHaveLength(1);
  });

  it('rejects CommandKey collision across a different trusted source or payload', () => {
    const current = state();
    const processor = new Sec006AutomationProcessor();
    processor.process(context(), current);
    const collision = processor.process(context({ itemId: 72 }, {
      expectedETag: '"2"', expectedRowVersionToken: 2,
      payload: { coreCategoryWeight: 60, personalCategoryWeight: 30, behaviourCategoryWeight: 10 }
    }), current);
    expect(collision.receipt.validationCode).toBe('COMMAND_KEY_COLLISION');
    expect(collision.mutationApplied).toBe(false);
    expect(current.receipts).toHaveLength(2);
  });

  it('accepts the current manager and denies the unrelated manager', () => {
    const submitted = subject({ state: 'Submitted' });
    const managerContext = context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'm1@example.invalid'
    }, { commandType: 'RequestWorkplanChanges', payload: { reason: 'Clarify targets.' } });
    const accepted = new Sec006AutomationProcessor().process(managerContext, state(submitted));
    expect(accepted.receipt.effectiveRole).toBe('Manager');
    expect(accepted.receipt.outcome).toBe('Accepted');
    const denied = new Sec006AutomationProcessor().process({ ...managerContext, source: { ...managerContext.source, itemId: 72, authorEmail: 'm2@example.invalid' } }, state(submitted));
    expect(denied.receipt.validationCode).toBe('AUTHORITY_DENIED');
  });

  it('accepts exact active delegation and rejects expired or deactivated variants', () => {
    const managerCommand = context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'd1@example.invalid'
    }, { commandType: 'RequestWorkplanChanges', payload: { reason: 'Delegated review.' } });
    const active = new Sec006AutomationProcessor().process(managerCommand, state(subject({ state: 'Submitted' })));
    expect(active.receipt.effectiveRole).toBe('DelegatedManager');
    const expiredState = state(subject({ state: 'Submitted' }));
    expiredState.delegations[0] = { ...expiredState.delegations[0], endUtc: '2026-10-31T23:59:59Z' };
    expect(new Sec006AutomationProcessor().process(managerCommand, expiredState).receipt.validationCode).toBe('AUTHORITY_DENIED');
    const inactiveState = state(subject({ state: 'Submitted' }));
    inactiveState.delegations[0] = { ...inactiveState.delegations[0], active: false };
    expect(new Sec006AutomationProcessor().process(managerCommand, inactiveState).receipt.validationCode).toBe('AUTHORITY_DENIED');
  });

  it('re-resolves manager assignment at processing time', () => {
    const reassigned = state(subject({ state: 'Submitted' }));
    reassigned.people[0] = { ...reassigned.people[0], managerPersonKey: 'M2' };
    const oldManager = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'm1@example.invalid'
    }, { commandType: 'RequestWorkplanChanges', payload: { reason: 'Old manager.' } }), reassigned);
    expect(oldManager.receipt.validationCode).toBe('AUTHORITY_DENIED');
    const newManager = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', itemId: 72, authorEmail: 'm2@example.invalid'
    }, { commandKey: 'CMD-002', commandType: 'RequestWorkplanChanges', payload: { reason: 'Current manager.' } }), reassigned);
    expect(newManager.receipt.effectiveRole).toBe('Manager');
  });

  it('allows CONTROL amendment only to System Admin and appends immutable history', () => {
    const locked = state(subject({ state: 'Locked', locked: true, workplanVersion: 1 }));
    const amendment = context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'sa1@example.invalid'
    }, { commandType: 'CreateWorkplanAmendmentV2', payload: { reason: 'Controlled correction.', controlReference: 'CONTROL-027B-001' } });
    const result = new Sec006AutomationProcessor().process(amendment, locked);
    expect(result.receipt.outcome).toBe('Accepted');
    expect(locked.approvedHistory).toHaveLength(1);
    expect(locked.approvedHistory[0]).toEqual(expect.objectContaining({ locked: true, workplanVersion: 1 }));
    expect(locked.subjects.get('WP|E1|2027')).toEqual(expect.objectContaining({ locked: false, state: 'ChangesRequested', workplanVersion: 2 }));
  });

  it('denies amendment to Manager and requires the exact CONTROL reference', () => {
    const manager = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'm1@example.invalid'
    }, { commandType: 'CreateWorkplanAmendmentV2', payload: { reason: 'Attempt.', controlReference: 'CONTROL-027B-001' } }), state(subject({ state: 'Locked', locked: true })));
    expect(manager.receipt.validationCode).toBe('AMENDMENT_SYSTEM_ADMIN_REQUIRED');
    const noReference = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'sa1@example.invalid'
    }, { commandType: 'CreateWorkplanAmendmentV2', payload: { reason: 'Attempt.', controlReference: 'none' } }), state(subject({ state: 'Locked', locked: true })));
    expect(noReference.receipt.validationCode).toBe('AMENDMENT_CONTROL_REFERENCE_REQUIRED');
  });

  it('denies System Admin business approval and locked-history rewrite', () => {
    const systemApproval = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'sa1@example.invalid'
    }, { commandType: 'ApproveAndLockWorkplan', payload: {} }), state(subject({ state: 'Submitted' })));
    expect(systemApproval.receipt.validationCode).toBe('SYSTEM_ADMIN_NO_BUSINESS_DECISION');
    const lockedWrite = new Sec006AutomationProcessor().process(context({}, {
      payload: { coreCategoryWeight: 60, personalCategoryWeight: 30, behaviourCategoryWeight: 10 }
    }), state(subject({ state: 'Locked', locked: true })));
    expect(lockedWrite.receipt.validationCode).toBe('APPROVED_HISTORY_IMMUTABLE');
  });

  it('places a partial failure into RecoveryHold and cannot claim success', () => {
    const current = state();
    const processor = new Sec006AutomationProcessor(() => {
      throw new Sec006PartialFailureError('Audit append failed after canonical write.', { partialMarker: true });
    });
    const result = processor.process(context(), current);
    expect(result.receipt.outcome).toBe('RecoveryHold');
    expect(result.receipt.validationCode).toBe('PARTIAL_FAILURE_RECOVERY_HOLD');
    expect(result.mutationApplied).toBe(false);
    expect(current.subjects.get('WP|E1|2027')?.transitionStatus).toBe('RecoveryHold');
    const blocked = new Sec006AutomationProcessor().process(context({ itemId: 72 }, {
      commandKey: 'CMD-002', expectedETag: '"1"', expectedRowVersionToken: 1
    }), current);
    expect(blocked.receipt.validationCode).toBe('RECOVERY_HOLD_ACTIVE');
    expect(blocked.mutationApplied).toBe(false);
  });

  it('keeps Synthetic User Employee-only and never permits his identity as Automation', () => {
    const peterSubject = subject({ subjectKey: 'WP|Synthetic User|2027', personKey: 'Synthetic User' });
    const peterState = state(peterSubject);
    const asEmployee = new Sec006AutomationProcessor().process(context({ authorEmail: 'person003@example.invalid' }, {
      subjectKey: peterSubject.subjectKey, claimedPersonKey: 'Synthetic User'
    }), peterState);
    expect(asEmployee.receipt.effectiveRole).toBe('Employee');
    const asAutomation = new Sec006AutomationProcessor().process({
      ...context({}, { subjectKey: peterSubject.subjectKey, claimedPersonKey: 'Synthetic User' }),
      automationIdentity: 'person003@example.invalid'
    }, state(peterSubject));
    expect(asAutomation.receipt.validationCode).toBe('AUTOMATION_IDENTITY_FORBIDDEN');
  });

  it('uses a deterministic SHA-256 for payload evidence', () => {
    expect(sec006Sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const first = new Sec006AutomationProcessor().process(context(), state()).receipt.processedPayloadSha256;
    const second = new Sec006AutomationProcessor().process(context({}, {
      payload: { behaviourCategoryWeight: 10, personalCategoryWeight: 20, coreCategoryWeight: 70 }
    }), state()).receipt.processedPayloadSha256;
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts retained legacy commands through the same controlled source', () => {
    const result = new Sec006AutomationProcessor().process(context({}, {
      commandType: 'UpdateWorkplanDraft',
      payload: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 }
    }), state());
    expect(result.receipt.outcome).toBe('Accepted');
  });

  it('rejects a command placed on the wrong trusted source list', () => {
    const result = new Sec006AutomationProcessor().process(context({}, {
      commandType: 'ApproveAndLockWorkplan', payload: {}
    }), state(subject({ state: 'Submitted' })));
    expect(result.receipt.validationCode).toBe('COMMAND_SOURCE_MISMATCH');
  });

  it('executes Draft-save-submit-changes-resubmit-approve with exact canonical readback', () => {
    const current = state();
    const processor = new Sec006AutomationProcessor();
    const run = (
      itemId: number,
      authorEmail: string,
      listTitle: ISec006TrustedSource['listTitle'],
      commandType: ISec006CommandEnvelope['commandType'],
      payload: Readonly<Record<string, unknown>>
    ): void => {
      const canonical = current.subjects.get('WP|E1|2027') as ISec006CanonicalSubject;
      const result = processor.process(context({
        listId: listTitle === 'KCFKPI_EmployeeCommands' ? employeeListId : managerListId,
        listTitle, itemId, authorEmail
      }, {
        commandKey: `CMD-${itemId}`, commandType, expectedETag: canonical.etag,
        expectedRowVersionToken: canonical.rowVersionToken, payload,
        clientCorrelationKey: `CORR-${itemId}`
      }), current);
      expect(result.receipt.outcome).toBe('Accepted');
    };
    run(71, 'e1@example.invalid', 'KCFKPI_EmployeeCommands', 'UpdateWorkplanDraftV2', {
      coreCategoryWeight: 60, personalCategoryWeight: 25, behaviourCategoryWeight: 15
    });
    expect(current.subjects.get('WP|E1|2027')).toEqual(expect.objectContaining({ state: 'Draft', rowVersionToken: 2 }));
    run(72, 'e1@example.invalid', 'KCFKPI_EmployeeCommands', 'SubmitWorkplan', {});
    expect(current.subjects.get('WP|E1|2027')?.state).toBe('Submitted');
    run(73, 'm1@example.invalid', 'KCFKPI_ManagerCommands', 'RequestWorkplanChanges', { reason: 'Clarify Personal target.' });
    expect(current.subjects.get('WP|E1|2027')?.state).toBe('ChangesRequested');
    run(74, 'e1@example.invalid', 'KCFKPI_EmployeeCommands', 'UpdateWorkplanDraftV2', {
      coreCategoryWeight: 65, personalCategoryWeight: 20, behaviourCategoryWeight: 15
    });
    run(75, 'e1@example.invalid', 'KCFKPI_EmployeeCommands', 'SubmitWorkplan', { amendmentReason: 'Manager change addressed.' });
    run(76, 'm1@example.invalid', 'KCFKPI_ManagerCommands', 'ApproveAndLockWorkplan', {});
    const approved = current.subjects.get('WP|E1|2027');
    expect(approved).toEqual(expect.objectContaining({ state: 'Locked', locked: true, rowVersionToken: 7 }));
    expect(approved?.values).toEqual(expect.objectContaining({
      coreCategoryWeight: 65, personalCategoryWeight: 20, behaviourCategoryWeight: 15,
      amendmentReason: 'Manager change addressed.'
    }));
    expect(current.receipts).toHaveLength(6);
    expect(current.audit).toHaveLength(6);
  });

  it('persists and reads back an exact quarterly update before submit and manager lock', () => {
    const quarterItem = subject({
      subjectKey: 'QRI|E1|2027|Q1|SO1-001', subjectType: 'QuarterReviewItem',
      values: {}, state: 'Draft'
    });
    const current = state(quarterItem);
    const processor = new Sec006AutomationProcessor();
    const update = processor.process(context({}, {
      subjectKey: quarterItem.subjectKey, subjectType: 'QuarterReviewItem',
      commandType: 'UpdateQuarterItemV2',
      payload: { employeeActualValue: 17, employeeUpdate: 'Delivered 17 sessions.', contextMitigation: 'Two dates moved.' }
    }), current);
    expect(update.receipt.outcome).toBe('Accepted');
    expect(current.subjects.get(quarterItem.subjectKey)?.values).toEqual(expect.objectContaining({
      employeeActualValue: 17, employeeUpdate: 'Delivered 17 sessions.', contextMitigation: 'Two dates moved.'
    }));

    const review = subject({ subjectKey: 'QR|E1|2027|Q1', subjectType: 'QuarterReview', values: {}, state: 'Draft' });
    current.subjects.set(review.subjectKey, review);
    const submitted = processor.process(context({ itemId: 72 }, {
      commandKey: 'CMD-072', subjectKey: review.subjectKey, subjectType: 'QuarterReview',
      commandType: 'SubmitQuarterReview', payload: { comment: 'Q1 ready.' }
    }), current);
    expect(submitted.receipt.outcome).toBe('Accepted');
    const afterSubmit = current.subjects.get(review.subjectKey) as ISec006CanonicalSubject;
    expect(afterSubmit.state).toBe('Submitted');
    const locked = processor.process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', itemId: 73, authorEmail: 'm1@example.invalid'
    }, {
      commandKey: 'CMD-073', subjectKey: review.subjectKey, subjectType: 'QuarterReview',
      commandType: 'ApproveAndLockQuarter', expectedETag: afterSubmit.etag,
      expectedRowVersionToken: afterSubmit.rowVersionToken, payload: {}
    }), current);
    expect(locked.receipt.outcome).toBe('Accepted');
    expect(current.subjects.get(review.subjectKey)).toEqual(expect.objectContaining({ state: 'Locked', locked: true }));
    expect(current.subjects.get(quarterItem.subjectKey)?.values.employeeActualValue).toBe(17);
  });

  it('enforces Shared, Weighted and Completion contribution governance', () => {
    const contributionSubject = subject({
      subjectKey: 'WPI|E1|2027|SO1-001', subjectType: 'WorkplanItem', values: {}
    });
    const basePayload = {
      kpiId: 'SO1-001', role: 'Contributor', displayOrder: 1, activeInWorkplan: true,
      quarterTargets: [{ quarter: 'Q1' }, { quarter: 'Q2' }, { quarter: 'Q3' }, { quarter: 'Q4' }]
    };
    const run = (payload: Readonly<Record<string, unknown>>): string => new Sec006AutomationProcessor()
      .process(context({}, {
        subjectKey: contributionSubject.subjectKey, subjectType: 'WorkplanItem',
        commandType: 'UpsertCoreContributionV2', payload
      }), state(contributionSubject)).receipt.validationCode;
    expect(run({ ...basePayload, contributionMethod: 'SharedTarget', sharedTargetRule: 'ApprovedApportionment', sharedApportionmentPercent: 0 }))
      .toBe('SHARED_APPORTIONMENT_GOVERNANCE_REQUIRED');
    expect(run({ ...basePayload, contributionMethod: 'WeightedDenominator', denominatorValue: 0 }))
      .toBe('WEIGHTED_DENOMINATOR_GOVERNANCE_REQUIRED');
    expect(run({ ...basePayload, contributionMethod: 'CompletionOversight' }))
      .toBe('COMPLETION_SUCCESS_DEFINITIONS_REQUIRED');
  });

  it('does not infer additive eligibility from Accountable Owner role alone', () => {
    const contributionSubject = subject({
      subjectKey: 'WPI|E1|2027|SO1-001', subjectType: 'WorkplanItem', values: {}
    });
    const current = state(contributionSubject);
    const result = new Sec006AutomationProcessor().process(context({}, {
      subjectKey: contributionSubject.subjectKey, subjectType: 'WorkplanItem',
      commandType: 'UpsertCoreContributionV2', payload: {
        kpiId: 'SO1-001', role: 'AccountableOwner', contributionMethod: 'AccountableOwner',
        quarterTargets: [{ quarter: 'Q1' }, { quarter: 'Q2' }, { quarter: 'Q3' }, { quarter: 'Q4' }],
        displayOrder: 1, activeInWorkplan: true
      }
    }), current);
    expect(result.receipt.outcome).toBe('Accepted');
    expect(current.subjects.get(contributionSubject.subjectKey)?.values.directContributionEligible).toBe(false);
    expect(current.subjects.get(contributionSubject.subjectKey)?.values.additiveApproved).toBe(false);
  });

  it('KCF-KPI-036 accepts bounded selected Behaviour keys with concurrent custom wording', () => {
    const behaviourSubject = subject({
      subjectKey: 'WPI|E1|2027|BHV-01', subjectType: 'WorkplanItem', values: {}
    });
    const current = state(behaviourSubject);
    const result = new Sec006AutomationProcessor().process(context({ itemId: 72 }, {
      commandKey: 'CMD-036-BEHAVIOUR',
      commandType: 'UpsertBehaviourCommitmentV2',
      subjectType: 'WorkplanItem',
      subjectKey: behaviourSubject.subjectKey,
      payload: {
        behaviourId: 'BHV-01', objectiveSource: 'Library', sourceObjectiveKey: 'BHV-01-OBJ-01',
        selectedSuggestionKeys: ['BHV-01-OBJ-01', 'BHV-01-OBJ-02'],
        customObjective: 'Help another team deliver an agreed TEST outcome',
        objectiveTitle: 'Work as one team', objectiveDescription: 'Use controlled and custom commitments.',
        measure: 'Quarterly examples', unit: 'rating', evidenceDefinition: 'Examples and feedback',
        q1TargetText: 'Q1 commitment', q2TargetText: 'Q2 commitment',
        q3TargetText: 'Q3 commitment', q4TargetText: 'Q4 commitment',
        q1TargetRating: 3, q2TargetRating: 3, q3TargetRating: 4, q4TargetRating: 4,
        behaviourItemWeight: 100, displayOrder: 2, activeInWorkplan: true
      }
    }), current);

    expect(result.receipt.outcome).toBe('Accepted');
    expect(current.subjects.get(behaviourSubject.subjectKey)?.values).toEqual(expect.objectContaining({
      selectedSuggestionKeys: ['BHV-01-OBJ-01', 'BHV-01-OBJ-02'],
      customObjective: 'Help another team deliver an agreed TEST outcome'
    }));
  });
});
