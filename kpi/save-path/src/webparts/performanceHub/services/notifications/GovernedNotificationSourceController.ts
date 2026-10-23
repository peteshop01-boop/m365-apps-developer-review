import { NOTIFICATION_EVENT_KINDS, type INotificationEvaluationInput, type INotificationPlanResult,
  type INotificationOutboxRecord, type INotificationTemplateContract, type IDisabledNotificationDeliveryAdapterConfig,
  type IDisabledNotificationDeliveryRequest, type IDisabledNotificationDeliveryResult,
  type INotificationAuditEvidence } from './NotificationModels';
import { planNotificationOutbox, renderFinalReminderTemplate } from './NotificationPolicy';
import { beginNotificationAttempt } from './NotificationOutbox';
import { prepareDisabledNotificationDelivery, executeDisabledNotificationDelivery } from './NotificationDeliveryAdapter';
import { createNotificationAuditEvidence } from './NotificationAudit';
import { projectNotificationLifecycleSource } from './NotificationLifecycleSourcePolicy';
import type { INotificationLifecycleSourceInput, INotificationLifecycleSourceResult } from './NotificationLifecycleSourceModels';
import { projectNotificationQuarterSource,
  type INotificationQuarterSourceInput, type INotificationQuarterSourceResult } from './NotificationQuarterSourcePolicy';
import { projectNotificationManagerDigest,
  type INotificationManagerDigestInput, type INotificationManagerDigestResult } from './NotificationManagerDigest';

/** Source preview only. Supplied values confer no native event/date/recipient authority or admission. */
export interface INotificationSourcePreviewReader {
  read(): Promise<Readonly<INotificationEvaluationInput> | undefined>;
}
export interface INotificationSourceHold {
  status: 'HOLD';
  missingInputs: readonly string[];
  sourcePlan?: Readonly<INotificationPlanResult>;
  disabledResult?: Readonly<IDisabledNotificationDeliveryResult>;
  auditEvidence?: Readonly<INotificationAuditEvidence>;
  detail?: string;
}
const nativeMissing = Object.freeze(['NativeNotificationDeliveryUnbound', 'NotificationAuditAppendPortUnavailable']);

/** Composes existing donor APIs, retaining their privately issued objects and exact public rules.
 * Local preview state is neither durable outbox storage nor native protected admission.
 */
export class GovernedNotificationSourceController {
  private readonly localOutbox: Readonly<INotificationOutboxRecord>[] = [];
  private pending?: Promise<Readonly<INotificationSourceHold>>;
  public readonly supportedEventKinds = NOTIFICATION_EVENT_KINDS;
  public constructor(private readonly reader?: INotificationSourcePreviewReader) {}
  public nativeDeliveryEnabled(): false { return false; }
  public evaluate(): Promise<Readonly<INotificationSourceHold>> {
    if (this.pending) return this.pending;
    this.pending = this.evaluateSource().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async evaluateSource(): Promise<Readonly<INotificationSourceHold>> {
    try {
      const input = await this.reader?.read();
      if (!input) return Object.freeze({ status: 'HOLD', missingInputs: ['NotificationSourceUnavailable', ...nativeMissing] });
      // The donor owns schedule, recipient eligibility, event keys and duplicate suppression.
      const sourcePlan = planNotificationOutbox(input, this.localOutbox);
      if (sourcePlan.status === 'Queued' && sourcePlan.outbox) this.localOutbox.push(sourcePlan.outbox);
      return Object.freeze({ status: 'HOLD', missingInputs: nativeMissing, sourcePlan });
    } catch (error) {
      return Object.freeze({ status: 'HOLD', missingInputs: ['NotificationSourceUnavailable', ...nativeMissing],
        detail: error instanceof Error ? error.message : 'Notification source is unavailable.' });
    }
  }
  /** Existing lifecycle projection composed behind the governed source seam.
   * This remains source-preview only and does not create native delivery authority.
   */
  public previewLifecycleSource(
    input: Readonly<INotificationLifecycleSourceInput>
  ): Readonly<INotificationLifecycleSourceResult> {
    return projectNotificationLifecycleSource(input);
  }

  /** Existing quarter projection composed behind the governed source seam.
   * Supplied schedule/configuration values remain caller-owned preview inputs.
   */
  public previewQuarterSource(
    input: Readonly<INotificationQuarterSourceInput>
  ): Readonly<INotificationQuarterSourceResult> {
    return projectNotificationQuarterSource(input);
  }

  /** Existing manager/day digest projection composed behind the governed source seam.
   * This is not a persistent digest ledger and cannot send.
   */
  public previewManagerDigest(
    input: Readonly<INotificationManagerDigestInput>
  ): Readonly<INotificationManagerDigestResult> {
    return projectNotificationManagerDigest(input);
  }

  public previewDisabledFinalReminder(
    outbox: Readonly<INotificationOutboxRecord>, template: Readonly<INotificationTemplateContract> | undefined,
    adapter: Readonly<IDisabledNotificationDeliveryAdapterConfig> | undefined,
    attemptedAt: string, request: Readonly<IDisabledNotificationDeliveryRequest>
  ): Readonly<INotificationSourceHold> {
    if (!template || !adapter) return Object.freeze({ status: 'HOLD',
      missingInputs: ['DisabledTemplateOrAdapterUnavailable', ...nativeMissing] });
    try {
      const index = this.localOutbox.indexOf(outbox);
      if (index < 0) throw new Error('The source preview outbox is unavailable.');
      // Validate the existing closed template before consuming an issued attempt.
      renderFinalReminderTemplate(outbox, template);
      const transition = beginNotificationAttempt(outbox, attemptedAt);
      this.localOutbox[index] = transition.outbox;
      const capability = prepareDisabledNotificationDelivery(transition.outbox, transition.attempt, template, adapter);
      const disabledResult = executeDisabledNotificationDelivery(capability, request);
      this.localOutbox[index] = disabledResult.outbox;
      const auditEvidence = createNotificationAuditEvidence(disabledResult.outbox, transition.attempt, disabledResult.outcome);
      return Object.freeze({ status: 'HOLD', missingInputs: nativeMissing, disabledResult, auditEvidence });
    } catch (error) {
      return Object.freeze({ status: 'HOLD', missingInputs: nativeMissing,
        detail: error instanceof Error ? error.message : 'Disabled notification preview is unavailable.' });
    }
  }
}
