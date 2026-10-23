import { APPROVED_BEHAVIOUR_V1_SOURCE_ROWS } from '../testing/BehaviourFrameworkV1ApprovedData';
import { createBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';
import type { IBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';
import {
  createAdminBehaviourCatalogueV2State,
  publishBehaviourCatalogueV2Local,
  rollbackBehaviourCatalogueV2Local
} from './AdminBehaviourDefinitionsDomainV2';

const hash = 'a'.repeat(64);
const context = { actorEmail: 'product.admin@example.invalid', occurredAt: '2026-09-20T21:30:00.000Z',
  sourcePath: 'data/test-pilot/behaviour-catalogue.v2.json', sourceSha256: hash };
const candidate = (revision: number): IBehaviourFrameworkV2Catalogue => createBehaviourFrameworkV2Catalogue(APPROVED_BEHAVIOUR_V1_SOURCE_ROWS, {
  catalogueVersion: `KCF-BHV-PD03-2026.09-v${revision}`, revision, status: 'Published', effectiveFrom: '2026-11-01'
});

describe('BT-04 Admin publication and rollback domain', () => {
  it('records source/version/hash/counts/actor and is idempotent', () => {
    const input = createAdminBehaviourCatalogueV2State();
    const published = publishBehaviourCatalogueV2Local(input, candidate(1), context);
    const repeated = publishBehaviourCatalogueV2Local(published, candidate(1), context);
    expect(input.current).toBeUndefined();
    expect(published.current?.catalogueVersion).toBe('KCF-BHV-PD03-2026.09-v1');
    expect(published.audit[0]).toEqual(expect.objectContaining({ result: 'Published', sourceSha256: hash,
      rowCount: 75, headlineCount: 5, roleLevelCount: 3, actorEmail: context.actorEmail }));
    expect(repeated.audit[1].result).toBe('NoChange');
    expect(repeated.history).toHaveLength(1);
  });

  it('fails closed for stale, same-version changed, malformed evidence and non-published candidates', () => {
    const current = publishBehaviourCatalogueV2Local(createAdminBehaviourCatalogueV2State(), candidate(2), context);
    expect(() => publishBehaviourCatalogueV2Local(current, candidate(1), context)).toThrow(/Stale/);
    const changed = { ...candidate(2), rows: candidate(2).rows.map((row, index) => index ? row : { ...row, focusArea: 'Changed' }) };
    expect(() => publishBehaviourCatalogueV2Local(current, changed, context)).toThrow(/immutable/);
    expect(() => publishBehaviourCatalogueV2Local(current, candidate(3), { ...context, sourceSha256: 'wrong' })).toThrow(/SHA-256/);
    expect(() => publishBehaviourCatalogueV2Local(current, { ...candidate(3), status: 'Draft' }, context)).toThrow(/Published/);
  });

  it('rolls back to one exact preserved version and keeps an immutable audit trail', () => {
    const first = publishBehaviourCatalogueV2Local(createAdminBehaviourCatalogueV2State(), candidate(1), context);
    const second = publishBehaviourCatalogueV2Local(first, candidate(2), { ...context, occurredAt: '2026-09-20T21:40:00.000Z' });
    const rolledBack = rollbackBehaviourCatalogueV2Local(second, 'KCF-BHV-PD03-2026.09-v1',
      { ...context, occurredAt: '2026-09-20T21:50:00.000Z' });
    expect(rolledBack.current?.catalogueVersion).toBe('KCF-BHV-PD03-2026.09-v1');
    expect(rolledBack.audit[2]).toEqual(expect.objectContaining({ result: 'RolledBack', rollbackFromVersion: 'KCF-BHV-PD03-2026.09-v2' }));
    expect(Object.isFrozen(rolledBack)).toBe(true);
    expect(Object.isFrozen(rolledBack.audit)).toBe(true);
  });
});
