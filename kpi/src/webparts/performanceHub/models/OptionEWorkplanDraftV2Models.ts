import {
  OPTION_E_DRAFT_SCHEMA_VERSION, OptionEDraftValidationError, assertOptionEDraftWritable,
  validateOptionEDraftAggregate, validateOptionEPartialDraftAggregate,
  type IOptionEImpactDraftEntry, type IOptionEWorkplanDraftAggregate
} from './OptionEWorkplanDraftModels';
import { v4Etag } from '../services/OptionEWorkplanSubmitExactBodyV4Wire';

export const OPTION_E_DRAFT_V2_SCHEMA_VERSION = 'kcf.workplan-draft/v2' as const;
export const OPTION_E_DRAFT_V2_WIRE_VERSION = 'canonical-draft/v2' as const;
export const OPTION_E_DRAFT_V2_MAX_UTF8_BYTES = 56000;

/** Employee claims only. Protected Submit capture must independently resolve this identity. */
export interface IOptionEDraftTaxonomyPin {
  taxonomyId: string;
  version: string;
  etag: string;
  contentSha256: string;
}

export interface IOptionEImpactClassificationSelection {
  businessContributionAreaKey: string;
  strategicPillarKey?: string;
  taxonomyPin: IOptionEDraftTaxonomyPin;
}

export interface IOptionEImpactDraftEntryV2 extends IOptionEImpactDraftEntry {
  classificationSelection: IOptionEImpactClassificationSelection;
}

export interface IOptionEWorkplanDraftV2Aggregate {
  schemaVersion: typeof OPTION_E_DRAFT_V2_SCHEMA_VERSION;
  core: IOptionEWorkplanDraftAggregate['core'];
  impact: IOptionEImpactDraftEntryV2[];
  behaviours: IOptionEWorkplanDraftAggregate['behaviours'];
}

const invalid = (message: string): never => { throw new OptionEDraftValidationError('DraftPayloadInvalid', message); };
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void => {
  if (required.some(key => !Object.prototype.hasOwnProperty.call(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
    invalid(`${label} has unknown or missing fields.`);
  }
};
const nonBlank = (value: unknown, label: string): void => {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} must be a non-blank string.`);
};

/** Private validation projection only; never a persisted draft or Save payload. */
const validationProjection = (aggregate: IOptionEWorkplanDraftV2Aggregate): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: OPTION_E_DRAFT_SCHEMA_VERSION,
  core: aggregate.core,
  impact: aggregate.impact.map(entry => Object.fromEntries(
    Object.entries(entry).filter(([key]) => key !== 'classificationSelection')
  ) as unknown as IOptionEImpactDraftEntry),
  behaviours: aggregate.behaviours
});

const validateAggregate = (value: unknown, partial: boolean): void => {
    const aggregate = record(value, 'DraftV2 aggregate');
    exact(aggregate, ['schemaVersion', 'core', 'impact', 'behaviours'], [], 'DraftV2 aggregate');
    if (aggregate.schemaVersion !== OPTION_E_DRAFT_V2_SCHEMA_VERSION) invalid('DraftV2 schemaVersion is invalid.');
    if (!Array.isArray(aggregate.impact)) invalid('impact must be an array.');
    let firstPin: Record<string, unknown> | undefined;
    (aggregate.impact as unknown[]).forEach((candidate, index) => {
      const label = `impact[${index}]`;
      const entry = record(candidate, label);
      exact(entry, ['impactId', 'wording', 'measure', 'unit', 'success', 'classificationSelection'],
        ['annual', 'q1', 'q2', 'q3', 'q4'], label);
      const selection = record(entry.classificationSelection, `${label}.classificationSelection`);
      exact(selection, ['businessContributionAreaKey', 'taxonomyPin'], ['strategicPillarKey'], `${label}.classificationSelection`);
      nonBlank(selection.businessContributionAreaKey, `${label}.businessContributionAreaKey`);
      if (Object.prototype.hasOwnProperty.call(selection, 'strategicPillarKey')) {
        nonBlank(selection.strategicPillarKey, `${label}.strategicPillarKey`);
      }
      const pin = record(selection.taxonomyPin, `${label}.taxonomyPin`);
      const pinKeys = ['taxonomyId', 'version', 'etag', 'contentSha256'];
      exact(pin, pinKeys, [], `${label}.taxonomyPin`);
      nonBlank(pin.taxonomyId, `${label}.taxonomyId`);
      nonBlank(pin.version, `${label}.version`);
      if (!v4Etag(pin.etag) || typeof pin.contentSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(pin.contentSha256)) {
        invalid(`${label}.taxonomyPin requires a strong ETag and SHA256 identity.`);
      }
      if (firstPin && pinKeys.some(key => pin[key] !== firstPin![key])) invalid('Impact entries have crossed taxonomy pins.');
      firstPin = pin;
    });
    const projection = validationProjection(value as IOptionEWorkplanDraftV2Aggregate);
    if (partial) validateOptionEPartialDraftAggregate(projection);
    else validateOptionEDraftAggregate(projection);
  };

export const validateOptionEDraftV2Aggregate: (value: unknown) => asserts value is IOptionEWorkplanDraftV2Aggregate =
  (value: unknown): asserts value is IOptionEWorkplanDraftV2Aggregate => validateAggregate(value, false);

/** Save accepts unfinished employee content; classification pins and stable IDs remain exact. */
export const validateOptionEPartialDraftV2Aggregate: (value: unknown) => asserts value is IOptionEWorkplanDraftV2Aggregate =
  (value: unknown): asserts value is IOptionEWorkplanDraftV2Aggregate => validateAggregate(value, true);

export const assertOptionEPartialDraftV2Writable = (aggregate: IOptionEWorkplanDraftV2Aggregate): void => {
  validateOptionEPartialDraftV2Aggregate(aggregate);
};

export const assertOptionEDraftV2Writable = (aggregate: IOptionEWorkplanDraftV2Aggregate): void => {
  validateOptionEDraftV2Aggregate(aggregate);
  assertOptionEDraftWritable(validationProjection(aggregate));
};
