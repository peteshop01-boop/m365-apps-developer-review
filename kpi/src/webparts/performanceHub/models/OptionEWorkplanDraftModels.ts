export const OPTION_E_DRAFT_SCHEMA_VERSION = 'kcf.workplan-draft/v1' as const;
export const OPTION_E_DRAFT_MAX_UTF8_BYTES = 56000;
export const OPTION_E_BEHAVIOUR_FRAMEWORK_VERSION = 'KCCC-BEHAVIOUR|v02' as const;
export const OPTION_E_BEHAVIOUR_VALUE_IDS = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const;
export const OPTION_E_GOVERNED_BEHAVIOUR_EXTENSION_VERSION = 'kcf.option-e.behaviours/v02' as const;
export const OPTION_E_GOVERNED_BEHAVIOUR_APPROVAL = 'KCF-KPI-Sponsor-BEH-V02-001' as const;

export type OptionECoreRole = 'Owner' | 'Delivery' | 'Support';
export type OptionEContributionMethod = 'AdditiveDirect' | 'SharedTarget' | 'WeightedDenominator' | 'AccountableOwner' | 'CompletionOversight';
export type OptionECoreWeightingMode = 'Equal' | 'Custom';
export type OptionETargetValue = string | number;
export type OptionEBehaviourValueId = typeof OPTION_E_BEHAVIOUR_VALUE_IDS[number];

export interface IOptionECoreTarget {
  value?: OptionETargetValue;
  success?: string;
}

export interface IOptionECoreDraftEntry {
  coreId: string;
  kpiId: string;
  kpiVersionKey: string;
  targetVersionKey: string;
  role: OptionECoreRole;
  contributionMethod: OptionEContributionMethod;
  weightPercent: number;
  annual: IOptionECoreTarget;
  q1: IOptionECoreTarget;
  q2: IOptionECoreTarget;
  q3: IOptionECoreTarget;
  q4: IOptionECoreTarget;
}

export interface IOptionEImpactDraftEntry {
  impactId: string;
  wording: string;
  measure: string;
  unit: string;
  annual?: OptionETargetValue;
  q1?: OptionETargetValue;
  q2?: OptionETargetValue;
  q3?: OptionETargetValue;
  q4?: OptionETargetValue;
  success: string;
}

export interface IOptionEBehaviourDraftEntry {
  valueId: OptionEBehaviourValueId;
  descriptorKey: string;
  guidancePromptKeys: string[];
  selectedPromptKeys: string[];
  commitment: string;
  periodCommitments: Readonly<Record<'Q1' | 'Q2' | 'Q3' | 'Q4', string>>;
}

export type OptionEBehaviourRoleLevelCode = 'L1' | 'L2' | 'L3';

export interface IOptionEBehaviourCatalogueAuthority {
  catalogueId: string;
  catalogueVersion: string;
  catalogueRevision: number;
  catalogueEtag: string;
  catalogueContentSha256: string;
  approvalReference: typeof OPTION_E_GOVERNED_BEHAVIOUR_APPROVAL;
}

export interface IOptionEBehaviourSelectionSnapshot {
  selectionKey: string;
  source: 'Catalogue' | 'Own';
  behaviourKey: OptionEBehaviourValueId;
  headlineTitle: string;
  focusKey: string;
  focusTitle: string;
  roleLevelCode: OptionEBehaviourRoleLevelCode;
  targetKey?: string;
  selectedWording: string;
  catalogueId: string;
  catalogueVersion: string;
  catalogueRevision: number;
  catalogueEtag: string;
  catalogueContentSha256: string;
  myCommitment: string;
  howWillWeKnow: string;
}

export interface IOptionEBehaviourHeadlineSnapshot {
  behaviourKey: OptionEBehaviourValueId;
  headlineTitle: string;
  selections: IOptionEBehaviourSelectionSnapshot[];
}

/**
 * Explicit governed extension carried inside the accepted Option E payload.
 * Legacy v1 payloads remain readable but are not writable until this extension
 * has been rebuilt from the current approved catalogue and authenticated role.
 */
