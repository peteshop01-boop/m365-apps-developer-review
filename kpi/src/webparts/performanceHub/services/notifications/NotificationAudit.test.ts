import { createNotificationAuditEvidence } from './NotificationAudit';
import type {
  INotificationAuditEvidence,
  INotificationOutboxRecord,
  INotificationOutcomeInput
} from './NotificationModels';
import { beginNotificationAttempt, completeNotificationAttempt } from './NotificationOutbox';
import { planNotificationOutbox } from './NotificationPolicy';
import { encodeNotificationIdentity } from './NotificationBoundary';

const openCycleRecord = (): Readonly<INotificationOutboxRecord> => {
  const result = planNotificationOutbox({
    now: '2026-11-01T09:00:00.000Z',
    config: {
      eventKey: 'NOT-012:2026:Q1', kind: 'QuarterlyCycleOpen',
      configKey: 'Notification.QuarterlyCycleOpen', configVersion: 'cfg-v1',
      performanceYear: '2026/27', performanceYearNumber: 2026, periodKey: 'Q1',
      periodLabel: 'Q1 November-January', scheduledAt: '2026-11-01T09:00:00.000Z',
      opensAt: '2026-11-01T09:00:00.000Z', deadlineAt: '2027-02-07T17:00:00.000Z', channel: 'Teams',
      actionLink: 'https://kpi.example.invalid/sites/kcf/performance/q1',
      safeLinkPolicy: { allowedOrigins: ['https://kpi.example.invalid'], allowedPathPrefixes: ['/sites/kcf/performance'] }
    },
    people: [{ id: 1, personKey: 'EMP-001', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
      appRoles: ['Employee'], active: true }],
    intendedRecipient: { personKey: 'EMP-001', email: 'employee@example.invalid' },
    workflow: { workflowKey: 'WORKFLOW:EMP-001:2026:Q1', employeePersonKey: 'EMP-001', performanceYearNumber: 2026,
      periodKey: 'Q1', state: 'Draft', sourceVersion: 3 },
    expectedWorkflowState: 'Draft', expectedWorkflowVersion: 3
  }, []);
  if (!result.outbox) throw new Error('Expected issued notification audit fixture.');
  return result.outbox;
};

