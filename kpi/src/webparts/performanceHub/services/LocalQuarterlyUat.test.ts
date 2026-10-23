import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type { IAnnualWorkplan, ICoreKpiCatalogueItem, ICoreWorkplanItem, IPersonalWorkplanItem, IProductionPerson } from '../models/ProductionModels';
import type { IProgressEntry, IProgressLedger, IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import QuarterlyReviewPage from '../components/QuarterlyReviewPage';
import { canEmployeeUpdateQuarterProgress } from './QuarterReviewAuthorisation';
import {
  addLocalQuarterProgress,
  buildLocalPersonalQuarterContext,
  buildLocalQuarterLifecycle,
  LOCAL_QUARTERLY_CONFIG,
  saveLocalCoreQuarterItem,
  saveLocalPersonalQuarterItem
} from './LocalQuarterlyUat';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const workplan: IAnnualWorkplan = {
  id: -1, etag: 'LOCAL-UAT', workplanKey: 'local-person|2026', personKey: 'local-person',
  employeeDisplayName: 'Local Employee', employeeEmail: 'local@example.invalid', performanceYear: 2026,
  managerPersonKey: 'local-manager', managerDisplayName: 'Local Manager', managerEmail: 'manager@example.invalid',
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', coreCategoryWeight: 80,
  personalCategoryWeight: 10, behaviourCategoryWeight: 10, rowVersionToken: 1
};
const employee: IProductionPerson = {
  id: -1, personKey: 'local-person', displayName: 'Local Employee', email: 'local@example.invalid',
  managerPersonKey: 'local-manager', managerEmail: 'manager@example.invalid', appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: -2, personKey: 'local-manager', displayName: 'Local Manager', email: 'manager@example.invalid', appRoles: ['Manager'], active: true
};

const personal = (patch: Partial<IPersonalWorkplanItem> = {}): IPersonalWorkplanItem => ({
  id: -10, etag: 'LOCAL-UAT', workplanItemKey: 'personal-1', naturalKey: 'local-person|2026|LocalPersonal|personal-1',
  workplanKey: workplan.workplanKey, personKey: workplan.personKey, performanceYear: 2026, wording: 'Local Personal KPI',
  description: 'Controlled local-only definition', measure: 'Completed outcomes', measureType: 'Count', scoringDirection: 'HigherIsBetter',
  unitLabel: 'outcomes', yearEndTargetValue: 100, q1TargetValue: 100, q2TargetValue: 50, q3TargetValue: 80,
  q4TargetValue: 100, personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true, ...patch
});

const withIncoming = (context: IQuarterReviewContext, patch: Partial<IQuarterReviewItem>): IQuarterReviewItem => ({
  ...context.items[0], statusUpdate: 'Controlled local progress.', ...patch
});

const recovery = {
  route: 'Recover' as const, action: 'Complete the agreed recovery step.', ownerPersonKey: employee.personKey,
  dueDate: '2026-02-10', nextReviewDate: '2026-02-05', status: 'Active' as const, expectedReturnToGreenDate: '2026-02-20'
};

const coreDefinition = (patch: Partial<ICoreKpiCatalogueItem> = {}): ICoreKpiCatalogueItem => ({
  kpiId: 'CORE-001', kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|target-v1',
  wording: 'Controlled Core KPI', pillar: 'Synthetic pillar', workstream: 'Synthetic workstream',
  scoringDirection: 'HigherIsBetter', metricType: 'Count', unitLabel: 'outcomes', yearEndTargetValue: 100,
  q1TargetValue: 20, q2TargetValue: 40, q3TargetValue: 60, q4TargetValue: 80, ...patch
});
const coreAssignment = (patch: Partial<ICoreWorkplanItem> = {}): ICoreWorkplanItem => ({
  id: -40, etag: 'LOCAL-UAT', workplanItemKey: 'core-1', naturalKey: workplan.workplanKey + '|CoreGold|CORE-001',
  workplanKey: workplan.workplanKey, personKey: workplan.personKey, performanceYear: 2026, kpiId: 'CORE-001',
  kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|target-v1', coreWorkplanWeight: 100,
  displayOrder: 1, activeInWorkplan: true, ...patch
});
const coreContext = (definition: ICoreKpiCatalogueItem = coreDefinition()): IQuarterReviewContext =>
  buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], 'Q1', [definition], [coreAssignment()]);

