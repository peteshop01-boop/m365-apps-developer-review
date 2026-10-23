import { OptionEDraftValidationError } from '../models/OptionEWorkplanDraftModels';
import {
  OPTION_E_DRAFT_V2_MAX_UTF8_BYTES, OPTION_E_DRAFT_V2_SCHEMA_VERSION,
  validateOptionEDraftV2Aggregate, validateOptionEPartialDraftV2Aggregate, type IOptionEWorkplanDraftV2Aggregate
} from '../models/OptionEWorkplanDraftV2Models';
import {
  V4_DRAFT_SCHEMA, assertV4Schema, v4Canonical, parseV4Canonical, decodeV4Utf8, BufferByteLength
} from './OptionEWorkplanSubmitExactBodyV4Wire';

// Clone the schema graph so even the retained Core/Behaviour nodes remain independent.
const schema = JSON.parse(JSON.stringify(V4_DRAFT_SCHEMA)) as {
  properties: {
    schemaVersion: { const: string };
    impact: { items: { required: string[]; properties: Record<string, unknown> } };
  };
};
schema.properties.schemaVersion.const = OPTION_E_DRAFT_V2_SCHEMA_VERSION;
schema.properties.impact.items.required = [...schema.properties.impact.items.required, 'classificationSelection'].sort();
schema.properties.impact.items.properties.classificationSelection = {
  type: 'object', additionalProperties: false,
  required: ['businessContributionAreaKey', 'taxonomyPin'],
  properties: {
    businessContributionAreaKey: { type: 'string' }, strategicPillarKey: { type: 'string' },
    taxonomyPin: {
      type: 'object', additionalProperties: false, required: ['contentSha256', 'etag', 'taxonomyId', 'version'],
      properties: {
        taxonomyId: { type: 'string' }, version: { type: 'string' }, etag: { type: 'string' }, contentSha256: { type: 'string' }
      }
    }
  }
};
export const DRAFT_V2_SCHEMA: object = schema;

// Separate Save schema: never relax the sealed Submit declaration or its validators.
const partialSchema = JSON.parse(JSON.stringify(schema)) as {
  properties: { core: { properties: { entries: { items: { properties: {
    role: { enum: string[] }; contributionMethod: { enum: string[] };
  } } } } } };
};
partialSchema.properties.core.properties.entries.items.properties.role.enum.push('');
partialSchema.properties.core.properties.entries.items.properties.contributionMethod.enum.push('');
export const PARTIAL_DRAFT_V2_SCHEMA: object = partialSchema;

const guarded = <T>(operation: () => T): T => {
  try { return operation(); }
  catch (error) {
    if (error instanceof OptionEDraftValidationError) throw error;
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'DraftV2 is not the exact valid canonical representation.');
  }
};
const assertSize = (bytes: number): void => {
  if (bytes > OPTION_E_DRAFT_V2_MAX_UTF8_BYTES) {
    throw new OptionEDraftValidationError('DraftPayloadTooLarge',
      `DraftPayloadTooLarge: canonical DraftV2 payload is ${bytes} UTF-8 bytes; maximum is ${OPTION_E_DRAFT_V2_MAX_UTF8_BYTES}.`);
  }
};

export const canonicaliseOptionEDraftV2 = (value: unknown): string => guarded(() => {
  validateOptionEDraftV2Aggregate(value);
  assertV4Schema(value, DRAFT_V2_SCHEMA);
  const body = v4Canonical(value);
  assertSize(BufferByteLength(body));
  parseV4Canonical(body);
  return body;
});

export const parseCanonicalOptionEDraftV2 = (body: string): IOptionEWorkplanDraftV2Aggregate => guarded(() => {
  assertSize(BufferByteLength(body));
  const value = parseV4Canonical(body);
  assertV4Schema(value, DRAFT_V2_SCHEMA);
  validateOptionEDraftV2Aggregate(value);
  return value;
});

export const decodeOptionEDraftV2Utf8 = (bytes: Uint8Array): string => guarded(() => {
  assertSize(bytes.length);
  const body = decodeV4Utf8(bytes);
  parseCanonicalOptionEDraftV2(body);
  return body;
});

/** Lossless Save wire only; strict V2/V4/V5 submission paths remain unchanged. */
export const canonicaliseOptionEPartialDraftV2 = (value: unknown): string => guarded(() => {
  validateOptionEPartialDraftV2Aggregate(value);
  assertV4Schema(value, PARTIAL_DRAFT_V2_SCHEMA);
  const body = v4Canonical(value);
  assertSize(BufferByteLength(body));
  parseV4Canonical(body);
  return body;
});

export const parseCanonicalOptionEPartialDraftV2 = (body: string): IOptionEWorkplanDraftV2Aggregate => guarded(() => {
  assertSize(BufferByteLength(body));
  const value = parseV4Canonical(body);
  assertV4Schema(value, PARTIAL_DRAFT_V2_SCHEMA);
  validateOptionEPartialDraftV2Aggregate(value);
  return value;
});

export const decodeOptionEPartialDraftV2Utf8 = (bytes: Uint8Array): string => guarded(() => {
  assertSize(bytes.length);
  const body = decodeV4Utf8(bytes);
  parseCanonicalOptionEPartialDraftV2(body);
  return body;
});
