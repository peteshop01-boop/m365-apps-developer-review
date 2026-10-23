import { OptionEDraftValidationError, optionEUtf8ByteLength } from '../models/OptionEWorkplanDraftModels';
import { OPTION_E_DRAFT_V3_SCHEMA_VERSION, OPTION_E_DRAFT_V3_MAX_UTF8_BYTES, validateOptionEPartialDraftV3Aggregate, type IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import type { IOptionEDraftHasher } from './OptionEDraftSharePointGateway';
export interface IPreparedPrivateDraftV3 {
    schemaVersion: typeof OPTION_E_DRAFT_V3_SCHEMA_VERSION;
    aggregate: IOptionEWorkplanDraftV3Aggregate;
    payloadJson: string;
    payloadSha256: string;
}
const assertSize = (body: string): void => {
    if (optionEUtf8ByteLength(body) > OPTION_E_DRAFT_V3_MAX_UTF8_BYTES) {
        throw new OptionEDraftValidationError('DraftPayloadTooLarge', 'Private Draft V3 exceeds 56000 UTF8 bytes.');
    }
};
const ordered = (value: unknown): unknown => {
    if (Array.isArray(value))
        return value.map(ordered);
    if (value && typeof value === 'object') {
        const source = value as Record<string, unknown>, result = Object.create(null) as Record<string, unknown>;
        Object.keys(source).sort().forEach(key => { if (source[key] !== undefined)
            result[key] = ordered(source[key]); });
        return result;
    }
    return value;
};
const digest = (hash: string): string => {
    if (typeof hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(hash)) {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Private Draft hash must be SHA-256 hexadecimal.');
    }
    return hash.toUpperCase();
};
export const canonicaliseOptionEPartialDraftV3 = (value: unknown): string => {
    validateOptionEPartialDraftV3Aggregate(value);
    const body = JSON.stringify(ordered(value));
    assertSize(body);
    return body;
};
export const parseCanonicalOptionEPartialDraftV3 = (body: string): IOptionEWorkplanDraftV3Aggregate => {
    if (typeof body !== 'string')
        throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Expected private Draft JSON.');
    assertSize(body);
    let value: unknown;
    try {
        value = JSON.parse(body) as unknown;
    }
    catch {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Invalid private Draft JSON.');
    }
    if (canonicaliseOptionEPartialDraftV3(value) !== body) {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Private Draft is not its exact canonical representation.');
    }
    return value as IOptionEWorkplanDraftV3Aggregate;
};
/** Internal unverified content receipt; never a native Saved/approved result. */
export const prepareOptionEPartialDraftV3 = async (value: IOptionEWorkplanDraftV3Aggregate, hasher: IOptionEDraftHasher): Promise<IPreparedPrivateDraftV3> => {
    const payloadJson = canonicaliseOptionEPartialDraftV3(value);
    const aggregate = parseCanonicalOptionEPartialDraftV3(payloadJson);
    const payloadSha256 = digest(await hasher.sha256Hex(payloadJson));
    return { schemaVersion: OPTION_E_DRAFT_V3_SCHEMA_VERSION, aggregate, payloadJson, payloadSha256 };
};
export const reopenOptionEPartialDraftV3 = async (schemaVersion: typeof OPTION_E_DRAFT_V3_SCHEMA_VERSION, body: string, expectedSha256: string, hasher: IOptionEDraftHasher): Promise<IPreparedPrivateDraftV3> => {
    if (schemaVersion !== OPTION_E_DRAFT_V3_SCHEMA_VERSION)
        throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Unsupported private Draft version.');
    const aggregate = parseCanonicalOptionEPartialDraftV3(body), expected = digest(expectedSha256);
    const payloadSha256 = digest(await hasher.sha256Hex(body));
    if (payloadSha256 !== expected)
        throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Private Draft hash does not match its canonical bytes.');
    return { schemaVersion: OPTION_E_DRAFT_V3_SCHEMA_VERSION, aggregate, payloadJson: body, payloadSha256 };
};
