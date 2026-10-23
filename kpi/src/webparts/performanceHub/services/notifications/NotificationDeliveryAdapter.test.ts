import type { IProductionPerson } from '../../models/ProductionModels';
import type {
  IDisabledNotificationDeliveryAdapterConfig,
  IDisabledNotificationDeliveryRequest,
  INotificationEvaluationInput,
  INotificationOutboxRecord,
  INotificationTemplateContract,
  INotificationWorkflowSnapshot
} from './NotificationModels';
import {
  canRetryNotification,
  completeNotificationAttempt,
  beginNotificationAttempt,
  planNotificationOutbox
} from './NotificationPolicy';
import {
  executeDisabledNotificationDelivery,
  prepareDisabledNotificationDelivery,
  renderFinalReminderTemplate
} from './NotificationDeliveryAdapter';

const person = (): IProductionPerson => ({
  id: 1,
  personKey: 'EMP-007',
  displayName: 'Synthetic Final Reminder Employee',
  email: 'final.reminder@example.invalid',
  appRoles: ['Employee'],
  active: true
});

const workflow = (): INotificationWorkflowSnapshot => ({
  workflowKey: 'WORKFLOW:EMP-007:2026:Annual',
  employeePersonKey: 'EMP-007',
  performanceYearNumber: 2026,
  periodKey: 'Annual',
  state: 'Draft',
  sourceVersion: 4
});

const evaluation = (): INotificationEvaluationInput => ({
  now: '2026-10-02T09:00:00.000Z',
  config: {
    eventKey: 'NOT-EVENT:EmployeeFinalReminder7Day:2026',
    kind: 'EmployeeFinalReminder7Day',
    configKey: 'Notification.EmployeeFinalReminder7Day',
    configVersion: 'cfg-v7',
    performanceYear: '2026/27',
    performanceYearNumber: 2026,
    periodKey: 'Annual',
    periodLabel: '2026/27',
    scheduledAt: '2026-10-02T09:00:00.000Z',
    deadlineAt: '2026-10-09T09:00:00.000Z',
    channel: 'Email',
    actionLink: 'https://kpi.example.invalid/sites/kcf/performance/annual',
    safeLinkPolicy: {
      allowedOrigins: ['https://kpi.example.invalid'],
      allowedPathPrefixes: ['/sites/kcf/performance']
    }
  },
  people: [person()],
  intendedRecipient: { personKey: 'EMP-007', email: 'final.reminder@example.invalid' },
  workflow: workflow(),
  expectedWorkflowState: 'Draft',
  expectedWorkflowVersion: 4
});

const template = (overrides: Partial<INotificationTemplateContract> = {}): INotificationTemplateContract => ({
  schema: 'KCF.NotificationTemplate',
  schemaVersion: '1.0.0',
  templateKey: 'Template.EmployeeFinalReminder7Day',
  templateVersion: 'template-v3',
  kind: 'EmployeeFinalReminder7Day',
  titleText: 'Final reminder',
  instructionText: 'Complete your annual workplan before the governed deadline.',
  fieldOrder: ['performanceYear', 'periodLabel', 'deadlineAt', 'actionLink'],
  configKey: 'Notification.EmployeeFinalReminder7Day',
  configVersion: 'cfg-v7',
  ...overrides
});

const adapter = (
  overrides: Partial<IDisabledNotificationDeliveryAdapterConfig> = {}
): IDisabledNotificationDeliveryAdapterConfig => ({
  adapterKey: 'Adapter.NotificationDelivery.Disabled',
  adapterVersion: 'adapter-v1',
  provider: 'SyntheticDisabled',
  enabled: false,
  bindingState: 'Unbound',
  ...overrides
});

const queued = (): Readonly<INotificationOutboxRecord> => {
  const planned = planNotificationOutbox(evaluation(), []);
  expect(planned.status).toBe('Queued');
  if (!planned.outbox) throw new Error('Expected final reminder outbox.');
  return planned.outbox;
};

const prepared = (attemptedAt = '2026-10-02T09:00:01.000Z'): Readonly<{
  transition: ReturnType<typeof beginNotificationAttempt>;
  capability: ReturnType<typeof prepareDisabledNotificationDelivery>;
}> => {
  const transition = beginNotificationAttempt(queued(), attemptedAt);
  const capability = prepareDisabledNotificationDelivery(
    transition.outbox, transition.attempt, template(), adapter()
  );
  return { transition, capability };
};

const request = (
  outcomeAt = '2026-10-02T09:00:02.000Z',
  overrides: Partial<IDisabledNotificationDeliveryRequest> = {}
): IDisabledNotificationDeliveryRequest => ({
  outcomeIdempotencyKey: 'OUTCOME-NOT-003-001',
  outcomeAt,
  ...overrides
});

