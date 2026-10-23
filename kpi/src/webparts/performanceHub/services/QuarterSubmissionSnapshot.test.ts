import type { IProductionPerson } from '../models/ProductionModels';
import type {
  IProgressLedger,
  IQuarterEvidenceReference,
  IQuarterLifecycle,
  IQuarterReview,
  IQuarterReviewItem
} from '../models/QuarterlyModels';
import {
  assertQuarterSubmissionSnapshotCurrent,
  createQuarterSubmissionSnapshot,
  createQuarterSubmissionTransitionPlan
} from './QuarterSubmissionSnapshot';

const employee: IProductionPerson = {
  id: 1, personKey: 'employee', displayName: 'Employee', email: 'person012@example.invalid',
  appRoles: ['Employee'], active: true
};
const other: IProductionPerson = {
  id: 2, personKey: 'other', displayName: 'Other', email: 'person017@example.invalid',
  appRoles: ['Employee'], active: true
};
const lifecycle: IQuarterLifecycle = {
  performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q3', quarterName: 'Q3',
  quarterStart: '2026-05-01', quarterEnd: '2026-07-31', isCurrentQuarter: false, isOpenForProgressUpdates: false,
  employeeSubmissionDeadline: '2026-08-07', managerReviewDeadline: '2026-08-14',
  reminderMilestones: { earlyReview: '2026-07-01', preparation: '2026-07-17', final: '2026-07-24' },
  status: 'Finalising', priorQuarter: 'Q2', nextQuarter: 'Q4'
};
const review: IQuarterReview = {
  id: 11, etag: '"3"', quarterReviewKey: 'employee|2026|Q3', workplanKey: 'employee|2026', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026, quarter: 'Q3',
  managerPersonKey: 'manager', managerDisplayName: 'Manager', managerEmail: 'person013@example.invalid',
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 3
};
const impact: IQuarterReviewItem = {
  id: 21, etag: '"5"', quarterReviewItemKey: 'employee|2026|Q3|impact-1', quarterReviewKey: review.quarterReviewKey,
  workplanItemKey: 'impact-1', workplanKey: review.workplanKey, personKey: review.personKey,
  performanceYear: 2026, quarter: 'Q3', itemType: 'LocalPersonal', reportingStream: 'Impact',
  wording: 'Improve synthetic delivery', itemDescription: 'Reduce controlled waiting time', measure: 'Completed cases',
  unitLabel: 'cases', metricType: 'Count', scoringDirection: 'HigherIsBetter', yearEndTargetValueSnapshot: 40,
  quarterTargetValue: 10, employeeActualValue: 10, progressPct: 100, scoredProgressPct: 100,
  calculatedRag: 'Green', calculationRuleVersion: 'KCF-RAG-001', scoringMessage: 'At or above target.',
  statusUpdate: 'Ten synthetic cases completed with controlled evidence.', evidenceCount: 1,
  workplanItemWeightSnapshot: 100, managerApproved: false, locked: false,
  impactAnnualDefinitionSnapshot: Object.freeze({
    sourceWorkplanItemKey: 'impact-1', wording: 'Improve synthetic delivery', intendedOutcome: 'Reduce controlled waiting time',
    measure: 'Completed cases', unitLabel: 'cases', metricType: 'Count', scoringDirection: 'HigherIsBetter',
    yearEndTargetValue: 40, quarterTargetValue: 10, workplanItemWeight: 100,
    classification: Object.freeze({
      strategicPillar: Object.freeze({ key: 'pillar-1', label: 'Synthetic pillar', source: 'TEST-GOVERNED', sourceReference: 'pillar-v1' }),
      businessContributionArea: Object.freeze({ key: 'area-1', label: 'Synthetic area', source: 'TEST-GOVERNED', sourceReference: 'area-v1' })
    })
  })
};
const evidence: IQuarterEvidenceReference = {
  evidenceKey: 'evidence-1', kind: 'Link', personKey: review.personKey, workplanKey: review.workplanKey,
  workplanItemKey: impact.workplanItemKey, quarterReviewKey: review.quarterReviewKey,
  quarterReviewItemKey: impact.quarterReviewItemKey, performanceYear: 2026, quarter: 'Q3',
  description: 'Synthetic evidence', url: 'https://example.invalid/evidence-1', status: 'Draft'
};
const ledger: IProgressLedger = {
  id: 31, etag: '"2"', progressLedgerKey: 'employee|2026|impact-1', workplanItemKey: impact.workplanItemKey,
  workplanKey: review.workplanKey, personKey: review.personKey, performanceYear: 2026, itemType: 'LocalPersonal',
  locked: false, rowVersionToken: 2, entries: [{
    entryKey: 'progress-1', quarterReviewKey: review.quarterReviewKey,
    quarterReviewItemKey: impact.quarterReviewItemKey, quarter: 'Q3', date: '2026-07-15',
    note: 'Five synthetic cases completed.', actorPersonKey: employee.personKey, actorEmail: employee.email,
    updatedAt: '2026-07-15T10:00:00.000Z', actualValue: 5, evidenceLink: 'https://example.invalid/evidence-1'
  }]
};

