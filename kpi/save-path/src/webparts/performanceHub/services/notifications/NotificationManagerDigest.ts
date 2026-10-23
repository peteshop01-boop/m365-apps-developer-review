import { captureNotificationProtectedData, encodeNotificationIdentity } from './NotificationBoundary';
import type { INotificationRecipientReference } from './NotificationModels';
import {
  checkNotificationQuarterSchedule, projectNotificationQuarterSource, QUARTER_NOTIFICATION_SOURCE_EVENTS,
  type INotificationQuarterFacts, type INotificationQuarterPreview, type INotificationQuarterSchedule,
  type INotificationQuarterSourceInput, type QuarterNotificationSourceEvent
} from './NotificationQuarterSourcePolicy';

export interface INotificationManagerDigestInput {
  readonly now?: string;
  readonly schedule?: Readonly<INotificationQuarterSchedule>;
  readonly sources?: readonly Omit<INotificationQuarterSourceInput, 'now' | 'schedule'>[];
}
export interface INotificationManagerDigestMember {
  readonly facts: Readonly<INotificationQuarterFacts>;
  readonly reasons: readonly QuarterNotificationSourceEvent[];
  readonly urgency: INotificationQuarterPreview['urgency'];
}
export interface INotificationManagerDigestPreview {
  readonly previewBucketKey: string;
  readonly recipient: Readonly<INotificationRecipientReference>;
  readonly dayKey: string;
  readonly timeZone: string;
  readonly scheduledAt: string;
  readonly scheduleConfigKey: string;
  readonly scheduleConfigVersion: string;
  readonly employeeCount: number;
  readonly outstandingReviewCount: number;
  readonly members: readonly Readonly<INotificationManagerDigestMember>[];
  readonly message: string;
}
export interface INotificationManagerDigestResult {
  readonly status: 'PREVIEW' | 'HOLD' | 'SUPPRESSED';
  readonly reason: 'SourceInputUnavailable' | 'ScheduleUnavailable' | 'NotDue' | 'OutsideScheduledDay'
    | 'SourceObservationUnavailable' | 'ConflictingSubjectObservations' | 'ConflictingManagerIdentity' | 'EmptyDigest' | 'ManagerDigestProjected';
  readonly nativeDeliveryEnabled: false;
  readonly digests: readonly Readonly<INotificationManagerDigestPreview>[];
}
const empty = (status: INotificationManagerDigestResult['status'], reason: INotificationManagerDigestResult['reason']): Readonly<INotificationManagerDigestResult> =>
  Object.freeze({ status, reason, nativeDeliveryEnabled: false, digests: Object.freeze([]) });

/** One preview bucket per manager/local day. This is not a persistent delivery-success ledger. */
export const projectNotificationManagerDigest = (
  supplied: Readonly<INotificationManagerDigestInput>
): Readonly<INotificationManagerDigestResult> => {
  let input: Readonly<INotificationManagerDigestInput>;
  try { input = captureNotificationProtectedData(supplied, 'managerDigest').value; }
  catch { return empty('HOLD', 'SourceInputUnavailable'); }
  if (!input || !Array.isArray(input.sources)) return empty('HOLD', 'SourceInputUnavailable');
  const scheduleState = checkNotificationQuarterSchedule(input.schedule, input.now);
  if (scheduleState !== 'Eligible') return empty(scheduleState === 'ScheduleUnavailable' ? 'HOLD' : 'SUPPRESSED', scheduleState);
  const schedule = input.schedule!;
  const sources: NonNullable<INotificationManagerDigestInput['sources']> = input.sources;
  const buckets = new Map<string, { recipient: INotificationRecipientReference; members: Map<string, INotificationManagerDigestMember> }>();
  const observations = new Map<string, string>();
  for (const source of sources) {
    const projected = projectNotificationQuarterSource({ ...source, now: input.now, schedule });
    if (projected.status === 'HOLD') return empty('HOLD', 'SourceObservationUnavailable');
    // Retain every observed state before suppression, so a stale Submitted duplicate cannot
    // survive a supplied Approved/Locked observation for the same subject.
    const workflow = source.workflow!;
    const subjectIdentity = JSON.stringify([workflow.workflowKey, workflow.performanceYearNumber, workflow.periodKey]);
    const employee = source.people!.find(person => person.personKey === workflow.employeePersonKey)!;
    const observation = JSON.stringify([workflow.employeePersonKey, workflow.state, workflow.sourceVersion, source.configuration,
      employee.managerPersonKey, employee.managerEmail?.trim().toLowerCase()]);
    if (observations.has(subjectIdentity) && observations.get(subjectIdentity) !== observation) return empty('HOLD', 'ConflictingSubjectObservations');
    observations.set(subjectIdentity, observation);
    for (const notification of projected.notifications.filter(value => value.recipientRole === 'Manager')) {
      const recipient = notification.recipient;
      const key = `ManagerDayPreviewV1:${encodeNotificationIdentity('outbox', [recipient.personKey, schedule.dayKey, schedule.timeZone])}`;
      const bucket = buckets.get(key) || { recipient, members: new Map<string, INotificationManagerDigestMember>() };
      if (bucket.recipient.email.trim().toLowerCase() !== recipient.email.trim().toLowerCase()) return empty('HOLD', 'ConflictingManagerIdentity');
      const memberKey = JSON.stringify([notification.facts.employeePersonKey, notification.facts.subjectKey,
        notification.facts.performanceYearNumber, notification.facts.quarter]);
      const existing = bucket.members.get(memberKey);
      if (existing && JSON.stringify(existing.facts) !== JSON.stringify(notification.facts)) return empty('HOLD', 'ConflictingSubjectObservations');
      const reasons = QUARTER_NOTIFICATION_SOURCE_EVENTS.filter(reason => notification.reasons.includes(reason) || existing?.reasons.includes(reason));
      bucket.members.set(memberKey, { facts: notification.facts, reasons, urgency: notification.urgency });
      buckets.set(key, bucket);
    }
  }
  if (!buckets.size) return empty('SUPPRESSED', 'EmptyDigest');
  const urgencyOrder: Record<INotificationQuarterPreview['urgency'], number> = { Overdue: 0, Due: 1, Outstanding: 2, Upcoming: 3 };
  const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
  const digests: INotificationManagerDigestPreview[] = Array.from(buckets.keys()).sort(compare).map(key => {
    const bucket = buckets.get(key)!;
    const members = Array.from(bucket.members.values()).sort((left, right) =>
      compare(left.facts.employeePersonKey, right.facts.employeePersonKey)
      || urgencyOrder[left.urgency] - urgencyOrder[right.urgency] || compare(left.facts.subjectKey, right.facts.subjectKey));
    const employeeCount = new Set(members.map(member => member.facts.employeePersonKey)).size;
    return { previewBucketKey: key, recipient: bucket.recipient, dayKey: schedule.dayKey, timeZone: schedule.timeZone,
      scheduledAt: schedule.scheduledAt, scheduleConfigKey: schedule.configKey, scheduleConfigVersion: schedule.configVersion,
      employeeCount, outstandingReviewCount: members.length, members,
      message: `${members.length} quarter review${members.length === 1 ? '' : 's'} awaiting your decision across ${employeeCount} employee${employeeCount === 1 ? '' : 's'}. Open the Hub.` };
  });
  return captureNotificationProtectedData<INotificationManagerDigestResult>({
    status: 'PREVIEW', reason: 'ManagerDigestProjected', nativeDeliveryEnabled: false, digests
  }, 'managerDigestPreview').value;
};
