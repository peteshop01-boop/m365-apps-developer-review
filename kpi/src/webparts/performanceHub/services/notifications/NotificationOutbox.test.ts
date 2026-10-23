import type {
  INotificationAttempt,
  INotificationOutboxRecord,
  INotificationOutcomeInput,
  INotificationWorkflowSnapshot
} from './NotificationModels';
import {
  beginNotificationAttempt,
  canRetryNotification,
  completeNotificationAttempt
} from './NotificationOutbox';
import { planNotificationOutbox } from './NotificationPolicy';
import { encodeNotificationIdentity } from './NotificationBoundary';
import * as AuditSurface from './NotificationAudit';
import * as BoundarySurface from './NotificationBoundary';
import * as ModelSurface from './NotificationModels';
import * as OutboxSurface from './NotificationOutbox';
import * as PolicySurface from './NotificationPolicy';

const record = (
  eventKey = 'NOT-001:2026',
  personKey = 'EMP-001',
  workflowKey = 'WORKFLOW:EMP-001:2026:Annual'
): Readonly<INotificationOutboxRecord> => {
  const result = planNotificationOutbox({
    now: '2026-10-02T09:00:00.000Z',
    config: {
      eventKey, kind: 'EmployeeReadiness30Day',
      configKey: 'Notification.EmployeeReadiness30Day', configVersion: 'cfg-v1',
      performanceYear: '2026/27', performanceYearNumber: 2026, periodKey: 'Annual', periodLabel: '2026/27',
      scheduledAt: '2026-10-02T09:00:00.000Z', deadlineAt: '2026-11-01T09:00:00.000Z', channel: 'Email'
    },
    people: [{ id: 1, personKey, displayName: 'Synthetic Employee', email: 'employee@example.invalid',
      appRoles: ['Employee'], active: true }],
    intendedRecipient: { personKey, email: 'employee@example.invalid' },
    workflow: { workflowKey, employeePersonKey: personKey,
      performanceYearNumber: 2026, periodKey: 'Annual', state: 'Draft', sourceVersion: 3 },
    expectedWorkflowState: 'Draft', expectedWorkflowVersion: 3
  }, []);
  if (!result.outbox) throw new Error('Expected issued notification outbox fixture.');
  return result.outbox;
};

const transient: INotificationOutcomeInput = {
  outcome: 'TransientFailure',
  outcomeAt: '2026-10-02T09:01:00.000Z',
  outcomeCode: 'SMTP_TEMPORARY'
};

