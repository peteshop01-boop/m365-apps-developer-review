import { EXACT_BODY_V5, V5_MAX_BYTES } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V5CapturedBytePort, V5Result } from '../models/OptionEWorkplanSubmitExactBodyV5ExecutionModels';
import type { V5SyntheticHostPorts } from '../models/OptionEWorkplanSubmitExactBodyV5ClientModels';
import { V5_WIRE_SCHEMA, V5_CAPTURED_ADMISSION_SCHEMA, V5_CAPTURED_JOURNAL_SCHEMA,
  V5_CAPTURED_SNAPSHOT_SCHEMA, V5_CAPTURED_RECEIPT_SCHEMA } from './OptionEWorkplanSubmitExactBodyV5Wire';
import { parseV5CapturedAdmission, parseV5CapturedJournalOperation } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { validateV5Admission } from './OptionEWorkplanSubmitExactBodyV5Admission';
import { validateV5SourceDomainBinding, measureV5Capacity } from './OptionEWorkplanSubmitExactBodyV5PackageContract';
import { OptionEWorkplanSubmitExactBodyV5, v5AclPlan } from './OptionEWorkplanSubmitExactBodyV5';
import { v4Canonical, v4Equal } from './OptionEWorkplanSubmitExactBodyV4Wire';

export const V5_HOST_DECLARATION = {
  capability: EXACT_BODY_V5, state: 'Disabled', binding: 'Unbound', defaultOn: false,
  installedReadiness: 'NOT_ADMITTED', purpose: 'SyntheticSourceOnly', maxUtf8Bytes: V5_MAX_BYTES,
  schemas: { request: V5_WIRE_SCHEMA, admission: V5_CAPTURED_ADMISSION_SCHEMA, journal: V5_CAPTURED_JOURNAL_SCHEMA,
    snapshot: V5_CAPTURED_SNAPSHOT_SCHEMA, receipt: V5_CAPTURED_RECEIPT_SCHEMA },
  nativeRequirements: ['ProtectedOrigin', 'NativeETagAllocation', 'ConditionalCreateAtomicity', 'CAS', 'ACL',
    'SupportedStandardHashing', 'SupportedStandardRuntime']
} as const;

/** Explicit source-test opt-in only. The installed declaration remains disabled/unbound. */
export async function dispatchV5SyntheticHost(admissionBody: string, port?: V5SyntheticHostPorts,
  sourceTestEnabled = false): Promise<V5Result> {
  try {
    if (!sourceTestEnabled || !port || typeof port.readImmutableRequest !== 'function') throw new Error('HostDisabledUnbound');
    validateV5SourceDomainBinding(port.binding);
    const a = parseV5CapturedAdmission(admissionBody);
    validateV5Admission(a); measureV5Capacity(a); v5AclPlan(a, port.binding.principals);
    const { control: originalControl, ...original } = a.authority;
    const checkedAuthority = async (): Promise<typeof a.authority> => {
      const request = await port.readImmutableRequest(a.key);
      if (!request || !v4Equal(request, a.authority.request)
        || !v4Equal(await port.readImmutableRequest(a.key), a.authority.request)) throw new Error('HostImmutableRequestMissingOrChanging');
      const first = JSON.parse(v4Canonical(await port.readAuthority(a.key))) as typeof a.authority;
      const second = JSON.parse(v4Canonical(await port.readAuthority(a.key))) as typeof a.authority;
      const { control, ...observed } = first;
      if (!v4Equal(first, second) || !v4Equal(observed, original)) throw new Error('HostImmutableOriginMismatch');
      return { ...first, control };
    };
    const first = await checkedAuthority();
    const operation = await port.readOperation(a.key);
    if (!operation && !v4Equal(first.control, originalControl)) throw new Error('HostOriginalControlMismatch');
    // Delegate every method explicitly, retaining the port receiver and synthetic ETag contract.
    const bound: V5CapturedBytePort = {
      binding: port.binding, readAuthority: checkedAuthority,
      nextOperationEtag: (key, etag) => port.nextOperationEtag(key, etag), readOperation: key => port.readOperation(key),
      createOperation: (admission, journal) => port.createOperation(admission, journal),
      replaceOperation: (key, etag, journal) => port.replaceOperation(key, etag, journal),
      readControl: key => port.readControl(key), casControl: (key, etag, next) => port.casControl(key, etag, next),
      readSnapshot: key => port.readSnapshot(key), createSnapshot: body => port.createSnapshot(body),
      readReceipt: key => port.readReceipt(key), createReceipt: body => port.createReceipt(body),
      expectedAcl: admission => port.expectedAcl(admission), readAcl: key => port.readAcl(key),
      applyAcl: admission => port.applyAcl(admission), now: () => a.eventAt
    };
    // Existing operations must preserve the complete original event as well as all origins.
    if (operation) {
      if (!v4Equal(parseV5CapturedJournalOperation(operation).admission, a)) throw new Error('HostOriginalAdmissionMismatch');
    }
    return await new OptionEWorkplanSubmitExactBodyV5(bound).submit(a.key);
  } catch (error) { return { outcome: 'Rejected', reason: error instanceof Error ? error.message : 'HostUnavailable' }; }
}