describe('PM128 explicit local open-current simulation', () => {
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('preserves default lifecycle and production progress denial for %s', quarter => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], quarter);
    expect(context.lifecycle.status).toBe('Finalising');
    expect(context.lifecycle.isCurrentQuarter).toBe(quarter === 'Q4');
    expect(canEmployeeUpdateQuarterProgress(employee, context.lifecycle, context.review, context.items[0])).toBe(false);
  });
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('allows explicitly simulated %s while retaining lock/current/closed guards', quarter => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], quarter, [], [], true);
    expect(context.lifecycle.status).toBe('Open'); expect(context.lifecycle.isCurrentQuarter).toBe(true);
    expect(canEmployeeUpdateQuarterProgress(employee, context.lifecycle, context.review, context.items[0])).toBe(true);
    expect(canEmployeeUpdateQuarterProgress(employee, { ...context.lifecycle, isCurrentQuarter: false }, context.review, context.items[0])).toBe(false);
    expect(canEmployeeUpdateQuarterProgress(employee, { ...context.lifecycle, isOpenForProgressUpdates: false }, context.review, context.items[0])).toBe(false);
    expect(canEmployeeUpdateQuarterProgress(employee, { ...context.lifecycle, status: 'Locked' }, context.review, context.items[0])).toBe(false);
    expect(canEmployeeUpdateQuarterProgress(employee, context.lifecycle, context.review, { ...context.items[0], locked: true })).toBe(false);
  });
});