describe('immutable notification outbox transitions', () => {
  it('makes transient failure observable and retries the same outbox key as the next attempt', () => {
    const initial = record();
    const initialBefore = JSON.stringify(initial);
    const first = beginNotificationAttempt(initial, '2026-10-02T09:00:05.000Z');
    expect(first.attempt).toEqual({
      attemptKey: encodeNotificationIdentity('attempt', [initial.outboxKey, '1']),
      outboxKey: initial.outboxKey,
      attemptNumber: 1,
      attemptedAt: '2026-10-02T09:00:05.000Z',
      expectedOutboxVersion: 1
    });
    expect(first.outbox).toEqual(expect.objectContaining({ state: 'Attempting', attemptCount: 1, version: 2 }));
    expect(() => beginNotificationAttempt(initial, '2026-10-02T09:00:05.000Z')).toThrow(/already been consumed/);

    const failed = completeNotificationAttempt(first.outbox, first.attempt, transient);
    expect(failed).toEqual(expect.objectContaining({
      outboxKey: initial.outboxKey,
      state: 'FailedTransient',
      attemptCount: 1,
      lastOutcomeCode: 'SMTP_TEMPORARY',
      version: 3
    }));
    expect(canRetryNotification(failed)).toBe(true);

    const second = beginNotificationAttempt(failed, '2026-10-02T09:05:00.000Z');
    expect(canRetryNotification(failed)).toBe(false);
    expect(() => beginNotificationAttempt(failed, '2026-10-02T09:05:00.000Z')).toThrow(/already been consumed/);
    expect(second.attempt).toEqual(expect.objectContaining({
      outboxKey: initial.outboxKey,
      attemptNumber: 2,
      expectedOutboxVersion: 3
    }));
    const deliveredOutcome: INotificationOutcomeInput = {
      outcome: 'Delivered', outcomeAt: '2026-10-02T09:05:02.000Z', outcomeCode: 'DELIVERED'
    };
    const delivered = completeNotificationAttempt(second.outbox, second.attempt, deliveredOutcome);
    expect(() => completeNotificationAttempt(second.outbox, second.attempt, deliveredOutcome))
      .toThrow(/already been consumed/);
    expect(delivered).toEqual(expect.objectContaining({
      outboxKey: initial.outboxKey,
      state: 'Delivered',
      attemptCount: 2,
      version: 5
    }));
    expect(canRetryNotification(delivered)).toBe(false);
    expect(JSON.stringify(initial)).toBe(initialBefore);
    expect(Object.isFrozen(delivered)).toBe(true);
    expect(Object.isFrozen(delivered.digest)).toBe(true);
    expect(Object.isFrozen(delivered.provenance)).toBe(true);
  });

  it('derives distinct canonical attempt identities across retries and adversarial outboxes', () => {
    const firstOutbox = record('AAA::BBB', 'CCC', 'DDD');
    const collisionAdversary = record('AAA', 'BBB', 'CCC::DDD');
    const first = beginNotificationAttempt(firstOutbox, '2026-10-02T09:00:05.000Z');
    const other = beginNotificationAttempt(collisionAdversary, '2026-10-02T09:00:05.000Z');
    const failed = completeNotificationAttempt(first.outbox, first.attempt, transient);
    const second = beginNotificationAttempt(failed, '2026-10-02T09:02:00.000Z');

    expect(new Set([first.attempt.attemptKey, second.attempt.attemptKey, other.attempt.attemptKey]).size).toBe(3);
    expect(first.attempt.attemptKey).toBe(encodeNotificationIdentity('attempt', [firstOutbox.outboxKey, '1']));
    expect(second.attempt.attemptKey).toBe(encodeNotificationIdentity('attempt', [firstOutbox.outboxKey, '2']));
    expect(other.attempt.attemptKey).toBe(encodeNotificationIdentity('attempt', [collisionAdversary.outboxKey, '1']));
    expect(encodeNotificationIdentity('attempt', [firstOutbox.outboxKey, '1'])).toBe(first.attempt.attemptKey);
  });

  it('records permanent failure as terminal and never changes the workflow snapshot', () => {
    const workflow: INotificationWorkflowSnapshot = Object.freeze({
      workflowKey: 'WORKFLOW:EMP-001:2026:Annual',
      employeePersonKey: 'EMP-001',
      performanceYearNumber: 2026,
      periodKey: 'Annual',
      state: 'Draft',
      sourceVersion: 3
    });
    const before = JSON.stringify(workflow);
    const started = beginNotificationAttempt(record(), '2026-10-02T09:00:05.000Z');
    const failed = completeNotificationAttempt(started.outbox, started.attempt, {
      outcome: 'PermanentFailure', outcomeAt: '2026-10-02T09:01:00.000Z', outcomeCode: 'RECIPIENT_REJECTED'
    });
    expect(failed.state).toBe('FailedPermanent');
    expect(canRetryNotification(failed)).toBe(false);
    expect(() => beginNotificationAttempt(failed, '2026-10-02T09:02:00.000Z')).toThrow(/queued or transiently failed/);
    expect(JSON.stringify(workflow)).toBe(before);
    expect(workflow.state).toBe('Draft');
    expect(workflow.sourceVersion).toBe(3);
  });

  it('rejects attempts before schedule, non-UTC time and non-retryable states without mutation', () => {
    const initial = record();
    const before = JSON.stringify(initial);
    expect(() => beginNotificationAttempt(initial, '2026-10-02T08:59:59.999Z')).toThrow(/at or after/);
    expect(() => beginNotificationAttempt(initial, '2026-10-02T10:00:00.000+01:00')).toThrow(/canonical UTC/);
    expect(() => beginNotificationAttempt({ ...record(), state: 'Delivered' }, initial.scheduledAt)).toThrow(/issued notification outbox/);
    expect(beginNotificationAttempt(initial, '2026-10-02T09:00:05.000Z').attempt.attemptNumber).toBe(1);
    expect(JSON.stringify(initial)).toBe(before);
  });

  it('fails closed on replay, stale attempt, mismatched identity and conflicting outcome data', () => {
    const started = beginNotificationAttempt(record(), '2026-10-02T09:00:05.000Z');
    const otherStarted = beginNotificationAttempt(record(), '2026-10-02T09:00:05.000Z');
    const staleAttempt: INotificationAttempt = { ...started.attempt, expectedOutboxVersion: 0 };
    expect(() => completeNotificationAttempt(started.outbox, staleAttempt, transient)).toThrow(/issued notification attempt/);
    expect(() => completeNotificationAttempt(started.outbox, {
      ...started.attempt, outboxKey: 'NOT-OTHER'
    }, transient)).toThrow(/issued notification attempt/);
    expect(() => completeNotificationAttempt(started.outbox, started.attempt, {
      ...transient, outcomeAt: '2026-10-02T09:00:04.999Z'
    })).toThrow(/time or code is invalid/);
    expect(() => completeNotificationAttempt(started.outbox, started.attempt, {
      ...transient, outcomeCode: 'temporary failure'
    })).toThrow(/time or code is invalid/);
    expect(() => completeNotificationAttempt(started.outbox, otherStarted.attempt, transient))
      .toThrow(/exact current outbox transition/);
    expect(() => completeNotificationAttempt(otherStarted.outbox, started.attempt, transient))
      .toThrow(/exact current outbox transition/);

    const completed = completeNotificationAttempt(started.outbox, started.attempt, transient);
    expect(() => completeNotificationAttempt(started.outbox, started.attempt, transient))
      .toThrow(/already been consumed/);
    expect(() => completeNotificationAttempt(completed, started.attempt, transient)).toThrow(/exact current outbox transition/);
    expect(completeNotificationAttempt(otherStarted.outbox, otherStarted.attempt, transient).state).toBe('FailedTransient');
  });

  it('commits one inner descriptor-trap completion and makes the re-entered outer completion fail closed', () => {
    const started = beginNotificationAttempt(record(), '2026-10-02T09:00:05.000Z');
    const plainInnerOutcome: INotificationOutcomeInput = {
      outcome: 'TransientFailure',
      outcomeAt: '2026-10-02T09:01:00.000Z',
      outcomeCode: 'DESCRIPTOR_REENTRY_TRANSIENT'
    };
    let innerSuccessCount = 0;
    let descriptorCount = 0;
    let propertyGetCount = 0;
    let reentered = false;
    const successors: Readonly<INotificationOutboxRecord>[] = [];
    const outerOutcome = new Proxy<INotificationOutcomeInput>({
      outcome: 'Delivered',
      outcomeAt: '2026-10-02T09:01:01.000Z',
      outcomeCode: 'OUTER_DELIVERED'
    }, {
      getOwnPropertyDescriptor(target, property) {
        descriptorCount += 1;
        if (!reentered) {
          reentered = true;
          successors.push(completeNotificationAttempt(
            started.outbox, started.attempt, plainInnerOutcome
          ));
          innerSuccessCount += 1;
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
      get(target, property, receiver) {
        propertyGetCount += 1;
        return Reflect.get(target, property, receiver);
      }
    });

    let outerSuccessor: Readonly<INotificationOutboxRecord> | undefined;
    expect(() => {
      outerSuccessor = completeNotificationAttempt(started.outbox, started.attempt, outerOutcome);
    }).toThrow('Notification completion authority has already been consumed.');
    expect(outerSuccessor).toBeUndefined();
    expect(innerSuccessCount).toBe(1);
    expect(successors).toHaveLength(1);
    expect(descriptorCount).toBe(6);
    expect(propertyGetCount).toBe(0);
    expect(successors[0]).toEqual(expect.objectContaining({
      state: 'FailedTransient',
      lastOutcomeAt: plainInnerOutcome.outcomeAt,
      lastOutcomeCode: plainInnerOutcome.outcomeCode,
      attemptCount: 1
    }));
    expect(() => completeNotificationAttempt(started.outbox, started.attempt, plainInnerOutcome))
      .toThrow(/already been consumed/);

    const retry = beginNotificationAttempt(successors[0], '2026-10-02T09:02:00.000Z');
    expect(() => beginNotificationAttempt(successors[0], '2026-10-02T09:02:00.000Z'))
      .toThrow(/already been consumed/);
    expect(retry.attempt.attemptNumber).toBe(2);
    const deliveredOutcome: INotificationOutcomeInput = {
      outcome: 'Delivered', outcomeAt: '2026-10-02T09:02:01.000Z', outcomeCode: 'DELIVERED'
    };
    expect(completeNotificationAttempt(retry.outbox, retry.attempt, deliveredOutcome).state).toBe('Delivered');
    expect(() => completeNotificationAttempt(retry.outbox, retry.attempt, deliveredOutcome))
      .toThrow(/already been consumed/);

    const separate = beginNotificationAttempt(record(), '2026-10-02T09:00:05.000Z');
    expect(() => completeNotificationAttempt(separate.outbox, separate.attempt, {
      outcome: 'Unknown' as never, outcomeAt: '2026-10-02T09:01:00.000Z', outcomeCode: 'UNKNOWN'
    })).toThrow(/governed exhaustive set/);
    expect(completeNotificationAttempt(separate.outbox, separate.attempt, plainInnerOutcome).state)
      .toBe('FailedTransient');
  });

  it('rejects malformed outbox identity/version/attempt data before any transition', () => {
    expect(() => beginNotificationAttempt({ ...record(), recipientIdempotencyKey: 'OTHER' },
      '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);
    expect(() => beginNotificationAttempt({ ...record(), version: 0 },
      '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);
    expect(() => beginNotificationAttempt({ ...record(), attemptCount: -1 },
      '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);
  });

  it('rejects legacy and mixed-version outbox and attempt identities without consuming exact authority', () => {
    const initial = record();
    const legacyOutboxKey = 'NOT-001:2026::EMP-001::WORKFLOW:EMP-001:2026:Annual';
    expect(() => beginNotificationAttempt({
      ...initial, outboxKey: legacyOutboxKey, recipientIdempotencyKey: legacyOutboxKey
    }, '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);

    const started = beginNotificationAttempt(initial, '2026-10-02T09:00:05.000Z');
    expect(() => completeNotificationAttempt(started.outbox, {
      ...started.attempt,
      attemptKey: `${started.outbox.outboxKey}::attempt:1`
    }, transient)).toThrow(/issued notification attempt/);
    expect(() => completeNotificationAttempt(started.outbox, {
      ...started.attempt,
      outboxKey: legacyOutboxKey,
      attemptKey: encodeNotificationIdentity('attempt', [legacyOutboxKey, '1'])
    }, transient)).toThrow(/issued notification attempt/);
    expect(completeNotificationAttempt(started.outbox, started.attempt, transient).state).toBe('FailedTransient');
  });

  it('rejects forged queued state, unknown outcomes, forged attempt keys and exotic inputs', () => {
    const initial = record();
    expect(() => beginNotificationAttempt({ ...initial }, '2026-10-02T09:00:05.000Z'))
      .toThrow(/issued notification outbox/);
    expect(() => beginNotificationAttempt(Object.assign(Object.create(null), initial),
      '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);
    const forged = {
      ...initial,
      recipientReference: 'employee@example.invalid',
      digest: { ...initial.digest, actionLink: 'https://evil.example.invalid/steal' },
      provenance: { ...initial.provenance, workflowState: 'Complete' as const, workflowVersion: 999 }
    };
    expect(() => beginNotificationAttempt(forged, '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);

    const shaped = Object.create({ state: 'Queued' });
    Object.assign(shaped, initial);
    delete shaped.state;
    Object.defineProperty(shaped, Symbol('hidden'), { enumerable: true, value: 'SECRET' });
    expect(() => beginNotificationAttempt(shaped, '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);

    let reads = 0;
    const hostile = new Proxy(initial, {
      get(target, property) {
        reads += 1;
        return (target as unknown as { [key: string]: unknown })[String(property)];
      }
    });
    expect(() => beginNotificationAttempt(hostile, '2026-10-02T09:00:05.000Z')).toThrow(/issued notification outbox/);
    expect(reads).toBe(0);

    const started = beginNotificationAttempt(initial, '2026-10-02T09:00:05.000Z');
    expect(() => completeNotificationAttempt(started.outbox, started.attempt, {
      outcome: 'ForgedOutcome' as never, outcomeAt: '2026-10-02T09:00:06.000Z', outcomeCode: 'FORGED'
    })).toThrow(/governed exhaustive set/);
    expect(() => completeNotificationAttempt(started.outbox, {
      ...started.attempt, attemptKey: 'FORGED-AUDIT-KEY'
    }, { outcome: 'Delivered', outcomeAt: '2026-10-02T09:00:06.000Z', outcomeCode: 'DELIVERED' }))
      .toThrow(/issued notification attempt/);

    const separate = beginNotificationAttempt(record(), '2026-10-02T09:00:05.000Z');
    expect(() => completeNotificationAttempt(separate.outbox, separate.attempt, {
      outcome: 'Delivered', outcomeAt: '2026-10-02T09:00:06.000Z', outcomeCode: ''
    })).toThrow(/time or code is invalid/);
    expect(() => completeNotificationAttempt(separate.outbox, separate.attempt, {
      outcome: 'Delivered', outcomeAt: '2026-10-02T09:00:06.000Z', outcomeCode: '😀'
    })).toThrow(/time or code is invalid/);
    expect(completeNotificationAttempt(separate.outbox, separate.attempt, {
      outcome: 'Delivered', outcomeAt: '2026-10-02T09:00:06.000Z', outcomeCode: 'VALID_AFTER_INVALID'
    }).state).toBe('Delivered');
  });

  it('exposes no raw issuer through any production Notifications module', () => {
    const modules = [PolicySurface, BoundarySurface, OutboxSurface, AuditSurface, ModelSurface];
    const rawIssuers = [
      'issuePlannedNotificationOutbox',
      'issueNotificationAttemptTransition',
      'issueCompletedNotificationOutbox'
    ];
    modules.forEach(surface => rawIssuers.forEach(name => {
      expect((surface as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }));

    const fabricated = {
      ...record(),
      eventKey: 'FORGED-EVENT',
      recipientReference: 'EMP-999',
      outboxKey: 'FORGED-EVENT::EMP-999::WORKFLOW:EMP-999:2026:Q1',
      recipientIdempotencyKey: 'FORGED-EVENT::EMP-999::WORKFLOW:EMP-999:2026:Q1',
      provenance: {
        ...record().provenance,
        workflowKey: 'WORKFLOW:EMP-999:2026:Q1',
        workflowVersion: 999
      }
    };
    expect(() => beginNotificationAttempt(fabricated, '2026-10-02T09:00:05.000Z'))
      .toThrow(/issued notification outbox/);
  });
});
