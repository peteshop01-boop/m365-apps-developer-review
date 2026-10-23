import type { INotificationEvaluationInput, INotificationTemplateContract,
  IDisabledNotificationDeliveryAdapterConfig, NotificationEventKind } from './NotificationModels';
import { GovernedNotificationSourceController } from './GovernedNotificationSourceController';
import type { INotificationLifecycleSourceInput } from './NotificationLifecycleSourceModels';
import type { INotificationQuarterSourceInput } from './NotificationQuarterSourcePolicy';
import type { INotificationManagerDigestInput } from './NotificationManagerDigest';
import { buildQuarterLifecycleDates } from '../GovernanceValidation';

/** Ordinary synthetic inputs preserve donor Config dates and recipients; no native authority. */
const evaluation = (kind: NotificationEventKind = 'EmployeeFinalReminder7Day'): INotificationEvaluationInput => {
  const now = '2026-10-02T09:00:00.000Z';
  const periodKey = kind === 'QuarterlyCycleOpen' ? 'Q1' : 'Annual';
  const days = kind === 'EmployeeReadiness30Day' ? 30 : kind === 'EmployeePreparation14Day' ? 14 : 7;
  const open = kind === 'AnnualCycleOpen' || kind === 'QuarterlyCycleOpen';
  const link = open || kind === 'EmployeeFinalReminder7Day';
  return {
    now, config: { eventKey: `NOT-EVENT:${kind}:2026`, kind, configKey: `Notification.${kind}`, configVersion: 'cfg-v7',
      performanceYear: '2026/27', performanceYearNumber: 2026, periodKey, periodLabel: periodKey === 'Q1' ? 'Q1 2026/27' : '2026/27',
      scheduledAt: now, deadlineAt: new Date(Date.parse(now) + days * 86400000).toISOString(), channel: 'Email',
      ...(open ? { opensAt: now } : {}),
      ...(link ? { actionLink: 'https://kpi.example.invalid/sites/kcf/performance/annual',
        safeLinkPolicy: { allowedOrigins: ['https://kpi.example.invalid'], allowedPathPrefixes: ['/sites/kcf/performance'] } } : {}) },
    people: [{ id: 1, personKey: 'EMP-007', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
      appRoles: ['Employee'], active: true }],
    intendedRecipient: { personKey: 'EMP-007', email: 'employee@example.invalid' },
    workflow: { workflowKey: `WORKFLOW:EMP-007:2026:${periodKey}`, employeePersonKey: 'EMP-007',
      performanceYearNumber: 2026, periodKey, state: 'Draft', sourceVersion: 4 },
    expectedWorkflowState: 'Draft', expectedWorkflowVersion: 4
  };
};
const template: INotificationTemplateContract = { schema: 'KCF.NotificationTemplate', schemaVersion: '1.0.0',
  templateKey: 'Template.EmployeeFinalReminder7Day', templateVersion: 'template-v3', kind: 'EmployeeFinalReminder7Day',
  titleText: 'Final reminder', instructionText: 'Complete your annual workplan before the governed deadline.',
  fieldOrder: ['performanceYear','periodLabel','deadlineAt','actionLink'], configKey: 'Notification.EmployeeFinalReminder7Day', configVersion: 'cfg-v7' };
const adapter: IDisabledNotificationDeliveryAdapterConfig = { adapterKey: 'Adapter.NotificationDelivery.Disabled',
  adapterVersion: 'adapter-v1', provider: 'SyntheticDisabled', enabled: false, bindingState: 'Unbound' };
const attemptedAt = '2026-10-02T09:00:01.000Z';
const request = { outcomeIdempotencyKey: 'OUTCOME:FINAL-REMINDER:1', outcomeAt: '2026-10-02T09:00:02.000Z' };

