import {
  OPTION_E_DRAFT_SCHEMA_VERSION, OptionEDraftValidationError, canonicaliseOptionEPartialDraft,
  parseCanonicalOptionEPartialDraft, type IOptionEWorkplanDraftAggregate
} from '../models/OptionEWorkplanDraftModels';
import { OPTION_E_DRAFT_V2_SCHEMA_VERSION, type IOptionEWorkplanDraftV2Aggregate } from '../models/OptionEWorkplanDraftV2Models';
import type { IOptionEDraftHasher } from './OptionEDraftSharePointGateway';
import { canonicaliseOptionEPartialDraftV2, parseCanonicalOptionEPartialDraftV2 } from './OptionEWorkplanDraftV2Wire';

export type ClosedPartialDraft = IOptionEWorkplanDraftAggregate | IOptionEWorkplanDraftV2Aggregate;
export type PreparedClosedPartialDraft =
  | { schemaVersion: 'kcf.workplan-draft/v1'; aggregate: IOptionEWorkplanDraftAggregate; payloadJson: string; payloadSha256: string }
  | { schemaVersion: 'kcf.workplan-draft/v2'; aggregate: IOptionEWorkplanDraftV2Aggregate; payloadJson: string; payloadSha256: string };

const hashHex = (value: string): string => {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Draft payload hash must be SHA-256 hexadecimal.');
  }
  return value.toUpperCase();
};

const parseSelectedPayload = (
  schemaVersion: ClosedPartialDraft['schemaVersion'], payloadJson: string
): Omit<Extract<PreparedClosedPartialDraft, { schemaVersion: 'kcf.workplan-draft/v1' }>, 'payloadSha256'>
  | Omit<Extract<PreparedClosedPartialDraft, { schemaVersion: 'kcf.workplan-draft/v2' }>, 'payloadSha256'> => {
  switch (schemaVersion) {
    case OPTION_E_DRAFT_SCHEMA_VERSION:
      return { schemaVersion, aggregate: parseCanonicalOptionEPartialDraft(payloadJson), payloadJson };
    case OPTION_E_DRAFT_V2_SCHEMA_VERSION:
      return { schemaVersion, aggregate: parseCanonicalOptionEPartialDraftV2(payloadJson), payloadJson };
    default:
      throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Unsupported partial Draft schema version.');
  }
};

/** Prepares an internal payload, never a native Saved receipt. Each sealed codec
 * owns its bytes and validation. Capture and detach before awaiting the hasher. */
export const prepareClosedPartialDraft = async (
  value: ClosedPartialDraft, hasher: IOptionEDraftHasher
): Promise<PreparedClosedPartialDraft> => {
  const schemaVersion = value.schemaVersion;
  let payloadJson: string;
  switch (schemaVersion) {
    case OPTION_E_DRAFT_SCHEMA_VERSION:
      payloadJson = canonicaliseOptionEPartialDraft(value);
      break;
    case OPTION_E_DRAFT_V2_SCHEMA_VERSION:
      payloadJson = canonicaliseOptionEPartialDraftV2(value);
      break;
    default:
      throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Unsupported partial Draft schema version.');
  }
  const parsed = parseSelectedPayload(schemaVersion, payloadJson);
  const payloadSha256 = hashHex(await hasher.sha256Hex(payloadJson));
  return { ...parsed, payloadSha256 };
};

/** Reopens only the supplied version and exact canonical bytes. No fallback,
 * implicit migration or persisted V2-to-V1 validation projection. */
export const reopenClosedPartialDraft = async (
  schemaVersion: ClosedPartialDraft['schemaVersion'], payloadJson: string, expectedSha256: string, hasher: IOptionEDraftHasher
): Promise<PreparedClosedPartialDraft> => {
  const parsed = parseSelectedPayload(schemaVersion, payloadJson);
  const expected = hashHex(expectedSha256);
  const payloadSha256 = hashHex(await hasher.sha256Hex(payloadJson));
  if (payloadSha256 !== expected) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Draft payload hash does not match its exact canonical bytes.');
  }
  return { ...parsed, payloadSha256 };
};
