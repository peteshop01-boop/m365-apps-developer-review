import {
  BEHAVIOUR_KEYS,
  GOVERNED_BEHAVIOUR_RATINGS,
  GOVERNED_BEHAVIOUR_ROLE_LEVELS,
  type GovernedBehaviourRoleLevel,
  type IGovernedBehaviourCatalogueContract,
  type IGovernedBehaviourCommandContext,
  type IGovernedBehaviourCommitmentDraft,
  type IGovernedBehaviourHeadlineRatingInput
} from '../models/BehaviourWorkplanModels';
import {
  appendGovernedBehaviourManagerReview,
  assertGovernedBehaviourCatalogue,
  buildGovernedBehaviourCommitmentCommand,
  buildGovernedBehaviourHeadlineRatingSet,
  buildGovernedBehaviourSelectionView,
  reopenGovernedBehaviourCommitmentReadModel
} from './BehaviourWorkplanPolicy';

const asOf = new Date('2026-09-22T12:00:00.000Z');
const sha = 'A'.repeat(64);

const catalogue = (): IGovernedBehaviourCatalogueContract => ({
  schema: 'KCF.GovernedBehaviourCatalogue',
  immutable: true,
  published: true,
  productionSafe: true,
  authority: {
    catalogueId: 'KCF-BEHAVIOUR-CATALOGUE',
    version: 'BEH-V1',
    etag: '"catalogue-v1"',
    approvalReference: 'KCF-KPI-Sponsor-BEH-V1-001',
    contentSha256: sha,
    effectiveFrom: '2026-09-21',
    publishedAt: '2026-09-21T09:00:00.000Z',
    publishedBy: 'sponsor@example.invalid',
    changeReference: 'KCF-KPI-Sponsor-BEH-V1-001'
  },
  headlines: BEHAVIOUR_KEYS.map((behaviourKey, behaviourIndex) => ({
    behaviourKey,
    title: `Synthetic approved headline ${behaviourIndex + 1}`,
    sortOrder: (behaviourIndex + 1) as 1 | 2 | 3 | 4 | 5,
    active: true,
    approved: true,
    focuses: [1, 2, 3, 4, 5].map(focusOrder => ({
      focusKey: `${behaviourKey}-FOCUS-${focusOrder}`,
      behaviourKey,
      title: `Synthetic focus ${behaviourIndex + 1}.${focusOrder}`,
      sortOrder: focusOrder as 1 | 2 | 3 | 4 | 5,
      targets: GOVERNED_BEHAVIOUR_ROLE_LEVELS.map((roleLevel, roleIndex) => ({
        targetKey: `${behaviourKey}-F${focusOrder}-R${roleIndex + 1}`,
        behaviourKey,
        focusKey: `${behaviourKey}-FOCUS-${focusOrder}`,
        roleLevel,
        wording: `Synthetic measurable target ${behaviourIndex + 1}.${focusOrder}.${roleIndex + 1}`,
        sortOrder: focusOrder as 1 | 2 | 3 | 4 | 5,
        active: true,
        approved: true,
        effectiveFrom: '2026-09-21'
      }))
    }))
  })),
  ratingOptions: GOVERNED_BEHAVIOUR_RATINGS
});

const context = (
  action: 'Save' | 'Submit' = 'Submit',
  state: 'Draft' | 'ChangesRequested' | 'Submitted' = 'Draft',
  roleLevel: GovernedBehaviourRoleLevel = 'Manager'
): IGovernedBehaviourCommandContext => ({
  action,
  workplanKey: 'WP-SYN-001',
  expectedWorkplanVersion: '"workplan-v1"',
  currentWorkplanVersion: '"workplan-v1"',
  state,
  roleLevel,
  actorEmail: 'employee@example.invalid',
  occurredAt: '2026-09-22T12:30:00.000Z',
  changeReference: 'KCF-KPI-PM28-A007'
});

const governedDraft = (
  behaviourIndex: number,
  focusOrder = 1,
  roleLevel: GovernedBehaviourRoleLevel = 'Manager'
): IGovernedBehaviourCommitmentDraft => {
  const behaviourKey = BEHAVIOUR_KEYS[behaviourIndex];
  const roleIndex = GOVERNED_BEHAVIOUR_ROLE_LEVELS.indexOf(roleLevel) + 1;
  return {
    commitmentKey: `COMMIT-${behaviourIndex + 1}-${focusOrder}`,
    source: 'GovernedTarget',
    behaviourKey,
    focusKey: `${behaviourKey}-FOCUS-${focusOrder}`,
    roleLevel,
    targetKey: `${behaviourKey}-F${focusOrder}-R${roleIndex}`,
    catalogueVersion: 'BEH-V1',
    catalogueEtag: '"catalogue-v1"',
    myCommitment: `I will deliver synthetic commitment ${behaviourIndex + 1}.`,
    howWillWeKnow: `Colleagues will observe synthetic evidence ${behaviourIndex + 1}.`
  };
};