test('unbound MainApp-facing source remains HOLD with native delivery disabled', async () => {
  const controller = new GovernedNotificationSourceController();
  expect(controller.nativeDeliveryEnabled()).toBe(false);
  expect(await controller.evaluate()).toEqual({ status: 'HOLD', missingInputs: ['NotificationSourceUnavailable',
    'NativeNotificationDeliveryUnbound','NotificationAuditAppendPortUnavailable'] });
});
test.each(['EmployeeReadiness30Day','EmployeePreparation14Day','EmployeeFinalReminder7Day','AnnualCycleOpen','QuarterlyCycleOpen'] as const)(
  'ordinary existing %s source event preserves configured fields and suppresses local duplicate', async kind => {
    const input = evaluation(kind), before = JSON.stringify(input);
    const controller = new GovernedNotificationSourceController({ read: async () => input });
    const first = await controller.evaluate();
    expect(first.status).toBe('HOLD'); expect(first.sourcePlan!.status).toBe('Queued');
    expect(first.sourcePlan!.outbox).toMatchObject({ eventKey: input.config.eventKey, kind, recipientReference: 'EMP-007',
      scheduledAt: input.config.scheduledAt, digest: { kind, deadlineAt: input.config.deadlineAt,
        performanceYear: '2026/27', periodKey: input.config.periodKey }, provenance: { configKey: input.config.configKey, configVersion: 'cfg-v7' } });
    expect((await controller.evaluate()).sourcePlan).toMatchObject({ status: 'Suppressed', reason: 'DuplicateOutboxKey' });
    expect(JSON.stringify(input)).toBe(before); expect(controller.nativeDeliveryEnabled()).toBe(false);
  });