describe('PM128 controlled local Core quarter capability', () => {
  it.each([['Q1', 20], ['Q2', 40], ['Q3', 60], ['Q4', 80]] as const)('captures %s Core target %s with retained Impact', (quarter, target) => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], quarter, [coreDefinition()], [coreAssignment()]);
    expect(context.items).toHaveLength(2);
    expect(context.items[0]).toEqual(expect.objectContaining({ itemType: 'CoreGold', kpiId: 'CORE-001',
      quarterTargetValue: target, kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|target-v1' }));
    expect(context.items[1].itemType).toBe('LocalPersonal');
  });
  it('provides an explicit controlled Core save capability', () => {
    expect(typeof saveLocalCoreQuarterItem).toBe('function');
  });
  it('saves Actual and Forecast against immutable target and retained evidence count', () => {
    const context = coreContext(); const item = { ...context.items[0], evidenceCount: 2 }; context.items[0] = item;
    const saved = saveLocalCoreQuarterItem(context, { ...item, employeeActualValue: 20, quarterEndForecastValue: 30,
      quarterTargetValue: 1, statusUpdate: 'Synthetic Core result' });
    expect(saved.items[0]).toEqual(expect.objectContaining({ quarterTargetValue: 20, employeeActualValue: 20,
      quarterEndForecastValue: 30, progressPct: 100, calculatedRag: 'Green', evidenceCount: 2 }));
    expect(saved.items[1]).toBe(context.items[1]); expect(saved.evidence).toBe(context.evidence);
    expect(saved.progressLedgers).toBe(context.progressLedgers);
  });
  it.each(['Fraction', 'LowerIsBetter', 'NotRated'])('retains governed %s scoring', semantics => {
    const definition = semantics === 'Fraction' ? coreDefinition({ metricType: 'Percentage', percentageSourceScale: 'Fraction', q1TargetValue: 0.5 })
      : semantics === 'LowerIsBetter' ? coreDefinition({ scoringDirection: 'LowerIsBetter', baselineValue: 40 })
        : coreDefinition({ scoringDirection: 'TBC' });
    const context = coreContext(definition);
    const saved = saveLocalCoreQuarterItem(context, { ...context.items[0], employeeActualValue: semantics === 'Fraction' ? 0.45 : 20,
      statusUpdate: 'Controlled semantics' });
    expect(saved.items[0].calculatedRag).toBe(semantics === 'NotRated' ? 'NotRated' : 'Green');
    if (semantics !== 'NotRated') expect(saved.items[0].progressPct).toBe(semantics === 'Fraction' ? 90 : 100);
  });
  it.each(['missing', 'duplicate', 'kpi-version', 'target-version', 'foreign'])('withholds %s annual Core source', failure => {
    const catalogue = failure === 'missing' ? [] : failure === 'duplicate' ? [coreDefinition(), coreDefinition()] : [coreDefinition()];
    const row = coreAssignment(failure === 'kpi-version' ? { kpiVersionKey: 'other' }
      : failure === 'target-version' ? { targetVersionKey: 'other' } : failure === 'foreign' ? { personKey: 'other' } : {});
    expect(() => buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], 'Q1', catalogue, [row])).toThrow();
  });
  it('detaches supplied catalogue and annual assignments before later edits', () => {
    const definition = coreDefinition(); const assignment = coreAssignment();
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], 'Q1', [definition], [assignment]);
    definition.q1TargetValue = 1; assignment.kpiVersionKey = 'changed';
    expect(Object.isFrozen(context.coreCatalogue)).toBe(true);
    expect(context.coreCatalogue[0].q1TargetValue).toBe(20);
    const saved = saveLocalCoreQuarterItem(context, { ...context.items[0], employeeActualValue: 20, statusUpdate: 'Detached source' });
    expect(saved.items[0].progressPct).toBe(100);
  });
  it('withholds read-only and changed-catalogue Core saves', () => {
    const context = coreContext();
    if (!context.review) throw new Error('Expected Core review.');
    context.review = { ...context.review, state: 'Locked', accessState: 'ReadOnly' };
    expect(() => saveLocalCoreQuarterItem(context, { ...context.items[0], employeeActualValue: 20 })).toThrow(/read-only/);
    context.review = { ...context.review, state: 'Draft', accessState: 'EmployeeEdit' };
    context.coreCatalogue = [{ ...context.coreCatalogue[0], targetVersionKey: 'changed' }];
    expect(() => saveLocalCoreQuarterItem(context, { ...context.items[0], employeeActualValue: 20 })).toThrow(/version/i);
  });
  it.each(['missing', 'duplicate'])('withholds %s Core catalogue during save', source => {
    const context = coreContext();
    context.coreCatalogue = source === 'missing' ? [] : [context.coreCatalogue[0], context.coreCatalogue[0]];
    expect(() => saveLocalCoreQuarterItem(context, { ...context.items[0], employeeActualValue: 20 })).toThrow(/one exact/);
  });
  it('rejects catalogue accessor input without invoking it', () => {
    const definition = coreDefinition(); const getter = jest.fn(() => 20);
    Object.defineProperty(definition, 'q1TargetValue', { enumerable: true, get: getter });
    expect(() => coreContext(definition)).toThrow(); expect(getter).not.toHaveBeenCalled();
  });
  it('attributes Core progress and evidence to its captured Core source', () => {
    const context = coreContext(); const item = context.items[0];
    const entry: IProgressEntry = { entryKey: item.quarterReviewItemKey + '|2026-01-10', quarterReviewKey: item.quarterReviewKey,
      quarterReviewItemKey: item.quarterReviewItemKey, quarter: item.quarter, date: '2026-01-10',
      note: 'Captured Core progress', actorPersonKey: employee.personKey, actorEmail: employee.email,
      updatedAt: '2026-01-10T09:00:00Z', evidenceLink: 'https://example.invalid/core' };
    const updated = addLocalQuarterProgress(context, item, entry);
    expect(updated.progressLedgers[0].kpiId).toBe('CORE-001');
    expect(updated.evidence[0].kpiId).toBe('CORE-001');
    expect(updated.items[0].calculatedRag).toBe('NotRated');
  });
});

const progressFixture = (): { context: IQuarterReviewContext; item: IQuarterReviewItem; entry: IProgressEntry; ledger: IProgressLedger } => {
  const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], 'Q1');
  const item = context.items[0];
  const entry: IProgressEntry = {
    entryKey: item.quarterReviewItemKey + '|2026-01-10', quarterReviewKey: item.quarterReviewKey,
    quarterReviewItemKey: item.quarterReviewItemKey, quarter: item.quarter, date: '2026-01-10',
    note: 'Controlled local note', actorPersonKey: employee.personKey, actorEmail: employee.email,
    updatedAt: '2026-01-10T09:00:00Z', evidenceLink: 'https://example.invalid/local'
  };
  const ledger: IProgressLedger = {
    id: -2000, etag: 'LOCAL-UAT', progressLedgerKey: item.workplanItemKey + '|2026',
    workplanKey: item.workplanKey, workplanItemKey: item.workplanItemKey, personKey: item.personKey,
    performanceYear: item.performanceYear, itemType: item.itemType, entries: [], locked: false, rowVersionToken: 1
  };
  return { context, item, entry, ledger };
};

