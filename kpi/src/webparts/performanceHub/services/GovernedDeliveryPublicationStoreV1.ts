import type {
  DeliveryPublicationCommand, IDeliveryPublicationProtectedBinding, IDeliveryPublicationProtectedPorts,
  IDeliveryPublicationProtectedSources, IDeliveryPublicationSourceReceipt, IDeliveryPublicationStoreIntent,
  IDeliveryPublicationStoreReadback
} from '../models/GovernedDeliveryPublicationStoreV1Models';
import type { GovernedDeliveryPublicationProposal, IDeliveryPublicationNativeCoordinates } from '../models/GovernedDeliveryPublicationV1Models';
import { canonicalisePlainRecord } from './SecurityBoundaryCanonicalisation';
import { BufferByteLength, v4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { buildGlobalDeliveryPublicationProposal, buildManagerDeliveryPublicationProposal } from './GovernedDeliveryPublicationV1';

const hold = (reason: string): never => { throw new Error(`Delivery store HOLD: ${reason}`); };
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const guid = (value: unknown): boolean => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const same = (a: unknown, b: unknown): boolean => a === undefined || b === undefined ? a === b : v4Canonical(a) === v4Canonical(b);
const closed = (value: object, required: readonly string[], optional: readonly string[] = []): void => {
  if (!value || Array.isArray(value) || required.some(key => !Object.prototype.hasOwnProperty.call(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) hold('Incomplete or open record.');
};
const snapshot = <T extends object>(value: T): Readonly<T> => canonicalisePlainRecord(value, 'Protected Delivery observations');
const nativeValid = (value: Readonly<IDeliveryPublicationNativeCoordinates>): void => {
  closed(value, ['siteId', 'webId', 'listId', 'itemId', 'version', 'etag']);
  if (![value.siteId, value.webId, value.listId].every(guid) || !Number.isSafeInteger(value.itemId) || value.itemId < 1
    || !text(value.version) || value.version.includes('*') || !/^"[^"\r\n]+"$/.test(value.etag) || value.etag.includes('*')) {
    hold('Invalid exact native identity.');
  }
};
const commandValid = (value: DeliveryPublicationCommand): void => {
  closed(value, value.kind === 'GlobalDefault' ? ['key', 'kind', 'year']
    : ['key', 'kind', 'year', 'workplan', 'person', 'proposed', 'reason']);
  if (!text(value.key) || !Number.isInteger(value.year) || value.year < 2000 || value.year > 2100
    || !['GlobalDefault', 'WorkplanOverride'].includes(value.kind)) hold('Invalid command.');
  if (value.kind === 'WorkplanOverride' && ![value.workplan, value.person, value.reason].every(text)) hold('Incomplete Manager intent.');
};
const bindingValid = (value: Readonly<IDeliveryPublicationProtectedBinding>): void => {
  closed(value, ['admitted', 'admissionReference', 'sourcePreconditionContract', 'immutableCreate', 'appendOnlyIntent',
    'publication', 'producerPrincipal', 'publisherIdentity', 'configListId', 'workplanListId', 'peopleListId']);
  nativeValid(value.publication);
  if (value.admitted !== true || value.immutableCreate !== true || value.appendOnlyIntent !== true
    || ![value.admissionReference, value.sourcePreconditionContract, value.publisherIdentity].every(text)
    || !Number.isSafeInteger(value.producerPrincipal) || value.producerPrincipal < 1
    || ![value.configListId, value.workplanListId, value.peopleListId].every(guid)) hold('Protected native binding not admitted.');
};

const proposal = (command: DeliveryPublicationCommand, binding: Readonly<IDeliveryPublicationProtectedBinding>,
  sources: Readonly<IDeliveryPublicationProtectedSources>): GovernedDeliveryPublicationProposal => {
  closed(sources, ['config', 'configNative', 'globalPayload', 'publicationPayload'], command.kind === 'WorkplanOverride'
    ? ['manager', 'approvalEventAt', 'existingAuditKeys'] : []);
  closed(sources.configNative, ['core', 'impact']);
  const expected = binding.publication;
  (['core', 'impact'] as const).forEach(category => {
    const native = sources.configNative[category]; nativeValid(native);
    const row = sources.config.authority[category].identity;
    if (native.siteId !== expected.siteId || native.webId !== expected.webId || native.listId !== binding.configListId
      || native.itemId !== row.itemId || native.etag !== row.etag) hold('Config native observations disagree.');
  });
  const global = buildGlobalDeliveryPublicationProposal(sources.config, sources.globalPayload);
  const authority = sources.publicationPayload.authority;
  if (global.scope.year !== command.year || authority.version !== expected.version || authority.etag !== expected.etag
    || authority.publishedBy !== binding.publisherIdentity) hold('Publication authority/native binding disagreement.');
  if (command.kind === 'GlobalDefault') {
    if (!same(sources.globalPayload, sources.publicationPayload)) hold('Global payload disagrees.');
    return global;
  }
  const observed = sources.manager;
  if (!observed || !text(sources.approvalEventAt) || !Array.isArray(sources.existingAuditKeys)
    || !sources.existingAuditKeys.every(text) || new Set(sources.existingAuditKeys).size !== sources.existingAuditKeys.length) {
    return hold('Complete protected Manager and audit observations required.');
  }
  const wp = observed.workplanSource.value;
  [observed.workplanSource, observed.actorSource, observed.subjectSource].forEach(source => {
    nativeValid(source.native);
    if (source.native.siteId !== expected.siteId || source.native.webId !== expected.webId) hold('Crossed native source coordinates.');
  });
  if (observed.workplanSource.native.listId !== binding.workplanListId
    || observed.actorSource.native.listId !== binding.peopleListId || observed.subjectSource.native.listId !== binding.peopleListId
    || wp.workplanKey !== command.workplan || wp.personKey !== command.person || wp.performanceYear !== command.year) {
    hold('Relevant Workplan/People binding mismatch.');
  }
  return buildManagerDeliveryPublicationProposal(global, observed, {
    auditKey: command.key, existingAuditKeys: sources.existingAuditKeys,
    current: wp.overallDeliveryWeightConfiguration ? { core: wp.overallDeliveryWeightConfiguration.coreWeight,
      impact: wp.overallDeliveryWeightConfiguration.impactWeight } : global.payload.activeWeights,
    proposed: command.proposed, reason: command.reason, subjectPersonKey: wp.personKey,
    actorEmail: observed.actorSource.value.email, actorRole: 'Manager', actorPersonKey: observed.actorSource.value.personKey,
    assignedManagerPersonKey: observed.subjectSource.value.managerPersonKey, eventAt: sources.approvalEventAt,
    sourceVersion: wp.rowVersionToken, state: wp.state
  }, sources.publicationPayload);
};

const intentValid = (value: Readonly<IDeliveryPublicationStoreIntent>, command: DeliveryPublicationCommand,
  binding: Readonly<IDeliveryPublicationProtectedBinding>): GovernedDeliveryPublicationProposal => {
  closed(value, ['contract', 'command', 'binding', 'sources', 'rawBody']);
  if (value.contract !== 'kcf.option-e.delivery-publication-intent/v1' || !same(value.command, command)
    || !same(value.binding, binding)) hold('Replay identity changed; a new governed version is required.');
  const body = proposal(command, binding, value.sources);
  if (value.rawBody !== v4Canonical(body) || BufferByteLength(value.rawBody) > 1048576) {
    hold('Immutable exact body or capacity mismatch.');
  }
  return body;
};

const readbackValid = (value: Readonly<IDeliveryPublicationStoreReadback>, intent: Readonly<IDeliveryPublicationStoreIntent>): void => {
  closed(value, ['commandKey', 'native', 'authorId', 'createdAt', 'rawBody', 'sourcePreconditionContract', 'sourcePreconditions']);
  nativeValid(value.native);
  if (value.commandKey !== intent.command.key || !same(value.native, intent.binding.publication)
    || value.authorId !== intent.binding.producerPrincipal || value.createdAt !== intent.sources.publicationPayload.authority.publishedAt
    || value.rawBody !== intent.rawBody || value.sourcePreconditionContract !== intent.binding.sourcePreconditionContract
    || !same(value.sourcePreconditions, intent.sources)) hold('Protected publication/readback/audit/precondition disagreement.');
};

/** Source adapter only; constructing it without separately admitted backend ports is OFF.
 * Two stable observations are necessary but do not assert atomicity. A native implementation
 * must additionally enforce the admitted source-precondition contract at immutable create.
 */
export class GovernedDeliveryPublicationStoreV1 {
  public constructor(private readonly ports?: IDeliveryPublicationProtectedPorts) {}

  public async publish(input: DeliveryPublicationCommand): Promise<Readonly<IDeliveryPublicationSourceReceipt>> {
    const ports = this.ports;
    if (!ports) return hold('Backend ports are unbound (OFF).');
    const command = snapshot(input); commandValid(command);
    const observedBinding = await ports.readBinding(command);
    if (!observedBinding) return hold('Backend binding missing.');
    const binding = snapshot(observedBinding); bindingValid(binding);
    const stable = async <T extends object>(read: () => Promise<Readonly<T> | undefined>): Promise<Readonly<T> | undefined> => {
      const first = await read(); const a = first === undefined ? undefined : snapshot(first);
      const second = await read(); const b = second === undefined ? undefined : snapshot(second);
      if (!same(a, b)) return hold('Protected observations changed during readback.');
      return a;
    };
    let intent = await stable(() => ports.readIntent(command.key));
    if (!intent) {
      const sources = await stable(() => ports.readSources(command));
      if (!sources) return hold('Authoritative source observations missing.');
      const body = proposal(command, binding, sources);
      const planned = snapshot<IDeliveryPublicationStoreIntent>({ contract: 'kcf.option-e.delivery-publication-intent/v1',
        command, binding, sources, rawBody: v4Canonical(body) });
      intentValid(planned, command, binding);
      try { await ports.createIntentIfAbsent(planned); } catch { /* Reconcile this exact protected intent only. */ }
      intent = await stable(() => ports.readIntent(command.key));
      if (!intent || !same(intent, planned)) return hold('Immutable intent was not read back exactly.');
    }
    const publication = intentValid(intent, command, binding);
    const fixedIntent = intent;
    let readback = await stable(() => ports.readPublication(fixedIntent));
    if (!readback) {
      const current = await stable(() => ports.readSources(command));
      const bindingReadback = await ports.readBinding(command);
      const currentBinding = bindingReadback === undefined ? undefined : snapshot(bindingReadback);
      if (!same(current, intent.sources) || !same(currentBinding, binding)) return hold('Source or binding changed before publication.');
      try { await ports.createPublicationIfSourcesCurrent(intent); } catch { /* Never blindly retry an uncertain create. */ }
      readback = await stable(() => ports.readPublication(fixedIntent));
      if (!readback) return hold('Publication outcome unproved; retry must reuse the exact protected intent.');
    }
    readbackValid(readback, intent);
    return snapshot<IDeliveryPublicationSourceReceipt>({ contract: 'kcf.option-e.delivery-publication-source-readback/v1',
      evidence: 'SOURCE_PORT_READBACK_ONLY', intent, readback, publication });
  }
}
