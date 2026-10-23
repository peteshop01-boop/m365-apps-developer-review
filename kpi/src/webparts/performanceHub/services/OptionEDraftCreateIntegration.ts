import {
  OptionEDraftCreateContract,
  type IOptionEDraftCreateAuthority,
  type IOptionEDraftCreateAuthorityResolver,
  type IOptionEDraftCreateInput,
  type IOptionEDraftCreateOnlyTransport,
  type IOptionEDraftCreateRequest,
  type IOptionEDraftCreateVerified,
  type IOptionEDraftCanonicalReadback,
  type IOptionEDraftNativeReceipt
} from './OptionEDraftCreateContract';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';

export type OptionEDraftCreateAdmissionCode =
  'INPUTS_ABSENT' | 'INPUTS_UNVERIFIED' | 'RESOLVER_UNVERIFIED' |
  'TRANSPORT_UNVERIFIED' | 'BINDING_UNVERIFIED' | 'ADMITTED';

export class OptionEDraftCreateIntegrationError extends Error {
  public constructor(public readonly code: Exclude<OptionEDraftCreateAdmissionCode, 'ADMITTED'>) {
    super(`OPTION_E_DRAFT_CREATE_${code}`);
    this.name = 'OptionEDraftCreateIntegrationError';
    Object.setPrototypeOf(this, OptionEDraftCreateIntegrationError.prototype);
  }
}

/**
 * A trusted composer may provide this only after the physical protected Workplan path has been
 * independently verified. The canonical binding object prevents a partial field-map substitute.
 */
export interface IOptionEDraftCreateBindingCapability {
  bindings: typeof OPTION_E_WORKPLAN_LIST_BINDINGS;
  physicalIdentityVerified: true;
  privateItemAclVerified: true;
  physicalSchemaVerified: true;
  atomicCreateVerified: true;
  nativeReceiptVerified: true;
  privateReadbackVerified: true;
  trustedProcessorReceiptVerified: true;
  protectedState: 'Draft';
  transitionStatus: 'Ready';
}

export interface IOptionEDraftCreateIntegrationInputs {
  authorityResolver: IOptionEDraftCreateAuthorityResolver;
  createOnlyTransport: IOptionEDraftCreateOnlyTransport;
  bindingCapability: IOptionEDraftCreateBindingCapability;
}

export interface IOptionEDraftCreateAdmission {
  admitted: boolean;
  code: OptionEDraftCreateAdmissionCode;
}

export interface IOptionEDraftCreateIntegration {
  readonly admission: Readonly<IOptionEDraftCreateAdmission>;
  create(input: Readonly<IOptionEDraftCreateInput>): Promise<IOptionEDraftCreateVerified>;
}

const INPUT_KEYS = ['authorityResolver', 'createOnlyTransport', 'bindingCapability'] as const;
const RESOLVER_KEYS = ['resolve'] as const;
const TRANSPORT_KEYS = ['createOnce', 'readCanonical'] as const;
const BINDING_KEYS = [
  'bindings', 'physicalIdentityVerified', 'privateItemAclVerified', 'physicalSchemaVerified',
  'atomicCreateVerified', 'nativeReceiptVerified', 'privateReadbackVerified',
  'trustedProcessorReceiptVerified', 'protectedState', 'transitionStatus'
] as const;

const trustedIntegrations = new WeakSet<object>();

const ownDataRecord = (value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> | undefined => {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key)))
      return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return undefined;
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch { return undefined; }
};

const admission = (admitted: boolean, code: OptionEDraftCreateAdmissionCode): Readonly<IOptionEDraftCreateAdmission> =>
  Object.freeze(Object.assign(Object.create(null) as IOptionEDraftCreateAdmission, { admitted, code }));

const integration = (
  status: Readonly<IOptionEDraftCreateAdmission>,
  create: IOptionEDraftCreateIntegration['create']
): IOptionEDraftCreateIntegration => {
  const result = Object.assign(Object.create(null) as IOptionEDraftCreateIntegration, { admission: status, create });
  Object.freeze(result);
  trustedIntegrations.add(result);
  return result;
};

const denied = (code: Exclude<OptionEDraftCreateAdmissionCode, 'ADMITTED'>): IOptionEDraftCreateIntegration =>
  integration(admission(false, code), (_input): Promise<never> =>
    Promise.reject(new OptionEDraftCreateIntegrationError(code)));

const verifiedBinding = (value: unknown): boolean => {
  const candidate = ownDataRecord(value, BINDING_KEYS);
  return Boolean(candidate && candidate.bindings === OPTION_E_WORKPLAN_LIST_BINDINGS &&
    candidate.physicalIdentityVerified === true && candidate.privateItemAclVerified === true &&
    candidate.physicalSchemaVerified === true && candidate.atomicCreateVerified === true &&
    candidate.nativeReceiptVerified === true && candidate.privateReadbackVerified === true &&
    candidate.trustedProcessorReceiptVerified === true && candidate.protectedState === 'Draft' &&
    candidate.transitionStatus === 'Ready');
};

/** Default/partial composition is disabled. Only exact own-data dependencies can be admitted. */
export const createOptionEDraftCreateIntegration = (value?: unknown): IOptionEDraftCreateIntegration => {
  if (value === undefined) return denied('INPUTS_ABSENT');
  const inputs = ownDataRecord(value, INPUT_KEYS);
  if (!inputs) return denied('INPUTS_UNVERIFIED');
  const resolver = ownDataRecord(inputs.authorityResolver, RESOLVER_KEYS);
  if (!resolver || typeof resolver.resolve !== 'function') return denied('RESOLVER_UNVERIFIED');
  const transport = ownDataRecord(inputs.createOnlyTransport, TRANSPORT_KEYS);
  if (!transport || typeof transport.createOnce !== 'function' || typeof transport.readCanonical !== 'function')
    return denied('TRANSPORT_UNVERIFIED');
  if (!verifiedBinding(inputs.bindingCapability)) return denied('BINDING_UNVERIFIED');

  const resolve = resolver.resolve as IOptionEDraftCreateAuthorityResolver['resolve'];
  const createOnce = transport.createOnce as IOptionEDraftCreateOnlyTransport['createOnce'];
  const readCanonical = transport.readCanonical as IOptionEDraftCreateOnlyTransport['readCanonical'];
  const safeResolver: IOptionEDraftCreateAuthorityResolver = Object.freeze({
    resolve: (email: string, year: number): Promise<IOptionEDraftCreateAuthority> => resolve(email, year)
  });
  const safeTransport: IOptionEDraftCreateOnlyTransport = Object.freeze({
    createOnce: (request: Readonly<IOptionEDraftCreateRequest>): Promise<IOptionEDraftNativeReceipt> =>
      createOnce(request),
    readCanonical: (itemId: number): Promise<IOptionEDraftCanonicalReadback> => readCanonical(itemId)
  });
  const contract = new OptionEDraftCreateContract(safeResolver, safeTransport);
  return integration(admission(true, 'ADMITTED'),
    (input: Readonly<IOptionEDraftCreateInput>): Promise<IOptionEDraftCreateVerified> => contract.create(input));
};

/** Facade consumers can trust admission only for an object created by this module. */
export const readOptionEDraftCreateAdmission = (value: unknown): Readonly<IOptionEDraftCreateAdmission> => {
  if (!value || typeof value !== 'object' || !trustedIntegrations.has(value))
    return admission(false, 'INPUTS_UNVERIFIED');
  return (value as IOptionEDraftCreateIntegration).admission;
};