describe('PM128 local Personal save context boundary', () => {
  it.each(['review', 'access', 'transition', 'lifecycle-quarter', 'lifecycle-year', 'closed', 'status',
    'locked', 'foundation', 'actor', 'actor-person', 'actor-email', 'membership', 'duplicate', 'etag',
    'row-id', 'workplan', 'person', 'year', 'quarter', 'review-key', 'item-type'])('withholds %s save without mutation', boundary => {
    const { context, item } = progressFixture();
    if (!context.review) throw new Error('Expected controlled review fixture.');
    if (boundary === 'review') context.review = { ...context.review, state: 'Locked' };
    if (boundary === 'access') context.review = { ...context.review, accessState: 'ReadOnly' };
    if (boundary === 'transition') context.review = { ...context.review, transitionStatus: 'Failed' };
    if (boundary === 'lifecycle-quarter') context.lifecycle = { ...context.lifecycle, quarterKey: 'Q2' };
    if (boundary === 'lifecycle-year') context.lifecycle = { ...context.lifecycle, performanceYearNumber: 2027 };
    if (boundary === 'closed') context.lifecycle = { ...context.lifecycle, isOpenForProgressUpdates: false };
    if (boundary === 'status') context.lifecycle = { ...context.lifecycle, status: 'Locked' };
    if (boundary === 'locked') context.items = [{ ...item, locked: true }];
    if (boundary === 'foundation') context.dataFoundationReady = false;
    if (boundary === 'actor') context.employee = { ...employee, active: false };
    if (boundary === 'actor-person') context.employee = { ...employee, personKey: 'other' };
    if (boundary === 'actor-email') context.employee = { ...employee, email: 'other@example.invalid' };
    if (boundary === 'membership') context.items = [];
    if (boundary === 'duplicate') context.items = [item, { ...item }];
    if (boundary === 'etag') context.items = [{ ...item, etag: 'next' }];
    if (boundary === 'row-id') context.items = [{ ...item, id: -9090 }];
    const incoming = { ...item, employeeActualValue: 100, statusUpdate: 'Controlled update' };
    if (boundary === 'workplan') incoming.workplanKey = 'other|2026';
    if (boundary === 'person') incoming.personKey = 'other';
    if (boundary === 'year') incoming.performanceYear = 2027;
    if (boundary === 'quarter') incoming.quarter = 'Q2';
    if (boundary === 'review-key') incoming.quarterReviewKey = 'other|Q1';
    if (boundary === 'item-type') incoming.itemType = 'CoreGold';
    const oldItems = context.items;
    expect(() => saveLocalPersonalQuarterItem(context, incoming)).toThrow();
    expect(context.items).toBe(oldItems);
    expect(item.employeeActualValue).toBeUndefined();
  });

  it('rejects a canonical item anchored to a foreign review source', () => {
    const { context, item } = progressFixture();
    const foreign = { ...item, workplanKey: 'other|2026', personKey: 'other' };
    context.items = [foreign];
    expect(() => saveLocalPersonalQuarterItem(context, { ...foreign, employeeActualValue: 100, statusUpdate: 'Update' })).toThrow();
  });

  it.each(['save', 'progress'])('withholds a contradictory locked lifecycle on %s', route => {
    const { context, item, entry } = progressFixture();
    context.lifecycle = { ...context.lifecycle, status: 'Locked', isOpenForProgressUpdates: true };
    expect(() => route === 'save' ? saveLocalPersonalQuarterItem(context, { ...item, employeeActualValue: 100, statusUpdate: 'Update' })
      : addLocalQuarterProgress(context, item, entry)).toThrow();
  });

  it('keeps the authoritative target and unrelated item/history/evidence references', () => {
    const { context, item } = progressFixture();
    const unrelated = { ...item, workplanItemKey: 'other-item', quarterReviewItemKey: item.quarterReviewKey + '|other-item' };
    context.items = [item, unrelated];
    const updated = saveLocalPersonalQuarterItem(context, { ...item, quarterTargetValue: 1, employeeActualValue: 100, statusUpdate: 'Update' });
    expect(updated.items[0].quarterTargetValue).toBe(100);
    expect(updated.items[0].progressPct).toBe(100);
    expect(updated.items[1]).toBe(unrelated);
    expect(updated.progressLedgers).toBe(context.progressLedgers);
    expect(updated.evidence).toBe(context.evidence);
  });
});

