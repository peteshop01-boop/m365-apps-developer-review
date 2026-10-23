import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_V2_VALUE_IDS } from '../models/BehaviourFrameworkV2Models';

export const QUARTER_BEHAVIOUR_TARGET_FIELDS = [
  'behaviourAnnualTargetLevelV2', 'behaviourAnnualTargetJustificationV2',
  'behaviourAnnualTargetSourceWorkplanItemKeyV2', 'behaviourAnnualTargetSourceEtagV2',
  'behaviourAnnualTargetSourceWorkplanVersionV2', 'behaviourAnnualTargetSourceApprovalKeyV2'
] as const;
export type QuarterBehaviourTargetSnapshot = Readonly<Pick<IQuarterReviewItem,
  typeof QUARTER_BEHAVIOUR_TARGET_FIELDS[number]>>;
const invalid = (): never => { throw new Error('The frozen annual Behaviour Target or provenance is invalid, absent or changed.'); };

/** Read data descriptors only; never invoke a getter or trust an inherited authority field. */
export const ownSnapshotValue = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) return invalid();
  return descriptor.value;
};
const identity = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export const isSpecificBehaviourSourceEtag = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]+"$/.test(value);

/** Materialise validated scalars once. All absent is the historic unavailable state. */
export const materialiseQuarterBehaviourTarget = (item: unknown): QuarterBehaviourTargetSnapshot | undefined => {
  const values = QUARTER_BEHAVIOUR_TARGET_FIELDS.map(key => ownSnapshotValue(item, key));
  if (values.every(value => value === undefined)) return undefined;
  const [level, justification, sourceKey, etag, version, approval] = values;
  const snapshot = ownSnapshotValue(item, 'behaviourSnapshotV2');
  const valueId = ownSnapshotValue(snapshot, 'valueId');
  const period = ownSnapshotValue(snapshot, 'period');
  const quarter = ownSnapshotValue(item, 'quarter');
  if (!['Developing', 'Effective', 'Exceptional'].includes(level as string)
    || justification !== undefined && (typeof justification !== 'string' || !justification.trim() || justification.trim().length > 1000)
    || !identity(sourceKey) || sourceKey !== ownSnapshotValue(item, 'workplanItemKey')
    || !isSpecificBehaviourSourceEtag(etag)
    || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1
    || !identity(approval) || !identity(ownSnapshotValue(item, 'quarterReviewItemKey'))
    || !identity(ownSnapshotValue(item, 'workplanKey')) || !identity(ownSnapshotValue(item, 'personKey'))
    || !BEHAVIOUR_V2_VALUE_IDS.includes(valueId as typeof BEHAVIOUR_V2_VALUE_IDS[number])
    || valueId !== ownSnapshotValue(item, 'behaviourId')
    || ownSnapshotValue(snapshot, 'frameworkVersion') !== BEHAVIOUR_FRAMEWORK_V2_VERSION
    || !['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter as string)
    || period !== quarter && period !== (quarter === 'Q1' || quarter === 'Q2' ? 'H1' : 'H2')) return invalid();
  return Object.freeze({ behaviourAnnualTargetLevelV2: level as IQuarterReviewItem['behaviourAnnualTargetLevelV2'],
    behaviourAnnualTargetJustificationV2: justification as string | undefined,
    behaviourAnnualTargetSourceWorkplanItemKeyV2: sourceKey,
    behaviourAnnualTargetSourceEtagV2: etag,
    behaviourAnnualTargetSourceWorkplanVersionV2: version,
    behaviourAnnualTargetSourceApprovalKeyV2: approval });
};

/** Invalid stored images are unavailable for presentation, never a comparison Target. */
export const presentQuarterBehaviourTarget = (item: unknown): QuarterBehaviourTargetSnapshot | undefined => {
  try { return materialiseQuarterBehaviourTarget(item); } catch { return undefined; }
};

/** Detach annual authority inputs before source creation; accessors are never evaluated. */
export const materialiseBehaviourSourceData = <T>(value: T): T => {
  const ancestors = new WeakSet<object>();
  const detach = (candidate: unknown): unknown => {
    if (candidate === null || typeof candidate !== 'object') return candidate;
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype
      || ancestors.has(candidate)) return invalid();
    ancestors.add(candidate);
    try {
      const copy: Record<string, unknown> | unknown[] = Array.isArray(candidate) ? new Array(candidate.length) : {};
      Object.getOwnPropertyNames(candidate).filter(key => !Array.isArray(candidate) || key !== 'length').forEach(key => {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key)!;
        if (!('value' in descriptor)) return invalid();
        Object.defineProperty(copy, key, { value: detach(descriptor.value), enumerable: true });
      });
      return Object.freeze(copy);
    } finally {
      // Shared acyclic references are valid; only a reference on the active path is a cycle.
      ancestors.delete(candidate);
    }
  };
  return detach(value) as T;
};
