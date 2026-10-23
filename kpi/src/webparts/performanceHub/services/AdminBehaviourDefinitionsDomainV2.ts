import type { IBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';
import { inspectBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';

export type BehaviourCataloguePublicationResult = 'Published' | 'NoChange' | 'RolledBack';

export interface IBehaviourCataloguePublicationContext {
  actorEmail: string;
  occurredAt: string;
  sourcePath: string;
  sourceSha256: string;
}

export interface IBehaviourCataloguePublicationRecord {
  sequence: number;
  catalogueKey: string;
  catalogueVersion: string;
  revision: number;
  schemaVersion: string;
  sourcePath: string;
  sourceSha256: string;
  rowCount: number;
  headlineCount: number;
  roleLevelCount: number;
  actorEmail: string;
  occurredAt: string;
  result: BehaviourCataloguePublicationResult;
  rollbackFromVersion?: string;
}

export interface IAdminBehaviourCatalogueV2State {
  mode: 'SyntheticPackageOnly';
  current?: Readonly<IBehaviourFrameworkV2Catalogue>;
  history: ReadonlyArray<Readonly<IBehaviourFrameworkV2Catalogue>>;
  audit: ReadonlyArray<Readonly<IBehaviourCataloguePublicationRecord>>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const clean = (value: string | undefined): string => (value || '').trim();

const cloneCatalogue = (catalogue: IBehaviourFrameworkV2Catalogue): IBehaviourFrameworkV2Catalogue => ({
  ...catalogue,
  headlineBehaviours: catalogue.headlineBehaviours.map(row => ({ ...row })),
  roleLevels: catalogue.roleLevels.map(row => ({ ...row })),
  ratingScale: catalogue.ratingScale.slice(),
  selectionGuidance: { ...catalogue.selectionGuidance },
  rows: catalogue.rows.map(row => ({ ...row }))
});

const freezeCatalogue = (catalogue: IBehaviourFrameworkV2Catalogue): Readonly<IBehaviourFrameworkV2Catalogue> => Object.freeze({
  ...catalogue,
  headlineBehaviours: Object.freeze(catalogue.headlineBehaviours.map(row => Object.freeze({ ...row }))),
  roleLevels: Object.freeze(catalogue.roleLevels.map(row => Object.freeze({ ...row }))),
  ratingScale: Object.freeze(catalogue.ratingScale.slice()),
  selectionGuidance: Object.freeze({ ...catalogue.selectionGuidance }),
  rows: Object.freeze(catalogue.rows.map(row => Object.freeze({ ...row })))
});

const freezeRecord = (record: IBehaviourCataloguePublicationRecord): Readonly<IBehaviourCataloguePublicationRecord> =>
  Object.freeze({ ...record });

const freezeState = (state: IAdminBehaviourCatalogueV2State): Readonly<IAdminBehaviourCatalogueV2State> => Object.freeze({
  ...state,
  current: state.current ? freezeCatalogue(cloneCatalogue(state.current)) : undefined,
  history: Object.freeze(state.history.map(row => freezeCatalogue(cloneCatalogue(row)))),
  audit: Object.freeze(state.audit.map(row => freezeRecord(row)))
});

const assertContext = (context: IBehaviourCataloguePublicationContext): void => {
  if (!clean(context.actorEmail) || !clean(context.occurredAt) || !clean(context.sourcePath)
    || !SHA256_PATTERN.test(clean(context.sourceSha256))) {
    throw new Error('Publication requires actor, timestamp, source path and lowercase SHA-256 evidence.');
  }
};

const equivalentCatalogue = (
  left: IBehaviourFrameworkV2Catalogue,
  right: IBehaviourFrameworkV2Catalogue
): boolean => JSON.stringify(left) === JSON.stringify(right);

const publicationRecord = (
  sequence: number,
  catalogue: IBehaviourFrameworkV2Catalogue,
  context: IBehaviourCataloguePublicationContext,
  result: BehaviourCataloguePublicationResult,
  rollbackFromVersion?: string
): Readonly<IBehaviourCataloguePublicationRecord> => freezeRecord({
  sequence,
  catalogueKey: catalogue.catalogueKey,
  catalogueVersion: catalogue.catalogueVersion,
  revision: catalogue.revision,
  schemaVersion: catalogue.schemaVersion,
  sourcePath: clean(context.sourcePath),
  sourceSha256: clean(context.sourceSha256),
  rowCount: catalogue.rows.length,
  headlineCount: catalogue.headlineBehaviours.length,
  roleLevelCount: catalogue.roleLevels.length,
  actorEmail: clean(context.actorEmail),
  occurredAt: clean(context.occurredAt),
  result,
  rollbackFromVersion
});

export const createAdminBehaviourCatalogueV2State = (
  current?: IBehaviourFrameworkV2Catalogue
): Readonly<IAdminBehaviourCatalogueV2State> => {
  if (current) {
    const inspection = inspectBehaviourFrameworkV2Catalogue(current);
    if (!inspection.valid) throw new Error(inspection.issues.join(' '));
  }
  return freezeState({ mode: 'SyntheticPackageOnly', current, history: current ? [current] : [], audit: [] });
};

export const publishBehaviourCatalogueV2Local = (
  state: IAdminBehaviourCatalogueV2State,
  candidate: IBehaviourFrameworkV2Catalogue,
  context: IBehaviourCataloguePublicationContext
): Readonly<IAdminBehaviourCatalogueV2State> => {
  if (state.mode !== 'SyntheticPackageOnly') throw new Error('Catalogue publication is locked to the synthetic package boundary.');
  assertContext(context);
  const inspection = inspectBehaviourFrameworkV2Catalogue(candidate);
  if (!inspection.valid) throw new Error(inspection.issues.join(' '));
  if (candidate.status !== 'Published') throw new Error('Only a validated Published catalogue may be published.');
  const current = state.current;
  if (current && candidate.revision < current.revision) throw new Error('Stale catalogue revision was rejected.');
  if (current && candidate.revision === current.revision) {
    if (!equivalentCatalogue(current, candidate)) throw new Error('A published catalogue revision is immutable.');
    const noChange = publicationRecord(state.audit.length + 1, candidate, context, 'NoChange');
    return freezeState({ ...state, audit: [...state.audit, noChange] });
  }
  const published = freezeCatalogue(cloneCatalogue(candidate));
  const record = publicationRecord(state.audit.length + 1, published, context, 'Published');
  return freezeState({
    ...state,
    current: published,
    history: [...state.history, published],
    audit: [...state.audit, record]
  });
};

export const rollbackBehaviourCatalogueV2Local = (
  state: IAdminBehaviourCatalogueV2State,
  targetVersion: string,
  context: IBehaviourCataloguePublicationContext
): Readonly<IAdminBehaviourCatalogueV2State> => {
  if (state.mode !== 'SyntheticPackageOnly') throw new Error('Catalogue rollback is locked to the synthetic package boundary.');
  assertContext(context);
  if (!state.current) throw new Error('There is no current catalogue to roll back.');
  const matches = state.history.filter(row => row.catalogueVersion === clean(targetVersion));
  if (matches.length !== 1) throw new Error('Rollback requires one exact preserved catalogue version.');
  const target = freezeCatalogue(cloneCatalogue(matches[0]));
  const record = publicationRecord(
    state.audit.length + 1,
    target,
    context,
    'RolledBack',
    state.current.catalogueVersion
  );
  return freezeState({ ...state, current: target, audit: [...state.audit, record] });
};