export interface IOptionEGovernedBehaviourExtension {
  schemaVersion: typeof OPTION_E_GOVERNED_BEHAVIOUR_EXTENSION_VERSION;
  authority: IOptionEBehaviourCatalogueAuthority;
  roleLevelCode: OptionEBehaviourRoleLevelCode;
  headlines: IOptionEBehaviourHeadlineSnapshot[];
  immutableSelectionSnapshots: true;
  legacyTargetRatingWeightFieldsWritten: false;
  deliveryArithmeticAffected: false;
}

/**
 * Employee-owned content only. Person, manager, role/permission, list, item and
 * evidence identities are deliberately absent: the authenticated row and ACL
 * remain the authority.
 */
export interface IOptionEWorkplanDraftAggregate {
  schemaVersion: typeof OPTION_E_DRAFT_SCHEMA_VERSION;
  core: {
    weightingMode: OptionECoreWeightingMode;
    entries: IOptionECoreDraftEntry[];
  };
  impact: IOptionEImpactDraftEntry[];
  behaviours: {
    frameworkVersion: typeof OPTION_E_BEHAVIOUR_FRAMEWORK_VERSION;
    roleTier: string;
    entries: IOptionEBehaviourDraftEntry[];
    governedExtension?: IOptionEGovernedBehaviourExtension;
  };
}

export type OptionEDraftValidationCode =
  | 'DraftPayloadInvalid'
  | 'DraftPayloadTooLarge';

export class OptionEDraftValidationError extends Error {
  public constructor(public readonly code: OptionEDraftValidationCode, message: string) {
    super(message);
    this.name = 'OptionEDraftValidationError';
    Object.setPrototypeOf(this, OptionEDraftValidationError.prototype);
  }
}

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};
const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void => {
  const allowed = [...required, ...optional];
  const keys = Object.keys(value);
  const missing = required.filter(key => !own(value, key));
  const extra = keys.filter(key => allowed.indexOf(key) < 0);
  if (missing.length || extra.length) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid',
      `${label} has unknown or missing fields${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; unknown ${extra.join(', ')}` : ''}.`);
  }
};
const nonBlank = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} must be a non-blank string.`);
  }
  return value;
};
const targetValue = (value: unknown, label: string): void => {
  if (value === undefined) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string') return;
  throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} must be a finite number, string or missing.`);
};
const distinctNonBlank = (values: unknown, expectedCount: number | undefined, label: string): string[] => {
  if (!Array.isArray(values) || (expectedCount !== undefined && values.length !== expectedCount)) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid',
      `${label} must contain ${expectedCount === undefined ? 'an array of' : `exactly ${expectedCount}`} stable keys.`);
  }
  const strings = values.map((value, index) => nonBlank(value, `${label}[${index}]`));
  if (new Set(strings).size !== strings.length) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} must contain distinct stable keys.`);
  }
  return strings;
};