describe('PM128 source-bound local progress integration', () => {
  it.each(['legacy', 'other-quarter'])('rejects %s entry attribution in the selected quarter route', attribution => {
    const { context, item, entry } = progressFixture();
    const supplied = attribution === 'legacy' ? { ...entry, quarterReviewKey: undefined, quarterReviewItemKey: undefined, quarter: undefined }
      : { ...entry, quarter: 'Q2' as const, quarterReviewKey: workplan.workplanKey + '|Q2',
        quarterReviewItemKey: workplan.workplanKey + '|Q2|' + item.workplanItemKey,
        entryKey: workplan.workplanKey + '|Q2|' + item.workplanItemKey + '|' + entry.date };
    expect(() => addLocalQuarterProgress(context, item, supplied)).toThrow();
  });

  it('keeps legacy Core history without assigning a missing KPIID', () => {
    const { context, item, entry, ledger } = progressFixture();
    const core = { ...item, itemType: 'CoreGold' as const, kpiId: 'CORE-001' };
    const legacy = { ...ledger, itemType: 'CoreGold' as const };
    context.items = [core]; context.progressLedgers = [legacy];
    const updated = addLocalQuarterProgress(context, core, entry);
    expect(updated.progressLedgers).toHaveLength(2);
    expect(updated.progressLedgers[0]).toBe(legacy);
    expect(updated.progressLedgers[1].kpiId).toBe('CORE-001');
  });

  it('enforces the approved annual entry limit', () => {
    const { context, item, entry, ledger } = progressFixture();
    context.progressLedgers = [{ ...ledger, entries: Array.from({ length: 12 }, (_, index) => ({
      ...entry, entryKey: 'old-' + index, date: '2025-12-01', evidenceLink: undefined
    })) }];
    expect(() => addLocalQuarterProgress(context, item, entry)).toThrow(/12/);
  });

  it('rejects an ambiguous existing matching entry key', () => {
    const { context, item, entry, ledger } = progressFixture();
    context.progressLedgers = [{ ...ledger, entries: [entry, { ...entry }] }];
    expect(() => addLocalQuarterProgress(context, item, entry)).toThrow(/ambiguous/);
  });

  it('excludes withdrawn evidence from the active count without deleting it', () => {
    const { context, item, entry } = progressFixture();
    const first = addLocalQuarterProgress(context, item, entry);
    const withdrawn = { ...first.evidence[0], evidenceKey: 'previous|LINK', status: 'Withdrawn' as const };
    context.evidence = [withdrawn];
    const updated = addLocalQuarterProgress(context, item, entry);
    expect(updated.evidence[0]).toBe(withdrawn);
    expect(updated.items[0].evidenceCount).toBe(1);
  });

  it('preserves a foreign annual ledger sharing the item key', () => {
    const { context, item, entry, ledger } = progressFixture();
    const foreign = { ...ledger, workplanKey: 'other|2026', personKey: 'other', rowVersionToken: 8 };
    context.progressLedgers = [foreign, ledger];
    const updated = addLocalQuarterProgress(context, item, entry);
    expect(updated.progressLedgers).toHaveLength(2);
    expect(updated.progressLedgers[0]).toBe(foreign);
    expect(updated.progressLedgers[1].rowVersionToken).toBe(2);
    expect(ledger.entries).toEqual([]);
  });

  it('rejects duplicate full-source ledgers without deleting either', () => {
    const { context, item, entry, ledger } = progressFixture();
    context.progressLedgers = [ledger, { ...ledger }];
    expect(() => addLocalQuarterProgress(context, item, entry)).toThrow();
    expect(context.progressLedgers).toHaveLength(2);
  });

  it.each([
    { date: '2026-02-30' }, { updatedAt: 'invalid' }, { actorPersonKey: 'other' },
    { evidenceLink: 'file:///local' }, { quarterReviewKey: 'other|Q1' }, { entryKey: 'other' }, { note: ' ' }
  ])('uses validated entry admission for %j', patch => {
    const { context, item, entry } = progressFixture();
    expect(() => addLocalQuarterProgress(context, item, { ...entry, ...patch })).toThrow();
    expect(context.progressLedgers).toEqual([]);
    expect(context.evidence).toEqual([]);
  });

  it.each([NaN, Number.MAX_SAFE_INTEGER])('rejects unsafe existing version %s', rowVersionToken => {
    const { context, item, entry, ledger } = progressFixture();
    context.progressLedgers = [{ ...ledger, rowVersionToken }];
    expect(() => addLocalQuarterProgress(context, item, entry)).toThrow();
  });

  it.each(['review', 'access', 'transition', 'lifecycle', 'closed', 'locked', 'foundation', 'actor', 'membership', 'duplicate', 'stale'])('withholds %s context', boundary => {
    const { context, item, entry } = progressFixture();
    if (!context.review) throw new Error('Expected controlled review fixture.');
    if (boundary === 'review') context.review = { ...context.review, state: 'Locked' };
    if (boundary === 'access') context.review = { ...context.review, accessState: 'ReadOnly' };
    if (boundary === 'transition') context.review = { ...context.review, transitionStatus: 'InProgress' };
    if (boundary === 'lifecycle') context.lifecycle = { ...context.lifecycle, quarterKey: 'Q2' };
    if (boundary === 'closed') context.lifecycle = { ...context.lifecycle, isOpenForProgressUpdates: false };
    if (boundary === 'locked') context.items = [{ ...item, locked: true }];
    if (boundary === 'foundation') context.dataFoundationReady = false;
    if (boundary === 'actor') context.employee = { ...employee, active: false };
    if (boundary === 'membership') context.items = [];
    if (boundary === 'duplicate') context.items = [item, { ...item }];
    if (boundary === 'stale') context.items = [{ ...item, etag: 'new-version' }];
    expect(() => addLocalQuarterProgress(context, item, entry)).toThrow();
  });

  it('preserves a colliding evidence key belonging to another source', () => {
    const { context, item, entry } = progressFixture();
    const foreign = {
      evidenceKey: entry.entryKey + '|LINK', kind: 'Link' as const, personKey: 'other', workplanKey: 'other|2026',
      workplanItemKey: item.workplanItemKey, quarterReviewKey: item.quarterReviewKey,
      quarterReviewItemKey: item.quarterReviewItemKey, performanceYear: 2026, quarter: item.quarter,
      description: 'Preserved foreign reference', url: 'https://example.invalid/other', status: 'Draft' as const
    };
    context.evidence = [foreign];
    const updated = addLocalQuarterProgress(context, item, entry);
    expect(updated.evidence).toHaveLength(2);
    expect(updated.evidence[0]).toBe(foreign);
    expect(updated.items[0].evidenceCount).toBe(1);
  });

  it('binds a supplied Core KPIID to its new ledger and evidence', () => {
    const { context, item, entry } = progressFixture();
    const core = { ...item, itemType: 'CoreGold' as const, kpiId: 'CORE-001' };
    context.items = [core];
    const updated = addLocalQuarterProgress(context, core, entry);
    expect(updated.progressLedgers[0].kpiId).toBe('CORE-001');
    expect(updated.evidence[0].kpiId).toBe('CORE-001');
  });

  it('updates only its own history entry and retains an unrelated old row reference', () => {
    const { context, item, entry, ledger } = progressFixture();
    const old = { ...entry, entryKey: item.quarterReviewItemKey + '|2026-01-09', date: '2026-01-09', evidenceLink: undefined };
    context.progressLedgers = [{ ...ledger, entries: [old, entry], rowVersionToken: 4 }];
    const updated = addLocalQuarterProgress(context, item, { ...entry, note: 'Replacement' });
    expect(updated.progressLedgers[0].entries[0]).toBe(old);
    expect(updated.progressLedgers[0].entries[1].note).toBe('Replacement');
    expect(updated.progressLedgers[0].rowVersionToken).toBe(5);
  });
});

