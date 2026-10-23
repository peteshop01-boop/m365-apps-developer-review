import { BEHAVIOUR_FRAMEWORK_V2_VERSION, type BehaviourV2ValueId } from '../models/BehaviourFrameworkV2Models';
import { canonicaliseC2b, c2bUtf8ByteLength, hashC2bCanonical } from './TestPilotCommandAdmissionC2b';
import { normaliseEmployeeBehaviourCustomObjective } from './EmployeeBehaviourSelection';

export const BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA = 'kcf.behaviour.v02.selections.v1' as const;
export const BEHAVIOUR_V2_SELECTION_SNAPSHOT_MAX_BYTES = 1000000;

export interface IBehaviourCatalogueSelectionSnapshotV2 {
  source: 'Catalogue';
  selectionKey: string;
  catalogueKey: string;
  catalogueVersion: string;
  catalogueRevision: number;
  targetKey: string;
  focusKey: string;
  behaviourKey: BehaviourV2ValueId;
  roleLevelCode: 'L1' | 'L2' | 'L3';
  focusArea: string;
  selectedExampleText: string;
  commitment: string;
  howWillWeKnow: string;
}

export interface IBehaviourOwnSelectionSnapshotV2 {
  source: 'Own';
  selectionKey: string;
  behaviourKey: BehaviourV2ValueId;
  commitment: string;
  howWillWeKnow: string;
}

export type BehaviourSelectionSnapshotV2 = IBehaviourCatalogueSelectionSnapshotV2 | IBehaviourOwnSelectionSnapshotV2;
export interface IBehaviourSelectionSnapshotEnvelopeV2 {
  schemaVersion: typeof BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA;
  frameworkVersion: typeof BEHAVIOUR_FRAMEWORK_V2_VERSION;
  valueId: BehaviourV2ValueId;
  selections: readonly BehaviourSelectionSnapshotV2[];
}

const catalogueKeyPattern = /^BHV-0[1-5]-L[1-3]-0[1-9][0-9]*$/;
const ownKeyPattern = /^BHV-0[1-5]-OWN-[A-Z0-9][A-Z0-9-]{5,39}$/;
const exactKeys = (value: object, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};
const visible = (value: unknown): value is string => typeof value === 'string'
  && normaliseEmployeeBehaviourCustomObjective(value) === value;

export const assertBehaviourSelectionSnapshotEnvelopeV2 = (
  value: unknown
): IBehaviourSelectionSnapshotEnvelopeV2 => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !exactKeys(value, ['schemaVersion', 'frameworkVersion', 'valueId', 'selections'])) {
    throw new Error('Behaviour v02 selection snapshot envelope is malformed.');
  }
  const envelope = value as IBehaviourSelectionSnapshotEnvelopeV2;
  if (envelope.schemaVersion !== BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA
    || envelope.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION
    || !/^BHV-0[1-5]$/.test(envelope.valueId) || !Array.isArray(envelope.selections)) {
    throw new Error('Behaviour v02 selection snapshot identity is crossed.');
  }
  const keys = new Set<string>();
  envelope.selections.forEach(selection => {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)
      || !visible(selection.commitment) || !visible(selection.howWillWeKnow)
      || selection.behaviourKey !== envelope.valueId || keys.has(selection.selectionKey)) {
      throw new Error('Behaviour v02 selection snapshot text or Value is invalid.');
    }
    keys.add(selection.selectionKey);
    if (selection.source === 'Catalogue') {
      if (!exactKeys(selection, ['source', 'selectionKey', 'catalogueKey', 'catalogueVersion',
        'catalogueRevision', 'targetKey', 'focusKey', 'behaviourKey', 'roleLevelCode',
        'focusArea', 'selectedExampleText', 'commitment', 'howWillWeKnow'])
        || !catalogueKeyPattern.test(selection.selectionKey)
        || selection.selectionKey !== selection.targetKey
        || !selection.selectionKey.startsWith(`${envelope.valueId}-${selection.roleLevelCode}-`)
        || selection.catalogueKey !== 'KCF-KCCC-BEHAVIOUR-FOCUS'
        || !visible(selection.catalogueVersion)
        || !Number.isSafeInteger(selection.catalogueRevision) || selection.catalogueRevision < 1
        || !/^BHV-0[1-5]-FOCUS-0[1-9][0-9]*$/.test(selection.focusKey)
        || !selection.focusKey.startsWith(envelope.valueId)
        || !visible(selection.focusArea) || !visible(selection.selectedExampleText)) {
        throw new Error('Behaviour v02 catalogue snapshot provenance is invalid.');
      }
    } else if (selection.source === 'Own') {
      if (!exactKeys(selection, ['source', 'selectionKey', 'behaviourKey', 'commitment', 'howWillWeKnow'])
        || !ownKeyPattern.test(selection.selectionKey)
        || !selection.selectionKey.startsWith(envelope.valueId)) {
        throw new Error('Behaviour v02 own selection snapshot is invalid.');
      }
    } else {
      throw new Error('Behaviour v02 selection source is unknown.');
    }
  });
  if (envelope.selections.some((selection, index) => index > 0
    && envelope.selections[index - 1].selectionKey.localeCompare(selection.selectionKey) >= 0)) {
    throw new Error('Behaviour v02 selection snapshots must be sorted by stable key.');
  }
  return envelope;
};

export const encodeBehaviourSelectionSnapshotsV2 = (value: IBehaviourSelectionSnapshotEnvelopeV2): {
  json: string; sha256: string; utf8ByteLength: number; catalogueKeys: string[]
} => {
  const envelope = assertBehaviourSelectionSnapshotEnvelopeV2(value);
  const json = canonicaliseC2b(envelope);
  const utf8ByteLength = c2bUtf8ByteLength(json);
  if (utf8ByteLength > BEHAVIOUR_V2_SELECTION_SNAPSHOT_MAX_BYTES) {
    throw new Error('Behaviour v02 selection snapshot exceeds the 1,000,000-byte physical limit.');
  }
  return { json, sha256: hashC2bCanonical(envelope), utf8ByteLength,
    catalogueKeys: envelope.selections.filter(selection => selection.source === 'Catalogue')
      .map(selection => selection.selectionKey) };
};

export const decodeBehaviourSelectionSnapshotsV2 = (
  json: string, sha256: string, utf8ByteLength: number
): IBehaviourSelectionSnapshotEnvelopeV2 => {
  let parsed: unknown;
  try { parsed = JSON.parse(json) as unknown; }
  catch { throw new Error('Behaviour v02 selection snapshot JSON is invalid.'); }
  const envelope = assertBehaviourSelectionSnapshotEnvelopeV2(parsed);
  const encoded = encodeBehaviourSelectionSnapshotsV2(envelope);
  if (encoded.json !== json || encoded.sha256 !== sha256 || encoded.utf8ByteLength !== utf8ByteLength) {
    throw new Error('Behaviour v02 selection snapshot canonical digest or size is invalid.');
  }
  return envelope;
};