describe('QuarterSubmissionSnapshot', () => {
  it.each([-1, 0, 2026.5, Number.MAX_SAFE_INTEGER + 1])('rejects matching invalid snapshot year %s before readiness', performanceYear => {
    const changed = { ...review, performanceYear };
    expect(() => createQuarterSubmissionSnapshot({ ...lifecycle, performanceYearNumber: performanceYear }, changed,
      [{ ...impact, performanceYear }], [evidence], [{ ...ledger, performanceYear }], employee,
      'year-domain', '2026-08-01T10:00:00.000Z')).toThrow(/year/);
  });
  it.each([-1, 0, 2026.5, Number.MAX_SAFE_INTEGER + 1])('rejects matching persisted snapshot year %s', performanceYear => {
    const plan = createQuarterSubmissionTransitionPlan(lifecycle, review, [impact], [evidence], [ledger], employee,
      'stored-year', '2026-08-01T10:00:00.000Z');
    expect(() => assertQuarterSubmissionSnapshotCurrent({ ...plan.review, performanceYear,
      submissionSnapshot: { ...plan.snapshot, performanceYear } }, [{ ...impact, performanceYear }], [evidence], [{ ...ledger, performanceYear }])).toThrow(/valid immutable/);
  });
  it('rejects inherited submission authority without executing the getter', () => {
    const actor = { ...employee }; delete (actor as Partial<IProductionPerson>).active;
    let reads = 0;
    Object.defineProperty(Object.prototype, 'active', { configurable: true, get: () => { reads++; return true; } });
    try { expect(() => createQuarterSubmissionSnapshot(lifecycle, review, [impact], [evidence], [ledger], actor,
      'own-active', '2026-08-01T10:00:00.000Z')).toThrow(/review employee/); expect(reads).toBe(0); }
    finally { delete (Object.prototype as Partial<IProductionPerson>).active; }
  });
  it.each([
    { snapshotVersion: 'UNKNOWN' }, { snapshotVersion: undefined },
    { snapshotKey: 'other|2026|Q3|submission|header' },
    { snapshotKey: review.quarterReviewKey + '|submission|' },
    { snapshotKey: review.quarterReviewKey + '|submission| padded ' },
    { submittedByPersonKey: 'other' }, { submittedByEmail: 'other@example.invalid' },
    { capturedAt: 'not a date' }, { capturedAt: '2026-08-01T10:00:00Z' }, { capturedAt: undefined },
    { sourceReviewRowVersionToken: 0 }, { sourceReviewRowVersionToken: -1 },
    { sourceReviewRowVersionToken: 1.5 }, { sourceReviewRowVersionToken: undefined }
  ])('rejects malformed or crossed stored submission header %j', patch => {
    const plan = createQuarterSubmissionTransitionPlan(lifecycle, review, [impact], [evidence], [ledger], employee,
      'header', '2026-08-01T10:00:00.000Z');
    const changed = Object.assign({}, plan.review, { submissionSnapshot: Object.assign({}, plan.snapshot, patch) });
    expect(() => assertQuarterSubmissionSnapshotCurrent(changed, [impact], [evidence], [ledger]))
      .toThrow('no valid immutable employee submission snapshot');
  });
  it.each([3.5, undefined])('rejects an invalid current review version %j', version => {
    const plan = createQuarterSubmissionTransitionPlan(lifecycle, review, [impact], [evidence], [ledger], employee,
      'header-version', '2026-08-01T10:00:00.000Z');
    const changed = { ...plan.review, rowVersionToken: version } as unknown as IQuarterReview;
    expect(() => assertQuarterSubmissionSnapshotCurrent(changed, [impact], [evidence], [ledger]))
      .toThrow('no valid immutable employee submission snapshot');
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])('does not create an unadvanceable source version %j', version => {
    expect(() => createQuarterSubmissionSnapshot(lifecycle, { ...review, rowVersionToken: version }, [impact],
      [evidence], [ledger], employee, 'bad-source-version', '2026-08-01T10:00:00.000Z'))
      .toThrow('positive safe source version that can advance');
  });
  it('retains legitimate version001 history across manager version advances and email casing', () => {
    const plan = createQuarterSubmissionTransitionPlan(lifecycle, { ...review, rowVersionToken: 1 }, [impact],
      [evidence], [ledger], employee, 'old-header', '2026-08-01T10:00:00.000Z');
    const stored = { ...plan.review, rowVersionToken: 5, employeeEmail: ' person012@example.invalid ',
      submissionSnapshot: { ...plan.snapshot, submittedByEmail: ' person012@example.invalid ' } };
    const before = JSON.stringify(stored);
    expect(() => assertQuarterSubmissionSnapshotCurrent(stored, [impact], [evidence], [ledger])).not.toThrow();
    expect(JSON.stringify(stored)).toBe(before);
  });

  it.each(['stored snapshot', 'live readback'] as const)('compares equivalent %s JSON property order without rewriting history', kind => {
    const reverseKeys = <T>(value: T): T => {
      if (Array.isArray(value)) return value.map(reverseKeys) as unknown as T;
      if (value === null || typeof value !== 'object') return value;
      const copy: Record<string, unknown> = {};
      Object.keys(value).reverse().forEach(key => Object.defineProperty(copy, key,
        { enumerable: true, value: reverseKeys((value as Record<string, unknown>)[key]) }));
      return copy as T;
    };
    const plan = createQuarterSubmissionTransitionPlan(lifecycle, review, [impact], [evidence], [ledger], employee,
      'ordered', '2026-08-01T10:00:00.000Z');
    const stored = kind === 'stored snapshot' ? { ...plan.review, submissionSnapshot: reverseKeys(plan.snapshot) } : plan.review;
    const before = JSON.stringify(stored.submissionSnapshot);
    expect(() => assertQuarterSubmissionSnapshotCurrent(stored,
      kind === 'live readback' ? [reverseKeys(impact)] : [impact],
      kind === 'live readback' ? [reverseKeys(evidence)] : [evidence],
      kind === 'live readback' ? [reverseKeys(ledger)] : [ledger])).not.toThrow();
    expect(JSON.stringify(stored.submissionSnapshot)).toBe(before);
  });
  it('still rejects changed array ordering in the stored submission image', () => {
    const entries = [ledger.entries[0], { ...ledger.entries[0], entryKey: 'progress-2', date: '2026-07-16' }];
    const expanded = { ...ledger, entries };
    const plan = createQuarterSubmissionTransitionPlan(lifecycle, review, [impact], [evidence], [expanded], employee,
      'array-order', '2026-08-01T10:00:00.000Z');
    const changed = { ...plan.review, submissionSnapshot: { ...plan.snapshot,
      progressEntries: [...plan.snapshot.progressEntries].reverse() } };
    expect(() => assertQuarterSubmissionSnapshotCurrent(changed, [impact], [evidence], [expanded]))
      .toThrow('changed after employee submission');
  });

  it('retains valid shared acyclic classification inputs and detaches their frozen history', () => {
    const selection = { key: 'shared-key', label: 'Shared synthetic selection', source: 'TEST-GOVERNED' };
    const item = { ...impact, impactAnnualDefinitionSnapshot: { ...impact.impactAnnualDefinitionSnapshot!,
      classification: { strategicPillar: selection, businessContributionArea: selection } } };
    const snapshot = createQuarterSubmissionSnapshot(lifecycle, review, [item], [evidence], [ledger], employee,
      'shared', '2026-08-01T10:00:00.000Z');
    selection.label = 'Later source label';
    const saved = snapshot.items[0].impactAnnualDefinitionSnapshot!.classification!;
    expect(saved.strategicPillar!.label).toBe('Shared synthetic selection');
    expect(saved.businessContributionArea!.label).toBe('Shared synthetic selection');
    expect(Object.isFrozen(saved.strategicPillar)).toBe(true);
  });
  it('accepts valid own data from null-prototype source records', () => {
    const reference = Object.assign(Object.create(null), evidence) as IQuarterEvidenceReference;
    const snapshot = createQuarterSubmissionSnapshot(lifecycle, review, [impact], [reference], [ledger], employee,
      'null-prototype', '2026-08-01T10:00:00.000Z');
    expect(snapshot.evidence).toEqual([evidence]);
    expect(Object.getPrototypeOf(snapshot.evidence[0])).toBe(Object.prototype);
  });
  it.each(['evidence', 'item'] as const)('rejects %s accessors before evaluating them', kind => {
    const item = { ...impact }; const reference = { ...evidence };
    const getter = jest.fn(() => 'Synthetic source getter');
    Object.defineProperty(kind === 'item' ? item : reference, kind === 'item' ? 'statusUpdate' : 'description',
      { enumerable: true, get: getter });
    expect(() => createQuarterSubmissionSnapshot(lifecycle, review, [item], [reference], [ledger], employee,
      'descriptor', '2026-08-01T10:00:00.000Z')).toThrow('Quarter submission inputs must be finite plain data without accessors or cycles.');
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects inherited input identity before authorisation or snapshotting', () => {
    const inherited = Object.create(review) as IQuarterReview;
    expect(() => createQuarterSubmissionSnapshot(lifecycle, inherited, [impact], [evidence], [ledger], employee,
      'inherited', '2026-08-01T10:00:00.000Z')).toThrow('Quarter submission inputs must be finite plain data without accessors or cycles.');
  });
  it('rejects cyclic stored input with a domain error rather than overflowing the stack', () => {
    const cyclic = { ...evidence }; Object.defineProperty(cyclic, 'sourceSnapshot', { enumerable: true, value: cyclic });
    expect(() => createQuarterSubmissionSnapshot(lifecycle, review, [impact], [cyclic], [ledger], employee,
      'cycle', '2026-08-01T10:00:00.000Z')).toThrow('Quarter submission inputs must be finite plain data without accessors or cycles.');
  });
  it('rejects nonfinite stored values before an audit JSON image can convert them to null', () => {
    expect(() => createQuarterSubmissionSnapshot(lifecycle, review, [{ ...impact, employeeActualValue: NaN }],
      [evidence], [ledger], employee, 'nonfinite', '2026-08-01T10:00:00.000Z'))
      .toThrow('Quarter submission inputs must be finite plain data without accessors or cycles.');
  });
  it('retains an own special JSON key as frozen data without changing the copy prototype', () => {
    const reference = { ...evidence };
    Object.defineProperty(reference, '__proto__', { enumerable: true, value: { captured: 'source annotation' } });
    const snapshot = createQuarterSubmissionSnapshot(lifecycle, review, [impact], [reference], [ledger], employee,
      'special-key', '2026-08-01T10:00:00.000Z');
    const saved = snapshot.evidence[0];
    expect(Object.getPrototypeOf(saved)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(saved, '__proto__')).toBe(true);
    expect(JSON.stringify(saved)).toContain('__proto__');
    expect(Object.isFrozen(Object.getOwnPropertyDescriptor(saved, '__proto__')!.value)).toBe(true);
    expect(Object.getPrototypeOf(reference)).toBe(Object.prototype);
  });

  it('freezes exact Impact progress, comment, evidence, classification and authoritative RAG inputs', () => {
    const snapshot = createQuarterSubmissionSnapshot(
      lifecycle, review, [impact], [evidence], [ledger], employee, 'submit-1', '2026-08-01T10:00:00.000Z'
    );
    expect(snapshot).toEqual(expect.objectContaining({
      snapshotKey: 'employee|2026|Q3|submission|submit-1', sourceReviewRowVersionToken: 3,
      submittedByEmail: employee.email, quarter: 'Q3'
    }));
    expect(snapshot.items[0]).toEqual(expect.objectContaining({
      reportingStream: 'Impact', employeeActualValue: 10, statusUpdate: impact.statusUpdate,
      calculatedRag: 'Green', impactAnnualDefinitionSnapshot: impact.impactAnnualDefinitionSnapshot
    }));
    expect(snapshot.evidence).toEqual([evidence]);
    expect(snapshot.progressEntries).toEqual([ledger.entries[0]]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.items)).toBe(true);
    expect(Object.isFrozen(snapshot.items[0].impactAnnualDefinitionSnapshot?.classification?.businessContributionArea)).toBe(true);
  });

  it('attaches the immutable snapshot to Submit and verifies employee inputs while allowing later manager-owned fields', () => {
    const plan = createQuarterSubmissionTransitionPlan(
      lifecycle, review, [impact], [evidence], [ledger], employee, 'submit-2', '2026-08-01T11:00:00.000Z', 'Ready for review.'
    );
    expect(plan.review).toEqual(expect.objectContaining({
      state: 'Submitted', accessState: 'ManagerDecision', rowVersionToken: 4,
      submissionSnapshot: plan.snapshot
    }));
    expect(plan.audit.afterJson).toContain('KCF-QUARTER-SUBMISSION-001');
    expect(() => assertQuarterSubmissionSnapshotCurrent(plan.review, [{
      ...impact, etag: '"6"', managerOverride: {
        rag: 'Amber', reason: 'Synthetic manager judgement.', actorPersonKey: 'manager',
        actorEmail: 'person013@example.invalid', overriddenAt: '2026-08-02T10:00:00.000Z'
      }, finalApprovedRag: 'Amber'
    }], [evidence], [ledger])).not.toThrow();
  });

  it('rejects actor, quarter, evidence and post-submission employee-value drift', () => {
    expect(() => createQuarterSubmissionSnapshot(
      lifecycle, review, [impact], [evidence], [ledger], other, 'submit-3', '2026-08-01T10:00:00.000Z'
    )).toThrow(/review employee/);
    expect(() => createQuarterSubmissionSnapshot(
      { ...lifecycle, quarterKey: 'Q2' }, review, [impact], [evidence], [ledger], employee,
      'submit-4', '2026-08-01T10:00:00.000Z'
    )).toThrow(/exact finalising quarter/);
    expect(() => createQuarterSubmissionSnapshot(
      lifecycle, review, [{ ...impact, evidenceCount: 2 }], [evidence], [ledger], employee,
      'submit-5', '2026-08-01T10:00:00.000Z'
    )).toThrow(/evidence count/);

    const plan = createQuarterSubmissionTransitionPlan(
      lifecycle, review, [impact], [evidence], [ledger], employee, 'submit-6', '2026-08-01T12:00:00.000Z'
    );
    expect(() => assertQuarterSubmissionSnapshotCurrent(
      plan.review, [{ ...impact, employeeActualValue: 9 }], [evidence], [ledger]
    )).toThrow(/changed after employee submission/);
  });
});