describe('redacted notification audit evidence', () => {
  it('records complete event, recipient-reference, channel, timing, outcome and safe provenance', () => {
    const started = beginNotificationAttempt(openCycleRecord(), '2026-11-01T09:00:03.000Z');
    const outcome: INotificationOutcomeInput = {
      outcome: 'Delivered', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'DELIVERED'
    };
    const completed = completeNotificationAttempt(started.outbox, started.attempt, outcome);
    const audit = createNotificationAuditEvidence(completed, started.attempt, outcome);
    const replay = createNotificationAuditEvidence(completed, started.attempt, outcome);

    expect(audit).toEqual({
      auditKey: encodeNotificationIdentity('audit', [
        started.attempt.attemptKey, outcome.outcome, outcome.outcomeAt, outcome.outcomeCode
      ]),
      eventKey: 'NOT-012:2026:Q1',
      outboxKey: completed.outboxKey,
      recipientReference: 'EMP-001',
      channel: 'Teams',
      scheduledAt: '2026-11-01T09:00:00.000Z',
      attemptedAt: '2026-11-01T09:00:03.000Z',
      outcomeAt: '2026-11-01T09:00:05.000Z',
      attemptNumber: 1,
      outcome: 'Delivered',
      outcomeCode: 'DELIVERED',
      finalOutboxState: 'Delivered',
      linkIncluded: true,
      provenance: completed.provenance
    });
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.provenance)).toBe(true);
    expect(replay).toBe(audit);
    expect(replay.auditKey).toBe(audit.auditKey);
  });

  it('separates governed outcome and delimiter-like code tuples while keeping exact replay identity', () => {
    const auditFor = (outcome: INotificationOutcomeInput): Readonly<INotificationAuditEvidence> => {
      const started = beginNotificationAttempt(openCycleRecord(), '2026-11-01T09:00:03.000Z');
      const completed = completeNotificationAttempt(started.outbox, started.attempt, outcome);
      const audit = createNotificationAuditEvidence(completed, started.attempt, outcome);
      expect(audit.auditKey).toBe(encodeNotificationIdentity('audit', [
        started.attempt.attemptKey, outcome.outcome, outcome.outcomeAt, outcome.outcomeCode
      ]));
      expect(createNotificationAuditEvidence(completed, started.attempt, outcome)).toBe(audit);
      return audit;
    };
    const cases: INotificationOutcomeInput[] = [
      { outcome: 'Delivered', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'CODE::AAA' },
      { outcome: 'TransientFailure', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'CODE::AAA' },
      { outcome: 'Delivered', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'CODE:AAA' },
      { outcome: 'Delivered', outcomeAt: '2026-11-01T09:00:06.000Z', outcomeCode: 'CODE::AAA' }
    ];
    const audits = cases.map(auditFor);
    expect(new Set(audits.map(audit => audit.auditKey)).size).toBe(cases.length);
  });

  it('does not expose employee email/name, message content or the direct-link value', () => {
    const started = beginNotificationAttempt(openCycleRecord(), '2026-11-01T09:00:03.000Z');
    const outcome: INotificationOutcomeInput = {
      outcome: 'TransientFailure', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'TEAMS_TEMPORARY'
    };
    const completed = completeNotificationAttempt(started.outbox, started.attempt, outcome);
    const serialised = JSON.stringify(createNotificationAuditEvidence(completed, started.attempt, outcome));
    expect(serialised).not.toContain('employee@example.invalid');
    expect(serialised).not.toContain('Synthetic Employee');
    expect(serialised).not.toContain('https://kpi.example.invalid');
    expect(serialised).not.toContain('Q1 November-January');
    expect(serialised).toContain('"linkIncluded":true');
    expect(serialised).toContain('"outcome":"TransientFailure"');
  });

  it('rejects stale, replayed or conflicting completion evidence', () => {
    const started = beginNotificationAttempt(openCycleRecord(), '2026-11-01T09:00:03.000Z');
    const outcome: INotificationOutcomeInput = {
      outcome: 'PermanentFailure', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'RECIPIENT_REJECTED'
    };
    const completed = completeNotificationAttempt(started.outbox, started.attempt, outcome);
    expect(() => createNotificationAuditEvidence(completed, {
      ...started.attempt, attemptNumber: 2
    }, outcome)).toThrow(/issued notification attempt/);
    expect(() => createNotificationAuditEvidence(completed, started.attempt, {
      ...outcome, outcomeCode: 'OTHER'
    })).toThrow(/exact completed/);
    expect(() => createNotificationAuditEvidence({ ...completed, state: 'Delivered' },
      started.attempt, outcome)).toThrow(/issued notification outbox/);
  });

  it('rejects a legacy or mixed-version audit object without replacing the exact audit cache', () => {
    const started = beginNotificationAttempt(openCycleRecord(), '2026-11-01T09:00:03.000Z');
    const outcome: INotificationOutcomeInput = {
      outcome: 'Delivered', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'DELIVERED'
    };
    const completed = completeNotificationAttempt(started.outbox, started.attempt, outcome);
    const legacyAudit = {
      ...completed,
      auditKey: `${started.attempt.attemptKey}::Delivered`
    };
    expect(() => createNotificationAuditEvidence(
      legacyAudit as unknown as INotificationOutboxRecord, started.attempt, outcome
    )).toThrow(/issued notification outbox/);
    const exact = createNotificationAuditEvidence(completed, started.attempt, outcome);
    expect(createNotificationAuditEvidence(completed, started.attempt, outcome)).toBe(exact);
  });

  it('rejects forged redaction, provenance, attempt and outcome evidence', () => {
    const started = beginNotificationAttempt(openCycleRecord(), '2026-11-01T09:00:03.000Z');
    const otherStarted = beginNotificationAttempt(openCycleRecord(), '2026-11-01T09:00:03.000Z');
    const outcome: INotificationOutcomeInput = {
      outcome: 'Delivered', outcomeAt: '2026-11-01T09:00:05.000Z', outcomeCode: 'DELIVERED'
    };
    const completed = completeNotificationAttempt(started.outbox, started.attempt, outcome);
    const otherCompleted = completeNotificationAttempt(otherStarted.outbox, otherStarted.attempt, outcome);
    expect(() => createNotificationAuditEvidence({
      ...completed,
      recipientReference: 'employee@example.invalid',
      provenance: { ...completed.provenance, workflowState: 'Complete', workflowVersion: 999 }
    }, started.attempt, outcome)).toThrow(/issued notification outbox/);
    expect(() => createNotificationAuditEvidence(completed, {
      ...started.attempt, attemptKey: 'FORGED-AUDIT-KEY'
    }, outcome)).toThrow(/issued notification attempt/);
    expect(() => createNotificationAuditEvidence(completed, started.attempt, {
      ...outcome, outcome: 'ForgedOutcome' as never
    })).toThrow(/governed exhaustive set/);
    expect(() => createNotificationAuditEvidence(completed, otherStarted.attempt, outcome))
      .toThrow(/exact completed|exact completed outbox/);
    expect(() => createNotificationAuditEvidence(otherCompleted, started.attempt, outcome))
      .toThrow(/exact completed|exact completed outbox/);

    const valid = createNotificationAuditEvidence(completed, started.attempt, outcome);
    expect(valid.outcome).toBe('Delivered');
    expect(valid.auditKey.startsWith('KCFN2:5:audit:4:')).toBe(true);
    expect(valid.auditKey).not.toBe(`${started.attempt.attemptKey}::Delivered`);
    expect(createNotificationAuditEvidence(completed, started.attempt, outcome)).toBe(valid);
  });
});
