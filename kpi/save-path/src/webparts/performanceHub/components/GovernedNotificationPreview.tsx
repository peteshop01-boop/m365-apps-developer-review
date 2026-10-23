import * as React from 'react';
import type { IProductionPerson } from '../models/ProductionModels';
import { applicationEntryCapabilities } from '../services/ControlledApplicationRoles';
import type { GovernedNotificationSourceController, INotificationSourceHold } from '../services/notifications/GovernedNotificationSourceController';
import styles from './PerformanceHub.module.scss';

export interface INotificationPreviewBinding {
  loadKey: object;
  year: number;
  currentUserEmail: string;
}
export interface IGovernedNotificationPreviewProps {
  source?: GovernedNotificationSourceController;
  actor?: IProductionPerson;
  /** Supplied only after the Hub's loaded actor, load key and year have matched. */
  binding?: INotificationPreviewBinding;
}
const unavailable = 'Notification preview unavailable. Reload the current configuration or contact KPI support.';
const reasons: Readonly<Record<string, string>> = {
  Eligible: 'Eligible in the supplied preview. No notification has been sent.',
  NotScheduledBoundary: 'This preview is outside the configured time.',
  DuplicateOutboxKey: 'Already previewed in this session. This is local preview suppression, not proof of a previous send.',
  NotActionableState: 'No action is needed for the supplied workflow state.',
  InactiveRecipient: 'Recipient eligibility check failed.',
  IneligibleRecipientRole: 'Recipient eligibility check failed.',
  RecipientIdentityMismatch: 'Recipient identity check failed.',
  AmbiguousPeopleIdentity: 'Recipient identity check failed.',
  MalformedConfig: 'Configuration unavailable.',
  WrongPeriodOrEmployee: 'Supplied preview scope does not match.',
  UnsafeActionLink: 'Action link safety check failed.',
  StaleWorkflowState: 'Supplied workflow state is out of date.',
  InvalidResendDistinction: 'Resend approval is unavailable.',
  ConflictingOutboxState: 'Supplied preview state conflicts.'
};
const missingLabels: Readonly<Record<string, string>> = {
  NotificationSourceUnavailable: 'Notification source unavailable.',
  NativeNotificationDeliveryUnbound: 'Notification delivery is not connected.',
  NotificationAuditAppendPortUnavailable: 'Delivery audit is unavailable.',
  DisabledTemplateOrAdapterUnavailable: 'Preview configuration unavailable.'
};
const safeLabels = (result: Readonly<INotificationSourceHold>, year: number): string[] => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [unavailable];
  const { status, missingInputs, sourcePlan: plan } = result;
  if (typeof status !== 'string' || status !== 'HOLD' || !Array.isArray(missingInputs)) return [unavailable];
  // Capture once, including sparse entries, before any property-key coercion or label lookup.
  const missingCodes = [...missingInputs];
  if (missingCodes.some(code => typeof code !== 'string'
    || !Object.prototype.hasOwnProperty.call(missingLabels, code))) return [unavailable];
  const missing = missingCodes.map(code => missingLabels[code]);
  if (plan === undefined) return missing.length ? missing : [unavailable];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return [unavailable];
  const { status: planStatus, reason } = plan;
  if (typeof planStatus !== 'string' || typeof reason !== 'string'
    || !Object.prototype.hasOwnProperty.call(reasons, reason)) return [unavailable];
  const suppressed = ['NotScheduledBoundary', 'DuplicateOutboxKey', 'NotActionableState'];
  if (planStatus === 'Queued') {
    if (reason !== 'Eligible' || !plan.outbox) return [unavailable];
    if (plan.outbox.provenance?.performanceYearNumber !== year) {
      return ['Preview held because the supplied year does not match the current loaded year.'];
    }
  } else if (planStatus === 'Suppressed') {
    if (!suppressed.includes(reason)) return [unavailable];
  } else if (planStatus !== 'Rejected' || reason === 'Eligible' || suppressed.includes(reason)) return [unavailable];
  return [reasons[reason], ...missing];
};

export const GovernedNotificationPreview: React.FC<IGovernedNotificationPreviewProps> = ({ source, actor, binding }) => {
  const authorised = applicationEntryCapabilities(actor).admin && Boolean(binding && actor
    && actor.email.trim().toLowerCase() === binding.currentUserEmail.trim().toLowerCase()
    && binding.loadKey && Number.isInteger(binding.year) && binding.year > 0);
  // Primitive actor/role coordinates also invalidate in-place identity/role changes.
  const token = React.useMemo(() => ({}), [source, binding?.loadKey, binding?.year, binding?.currentUserEmail,
    actor?.id, actor?.personKey, actor?.email, actor?.active,
    Array.isArray(actor?.appRoles) ? actor!.appRoles.join('|') : '', authorised]);
  const current = React.useRef<object | undefined>(token);
  current.current = token;
  const pending = React.useRef<{ token: object }>();
  const [observation, setObservation] = React.useState<{ token: object; pending: boolean; labels: string[] }>();
  React.useLayoutEffect(() => () => {
    if (current.current === token) current.current = undefined;
    if (pending.current?.token === token) pending.current = undefined;
  }, [token]);
  const visible = observation?.token === token ? observation : undefined;
  const check = async (): Promise<void> => {
    if (!authorised || !source || !binding || current.current !== token || pending.current?.token === token) return;
    const request = { token };
    pending.current = request;
    setObservation({ token, pending: true, labels: [] });
    try {
      if (source.nativeDeliveryEnabled() !== false) throw new Error('Preview held');
      const result = await source.evaluate();
      if (current.current !== token || pending.current !== request) return;
      const labels = source.nativeDeliveryEnabled() === false ? safeLabels(result, binding.year) : [unavailable];
      setObservation({ token, pending: false, labels });
    } catch {
      if (current.current === token && pending.current === request) setObservation({ token, pending: false, labels: [unavailable] });
    } finally {
      if (pending.current === request) pending.current = undefined;
    }
  };
  if (!authorised) return null;
  return <section className={styles.coreReadinessPanel} aria-label="Notification preview">
    <h3>Notification preview</h3>
    <p><strong>Preview only. Sending is off.</strong></p>
    <p>This check uses supplied preview inputs. It does not create a persistent queue or delivery audit record.</p>
    <p>Audit unavailable. No installed notification schedule or delivery is confirmed here.</p>
    <button type="button" disabled={!source || Boolean(visible?.pending)} onClick={() => { void check(); }}>Check notifications</button>
    <div role="status" aria-live="polite">{!source ? <p>{unavailable}</p>
      : visible?.pending ? <p>Checking notification preview…</p>
        : visible ? <ul>{visible.labels.map((label, index) => <li key={index}>{label}</li>)}</ul>
          : <p>Choose Check notifications to inspect the supplied preview. Nothing will be sent.</p>}</div>
  </section>;
};
