import type { V5Admission, V5Authority, V5Draft, V5NativeRequest, V5Request } from './OptionEWorkplanSubmitExactBodyV5Models';
import type { V5CapturedBytePort } from './OptionEWorkplanSubmitExactBodyV5ExecutionModels';

/** Explicit V2 evidence; no V1 Save controller conversion or installed V2 controller is implied. */
export interface V5SavedDraftEvidence {
  schema: 'kcf.workplan-draft/v2'; status: 'Saved' | 'Unsaved'; privateDraft: boolean;
  requiresCanonicalReopen: boolean; staleBuffer: boolean;
  person: string; year: number; workplan: string; source: V5Draft;
  canonicalReopenBody: string; currentBufferBody: string;
}
export type V5ClientSource = Omit<V5Authority, 'request'>;
/** All observations and proposed allocation are synthetic. Native allocation is NOT_ADMITTED. */
export interface V5ClientPorts extends Pick<V5CapturedBytePort,
  'binding' | 'readOperation' | 'readControl' | 'readSnapshot' | 'readReceipt' | 'readAcl'> {
  readCurrentSource(workplan: string): Promise<V5ClientSource>;
  readSyntheticRequestProposal(request: V5Request): Promise<V5NativeRequest>;
  createImmutableRequest(request: V5NativeRequest): Promise<void>;
  readImmutableRequest(key: string): Promise<V5NativeRequest | undefined>;
  now(): string;
}
export interface V5ClientState {
  phase: 'HOLD' | 'Recording' | 'Processing' | 'Submitted'; message: string; key?: string;
}
export interface V5RetainedIntent { admission: V5Admission; admissionBody: string }
export interface V5SyntheticHostPorts extends V5CapturedBytePort {
  readImmutableRequest(key: string): Promise<V5NativeRequest | undefined>;
}