const submitDrafts = (): IGovernedBehaviourCommitmentDraft[] => [
  governedDraft(0), governedDraft(1), governedDraft(2)
];

describe('governed Annual Workplan Behaviour commitment shell', () => {
  it('validates five ordered headline identities, 25 focus areas and 75 role targets without embedded Product wording', () => {
    const source = catalogue();
    const checked = assertGovernedBehaviourCatalogue(source, source.authority);
    expect(checked.headlines.map(item => item.behaviourKey)).toEqual(BEHAVIOUR_KEYS);
    expect(checked.headlines.flatMap(item => item.focuses)).toHaveLength(25);
    expect(checked.headlines.flatMap(item => item.focuses.flatMap(focus => focus.targets))).toHaveLength(75);
    expect(checked.ratingOptions).toEqual(['Developing', 'Effective', 'Exceptional']);
    expect(Object.isFrozen(checked)).toBe(true);
    expect(Object.isFrozen(checked.headlines[0].focuses[0].targets)).toBe(true);
  });

  it.each(GOVERNED_BEHAVIOUR_ROLE_LEVELS)('filters one exact target per focus for %s', roleLevel => {
    const source = catalogue();
    const view = buildGovernedBehaviourSelectionView(source, source.authority, roleLevel, asOf);
    const targets = view.flatMap(headline => headline.focuses.flatMap(focus => focus.targets));
    expect(view).toHaveLength(5);
    expect(targets).toHaveLength(25);
    expect(targets.every(target => target.selectable)).toBe(true);
  });

  it('builds an immutable three-item Submit command including governed and own targets with required evidence text', () => {
    const source = catalogue();
    const drafts = submitDrafts();
    drafts[2] = {
      ...drafts[2],
      source: 'OwnTarget',
      targetKey: undefined,
      ownTarget: 'Synthetic employee-authored measurable target.'
    };
    const command = buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), drafts, asOf);
    expect(command).toEqual(expect.objectContaining({
      action: 'Submit',
      sourceState: 'Draft',
      guidance: { normalMinimum: 3, normalMaximum: 5 },
      behavioursExcludedFromDeliveryArithmetic: true,
      perTargetScoreProduced: false,
      behaviourRagProduced: false,
      tenantMutationExecuted: false
    }));
    expect(command.commitments).toHaveLength(3);
    expect(command.commitments[0]).toEqual(expect.objectContaining({
      headlineTitle: 'Synthetic approved headline 1',
      focusTitle: 'Synthetic focus 1.1',
      roleLevel: 'Manager',
      targetWording: 'Synthetic measurable target 1.1.2',
      myCommitment: expect.stringContaining('commitment 1'),
      howWillWeKnow: expect.stringContaining('evidence 1')
    }));
    expect(command.commitments[2]).toEqual(expect.objectContaining({
      source: 'OwnTarget',
      targetKey: 'OWN:COMMIT-3-1',
      targetWording: 'Synthetic employee-authored measurable target.'
    }));
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.commitments)).toBe(true);
    expect(Object.isFrozen(command.commitments[0])).toBe(true);
  });

  it('requires MY COMMITMENT and HOW WILL WE KNOW? while keeping 3–5 as guidance and five as the shell limit', () => {
    const source = catalogue();
    expect(buildGovernedBehaviourCommitmentCommand(source, source.authority, context('Submit'), [
      governedDraft(0)
    ], asOf).guidance).toEqual({ normalMinimum: 3, normalMaximum: 5 });
    expect(buildGovernedBehaviourCommitmentCommand(source, source.authority, context('Save'), [
      governedDraft(0)
    ], asOf).commitments).toHaveLength(1);
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, context('Submit'), [
      governedDraft(0), governedDraft(1), governedDraft(2), governedDraft(3), governedDraft(4),
      { ...governedDraft(0), commitmentKey: 'SIXTH', focusKey: 'BHV-01-FOCUS-2', targetKey: 'BHV-01-F2-R2' }
    ], asOf)).toThrow(/one to five/);
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), [
      { ...governedDraft(0), myCommitment: '' }, governedDraft(1), governedDraft(2)
    ], asOf)).toThrow(/MY COMMITMENT/);
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), [
      { ...governedDraft(0), howWillWeKnow: '' }, governedDraft(1), governedDraft(2)
    ], asOf)).toThrow(/HOW WILL WE KNOW/);
  });

  it('fails closed on stale, crossed, missing, duplicate, moved, role-mismatched, retired and unapproved inputs', () => {
    const source = catalogue();
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), [
      { ...governedDraft(0), catalogueVersion: 'STALE' }, governedDraft(1), governedDraft(2)
    ], asOf)).toThrow(/stale/);
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, {
      ...context(), currentWorkplanVersion: '"workplan-v2"'
    }, submitDrafts(), asOf)).toThrow(/Workplan version is stale/);
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), [
      { ...governedDraft(0), targetKey: 'MISSING' }, governedDraft(1), governedDraft(2)
    ], asOf)).toThrow(/missing, duplicate or moved/);
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), [
      { ...governedDraft(0), roleLevel: 'Senior Manager / Leader' }, governedDraft(1), governedDraft(2)
    ], asOf)).toThrow(/role mismatch/);
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), [
      governedDraft(0), { ...governedDraft(0), commitmentKey: 'COMMIT-DUPLICATE' }, governedDraft(2)
    ], asOf)).toThrow(/duplicates/);

    const duplicate = catalogue();
    duplicate.headlines[0].focuses[0].targets[1].targetKey = duplicate.headlines[0].focuses[0].targets[0].targetKey;
    expect(() => assertGovernedBehaviourCatalogue(duplicate, duplicate.authority)).toThrow(/duplicate/);
    const moved = catalogue();
    moved.headlines[0].focuses[0].targets[0].focusKey = 'BHV-01-FOCUS-2';
    expect(() => assertGovernedBehaviourCatalogue(moved, moved.authority)).toThrow(/moved/);
    const retired = catalogue();
    retired.headlines[0].focuses[0].targets[1].active = false;
    expect(() => buildGovernedBehaviourCommitmentCommand(retired, retired.authority, context(), submitDrafts(), asOf))
      .toThrow(/retired/);
    const unapproved = catalogue();
    unapproved.headlines[0].focuses[0].targets[1].approved = false;
    expect(() => buildGovernedBehaviourCommitmentCommand(unapproved, unapproved.authority, context(), submitDrafts(), asOf))
      .toThrow(/unapproved/);
    const future = catalogue();
    future.authority.effectiveFrom = '2027-01-01';
    expect(() => buildGovernedBehaviourCommitmentCommand(future, future.authority, context(), submitDrafts(), asOf))
      .toThrow(/not effective/);
    expect(() => assertGovernedBehaviourCatalogue(source, {
      ...source.authority, contentSha256: 'B'.repeat(64)
    })).toThrow(/changed after it was loaded/);
  });

  it('rejects accessors without getter execution, malformed Proxy arrays and caller mutation after validation', () => {
    const accessor = catalogue();
    let getterReads = 0;
    Object.defineProperty(accessor.headlines[0].focuses[0].targets[0], 'wording', {
      enumerable: true,
      get: () => { getterReads += 1; return 'forged'; }
    });
    expect(() => assertGovernedBehaviourCatalogue(accessor, accessor.authority)).toThrow(/own data property/);
    expect(getterReads).toBe(0);

    const proxied = catalogue();
    let arrayGetReads = 0;
    proxied.headlines = new Proxy(proxied.headlines, {
      get: (target, property, receiver) => { arrayGetReads += 1; return Reflect.get(target, property, receiver); },
      ownKeys: target => Reflect.ownKeys(target).concat('unexpected')
    });
    expect(() => assertGovernedBehaviourCatalogue(proxied, proxied.authority)).toThrow(/unsupported own field/);
    expect(arrayGetReads).toBe(0);

    const source = catalogue();
    const drafts = submitDrafts();
    const command = buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), drafts, asOf);
    drafts[0].myCommitment = 'mutated after validation';
    source.headlines[0].title = 'mutated after validation';
    expect(command.commitments[0].myCommitment).toContain('commitment 1');
    expect(command.commitments[0].headlineTitle).toBe('Synthetic approved headline 1');
    expect(() => (command.commitments as unknown as IGovernedBehaviourCommitmentDraft[]).push(governedDraft(4))).toThrow();
  });

  it('round-trips Save/reopen/re-edit/Submit and preserves historic wording after current retirement', () => {
    const source = catalogue();
    const saved = buildGovernedBehaviourCommitmentCommand(source, source.authority, context('Save'), [
      governedDraft(0), governedDraft(1), governedDraft(2)
    ], asOf);
    const persisted = JSON.parse(JSON.stringify(saved)) as unknown;
    const reopened = reopenGovernedBehaviourCommitmentReadModel(persisted);
    expect(reopened.commitments.map(item => item.targetWording)).toEqual(saved.commitments.map(item => item.targetWording));
    const retiredCurrent = catalogue();
    retiredCurrent.headlines[0].focuses[0].targets[1].active = false;
    expect(reopened.commitments[0].targetWording).toBe('Synthetic measurable target 1.1.2');
    expect(() => buildGovernedBehaviourCommitmentCommand(
      retiredCurrent, retiredCurrent.authority, context('Submit'), submitDrafts(), asOf
    )).toThrow(/retired/);
    expect(buildGovernedBehaviourCommitmentCommand(
      source, source.authority, context('Save', 'ChangesRequested'), submitDrafts(), asOf
    ).sourceState).toBe('ChangesRequested');
    expect(() => buildGovernedBehaviourCommitmentCommand(
      source, source.authority, context('Save', 'Submitted'), submitDrafts(), asOf
    )).toThrow(/read-only/);
    expect(buildGovernedBehaviourCommitmentCommand(
      source, source.authority, context('Submit'), submitDrafts(), asOf
    ).action).toBe('Submit');
  });

  it('records only AGREED or CHANGES REQUESTED manager history with immutable audit and replay protection', () => {
    const first = appendGovernedBehaviourManagerReview([], {
      auditKey: 'AUDIT-1', expectedWorkplanVersion: '"workplan-v2"',
      managerEmail: 'manager@example.invalid', occurredAt: '2026-09-22T13:00:00Z',
      changeReference: 'MGR-1', disposition: 'AGREED'
    }, '"workplan-v2"');
    const second = appendGovernedBehaviourManagerReview(first, {
      auditKey: 'AUDIT-2', expectedWorkplanVersion: '"workplan-v2"',
      managerEmail: 'manager@example.invalid', occurredAt: '2026-09-22T14:00:00Z',
      changeReference: 'MGR-2', disposition: 'CHANGES REQUESTED', commentary: 'Please clarify evidence.'
    }, '"workplan-v2"');
    expect(second.map(item => item.disposition)).toEqual(['AGREED', 'CHANGES REQUESTED']);
    expect(second.map(item => item.sequence)).toEqual([1, 2]);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(second[0])).toBe(true);
    expect(() => appendGovernedBehaviourManagerReview(second, {
      auditKey: 'AUDIT-2', expectedWorkplanVersion: '"workplan-v2"',
      managerEmail: 'manager@example.invalid', occurredAt: '2026-09-22T15:00:00Z',
      changeReference: 'MGR-3', disposition: 'AGREED'
    }, '"workplan-v2"')).toThrow(/already used/);
    expect(() => appendGovernedBehaviourManagerReview(second, {
      auditKey: 'AUDIT-3', expectedWorkplanVersion: '"stale"',
      managerEmail: 'manager@example.invalid', occurredAt: '2026-09-22T15:00:00Z',
      changeReference: 'MGR-3', disposition: 'AGREED'
    }, '"workplan-v2"')).toThrow(/stale/);
    expect(() => appendGovernedBehaviourManagerReview(second, {
      auditKey: 'AUDIT-4', expectedWorkplanVersion: '"workplan-v2"',
      managerEmail: 'manager@example.invalid', occurredAt: '2026-09-22T15:00:00Z',
      changeReference: 'MGR-4', disposition: 'APPROVED' as 'AGREED'
    }, '"workplan-v2"')).toThrow(/AGREED or CHANGES REQUESTED/);
  });

  it('produces exactly one D/E/E rating per headline and no per-target score, RAG or Delivery contribution', () => {
    const source = catalogue();
    const ratings: IGovernedBehaviourHeadlineRatingInput[] = BEHAVIOUR_KEYS.map((behaviourKey, index) => ({
      behaviourKey,
      rating: GOVERNED_BEHAVIOUR_RATINGS[index % 3]
    }));
    const set = buildGovernedBehaviourHeadlineRatingSet(source, source.authority, ratings);
    expect(set.ratings).toHaveLength(5);
    expect(set).toEqual(expect.objectContaining({
      perTargetScoreProduced: false,
      behaviourRagProduced: false,
      deliveryContributionProduced: false
    }));
    expect(() => buildGovernedBehaviourHeadlineRatingSet(source, source.authority, [
      ...ratings.slice(0, 4), { behaviourKey: 'BHV-04', rating: 'Exceptional' }
    ])).toThrow(/unique/);
    expect(() => buildGovernedBehaviourHeadlineRatingSet(source, source.authority, ratings.map((item, index) =>
      index === 0 ? { ...item, score: 3 } as typeof item : item))).toThrow(/unexpected/);
  });

  it('keeps Core and Impact outside exact governed command shapes', () => {
    const source = catalogue();
    expect(() => buildGovernedBehaviourCommitmentCommand(source, source.authority, {
      ...context(), coreWeight: 70, impactWeight: 30
    }, submitDrafts(), asOf)).toThrow(/unexpected/);
    const command = buildGovernedBehaviourCommitmentCommand(source, source.authority, context(), submitDrafts(), asOf);
    expect(Object.prototype.hasOwnProperty.call(command, 'core')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(command, 'impact')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(command, 'score')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(command, 'rag')).toBe(false);
  });
});
