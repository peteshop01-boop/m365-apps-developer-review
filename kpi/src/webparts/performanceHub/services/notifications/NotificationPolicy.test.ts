import type { IProductionPerson } from '../../models/ProductionModels';
import type {
  INotificationEvaluationInput,
  INotificationEventConfig,
  INotificationOutboxRecord,
  INotificationResendAuthorisation,
  INotificationWorkflowSnapshot,
  NotificationEventKind,
  NotificationPeriodKey,
  NotificationWorkflowState
} from './NotificationModels';
import {
  authoriseNotificationResend,
  isCanonicalUtcTimestamp,
  isSafeNotificationActionLink,
  planNotificationOutbox,
  validateNotificationEventConfig
} from './NotificationPolicy';
import { encodeNotificationIdentity } from './NotificationBoundary';

const SCHEDULED = '2026-10-02T09:00:00.000Z';
const SAFE_ORIGIN = 'https://kpi.example.invalid';

const person = (overrides: Partial<IProductionPerson> = {}): IProductionPerson => ({
  id: 1,
  personKey: 'EMP-001',
  displayName: 'Synthetic Employee',
  email: 'employee@example.invalid',
  appRoles: ['Employee'],
  active: true,
  ...overrides
});

const config = (
  kind: NotificationEventKind = 'EmployeeReadiness30Day',
  overrides: Partial<INotificationEventConfig> = {}
): INotificationEventConfig => {
  const isOpen = kind === 'AnnualCycleOpen' || kind === 'QuarterlyCycleOpen';
  const isFinalReminder = kind === 'EmployeeFinalReminder7Day';
  const periodKey: NotificationPeriodKey = kind === 'QuarterlyCycleOpen' ? 'Q1' : 'Annual';
  const scheduledAt = isOpen ? '2026-11-01T09:00:00.000Z' : SCHEDULED;
  const deadlineAt = kind === 'EmployeeReadiness30Day'
    ? '2026-11-01T09:00:00.000Z'
    : kind === 'EmployeePreparation14Day'
      ? '2026-10-16T09:00:00.000Z'
      : kind === 'EmployeeFinalReminder7Day'
        ? '2026-10-09T09:00:00.000Z'
      : kind === 'QuarterlyCycleOpen'
        ? '2027-02-07T17:00:00.000Z'
        : '2026-11-14T17:00:00.000Z';
  return {
    eventKey: `NOT-EVENT:${kind}:2026`,
    kind,
    configKey: `Notification.${kind}`,
    configVersion: 'cfg-v1',
    performanceYear: '2026/27',
    performanceYearNumber: 2026,
    periodKey,
    periodLabel: periodKey === 'Annual' ? '2026/27' : 'Q1 November-January',
    scheduledAt,
    opensAt: isOpen ? scheduledAt : undefined,
    deadlineAt,
    channel: 'Email',
    actionLink: isOpen || isFinalReminder
      ? `${SAFE_ORIGIN}/sites/kcf/performance/${periodKey.toLowerCase()}` : undefined,
    safeLinkPolicy: isOpen || isFinalReminder ? {
      allowedOrigins: [SAFE_ORIGIN],
      allowedPathPrefixes: ['/sites/kcf/performance']
    } : undefined,
    ...overrides
  };
};

const workflow = (
  periodKey: NotificationPeriodKey = 'Annual',
  state: NotificationWorkflowState = 'Draft',
  overrides: Partial<INotificationWorkflowSnapshot> = {}
): INotificationWorkflowSnapshot => ({
  workflowKey: `WORKFLOW:EMP-001:2026:${periodKey}`,
  employeePersonKey: 'EMP-001',
  performanceYearNumber: 2026,
  periodKey,
  state,
  sourceVersion: 3,
  ...overrides
});

const input = (
  eventConfig: INotificationEventConfig = config(),
  overrides: Partial<INotificationEvaluationInput> = {}
): INotificationEvaluationInput => {
  const sourceWorkflow = workflow(eventConfig.periodKey);
  return {
    now: eventConfig.scheduledAt,
    config: eventConfig,
    people: [person()],
    intendedRecipient: { personKey: 'EMP-001', email: 'employee@example.invalid' },
    workflow: sourceWorkflow,
    expectedWorkflowState: sourceWorkflow.state,
    expectedWorkflowVersion: sourceWorkflow.sourceVersion,
    ...overrides
  };
};

const queued = (source: INotificationEvaluationInput): Readonly<INotificationOutboxRecord> => {
  const result = planNotificationOutbox(source, []);
  expect(result).toEqual(expect.objectContaining({ status: 'Queued', reason: 'Eligible' }));
  if (!result.outbox) throw new Error('Expected a queued notification outbox record.');
  return result.outbox;
};