test('ordinary disabled adapter composition preserves template and redacted audit evidence without workflow mutation', async () => {
  const input = evaluation(), before = JSON.stringify(input.workflow);
  const controller = new GovernedNotificationSourceController({ read: async () => input });
  const plan = await controller.evaluate();
  const result = controller.previewDisabledFinalReminder(plan.sourcePlan!.outbox!, template, adapter, attemptedAt, request);
  expect(result.status).toBe('HOLD');
  expect(result.disabledResult).toMatchObject({ status: 'FailedTransient',
    failure: { outcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND', retryEligible: true },
    renderedTemplate: { templateKey: template.templateKey, templateVersion: 'template-v3', fields: { deadlineAt: input.config.deadlineAt },
      provenance: { configKey: template.configKey, configVersion: 'cfg-v7' } } });
  expect(result.auditEvidence).toMatchObject({ eventKey: input.config.eventKey, recipientReference: 'EMP-007',
    outcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND', channel: 'Email', scheduledAt: input.now, outcomeAt: request.outcomeAt });
  const audit = JSON.stringify(result.auditEvidence);
  expect(audit).not.toContain('employee@example.invalid'); expect(audit).not.toContain('https://');
  expect(audit).not.toContain(template.instructionText); expect(JSON.stringify(input.workflow)).toBe(before);
});
test('unavailable disabled adapter holds before consuming the original source attempt', async () => {
  const controller = new GovernedNotificationSourceController({ read: async () => evaluation() });
  const plan = await controller.evaluate(), outbox = plan.sourcePlan!.outbox!;
  expect(controller.previewDisabledFinalReminder(outbox, template, undefined, attemptedAt, request).missingInputs)
    .toContain('DisabledTemplateOrAdapterUnavailable');
  expect(controller.previewDisabledFinalReminder(outbox, template, adapter, attemptedAt, request).disabledResult!.status)
    .toBe('FailedTransient');
});

test('composes the existing lifecycle source projector without granting native delivery', () => {
  const supplied: INotificationLifecycleSourceInput = { previewState: { processedTransitionIdentities: [] } };
  const before = JSON.stringify(supplied);
  const controller = new GovernedNotificationSourceController();
  expect(controller.previewLifecycleSource(supplied)).toEqual(expect.objectContaining({
    status: 'HOLD', reason: 'CompletionEvidenceUnavailable', nativeDeliveryEnabled: false, notifications: []
  }));
  expect(JSON.stringify(supplied)).toBe(before);
  expect(controller.nativeDeliveryEnabled()).toBe(false);
});

test('composes the existing quarter source projector and preserves missing-schedule HOLD', () => {
  const supplied: INotificationQuarterSourceInput = {};
  const before = JSON.stringify(supplied);
  const controller = new GovernedNotificationSourceController();
  expect(controller.previewQuarterSource(supplied)).toEqual({
    status: 'HOLD', reason: 'ScheduleUnavailable', nativeDeliveryEnabled: false, notifications: []
  });
  expect(JSON.stringify(supplied)).toBe(before);
  expect(controller.nativeDeliveryEnabled()).toBe(false);
});

test('composes the existing manager digest projector and preserves missing-schedule HOLD', () => {
  const supplied: INotificationManagerDigestInput = { sources: [] };
  const before = JSON.stringify(supplied);
  const controller = new GovernedNotificationSourceController();
  expect(controller.previewManagerDigest(supplied)).toEqual({
    status: 'HOLD', reason: 'ScheduleUnavailable', nativeDeliveryEnabled: false, digests: []
  });
  expect(JSON.stringify(supplied)).toBe(before);
  expect(controller.nativeDeliveryEnabled()).toBe(false);
});

/** Synthetic current observations exercise useful composition, not native scheduling. */
const quarterPreview = (): INotificationQuarterSourceInput => {
  const timing = { earlyReviewReminderDays: 30, preparationReminderDays: 14, finalReminderDays: 7,
    employeeSubmissionDays: 7, managerReviewDays: 7 };
  return {
    now: '2026-08-14T09:00:00.000Z',
    schedule: { configKey: 'ManagerDailyPreview', configVersion: 'schedule-v3', governanceReference: 'SYNTHETIC-PREVIEW',
      dayKey: '2026-08-14', scheduledAt: '2026-08-14T09:00:00.000Z', localTime: '09:00:00', timeZone: 'UTC',
      eventKinds: ['ManagerOutstandingReview', 'ManagerReviewDue'] },
    configuration: { configKey: 'QuarterTiming', configVersion: 'timing-v1', timing,
      dates: buildQuarterLifecycleDates('2026-07-31', timing), performance: {
        performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
        quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' }, weights: { core: 70, personal: 20, behaviours: 10 },
        rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: [], retentionStatus: 'TBC' } },
    workflow: { workflowKey: 'REVIEW:E1:2026:Q3', employeePersonKey: 'E1', performanceYearNumber: 2026,
      periodKey: 'Q3', state: 'Submitted', sourceVersion: 6 },
    people: [
      { id: 1, personKey: 'E1', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
        managerPersonKey: 'M1', managerEmail: 'manager@example.invalid', active: true, appRoles: ['Employee'] },
      { id: 2, personKey: 'M1', displayName: 'Synthetic Manager', email: 'manager@example.invalid', active: true, appRoles: ['Manager'] }
    ],
    actionLink: 'https://kpi.example.invalid/hub/quarter',
    safeLinkPolicy: { allowedOrigins: ['https://kpi.example.invalid'], allowedPathPrefixes: ['/hub'] }
  };
};

test('quarter and digest previews preserve configured facts, caller ownership and outer native HOLD', async () => {
  const supplied = quarterPreview(), before = JSON.stringify(supplied);
  const controller = new GovernedNotificationSourceController();
  const quarter = controller.previewQuarterSource(supplied);
  expect(quarter).toMatchObject({ status: 'PREVIEW', nativeDeliveryEnabled: false, notifications: [{
    recipientRole: 'Manager', recipient: { personKey: 'M1' }, reasons: ['ManagerOutstandingReview', 'ManagerReviewDue'],
    facts: { sourceVersion: 6, quarter: 'Q3', schedule: { configVersion: 'schedule-v3' } }
  }] });
  const { now, schedule, ...source } = supplied;
  const digestInput: INotificationManagerDigestInput = { now, schedule, sources: [source, source] };
  const digestBefore = JSON.stringify(digestInput);
  const digest = controller.previewManagerDigest(digestInput);
  expect(digest).toMatchObject({ status: 'PREVIEW', nativeDeliveryEnabled: false, digests: [{
    recipient: { personKey: 'M1' }, employeeCount: 1, outstandingReviewCount: 1, dayKey: '2026-08-14'
  }] });
  expect(controller.previewManagerDigest(digestInput)).toEqual(digest);
  expect(JSON.stringify(digestInput)).toBe(digestBefore);
  expect(JSON.stringify(supplied)).toBe(before);
  expect((await controller.evaluate()).status).toBe('HOLD');
  expect(controller.nativeDeliveryEnabled()).toBe(false);
});

test('lifecycle irrelevant saves suppress without advancing caller-owned preview state', () => {
  const supplied: INotificationLifecycleSourceInput = {
    change: { kind: 'DraftSave' }, previewState: { processedTransitionIdentities: ['existing-preview'] }
  };
  const before = JSON.stringify(supplied);
  expect(new GovernedNotificationSourceController().previewLifecycleSource(supplied)).toMatchObject({
    status: 'SUPPRESSED', reason: 'IrrelevantEdit', nativeDeliveryEnabled: false, notifications: [],
    nextPreviewState: { processedTransitionIdentities: ['existing-preview'] }
  });
  expect(JSON.stringify(supplied)).toBe(before);
});