describe('BT-06 disabled final-reminder delivery adapter', () => {
  it('renders a deterministic formula-neutral template with exact template and Config provenance', () => {
    const record = queued();
    const rendered = renderFinalReminderTemplate(record, template());
    expect(rendered).toEqual({
      templateKey: 'Template.EmployeeFinalReminder7Day',
      templateVersion: 'template-v3',
      kind: 'EmployeeFinalReminder7Day',
      titleText: 'Final reminder',
      instructionText: 'Complete your annual workplan before the governed deadline.',
      fields: {
        performanceYear: '2026/27',
        periodLabel: '2026/27',
        deadlineAt: '2026-10-09T09:00:00.000Z',
        actionLink: 'https://kpi.example.invalid/sites/kcf/performance/annual'
      },
      provenance: {
        templateSchemaVersion: '1.0.0',
        templateKey: 'Template.EmployeeFinalReminder7Day',
        templateVersion: 'template-v3',
        configKey: 'Notification.EmployeeFinalReminder7Day',
        configVersion: 'cfg-v7'
      }
    });
    expect(Object.isFrozen(rendered)).toBe(true);
    expect(Object.isFrozen(rendered.fields)).toBe(true);
    expect(renderFinalReminderTemplate(record, template())).toEqual(rendered);
  });

  it('captures deterministic redacted unbound failure and preserves workflow state for retry', () => {
    const source = evaluation();
    const workflowBefore = JSON.stringify(source.workflow);
    const planned = planNotificationOutbox(source, []);
    if (!planned.outbox) throw new Error('Expected final reminder outbox.');
    const transition = beginNotificationAttempt(planned.outbox, '2026-10-02T09:00:01.000Z');
    const capability = prepareDisabledNotificationDelivery(
      transition.outbox, transition.attempt, template(), adapter()
    );
    const result = executeDisabledNotificationDelivery(capability, request());

    expect(result).toMatchObject({
      status: 'FailedTransient',
      outcome: { outcome: 'TransientFailure', outcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND' },
      outbox: { state: 'FailedTransient', attemptCount: 1, lastOutcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND' },
      failure: {
        recipientReference: 'EMP-007', retryEligible: true, linkIncluded: true,
        outcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND',
        adapterProvenance: { provider: 'SyntheticDisabled', enabled: false, bindingState: 'Unbound' }
      }
    });
    expect(canRetryNotification(result.outbox)).toBe(true);
    expect(JSON.stringify(source.workflow)).toBe(workflowBefore);
    const failureJson = JSON.stringify(result.failure);
    expect(failureJson).not.toContain('final.reminder@example.invalid');
    expect(failureJson).not.toContain('Synthetic Final Reminder Employee');
    expect(failureJson).not.toContain('https://');
    expect(failureJson).not.toContain('Complete your annual workplan');
  });

  it('returns the same result for the exact outcome retry and rejects conflicting capability replay', () => {
    const { capability } = prepared();
    const firstRequest = request();
    const first = executeDisabledNotificationDelivery(capability, firstRequest);
    expect(executeDisabledNotificationDelivery(capability, { ...firstRequest })).toBe(first);
    expect(() => executeDisabledNotificationDelivery(capability, request(
      '2026-10-02T09:00:03.000Z', { outcomeIdempotencyKey: 'OUTCOME-NOT-003-CONFLICT' }
    ))).toThrow(/replayed with a conflicting outcome/);
  });

  it('supports a second deterministic transient attempt only from the exact retryable outbox', () => {
    const firstPrepared = prepared();
    const first = executeDisabledNotificationDelivery(firstPrepared.capability, request());
    const retryTransition = beginNotificationAttempt(first.outbox, '2026-10-02T09:01:00.000Z');
    const retryCapability = prepareDisabledNotificationDelivery(
      retryTransition.outbox, retryTransition.attempt, template(), adapter()
    );
    const retry = executeDisabledNotificationDelivery(retryCapability, request(
      '2026-10-02T09:01:01.000Z', { outcomeIdempotencyKey: 'OUTCOME-NOT-003-RETRY-002' }
    ));
    expect(retry.outbox).toMatchObject({ state: 'FailedTransient', attemptCount: 2, version: 5 });
    expect(retry.failure.attemptKey).not.toBe(first.failure.attemptKey);
    expect(canRetryNotification(retry.outbox)).toBe(true);
  });

  it('rejects copied, forged, stale and Proxy-wrapped capabilities without activating delivery', () => {
    const copiedPrepared = prepared();
    expect(() => executeDisabledNotificationDelivery({ ...copiedPrepared.capability }, request()))
      .toThrow(/privately issued/);
    const proxied = new Proxy(copiedPrepared.capability, {
      getOwnPropertyDescriptor: () => { throw new Error('Synthetic hostile capability proxy'); }
    });
    expect(() => executeDisabledNotificationDelivery(proxied, request())).toThrow(/privately issued/);

    const stalePrepared = prepared('2026-10-02T09:02:00.000Z');
    completeNotificationAttempt(stalePrepared.transition.outbox, stalePrepared.transition.attempt, {
      outcome: 'PermanentFailure',
      outcomeAt: '2026-10-02T09:02:01.000Z',
      outcomeCode: 'SYNTHETIC_FINAL_FAILURE'
    });
    expect(() => executeDisabledNotificationDelivery(stalePrepared.capability, request(
      '2026-10-02T09:02:02.000Z', { outcomeIdempotencyKey: 'OUTCOME-NOT-003-STALE' }
    ))).toThrow(/completion authority has already been consumed/);
  });

  it('rejects any binding-shaped input because this slice issues no runtime activation capability', () => {
    const { capability } = prepared();
    expect(() => executeDisabledNotificationDelivery(capability, request(
      '2026-10-02T09:00:02.000Z', {
        runtimeBindingCapability: { endpoint: 'https://provider.example.invalid', token: 'not-a-secret' }
      }
    ))).toThrow(/No runtime binding or activation capability/);
    expect(executeDisabledNotificationDelivery(capability, request()).status).toBe('FailedTransient');
  });

  it('blocks descriptor re-entry while allowing exactly one outer completion', () => {
    const { capability } = prepared();
    const exactRequest = request();
    let reentered = false;
    let innerError = '';
    const reentrant = new Proxy(exactRequest, {
      getOwnPropertyDescriptor: (target, property) => {
        if (!reentered) {
          reentered = true;
          try {
            executeDisabledNotificationDelivery(capability, exactRequest);
          } catch (error) {
            innerError = error instanceof Error ? error.message : String(error);
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });
    const outer = executeDisabledNotificationDelivery(capability, reentrant);
    expect(innerError).toMatch(/already executing and cannot re-enter/);
    expect(outer.status).toBe('FailedTransient');
    expect(outer.outbox.attemptCount).toBe(1);
    expect(executeDisabledNotificationDelivery(capability, exactRequest)).toBe(outer);
  });

  it('rejects malformed templates, provenance, adapter activation attempts and unsafe action links', () => {
    const record = queued();
    expect(() => renderFinalReminderTemplate(record, template({ titleText: '=dynamicFormula()' })))
      .toThrow(/formula-neutral/);
    expect(() => renderFinalReminderTemplate(record, template({ configVersion: 'cfg-v8' })))
      .toThrow(/configuration provenance/);
    const transition = beginNotificationAttempt(record, '2026-10-02T09:03:00.000Z');
    expect(() => prepareDisabledNotificationDelivery(
      transition.outbox, transition.attempt, template(), adapter({ enabled: true as false })
    )).toThrow(/disabled, synthetic and unbound/);

    const safeSource = evaluation();
    const unsafeSource: INotificationEvaluationInput = {
      ...safeSource,
      config: { ...safeSource.config, actionLink: 'https://evil.example.invalid/sites/kcf/performance/annual' }
    };
    expect(planNotificationOutbox(unsafeSource, [])).toEqual({ status: 'Rejected', reason: 'UnsafeActionLink' });
  });

  it('fails closed on accessor, custom-prototype and Proxy request/template inputs without consuming capability', () => {
    const first = prepared();
    let reads = 0;
    const accessorRequest = request() as unknown as Record<string, unknown>;
    Object.defineProperty(accessorRequest, 'outcomeAt', {
      enumerable: true,
      get: () => {
        reads += 1;
        return '2026-10-02T09:00:02.000Z';
      }
    });
    expect(() => executeDisabledNotificationDelivery(first.capability,
      accessorRequest as unknown as IDisabledNotificationDeliveryRequest)).toThrow(/stable enumerable plain own data/);
    expect(reads).toBe(0);
    expect(executeDisabledNotificationDelivery(first.capability, request()).status).toBe('FailedTransient');

    const second = beginNotificationAttempt(queued(), '2026-10-02T09:04:00.000Z');
    const customTemplate = Object.assign(Object.create({ inherited: true }), template());
    expect(() => prepareDisabledNotificationDelivery(
      second.outbox, second.attempt, customTemplate, adapter()
    )).toThrow(/stable enumerable plain own data/);
    const proxyTemplate = new Proxy(template(), {
      ownKeys: () => { throw new Error('Synthetic hostile template proxy'); }
    });
    expect(() => prepareDisabledNotificationDelivery(
      second.outbox, second.attempt, proxyTemplate, adapter()
    )).toThrow(/stable enumerable plain own data/);
  });
});