describe('KCF-KPI-018-R1 local Personal Quarterly adapter', () => {
  it('derives the selected Count target and scores a complete Actual', () => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], 'Q1');
    const saved = saveLocalPersonalQuarterItem(context, withIncoming(context, { employeeActualValue: 100 }));
    expect(saved.items[0]).toEqual(expect.objectContaining({ quarterTargetValue: 100, progressPct: 100, calculatedRag: 'Green' }));
  });

  it('preserves Fraction-scale Percentage semantics', () => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal({
      measureType: 'Percentage', percentageSourceScale: 'Fraction', q2TargetValue: 0.5, unitLabel: '%'
    })], 'Q2');
    const saved = saveLocalPersonalQuarterItem(context, withIncoming(context, { employeeActualValue: 0.45 }));
    expect(saved.items[0]).toEqual(expect.objectContaining({ progressPct: 90, calculatedRag: 'Green', percentageSourceScale: 'Fraction' }));
  });

  it('scores an approved Lower-is-better definition from its baseline', () => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal({
      scoringDirection: 'LowerIsBetter', baselineValue: 200, q3TargetValue: 100
    })], 'Q3');
    const saved = saveLocalPersonalQuarterItem(context, withIncoming(context, { employeeActualValue: 100 }));
    expect(saved.items[0]).toEqual(expect.objectContaining({ progressPct: 100, calculatedRag: 'Green', baselineValue: 200 }));
  });

  it('keeps incomplete target/scoring input visible and explicitly NotRated', () => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal({ q4TargetValue: undefined })], 'Q4');
    const saved = saveLocalPersonalQuarterItem(context, withIncoming(context, { employeeActualValue: 1 }));
    expect(saved.items[0]).toEqual(expect.objectContaining({ calculatedRag: 'NotRated' }));
    expect(saved.items[0].scoringMessage).toMatch(/target is required/i);
  });

  it.each([[80, 'Amber'], [40, 'Red']] as const)('renders Recovery for %s/100 %s Personal progress', (actual, rag) => {
    const initial = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], 'Q1');
    const context = saveLocalPersonalQuarterItem(initial, withIncoming(initial, { employeeActualValue: actual, recovery }));
    expect(context.items[0].calculatedRag).toBe(rag);
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(QuarterlyReviewPage, {
      workplan: { ...workplan, state: 'Submitted' }, config: LOCAL_QUARTERLY_CONFIG,
      lifecycles: [buildLocalQuarterLifecycle('Q1')], selectedQuarter: 'Q1', context,
      loading: false, saving: false, onSelectQuarter: async () => undefined, onPrepare: async () => undefined,
      onSaveItem: async () => undefined, onAddProgress: async () => undefined, onSubmit: async () => undefined
    }));
    expect(html).toContain('Recovery action · required for Amber/Red');
    expect(html).toContain('Current Actual');
    expect(html).toContain('Quarter-end forecast');
    expect(html).toContain(`${actual}% progress against target · ${actual}% delivery score`);
    expect(html).toContain('Status Update / Notes');
    expect(html).toContain('Progress notes');
    expect(html).toContain('Evidence: 0');
  });

  it('stores linked Evidence as an explicit Draft browser-memory reference', () => {
    const context = buildLocalPersonalQuarterContext(workplan, employee, manager, [personal()], 'Q1');
    const item = context.items[0];
    const entry: IProgressEntry = {
      entryKey: `${item.quarterReviewItemKey}|2026-01-10`, quarterReviewKey: item.quarterReviewKey,
      quarterReviewItemKey: item.quarterReviewItemKey, quarter: item.quarter, date: '2026-01-10',
      note: 'Local evidence note', actorPersonKey: employee.personKey, actorEmail: employee.email,
      updatedAt: '2026-01-10T09:00:00Z', evidenceLink: 'https://example.invalid/evidence'
    };
    const updated = addLocalQuarterProgress(context, item, entry);
    expect(updated.evidence).toEqual([expect.objectContaining({ kind: 'Link', status: 'Draft', url: entry.evidenceLink })]);
    expect(updated.items[0].evidenceCount).toBe(1);
    expect(updated.progressLedgers[0].entries).toEqual([entry]);
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(QuarterlyReviewPage, {
      workplan: { ...workplan, state: 'Submitted' }, config: LOCAL_QUARTERLY_CONFIG,
      lifecycles: [buildLocalQuarterLifecycle('Q1')], selectedQuarter: 'Q1', context: updated,
      loading: false, saving: false, onSelectQuarter: async () => undefined, onPrepare: async () => undefined,
      onSaveItem: async () => undefined, onAddProgress: async () => undefined, onSubmit: async () => undefined
    }));
    expect(html).toContain('Evidence state: Draft');
  });

  it('has a source-level no-network/no-production-service boundary', () => {
    const fs = require('fs');
    const path = require('path');
    const source = [
      fs.readFileSync(path.resolve('.', 'src', 'webparts', 'performanceHub', 'components', 'LocalWorkplanUatHarness.tsx'), 'utf8'),
      fs.readFileSync(path.resolve('.', 'src', 'webparts', 'performanceHub', 'services', 'LocalQuarterlyUat.ts'), 'utf8')
    ].join('\n');
    expect(source).not.toMatch(/SharePointProductionDataService|SPHttpClient|fetch\s*\(|postJson|mergeJson/);
    expect(source).toContain('browser memory');
  });
});
