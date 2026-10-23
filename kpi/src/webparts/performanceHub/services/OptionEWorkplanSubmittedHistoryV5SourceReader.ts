import type { V5ClientPorts, V5ClientSource } from '../models/OptionEWorkplanSubmitExactBodyV5ClientModels';
import type { V4Control } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { V5_AUTHORITY_CONTRACT, V5_CAPTURE_ENCODING, type V5Snapshot } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { IV5HistoryCoordinates, IV5SubmittedHistoryLoader } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import { v4Canonical, v4Equal, v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { parseV5CapturedReceipt, parseV5CapturedSnapshot, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';

export type SourceReadPorts = Pick<V5ClientPorts,
  'readCurrentSource' | 'readControl' | 'readReceipt' | 'readSnapshot'>;

const requireThat = (condition: boolean): void => {
  if (!condition) throw new Error('SubmittedCaptureSourceUnavailable');
};
const copy = <T>(value: T): T => JSON.parse(v4Canonical(value)) as T;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

const checkCurrent = (expected: Readonly<IV5HistoryCoordinates>, source: V5ClientSource, control: V4Control): void => {
  const { native, value } = source.workplan;
  requireThat(source.contract === V5_AUTHORITY_CONTRACT && source.actor.key === expected.person && source.actor.active === true
    && Number.isSafeInteger(source.actor.principal) && source.actor.principal > 0 && nonBlank(source.actor.version)
    && value.workplanKey === expected.workplan && value.personKey === expected.person && value.performanceYear === expected.year
    && value.state === 'Submitted' && value.transitionStatus === 'Ready'
    && control.workplan === expected.workplan && control.person === expected.person && control.year === expected.year
    && control.state === 'Submitted' && control.transition === 'Ready' && control.command === undefined
    && Number.isSafeInteger(control.hierarchyEpoch) && control.hierarchyEpoch >= 0 && control.aclEpoch === control.hierarchyEpoch
    && v4Etag(control.etag) && nonBlank(control.snapshot) && v4Equal(source.control, control)
    && nonBlank(native.siteId) && nonBlank(native.webId) && nonBlank(native.listId)
    && Number.isSafeInteger(native.itemId) && native.itemId > 0 && native.itemId === value.id
    && nonBlank(native.version) && v4Etag(native.etag) && native.etag === value.etag);
};
const checkSnapshot = (expected: Readonly<IV5HistoryCoordinates>, current: V5ClientSource, pointer: string, snapshot: V5Snapshot): void => {
  const a = snapshot.admission.authority, q = a.request.query, captured = a.workplan;
  requireThat(snapshot.key === pointer && snapshot.admission.key === pointer
    && q.workplan === expected.workplan && q.person === expected.person && q.year === expected.year
    && a.actor.key === expected.person && a.control.workplan === expected.workplan
    && a.control.person === expected.person && a.control.year === expected.year
    && captured.value.workplanKey === expected.workplan && captured.value.personKey === expected.person
    && captured.value.performanceYear === expected.year
    && (['siteId', 'webId', 'listId', 'itemId'] as const).every(key => captured.native[key] === current.workplan.native[key]));
};

/** Point-in-time source consistency only. Typed observations and captured encoding never
 * establish native origin, immutable replay, permissions, approval or an installed binding.
 * No write/operation/ACL/processor ports are consumed, and no capture bytes are rewritten.
 */
export function createOptionEWorkplanSubmittedHistoryV5SourceReader(
  ports?: SourceReadPorts
): IV5SubmittedHistoryLoader | undefined {
  if (!ports) return undefined;
  return Object.freeze({ readCapture: async (coordinates: Readonly<IV5HistoryCoordinates>) => {
    requireThat(!!coordinates && Object.keys(coordinates).length === 3 && nonBlank(coordinates.workplan)
      && nonBlank(coordinates.person) && Number.isInteger(coordinates.year));
    const expected = Object.freeze({ ...coordinates });
    const source = copy(await ports.readCurrentSource(expected.workplan));
    const control = copy(await ports.readControl(expected.workplan));
    checkCurrent(expected, source, control);
    const pointer = control.snapshot!;
    // Only undefined means absent. A thrown query or malformed present frame propagates HOLD.
    const receiptBody = await ports.readReceipt(pointer);
    const snapshotBody = await ports.readSnapshot(pointer);
    const receipt = receiptBody === undefined ? undefined : parseV5CapturedReceipt(receiptBody);
    const snapshot = snapshotBody === undefined ? undefined : parseV5CapturedSnapshot(snapshotBody);
    if (receipt) checkSnapshot(expected, source, pointer, receipt.snapshot);
    if (snapshot) checkSnapshot(expected, source, pointer, snapshot);
    if (receipt && snapshot) requireThat(v4Equal(receipt.snapshot, snapshot)
      && encodeV5CapturedSnapshot(receipt.snapshot) === snapshotBody);
    // Detach each observation immediately so later in-place changes cannot erase the before state.
    const finalSource = copy(await ports.readCurrentSource(expected.workplan));
    const finalControl = copy(await ports.readControl(expected.workplan));
    checkCurrent(expected, finalSource, finalControl);
    requireThat(v4Equal(source, finalSource) && v4Equal(control, finalControl));
    if (receiptBody !== undefined) return Object.freeze({ encoding: V5_CAPTURE_ENCODING, kind: 'receipt' as const, canonicalBody: receiptBody });
    if (snapshotBody !== undefined) return Object.freeze({ encoding: V5_CAPTURE_ENCODING, kind: 'snapshot' as const, canonicalBody: snapshotBody });
    return undefined;
  } });
}