const identityInput = (
  eventKey: string,
  personKey: string,
  workflowKey: string
): INotificationEvaluationInput => input(config('EmployeeReadiness30Day', { eventKey }), {
  people: [person({ personKey })],
  intendedRecipient: { personKey, email: 'employee@example.invalid' },
  workflow: workflow('Annual', 'Draft', { workflowKey, employeePersonKey: personKey })
});

describe('deterministic notification planning policy', () => {
  it.each([
    ['NOT-001', 'EmployeeReadiness30Day' as NotificationEventKind, 30],
    ['NOT-002', 'EmployeePreparation14Day' as NotificationEventKind, 14]
  ])('queues %s at its exact Config-driven %i-day employee boundary', (_requirement, kind, days) => {
    const eventConfig = config(kind);
    const record = queued(input(eventConfig));
    expect(Date.parse(record.digest.deadlineAt) - Date.parse(record.scheduledAt)).toBe(days * 24 * 60 * 60 * 1000);
    expect(record).toEqual(expect.objectContaining({
      eventKey: eventConfig.eventKey,
      recipientReference: 'EMP-001',
      state: 'Queued',
      attemptCount: 0,
      version: 1
    }));
    expect(record.digest).toEqual({
      kind,
      performanceYear: '2026/27',
      periodKey: 'Annual',
      periodLabel: '2026/27',
      deadlineAt: eventConfig.deadlineAt,
      actionLink: undefined
    });
  });

  it('queues NOT-003 only at the exact Config-driven 7-day boundary with its safe action link', () => {
    const eventConfig = config('EmployeeFinalReminder7Day');
    const record = queued(input(eventConfig));
    expect(Date.parse(record.digest.deadlineAt) - Date.parse(record.scheduledAt)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(record).toMatchObject({
      kind: 'EmployeeFinalReminder7Day', recipientReference: 'EMP-001', state: 'Queued', attemptCount: 0
    });
    expect(record.digest).toEqual({
      kind: 'EmployeeFinalReminder7Day',
      performanceYear: '2026/27',
      periodKey: 'Annual',
      periodLabel: '2026/27',
      deadlineAt: '2026-10-09T09:00:00.000Z',
      actionLink: 'https://kpi.example.invalid/sites/kcf/performance/annual'
    });
    expect(record.provenance).toMatchObject({
      configKey: 'Notification.EmployeeFinalReminder7Day', configVersion: 'cfg-v1'
    });
  });

  it('suppresses early/late/duplicate final-reminder evaluation and permits one governed resend', () => {
    const eventConfig = config('EmployeeFinalReminder7Day');
    const source = input(eventConfig);
    expect(planNotificationOutbox({ ...source, now: '2026-10-02T08:59:59.999Z' }, [])).toEqual({
      status: 'Suppressed', reason: 'NotScheduledBoundary'
    });
    expect(planNotificationOutbox({ ...source, now: '2026-10-02T09:00:00.001Z' }, [])).toEqual({
      status: 'Suppressed', reason: 'NotScheduledBoundary'
    });
    const original = queued(source);
    expect(planNotificationOutbox(source, [original])).toEqual({
      status: 'Suppressed', reason: 'DuplicateOutboxKey'
    });
    const authority = authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'FINAL-REMINDER-RESEND-01', governanceReference: 'DECISION:NOT-003-01'
    });
    const resend = planNotificationOutbox({ ...source, resend: authority }, [original]);
    expect(resend).toEqual(expect.objectContaining({ status: 'Queued', reason: 'Eligible' }));
    expect(resend.outbox?.outboxKey).not.toBe(original.outboxKey);
    expect(planNotificationOutbox({ ...source, resend: authority }, [original])).toEqual({
      status: 'Rejected', reason: 'InvalidResendDistinction'
    });
  });

  it('rejects wrong final-reminder boundary and unsafe or missing action links', () => {
    const cases = [
      config('EmployeeFinalReminder7Day', { deadlineAt: '2026-10-10T09:00:00.000Z' }),
      config('EmployeeFinalReminder7Day', { actionLink: undefined }),
      config('EmployeeFinalReminder7Day', { actionLink: 'http://kpi.example.invalid/sites/kcf/performance/annual' }),
      config('EmployeeFinalReminder7Day', { actionLink: 'https://evil.example.invalid/sites/kcf/performance/annual' })
    ];
    cases.forEach(eventConfig => expect(planNotificationOutbox(input(eventConfig), [])).toEqual(expect.objectContaining({
      status: 'Rejected'
    })));
  });

  it.each([
    ['annual', 'AnnualCycleOpen' as NotificationEventKind, 'Annual', '2026/27'],
    ['quarterly', 'QuarterlyCycleOpen' as NotificationEventKind, 'Q1', 'Q1 November-January']
  ])('queues the NOT-012 %s open-cycle digest with governed period, deadline and safe direct link',
    (_label, kind, periodKey, periodLabel) => {
      const eventConfig = config(kind);
      const record = queued(input(eventConfig));
      expect(record.digest).toEqual({
        kind,
        performanceYear: '2026/27',
        periodKey,
        periodLabel,
        deadlineAt: eventConfig.deadlineAt,
        actionLink: eventConfig.actionLink
      });
      expect(Object.keys(record.digest).sort()).toEqual([
        'actionLink', 'deadlineAt', 'kind', 'performanceYear', 'periodKey', 'periodLabel'
      ]);
    });

  it.each([
    ['early', '2026-10-02T08:59:59.000Z'],
    ['late', '2026-10-02T09:00:00.001Z']
  ])('suppresses an otherwise eligible reminder when evaluated %s', (_label, now) => {
    expect(planNotificationOutbox(input(config(), { now }), [])).toEqual({
      status: 'Suppressed', reason: 'NotScheduledBoundary'
    });
  });

  it.each(['NotStarted', 'Draft', 'ChangesRequested'] as NotificationWorkflowState[])(
    'queues the supported actionable workflow state %s', state => {
      const sourceWorkflow = workflow('Annual', state);
      expect(planNotificationOutbox(input(config(), {
        workflow: sourceWorkflow,
        expectedWorkflowState: state
      }), []).status).toBe('Queued');
    }
  );

  it.each(['Submitted', 'Approved', 'Locked', 'Complete'] as NotificationWorkflowState[])(
    'suppresses the post-action workflow state %s', state => {
      const sourceWorkflow = workflow('Annual', state);
      expect(planNotificationOutbox(input(config(), {
        workflow: sourceWorkflow,
        expectedWorkflowState: state
      }), [])).toEqual({ status: 'Suppressed', reason: 'NotActionableState' });
    }
  );

  it.each([
    ['inactive', [person({ active: false })], 'InactiveRecipient'],
    ['ineligible role', [person({ appRoles: ['Manager'] })], 'IneligibleRecipientRole'],
    ['invalid duplicated role', [person({ appRoles: ['Employee', 'Employee'] })], 'IneligibleRecipientRole'],
    ['mismatched identity', [person()], 'RecipientIdentityMismatch']
  ])('rejects an %s recipient without creating outbox state', (_label, people, reason) => {
    const recipient = reason === 'RecipientIdentityMismatch'
      ? { personKey: 'EMP-999', email: 'employee@example.invalid' }
      : { personKey: 'EMP-001', email: 'employee@example.invalid' };
    expect(planNotificationOutbox(input(config(), { people, intendedRecipient: recipient }), [])).toEqual({
      status: 'Rejected', reason
    });
  });

  it('rejects duplicate or ambiguous People authority without selecting a record', () => {
    const people = [person(), person({ id: 2, personKey: 'EMP-002' })];
    expect(planNotificationOutbox(input(config(), { people }), [])).toEqual({
      status: 'Rejected', reason: 'AmbiguousPeopleIdentity'
    });
  });

  it('fails closed on malformed UTC, date boundaries and period configuration', () => {
    const badCases: INotificationEventConfig[] = [
      config('EmployeeReadiness30Day', { scheduledAt: '2026-10-02T09:00:00Z' }),
      config('EmployeeReadiness30Day', { deadlineAt: '2026-10-31T09:00:00.000Z' }),
      config('AnnualCycleOpen', { periodKey: 'Q1' }),
      config('AnnualCycleOpen', { actionLink: undefined }),
      config('QuarterlyCycleOpen', { periodLabel: 'Second quarter' })
    ];
    badCases.forEach(eventConfig => {
      expect(planNotificationOutbox(input(eventConfig), [])).toEqual({ status: 'Rejected', reason: 'MalformedConfig' });
      expect(validateNotificationEventConfig(eventConfig).length).toBeGreaterThan(0);
    });
    expect(isCanonicalUtcTimestamp('2026-10-02T09:00:00.000Z')).toBe(true);
    expect(isCanonicalUtcTimestamp('2026-10-02T10:00:00.000+01:00')).toBe(false);
  });

  it('rejects the wrong employee, period or year and stale workflow state/version', () => {
    expect(planNotificationOutbox(input(config(), {
      workflow: workflow('Annual', 'Draft', { employeePersonKey: 'EMP-002' })
    }), [])).toEqual({ status: 'Rejected', reason: 'WrongPeriodOrEmployee' });
    expect(planNotificationOutbox(input(config(), {
      workflow: workflow('Q1')
    }), [])).toEqual({ status: 'Rejected', reason: 'WrongPeriodOrEmployee' });
    expect(planNotificationOutbox(input(config(), {
      workflow: workflow('Annual', 'Draft', { performanceYearNumber: 2025 })
    }), [])).toEqual({ status: 'Rejected', reason: 'WrongPeriodOrEmployee' });
    expect(planNotificationOutbox(input(config(), { expectedWorkflowVersion: 2 }), [])).toEqual({
      status: 'Rejected', reason: 'StaleWorkflowState'
    });
    expect(planNotificationOutbox(input(config(), { expectedWorkflowState: 'NotStarted' }), [])).toEqual({
      status: 'Rejected', reason: 'StaleWorkflowState'
    });
    expect(planNotificationOutbox(input(config(), {
      workflow: workflow('Annual', 'Draft', { workflowKey: 'bad key' })
    }), [])).toEqual({ status: 'Rejected', reason: 'StaleWorkflowState' });
  });

  it.each([
    'http://kpi.example.invalid/sites/kcf/performance/q1',
    'https://evil.example.invalid/sites/kcf/performance/q1',
    'https://kpi.example.invalid.evil/sites/kcf/performance/q1',
    'https://kpi.example.invalid./sites/kcf/performance/q1',
    'https://employee@kpi.example.invalid/sites/kcf/performance/q1',
    'https://kpi.example.invalid/sites/kcf/performance/q1?person=EMP-001',
    'https://kpi.example.invalid/sites/kcf/performance/q1#token',
    'https://kpi.example.invalid/sites/kcf/performance-evil',
    'https://kpi.example.invalid/sites/kcf/performance/%2e%2e/admin',
    'https://kpi.example.invalid/sites/kcf/performance%2f..%2fadmin',
    'https://kpi.example.invalid/sites/kcf/performance/%252e%252e/admin',
    'https://kpi.example.invalid/sites/kcf/performance/%255c..%255cadmin',
    'https://kpi.example.invalid/sites/kcf/performance/%252f..%252fadmin',
    'https://kpi.example.invalid/sites/kcf/performance/%25252e%25252e/admin',
    'https://kpi.example.invalid/sites/kcf/performance/reports/../admin',
    'https://kpi.example.invalid/sites/kcf/performance/reports/%2e/admin',
    'https://kpi.example.invalid/sites/kcf/performance/reports/%5cadmin',
    'https://kpi.example.invalid/sites/kcf/performance/%zz',
    'https://kpi.example.invalid/sites/kcf/performance/tail%',
    'https://kpi.example.invalid/sites/kcf/performance/%2',
    'https://kpi.example.invalid/sites/kcf/performance/%G0',
    'https://kpi.example.invalid/sites/kcf/performance/%25zz',
    'https://kpi.example.invalid/sites/kcf/performance/%2525zz',
    'https://kpi.example.invalid/sites/kcf/performance/%c3%28',
    'https://kpi.example.invalid/sites/kcf/performance/annual//summary',
    'https://kpi.example.invalid/sites/kcf/performance/annual%3fnext',
    'https://kpi.example.invalid/sites/kcf/performance/annual%23next',
    'https://kpi.example.invalid/sites/kcf/performance/caf\u00e9',
    'https://kpi.example.invalid\\@evil.example.invalid/sites/kcf/performance/q1',
    `java${'script:alert(1)'}`,
    '//kpi.example.invalid/sites/kcf/performance/q1'
  ])('rejects unsafe NOT-012 direct link %s', actionLink => {
    const eventConfig = config('QuarterlyCycleOpen', { actionLink });
    expect(isSafeNotificationActionLink(actionLink, eventConfig.safeLinkPolicy)).toBe(false);
    expect(planNotificationOutbox(input(eventConfig), [])).toEqual({ status: 'Rejected', reason: 'UnsafeActionLink' });
  });

  it.each([
    '%ef%bc%8e%ef%bc%8e/admin',
    '%e2%80%a4%e2%80%a4/admin',
    '%ef%b9%92%ef%b9%92/admin',
    '%ef%bc%852e%ef%bc%852e/admin'
  ])('rejects R049 outside-prefix Unicode escape %s', suffix => {
    const actionLink = `https://kpi.example.invalid/sites/kcf/performance/${suffix}`;
    const eventConfig = config('QuarterlyCycleOpen', { actionLink });
    expect(isSafeNotificationActionLink(actionLink, eventConfig.safeLinkPolicy)).toBe(false);
    expect(planNotificationOutbox(input(eventConfig), [])).toEqual({ status: 'Rejected', reason: 'UnsafeActionLink' });
  });

  it.each([
    '%ef%bc%8f..%ef%bc%8fadmin',
    '%ef%bc%bc..%ef%bc%bcadmin',
    '%ef%b9%a8..%ef%b9%a8admin'
  ])('rejects R049 Unicode route ambiguity %s', suffix => {
    const actionLink = `https://kpi.example.invalid/sites/kcf/performance/${suffix}`;
    const eventConfig = config('QuarterlyCycleOpen', { actionLink });
    expect(isSafeNotificationActionLink(actionLink, eventConfig.safeLinkPolicy)).toBe(false);
    expect(planNotificationOutbox(input(eventConfig), [])).toEqual({ status: 'Rejected', reason: 'UnsafeActionLink' });
  });

  it('rejects an otherwise benign encoded space beyond the 16-layer ceiling', () => {
    let suffix = 'safe%20note';
    for (let layer = 0; layer < 17; layer++) suffix = suffix.replace(/%/g, '%25');
    const actionLink = `https://kpi.example.invalid/sites/kcf/performance/${suffix}`;
    const eventConfig = config('QuarterlyCycleOpen', { actionLink });
    expect(isSafeNotificationActionLink(actionLink, eventConfig.safeLinkPolicy)).toBe(false);
    expect(planNotificationOutbox(input(eventConfig), [])).toEqual({ status: 'Rejected', reason: 'UnsafeActionLink' });
  });

  it('retains a benign encoded space fully decoded on the 16th layer', () => {
    let suffix = 'safe%20note';
    for (let layer = 0; layer < 15; layer++) suffix = suffix.replace(/%/g, '%25');
    const actionLink = `https://kpi.example.invalid/sites/kcf/performance/${suffix}`;
    const eventConfig = config('QuarterlyCycleOpen', { actionLink });
    expect(isSafeNotificationActionLink(actionLink, eventConfig.safeLinkPolicy)).toBe(true);
    expect(queued(input(eventConfig)).digest.actionLink).toBe(actionLink);
  });

  it.each([
    'https://kpi.example.invalid/sites/kcf/performance/annual',
    'https://kpi.example.invalid/sites/kcf/performance/annual%20review',
    'https://kpi.example.invalid/sites/kcf/performance/report%2Ev2',
    'https://kpi.example.invalid/sites/kcf/performance/q%31',
    'https://kpi.example.invalid/sites/kcf/performance/safe%2520note',
    'https://kpi.example.invalid/sites/kcf/performance/100%25-complete',
    'https://kpi.example.invalid/sites/kcf/performance/100%25',
    'https://kpi.example.invalid/sites/kcf/performance/100%2525-done',
    'https://kpi.example.invalid/sites/kcf/performance/100%25%20complete'
  ])('retains ordinary and benign encoded NOT-012 direct link %s', actionLink => {
    const eventConfig = config('QuarterlyCycleOpen', { actionLink });
    expect(isSafeNotificationActionLink(actionLink, eventConfig.safeLinkPolicy)).toBe(true);
    expect(queued(input(eventConfig)).digest.actionLink).toBe(actionLink);
  });

  it('uses one stable event/recipient/workflow idempotency key for normal retries', () => {
    const source = input();
    const first = queued(source);
    const samePlan = queued(source);
    expect(samePlan).toEqual(first);
    expect(planNotificationOutbox(source, [{ ...first, state: 'Delivered', attemptCount: 1, version: 3 }])).toEqual({
      status: 'Suppressed', reason: 'DuplicateOutboxKey'
    });
    expect(first.outboxKey).toBe(encodeNotificationIdentity('outbox', [
      source.config.eventKey, 'EMP-001', source.workflow.workflowKey
    ]));
    expect(first.outboxKey).toBe(
      'KCFN2:6:outbox:3:37:NOT-EVENT:EmployeeReadiness30Day:2026:7:EMP-001:28:WORKFLOW:EMP-001:2026:Annual'
    );
  });

  it('length-frames adversarial event, recipient and workflow boundaries injectively', () => {
    const pairs: ReadonlyArray<readonly [readonly [string, string, string], readonly [string, string, string]]> = [
      [['AAA::BBB', 'CCC', 'DDD'], ['AAA', 'BBB', 'CCC::DDD']],
      [['AAA::BBB', 'CCC', 'DDD'], ['AAA', 'BBB::CCC', 'DDD']],
      [['AAA', 'BBB::CCC', 'DDD'], ['AAA', 'BBB', 'CCC::DDD']]
    ];
    pairs.forEach(([leftTuple, rightTuple]) => {
      const left = queued(identityInput(...leftTuple));
      const right = queued(identityInput(...rightTuple));
      expect(left.outboxKey).not.toBe(right.outboxKey);
      expect(left.recipientIdempotencyKey).toBe(left.outboxKey);
      expect(right.recipientIdempotencyKey).toBe(right.outboxKey);
      expect(queued(identityInput(...leftTuple)).outboxKey).toBe(left.outboxKey);
    });
  });

  it('separates resend distinction and governance boundaries without suppressing either authority', () => {
    const source = input();
    const original = queued(source);
    const decisions = [
      { decision: 'Approved' as const, distinctionKey: 'AAA:BBB', governanceReference: 'CCC' },
      { decision: 'Approved' as const, distinctionKey: 'AAA', governanceReference: 'BBB:CCC' },
      { decision: 'Approved' as const, distinctionKey: 'SAME', governanceReference: 'GOV:ONE' },
      { decision: 'Approved' as const, distinctionKey: 'SAME', governanceReference: 'GOV:TWO' }
    ];
    const authorities = decisions.map(decision => authoriseNotificationResend(original, decision));
    expect(new Set(authorities.map(authority => authority.authorityKey)).size).toBe(decisions.length);
    const resends = authorities.map(authority => {
      const result = planNotificationOutbox(input(config(), { resend: authority }), [original]);
      expect(result.status).toBe('Queued');
      if (!result.outbox) throw new Error('Expected independently governed resend.');
      return result.outbox;
    });
    expect(new Set(resends.map(record => record.outboxKey)).size).toBe(decisions.length);
    expect(resends.every(record => record.recipientIdempotencyKey === record.outboxKey)).toBe(true);
  });

  it('uses fixed domain separation and deterministic UTF-16 length framing', () => {
    const ordinary = encodeNotificationIdentity('outbox', ['AAA', 'BBB', 'CCC']);
    const resend = encodeNotificationIdentity('resend-outbox', ['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    const authority = encodeNotificationIdentity('resend-authority', [
      ordinary, 'AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'Approved'
    ]);
    const attempt = encodeNotificationIdentity('attempt', [ordinary, '1']);
    const audit = encodeNotificationIdentity('audit', [attempt, 'Delivered', SCHEDULED, 'DELIVERED']);
    expect(new Set([ordinary, resend, authority, attempt, audit]).size).toBe(5);
    expect(ordinary).toBe('KCFN2:6:outbox:3:3:AAA:3:BBB:3:CCC');

    const unicode = encodeNotificationIdentity('outbox', ['', '😀', 'A::B']);
    expect(unicode).toBe('KCFN2:6:outbox:3:0::2:😀:4:A::B');
    expect(encodeNotificationIdentity('outbox', ['', '😀', 'A::B'])).toBe(unicode);
    expect(unicode).not.toBe(encodeNotificationIdentity('outbox', ['😀', '', 'A::B']));
    expect(() => encodeNotificationIdentity('outbox', ['AAA', 'BBB'])).toThrow(/component tuple/);
    expect(() => encodeNotificationIdentity('outbox', ['AAA', 'BBB', 3 as never])).toThrow(/component tuple/);
  });

  it('rejects structurally disallowed empty or Unicode identity components before issuance', () => {
    const invalidPlans: ReadonlyArray<readonly [INotificationEvaluationInput, string]> = [
      [identityInput('', 'EMP-001', 'WORKFLOW:EMP-001:2026:Annual'), 'MalformedConfig'],
      [identityInput('😀', 'EMP-001', 'WORKFLOW:EMP-001:2026:Annual'), 'MalformedConfig'],
      [identityInput('EVENT-001', '', 'WORKFLOW:EMP-001:2026:Annual'), 'RecipientIdentityMismatch'],
      [identityInput('EVENT-001', '😀', 'WORKFLOW:EMP-001:2026:Annual'), 'RecipientIdentityMismatch'],
      [identityInput('EVENT-001', 'EMP-001', ''), 'StaleWorkflowState'],
      [identityInput('EVENT-001', 'EMP-001', '😀'), 'StaleWorkflowState']
    ];
    invalidPlans.forEach(([candidate, reason]) => expect(planNotificationOutbox(candidate, [])).toEqual({
      status: 'Rejected', reason
    }));

    const original = queued(input());
    expect(() => authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: '', governanceReference: 'GOV-001'
    })).toThrow(/approved resend decision/);
    expect(() => authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: '😀', governanceReference: 'GOV-001'
    })).toThrow(/approved resend decision/);
    expect(() => authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'DIST-001', governanceReference: ''
    })).toThrow(/approved resend decision/);
    expect(() => authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'DIST-001', governanceReference: '😀'
    })).toThrow(/approved resend decision/);
  });

  it('fails closed on legacy and mixed-version outbox or resend identities', () => {
    const source = input();
    const original = queued(source);
    const legacyOrdinary = {
      ...original,
      outboxKey: `${source.config.eventKey}::EMP-001::${source.workflow.workflowKey}`,
      recipientIdempotencyKey: `${source.config.eventKey}::EMP-001::${source.workflow.workflowKey}`
    };
    expect(planNotificationOutbox(source, [legacyOrdinary])).toEqual({ status: 'Rejected', reason: 'MalformedConfig' });

    const authority = authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'DIST-001', governanceReference: 'GOV-001'
    });
    expect(planNotificationOutbox(input(config(), {
      resend: { ...authority, authorityKey: `${original.outboxKey}::authority:DIST-001:GOV-001` }
    }), [original])).toEqual({ status: 'Rejected', reason: 'InvalidResendDistinction' });
    expect(planNotificationOutbox(input(config(), { resend: authority }), [original, {
      ...original,
      outboxKey: `${original.outboxKey}::resend:DIST-001`,
      recipientIdempotencyKey: `${original.outboxKey}::resend:DIST-001`,
      resendDistinction: { distinctionKey: 'DIST-001', governanceReference: 'GOV-001' }
    }])).toEqual({ status: 'Rejected', reason: 'MalformedConfig' });

    const successful = planNotificationOutbox(input(config(), { resend: authority }), [original]);
    expect(successful.status).toBe('Queued');
  });

  it('rejects conflicting state for a reused idempotency key', () => {
    const source = input();
    const first = queued(source);
    expect(planNotificationOutbox(source, [{ ...first, channel: 'Teams' }])).toEqual({
      status: 'Rejected', reason: 'ConflictingOutboxState'
    });
    expect(planNotificationOutbox(source, [first, first])).toEqual({
      status: 'Rejected', reason: 'ConflictingOutboxState'
    });
  });

  it('requires a governed distinction for intentional resend and gives it a distinct stable key', () => {
    const source = input();
    const original = queued(source);
    expect(planNotificationOutbox(input(config(), {
      resend: { distinctionKey: 'bad distinction', governanceReference: 'DECISION:NOT-RESEND-001' } as never
    }), [original])).toEqual({ status: 'Rejected', reason: 'InvalidResendDistinction' });

    const authority = authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'MANAGER-APPROVED-01', governanceReference: 'DECISION:NOT-RESEND-001'
    });
    expect(authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'MANAGER-APPROVED-01', governanceReference: 'DECISION:NOT-RESEND-001'
    })).toBe(authority);
    const resendInput = input(config(), {
      resend: authority
    });
    const resendResult = planNotificationOutbox(resendInput, [original]);
    expect(resendResult.status).toBe('Queued');
    if (!resendResult.outbox) throw new Error('Expected a governed resend outbox.');
    const resend = resendResult.outbox;
    expect(resend.outboxKey).toBe(encodeNotificationIdentity('resend-outbox', [
      source.config.eventKey,
      source.intendedRecipient.personKey,
      source.workflow.workflowKey,
      authority.distinctionKey,
      authority.governanceReference
    ]));
    expect(resend.resendDistinction).toEqual({
      distinctionKey: authority.distinctionKey, governanceReference: authority.governanceReference
    });
    expect(planNotificationOutbox(resendInput, [original])).toEqual({
      status: 'Rejected', reason: 'InvalidResendDistinction'
    });
    expect(authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'MANAGER-APPROVED-01', governanceReference: 'DECISION:NOT-RESEND-001'
    })).toBe(authority);
  });

  it('does not consume resend authority on malformed, unsafe, stale, cross-original or conflicting use', () => {
    const source = input();
    const original = queued(source);
    const otherExactOriginal = queued(source);
    const decision = {
      decision: 'Approved' as const,
      distinctionKey: 'MANAGER-APPROVED-02',
      governanceReference: 'DECISION:NOT-RESEND-002'
    };
    const authority = authoriseNotificationResend(original, decision);
    const resendInput = input(config(), { resend: authority });

    expect(planNotificationOutbox(input(config(), { resend: { ...authority } }), [original])).toEqual({
      status: 'Rejected', reason: 'InvalidResendDistinction'
    });
    expect(planNotificationOutbox(input(config(), {
      now: '2026-10-02T08:59:59.999Z', resend: authority
    }), [original])).toEqual({ status: 'Suppressed', reason: 'NotScheduledBoundary' });
    expect(planNotificationOutbox(input(config('EmployeeReadiness30Day', {
      actionLink: 'http://kpi.example.invalid/sites/kcf/performance/annual'
    }), { resend: authority }), [original])).toEqual({ status: 'Rejected', reason: 'UnsafeActionLink' });
    expect(planNotificationOutbox(input(config(), {
      expectedWorkflowVersion: 2, resend: authority
    }), [original])).toEqual({ status: 'Rejected', reason: 'StaleWorkflowState' });
    expect(planNotificationOutbox(resendInput, [otherExactOriginal])).toEqual({
      status: 'Rejected', reason: 'InvalidResendDistinction'
    });

    const resendKey = encodeNotificationIdentity('resend-outbox', [
      source.config.eventKey,
      source.intendedRecipient.personKey,
      source.workflow.workflowKey,
      authority.distinctionKey,
      authority.governanceReference
    ]);
    const conflict: INotificationOutboxRecord = {
      ...original,
      outboxKey: resendKey,
      recipientIdempotencyKey: resendKey,
      channel: 'Teams',
      resendDistinction: {
        distinctionKey: authority.distinctionKey,
        governanceReference: authority.governanceReference
      }
    };
    expect(planNotificationOutbox(resendInput, [original, conflict])).toEqual({
      status: 'Rejected', reason: 'ConflictingOutboxState'
    });

    expect(authoriseNotificationResend(original, decision)).toBe(authority);
    const successful = planNotificationOutbox(resendInput, [original]);
    expect(successful).toEqual(expect.objectContaining({ status: 'Queued', reason: 'Eligible' }));
    expect(planNotificationOutbox(resendInput, [original])).toEqual({
      status: 'Rejected', reason: 'InvalidResendDistinction'
    });
  });

  it('rejects copied, fabricated or nonexistent resend authority', () => {
    const original = queued(input());
    const authority = authoriseNotificationResend(original, {
      decision: 'Approved', distinctionKey: 'MANAGER-APPROVED-03', governanceReference: 'DECISION:NOT-RESEND-003'
    });
    const copied = { ...authority } as INotificationResendAuthorisation;
    expect(planNotificationOutbox(input(config(), { resend: copied }), [original])).toEqual({
      status: 'Rejected', reason: 'InvalidResendDistinction'
    });
    expect(planNotificationOutbox(input(config(), {
      resend: {
        ...authority,
        authorityKey: 'FORGED-AUTHORITY',
        governanceReference: 'DECISION:DOES-NOT-EXIST'
      }
    }), [original])).toEqual({ status: 'Rejected', reason: 'InvalidResendDistinction' });
    expect(() => authoriseNotificationResend(original, {
      decision: 'Denied' as never, distinctionKey: 'DENIED-01', governanceReference: 'DECISION:NOT-RESEND-002'
    })).toThrow(/approved resend decision/);
  });

  it('captures planning inputs once and rejects accessors, symbols and custom prototypes without protected output', () => {
    const source = input(config('QuarterlyCycleOpen'));
    let reads = 0;
    Object.defineProperty(source.config, 'actionLink', {
      enumerable: true,
      get: () => {
        reads += 1;
        return 'https://evil.example.invalid/steal';
      }
    });
    expect(planNotificationOutbox(source, [])).toEqual({ status: 'Rejected', reason: 'MalformedConfig' });
    expect(reads).toBe(0);

    const symbolSource = input();
    Object.defineProperty(symbolSource, Symbol('hidden'), { enumerable: true, value: 'SECRET' });
    expect(planNotificationOutbox(symbolSource, [])).toEqual({ status: 'Rejected', reason: 'MalformedConfig' });

    const shaped = Object.assign(Object.create({ inherited: true }), input());
    expect(planNotificationOutbox(shaped, [])).toEqual({ status: 'Rejected', reason: 'MalformedConfig' });
  });

  it('preserves all caller inputs and returns deeply frozen planned state', () => {
    const source = input(config('QuarterlyCycleOpen'));
    const sourceBefore = JSON.stringify(source);
    const existing: INotificationOutboxRecord[] = [];
    const record = queued(source);
    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(existing).toEqual([]);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.digest)).toBe(true);
    expect(Object.isFrozen(record.provenance)).toBe(true);
  });
});
