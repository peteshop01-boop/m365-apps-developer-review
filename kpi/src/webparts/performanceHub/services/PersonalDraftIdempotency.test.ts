jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'personal-draft-test-guid' }) }
}));

import type { IAnnualWorkplan } from '../models/ProductionModels';
import { createPersonalDraftItem } from '../components/PersonalWorkplanPage';
import {
  nextPersonalDraftId,
  patchPersonalDraftItem,
  personalNaturalKey,
  resolvePersonalDraftUpsertTarget
} from './PersonalWorkplanPolicy';

const workplan = {
  workplanKey: 'person-1|2026', personKey: 'person-1', performanceYear: 2026
} as IAnnualWorkplan;

describe('Personal Draft save idempotency', () => {
  it('creates one stable client identity that repeated save attempts reuse', () => {
    const draft = createPersonalDraftItem(workplan, -1800, 1, 'client-draft-guid');
    expect(draft.workplanItemKey).toBe('client-draft-guid');
    expect(draft.naturalKey).toBe(personalNaturalKey(workplan.workplanKey, 'client-draft-guid'));

    const firstAttempt = resolvePersonalDraftUpsertTarget(draft, workplan.workplanKey, workplan.personKey);
    const repeatedAttempt = resolvePersonalDraftUpsertTarget(draft, workplan.workplanKey, workplan.personKey);
    expect(repeatedAttempt).toEqual(firstAttempt);
  });

  it('recovers a POST-success/read-back-loss retry against the one persisted row and its ETag', () => {
    const draft = createPersonalDraftItem(workplan, -1800, 1, 'client-draft-guid');
    const target = resolvePersonalDraftUpsertTarget(draft, workplan.workplanKey, workplan.personKey, {
      id: 42,
      etag: '"7"',
      workplanItemKey: draft.workplanItemKey,
      naturalKey: draft.naturalKey,
      workplanKey: draft.workplanKey,
      personKey: draft.personKey
    });
    expect(target).toEqual(expect.objectContaining({
      naturalKey: draft.naturalKey,
      persistedId: 42,
      updateEtag: '"7"'
    }));
  });

  it('fails closed when a positive persisted item ID resolves to another row', () => {
    const persistedDraft = {
      ...createPersonalDraftItem(workplan, 41, 1, 'client-draft-guid'),
      etag: '"6"'
    };
    expect(() => resolvePersonalDraftUpsertTarget(persistedDraft, workplan.workplanKey, workplan.personKey, {
      id: 42,
      etag: '"7"',
      workplanItemKey: persistedDraft.workplanItemKey,
      naturalKey: persistedDraft.naturalKey,
      workplanKey: persistedDraft.workplanKey,
      personKey: persistedDraft.personKey
    })).toThrow(/conflicts with another row/);
  });

  it('keeps local identities unique through save, remount, five-item boundary and one-row removal', () => {
    const saved = [
      createPersonalDraftItem(workplan, -1800, 1, 'personal-1'),
      createPersonalDraftItem(workplan, -1801, 2, 'personal-2'),
      createPersonalDraftItem(workplan, -1802, 3, 'personal-3')
    ];

    // The saved rows are supplied back to a newly mounted editor.
    const remounted = saved.map(item => ({ ...item }));
    const fourth = createPersonalDraftItem(workplan, nextPersonalDraftId(remounted), 4, 'personal-4');
    const withFourth = [...remounted, fourth];
    const fifth = createPersonalDraftItem(workplan, nextPersonalDraftId(withFourth), 5, 'personal-5');
    const atBoundary = [...withFourth, fifth];

    expect(atBoundary.map(item => item.id)).toEqual([-1800, -1801, -1802, -1803, -1804]);
    expect(new Set(atBoundary.map(item => item.id)).size).toBe(5);
    expect(new Set(atBoundary.map(item => item.workplanItemKey)).size).toBe(5);
    expect(atBoundary.filter(item => item.activeInWorkplan)).toHaveLength(5);

    const afterOneRemoval = patchPersonalDraftItem(atBoundary, fifth.workplanItemKey, { activeInWorkplan: false });
    expect(afterOneRemoval.filter(item => item.activeInWorkplan)).toHaveLength(4);
    expect(afterOneRemoval.filter(item => !item.activeInWorkplan)).toHaveLength(1);
    expect(afterOneRemoval.find(item => item.workplanItemKey === 'personal-1')?.activeInWorkplan).toBe(true);
    expect(afterOneRemoval.find(item => item.workplanItemKey === fifth.workplanItemKey)?.activeInWorkplan).toBe(false);
  });

  it('fails closed rather than editing more than one row when a stable key is duplicated', () => {
    const first = createPersonalDraftItem(workplan, -1800, 1, 'duplicate-key');
    const second = createPersonalDraftItem(workplan, -1801, 2, 'duplicate-key');
    expect(() => patchPersonalDraftItem([first, second], 'duplicate-key', { activeInWorkplan: false }))
      .toThrow(/missing or not unique/);
  });
});