const validateCoreTarget = (value: unknown, label: string): void => {
  const item = record(value, label);
  exactKeys(item, [], ['value', 'success'], label);
  targetValue(own(item, 'value') ? item.value : undefined, `${label}.value`);
  const success = own(item, 'success') ? item.success : undefined;
  if (success !== undefined && typeof success !== 'string') {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.success must be a string or missing.`);
  }
};

const validateCore = (value: unknown, partial = false): void => {
  const core = record(value, 'core');
  exactKeys(core, ['weightingMode', 'entries'], [], 'core');
  if (core.weightingMode !== 'Equal' && core.weightingMode !== 'Custom') {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'core.weightingMode must be Equal or Custom.');
  }
  if (!Array.isArray(core.entries)) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'core.entries must be an array.');
  }
  const coreIds: string[] = [];
  const kpiIds: string[] = [];
  const weights: number[] = [];
  core.entries.forEach((candidate, index) => {
    const label = `core.entries[${index}]`;
    const entry = record(candidate, label);
    exactKeys(entry, ['coreId', 'kpiId', 'kpiVersionKey', 'targetVersionKey', 'role', 'contributionMethod',
      'weightPercent', 'annual', 'q1', 'q2', 'q3', 'q4'], [], label);
    coreIds.push(nonBlank(entry.coreId, `${label}.coreId`));
    kpiIds.push(nonBlank(entry.kpiId, `${label}.kpiId`));
    if (partial) {
      if (typeof entry.kpiVersionKey !== 'string' || typeof entry.targetVersionKey !== 'string') {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} KPI and target versions must be strings.`);
      }
    } else {
      nonBlank(entry.kpiVersionKey, `${label}.kpiVersionKey`);
      nonBlank(entry.targetVersionKey, `${label}.targetVersionKey`);
    }
    if (['Owner', 'Delivery', 'Support'].indexOf(String(entry.role)) < 0 && !(partial && entry.role === '')) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.role is not approved.`);
    }
    if (['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight']
      .indexOf(String(entry.contributionMethod)) < 0 && !(partial && entry.contributionMethod === '')) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.contributionMethod is not approved.`);
    }
    if (typeof entry.weightPercent !== 'number' || !Number.isFinite(entry.weightPercent)
      || entry.weightPercent < 0 || entry.weightPercent > 100 || Math.round(entry.weightPercent * 100) !== entry.weightPercent * 100) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.weightPercent must be a non-negative percentage with at most two decimals.`);
    }
    weights.push(entry.weightPercent);
    ['annual', 'q1', 'q2', 'q3', 'q4'].forEach(key => validateCoreTarget(entry[key], `${label}.${key}`));
  });
  if (new Set(coreIds).size !== coreIds.length || new Set(kpiIds).size !== kpiIds.length) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Core stable IDs and KPI IDs must be unique.');
  }
  if (!partial && weights.length > 0 && weights.reduce((sum, weight) => sum + Math.round(weight * 100), 0) !== 10000) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Active Core weights must total exactly 100.00%.');
  }
  if (!partial && core.weightingMode === 'Equal' && weights.length > 0) {
    const expected = Array.from({ length: weights.length }, (_, index) =>
      Math.floor(100 / weights.length) + (index < 100 % weights.length ? 1 : 0));
    if (weights.some((weight, index) => weight !== expected[index])) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Equal Core weights must match the deterministic whole-percent allocation.');
    }
  }
};

const validateImpact = (value: unknown, partial = false): void => {
  if (!Array.isArray(value)) throw new OptionEDraftValidationError('DraftPayloadInvalid', 'impact must be an array.');
  const ids: string[] = [];
  value.forEach((candidate, index) => {
    const label = `impact[${index}]`;
    const entry = record(candidate, label);
    exactKeys(entry, ['impactId', 'wording', 'measure', 'unit', 'success'], ['annual', 'q1', 'q2', 'q3', 'q4'], label);
    ids.push(nonBlank(entry.impactId, `${label}.impactId`));
    if (partial) {
      if (typeof entry.wording !== 'string' || typeof entry.measure !== 'string') {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.wording and measure must be strings.`);
      }
    } else {
      nonBlank(entry.wording, `${label}.wording`);
      nonBlank(entry.measure, `${label}.measure`);
    }
    if (typeof entry.unit !== 'string' || typeof entry.success !== 'string') {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.unit and success must be strings.`);
    }
    ['annual', 'q1', 'q2', 'q3', 'q4'].forEach(key => targetValue(entry[key], `${label}.${key}`));
  });
  if (new Set(ids).size !== ids.length) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'IMPACT stable IDs must be unique.');
  }
};

const validateBehaviours = (value: unknown, partial = false): void => {
  const behaviours = record(value, 'behaviours');
  exactKeys(behaviours, ['frameworkVersion', 'roleTier', 'entries'], ['governedExtension'], 'behaviours');
  if (behaviours.frameworkVersion !== OPTION_E_BEHAVIOUR_FRAMEWORK_VERSION) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', `behaviours.frameworkVersion must be ${OPTION_E_BEHAVIOUR_FRAMEWORK_VERSION}.`);
  }
  if (partial) {
    if (typeof behaviours.roleTier !== 'string') throw new OptionEDraftValidationError('DraftPayloadInvalid', 'behaviours.roleTier must be a string.');
  } else nonBlank(behaviours.roleTier, 'behaviours.roleTier');
  if (!Array.isArray(behaviours.entries) || (partial ? behaviours.entries.length > OPTION_E_BEHAVIOUR_VALUE_IDS.length : behaviours.entries.length !== OPTION_E_BEHAVIOUR_VALUE_IDS.length)) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Exactly five governed Behaviour Values are required.');
  }
  const ids: string[] = [];
  behaviours.entries.forEach((candidate, index) => {
    const label = `behaviours.entries[${index}]`;
    const entry = record(candidate, label);
    exactKeys(entry, ['valueId', 'descriptorKey', 'guidancePromptKeys', 'selectedPromptKeys', 'commitment', 'periodCommitments'], [], label);
    const valueId = nonBlank(entry.valueId, `${label}.valueId`);
    ids.push(valueId);
    if (valueId !== OPTION_E_BEHAVIOUR_VALUE_IDS[index]) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Behaviour Values must be BHV-01 to BHV-05 in governed order.');
    }
    if (partial) {
      if (typeof entry.descriptorKey !== 'string') throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.descriptorKey must be a string.`);
    } else nonBlank(entry.descriptorKey, `${label}.descriptorKey`);
    const guidance = distinctNonBlank(entry.guidancePromptKeys, partial ? undefined : 5, `${label}.guidancePromptKeys`);
    const selected = distinctNonBlank(entry.selectedPromptKeys, undefined, `${label}.selectedPromptKeys`);
    if (selected.some(key => guidance.indexOf(key) < 0)) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.selectedPromptKeys must be governed guidance keys.`);
    }
    if (typeof entry.commitment !== 'string') {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.commitment must be a string.`);
    }
    const periods = record(entry.periodCommitments, `${label}.periodCommitments`);
    exactKeys(periods, ['Q1', 'Q2', 'Q3', 'Q4'], [], `${label}.periodCommitments`);
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(key => {
      if (typeof periods[key] !== 'string') {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.periodCommitments.${key} must be a string.`);
      }
    });
  });
  if (new Set(ids).size !== (partial ? ids.length : OPTION_E_BEHAVIOUR_VALUE_IDS.length)) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Behaviour Value IDs must be unique.');
  }
  if (behaviours.governedExtension !== undefined) validateGovernedBehaviourExtension(behaviours.governedExtension, partial);
};

const SHA256 = /^[A-F0-9]{64}$/;
const roleLevelCodes: readonly OptionEBehaviourRoleLevelCode[] = ['L1', 'L2', 'L3'];
const catalogueSelectionKey = /^BHV-0[1-5]-L[1-3]-0[1-9]\d*$/;
const ownSelectionKey = /^BHV-0[1-5]-OWN-[A-Z0-9][A-Z0-9-]{5,39}$/;
const focusKey = /^BHV-0[1-5]-FOCUS-0[1-9]\d*$/;

function validateGovernedBehaviourExtension(value: unknown, partial = false): void {
  const extension = record(value, 'behaviours.governedExtension');
  exactKeys(extension, ['schemaVersion', 'authority', 'roleLevelCode', 'headlines',
    'immutableSelectionSnapshots', 'legacyTargetRatingWeightFieldsWritten', 'deliveryArithmeticAffected'], [],
  'behaviours.governedExtension');
  if (extension.schemaVersion !== OPTION_E_GOVERNED_BEHAVIOUR_EXTENSION_VERSION
    || extension.immutableSelectionSnapshots !== true
    || extension.legacyTargetRatingWeightFieldsWritten !== false
    || extension.deliveryArithmeticAffected !== false
    || roleLevelCodes.indexOf(extension.roleLevelCode as OptionEBehaviourRoleLevelCode) < 0) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'The governed Behaviour extension identity or safety flags are invalid.');
  }
  const authority = record(extension.authority, 'behaviours.governedExtension.authority');
  exactKeys(authority, ['catalogueId', 'catalogueVersion', 'catalogueRevision', 'catalogueEtag',
    'catalogueContentSha256', 'approvalReference'], [], 'behaviours.governedExtension.authority');
  nonBlank(authority.catalogueId, 'behaviours.governedExtension.authority.catalogueId');
  nonBlank(authority.catalogueVersion, 'behaviours.governedExtension.authority.catalogueVersion');
  nonBlank(authority.catalogueEtag, 'behaviours.governedExtension.authority.catalogueEtag');
  if (!Number.isSafeInteger(authority.catalogueRevision) || Number(authority.catalogueRevision) < 1
    || !SHA256.test(String(authority.catalogueContentSha256))
    || authority.approvalReference !== OPTION_E_GOVERNED_BEHAVIOUR_APPROVAL) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'The governed Behaviour catalogue authority is invalid.');
  }
  if (!Array.isArray(extension.headlines) || extension.headlines.length !== OPTION_E_BEHAVIOUR_VALUE_IDS.length) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'The governed Behaviour extension must preserve all five headlines.');
  }
  const selectionKeys = new Set<string>();
  let selectionCount = 0;
  extension.headlines.forEach((candidate, headlineIndex) => {
    const headlineLabel = `behaviours.governedExtension.headlines[${headlineIndex}]`;
    const headline = record(candidate, headlineLabel);
    exactKeys(headline, ['behaviourKey', 'headlineTitle', 'selections'], [], headlineLabel);
    const expectedBehaviourKey = OPTION_E_BEHAVIOUR_VALUE_IDS[headlineIndex];
    if (headline.behaviourKey !== expectedBehaviourKey) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Governed Behaviour headlines must remain in the approved five-value order.');
    }
    nonBlank(headline.headlineTitle, `${headlineLabel}.headlineTitle`);
    if (!Array.isArray(headline.selections)) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', `${headlineLabel}.selections must be an array.`);
    }
    headline.selections.forEach((selectionCandidate, selectionIndex) => {
      selectionCount += 1;
      const label = `${headlineLabel}.selections[${selectionIndex}]`;
      const selection = record(selectionCandidate, label);
      exactKeys(selection, ['selectionKey', 'source', 'behaviourKey', 'headlineTitle', 'focusKey', 'focusTitle',
        'roleLevelCode', 'selectedWording', 'catalogueId', 'catalogueVersion', 'catalogueRevision', 'catalogueEtag',
        'catalogueContentSha256', 'myCommitment', 'howWillWeKnow'], ['targetKey'], label);
      const selectionKey = nonBlank(selection.selectionKey, `${label}.selectionKey`);
      if (selectionKeys.has(selectionKey) || selection.behaviourKey !== expectedBehaviourKey
        || selection.headlineTitle !== headline.headlineTitle || selection.roleLevelCode !== extension.roleLevelCode
        || selection.catalogueId !== authority.catalogueId || selection.catalogueVersion !== authority.catalogueVersion
        || selection.catalogueRevision !== authority.catalogueRevision || selection.catalogueEtag !== authority.catalogueEtag
        || selection.catalogueContentSha256 !== authority.catalogueContentSha256) {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} has crossed or duplicate governed identity.`);
      }
      selectionKeys.add(selectionKey);
      const governedFocusKey = nonBlank(selection.focusKey, `${label}.focusKey`);
      nonBlank(selection.focusTitle, `${label}.focusTitle`);
      nonBlank(selection.selectedWording, `${label}.selectedWording`);
      if (partial) {
        if (typeof selection.myCommitment !== 'string' || typeof selection.howWillWeKnow !== 'string') {
          throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} commitment and evidence must be strings.`);
        }
      } else {
        nonBlank(selection.myCommitment, `${label}.myCommitment`);
        nonBlank(selection.howWillWeKnow, `${label}.howWillWeKnow`);
      }
      if (selection.source === 'Catalogue') {
        if (!catalogueSelectionKey.test(selectionKey) || selection.targetKey !== selectionKey
          || !selectionKey.startsWith(`${expectedBehaviourKey}-${extension.roleLevelCode}-`)) {
          throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} catalogue selection identity is invalid.`);
        }
      } else if (selection.source === 'Own') {
        if (!ownSelectionKey.test(selectionKey) || selection.targetKey !== undefined
          || !selectionKey.startsWith(`${expectedBehaviourKey}-OWN-`)
          || !focusKey.test(governedFocusKey)
          || !governedFocusKey.startsWith(`${expectedBehaviourKey}-FOCUS-`)) {
          throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label} own-selection identity is invalid.`);
        }
      } else {
        throw new OptionEDraftValidationError('DraftPayloadInvalid', `${label}.source is invalid.`);
      }
    });
  });
  if ((!partial && selectionCount < 3) || selectionCount > 5) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Governed Behaviour selections must contain three to five commitments.');
  }
}

export const validateOptionEDraftAggregate: (value: unknown) => asserts value is IOptionEWorkplanDraftAggregate = (value: unknown): asserts value is IOptionEWorkplanDraftAggregate => {
  const aggregate = record(value, 'Draft aggregate');
  exactKeys(aggregate, ['schemaVersion', 'core', 'impact', 'behaviours'], [], 'Draft aggregate');
  if (aggregate.schemaVersion !== OPTION_E_DRAFT_SCHEMA_VERSION) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', `schemaVersion must be ${OPTION_E_DRAFT_SCHEMA_VERSION}.`);
  }
  validateCore(aggregate.core);
  validateImpact(aggregate.impact);
  validateBehaviours(aggregate.behaviours);
};

/** A Save Draft may contain unfinished employee fields. It must still keep exact
 * safe shape, stable IDs, acceptable value types and governed source identities.
 * Submit retains the stricter validateOptionEDraftAggregate checks above.
 */
export const validateOptionEPartialDraftAggregate: (value: unknown) => asserts value is IOptionEWorkplanDraftAggregate =
  (value: unknown): asserts value is IOptionEWorkplanDraftAggregate => {
    const aggregate = record(value, 'Draft aggregate');
    exactKeys(aggregate, ['schemaVersion', 'core', 'impact', 'behaviours'], [], 'Draft aggregate');
    if (aggregate.schemaVersion !== OPTION_E_DRAFT_SCHEMA_VERSION) {
      throw new OptionEDraftValidationError('DraftPayloadInvalid', 'Unsupported Draft schema version.');
    }
    validateCore(aggregate.core, true);
    validateImpact(aggregate.impact, true);
    validateBehaviours(aggregate.behaviours, true);
  };

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce((result, key) => {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = canonicalValue(child);
      return result;
    // The temporary output must not inherit setters/getters for valid own payload keys.
    // Sorted keys and JSON bytes remain identical for ordinary validated aggregates.
    }, Object.create(null) as Record<string, unknown>);
  }
  return value;
};

export const optionEUtf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
};

const canonicaliseValidatedOptionEDraft = (value: unknown): string => {
  const canonical = JSON.stringify(canonicalValue(value));
  const bytes = optionEUtf8ByteLength(canonical);
  if (bytes > OPTION_E_DRAFT_MAX_UTF8_BYTES) {
    throw new OptionEDraftValidationError('DraftPayloadTooLarge',
      `DraftPayloadTooLarge: canonical Draft payload is ${bytes} UTF-8 bytes; maximum is ${OPTION_E_DRAFT_MAX_UTF8_BYTES}.`);
  }
  return canonical;
};

export const canonicaliseOptionEDraft = (value: unknown): string => {
  validateOptionEDraftAggregate(value);
  return canonicaliseValidatedOptionEDraft(value);
};

export const canonicaliseOptionEPartialDraft = (value: unknown): string => {
  validateOptionEPartialDraftAggregate(value);
  return canonicaliseValidatedOptionEDraft(value);
};

export const parseCanonicalOptionEPartialDraft = (payloadJson: string): IOptionEWorkplanDraftAggregate => {
  let parsed: unknown;
  try { parsed = JSON.parse(payloadJson) as unknown; }
  catch { throw new OptionEDraftValidationError('DraftPayloadInvalid', 'DraftPayloadJSON is not valid JSON.'); }
  if (canonicaliseOptionEPartialDraft(parsed) !== payloadJson) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid',
      'DraftPayloadJSON is not the exact deterministic canonical representation.');
  }
  return parsed as IOptionEWorkplanDraftAggregate;
};

export const assertOptionEPartialDraftWritable = (aggregate: IOptionEWorkplanDraftAggregate): void => {
  validateOptionEPartialDraftAggregate(aggregate);
};

export const parseCanonicalOptionEDraft = (payloadJson: string): IOptionEWorkplanDraftAggregate => {
  let parsed: unknown;
  try { parsed = JSON.parse(payloadJson) as unknown; }
  catch { throw new OptionEDraftValidationError('DraftPayloadInvalid', 'DraftPayloadJSON is not valid JSON.'); }
  const canonical = canonicaliseOptionEDraft(parsed);
  if (canonical !== payloadJson) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid', 'DraftPayloadJSON is not the exact deterministic canonical representation.');
  }
  return parsed as IOptionEWorkplanDraftAggregate;
};

export const assertOptionEDraftWritable = (aggregate: IOptionEWorkplanDraftAggregate): void => {
  validateOptionEDraftAggregate(aggregate);
  if (!aggregate.behaviours.governedExtension) {
    throw new OptionEDraftValidationError('DraftPayloadInvalid',
      'Legacy Option E Draft content is read-only until the approved governed Behaviour extension is present.');
  }
};
