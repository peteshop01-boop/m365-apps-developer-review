import type { IProductionPerson } from '../models/ProductionModels';
import type { IProgressEntry, IProgressLedger } from '../models/QuarterlyModels';
import { upsertProgressEntry } from './ProgressLedgerValidation';

const actor: IProductionPerson = { id: 1, personKey: 'person', displayName: 'Employee', email: 'person012@example.invalid', appRoles: ['Employee'], active: true };
const ledger: IProgressLedger = {
  id: 1, etag: '"1"', progressLedgerKey: 'item|2026', workplanItemKey: 'item', workplanKey: 'person|2026', personKey: actor.personKey,
  performanceYear: 2026, itemType: 'CoreGold', kpiId: 'SO1-001', entries: [], locked: false, rowVersionToken: 1
};
const entry: IProgressEntry = {
  entryKey: 'entry-1', date: '2026-06-15', note: 'Delivery is progressing.', actorPersonKey: actor.personKey,
  actorEmail: actor.email, updatedAt: '2026-06-15T12:00:00Z', status: 'OnTrack'
};

describe('ProgressLedgerValidation', () => {
  it('denies inherited active without invoking its getter or changing history', () => {
    const person = { ...actor }; delete (person as Partial<IProductionPerson>).active;
    const before = JSON.stringify(ledger); let reads = 0;
    Object.defineProperty(Object.prototype, 'active', { configurable: true, get: () => { reads++; return true; } });
    try { expect(() => upsertProgressEntry(ledger, entry, person)).toThrow(/not authorised/); expect(reads).toBe(0); expect(JSON.stringify(ledger)).toBe(before); }
    finally { delete (Object.prototype as Partial<IProductionPerson>).active; }
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe next-version source %s without mutation', rowVersionToken => {
    const source = { ...ledger, rowVersionToken }; const before = JSON.stringify(source);
    expect(() => upsertProgressEntry(source, entry, actor)).toThrow(/version/); expect(JSON.stringify(source)).toBe(before);
  });
  it('allows the final safe version increment and retains the original header', () => {
    const source = { ...ledger, rowVersionToken: Number.MAX_SAFE_INTEGER - 1 };
    const saved = upsertProgressEntry(source, entry, actor);
    expect(saved.ledger.rowVersionToken).toBe(Number.MAX_SAFE_INTEGER); expect(source.rowVersionToken).toBe(Number.MAX_SAFE_INTEGER - 1);
  });
  it('does not run supplied history methods from a non-array source', () => {
    const findIndex = jest.fn(() => -1); const slice = jest.fn(() => []);
    const source = { ...ledger, entries: { findIndex, slice } as unknown as IProgressEntry[] };
    expect(() => upsertProgressEntry(source, entry, actor)).toThrow(/history/);
    expect(findIndex).not.toHaveBeenCalled(); expect(slice).not.toHaveBeenCalled();
  });
  it('rejects a nontext ledger source key without invoking its supplied trim function', () => {
    const trim = jest.fn(() => ledger.workplanKey);
    expect(() => upsertProgressEntry({ ...ledger, workplanKey: { trim } as unknown as string }, entry, actor)).toThrow(/ledger/);
    expect(trim).not.toHaveBeenCalled();
  });
  it.each(['workplanKey', 'workplanItemKey', 'personKey', 'progressLedgerKey'] as const)('requires nonblank primitive ledger %s', field => {
    const source = { ...ledger, [field]: '' };
    expect(() => upsertProgressEntry(source, entry, actor)).toThrow(/ledger/);
  });
  it.each([0, -1, 2026.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('requires a safe positive ledger year instead of %s', performanceYear => {
    expect(() => upsertProgressEntry({ ...ledger, performanceYear }, entry, actor)).toThrow(/ledger/);
  });
  it.each([undefined, 0, 'true'] as const)('requires an explicit boolean locked field instead of %s', locked => {
    expect(() => upsertProgressEntry({ ...ledger, locked: locked as unknown as boolean }, entry, actor)).toThrow();
  });
  it.each([1, 'true', {}])('does not admit a nonboolean active actor %s', active => {
    expect(() => upsertProgressEntry(ledger, entry, { ...actor, active: active as unknown as boolean })).toThrow(/not authorised/);
  });
  it('does not call a supplied nontext email trim function to admit an actor', () => {
    const trim = jest.fn(() => actor.email);
    const impostor = { ...actor, email: { trim } as unknown as string };
    expect(() => upsertProgressEntry(ledger, entry, impostor)).toThrow(/not authorised/); expect(trim).not.toHaveBeenCalled();
  });
  it.each(['entryKey', 'note'] as const)('does not accept a nontext %s through its supplied trim function', field => {
    const trim = jest.fn(() => 'synthetic-text');
    expect(() => upsertProgressEntry(ledger, { ...entry, [field]: { trim } }, actor)).toThrow(/stable key/);
    expect(trim).not.toHaveBeenCalled();
  });
  it('withholds duplicate matching entry keys instead of replacing an arbitrary first historical row', () => {
    const source = { ...ledger, entries: [entry, { ...entry, note: 'Second historical duplicate' }] };
    const before = JSON.stringify(source);
    expect(() => upsertProgressEntry(source, { ...entry, note: 'New submitted note' }, actor)).toThrow(/ambiguous/);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('retains nonmatching historical rows by reference and preserves normal email normalization', () => {
    const historical = { ...entry, entryKey: 'historical', note: 'Retained history' };
    const source = { ...ledger, entries: [historical] }; const before = JSON.stringify(source);
    const saved = upsertProgressEntry(source, entry, { ...actor, email: ' person012@example.invalid ' });
    expect(saved.ledger.entries.find(item => item.entryKey === 'historical')).toBe(historical);
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each(['2026-02-29', '2026-02-30', '2026-04-31', '2026-06-31'])('rejects impossible date %s without changing existing history', date => {
    const before = JSON.stringify(ledger);
    expect(() => upsertProgressEntry(ledger, { ...entry, date }, actor)).toThrow(/valid date/);
    expect(JSON.stringify(ledger)).toBe(before);
  });
  it.each(['2026-06-15', '2026-06-15T12:00:00', '15 June 2026 12:00:00 GMT', '2026-02-30T12:00:00Z',
    '2026-06-15T24:00:00Z', '2026-06-15T12:00:00Z '])('requires a real explicitly zoned timestamp instead of %s', updatedAt => {
    expect(() => upsertProgressEntry(ledger, { ...entry, updatedAt }, actor)).toThrow(/timestamp/);
  });
  it.each(['https://', 'http://', 'https://user:password@example.invalid/progress', 'https://user@example.invalid/progress',
    'https://example.invalid/line\nbreak', 'https://example.invalid/tab\tbreak', 'https://example.invalid/space here',
    'https://example.invalid\\progress'])('rejects malformed or credential-bearing HTTP(S) URL %s', evidenceLink => {
    expect(() => upsertProgressEntry(ledger, { ...entry, evidenceLink }, actor)).toThrow(/HTTP/);
  });
  it.each(['2024-02-29', '2026-02-28', '2026-04-30'])('retains valid date %s and valid explicitly zoned timestamps', date => {
    const updatedAt = `${date}T12:00:00.123+01:00`;
    const saved = upsertProgressEntry(ledger, { ...entry, date, updatedAt, evidenceLink: 'https://example.invalid/path%20with%20spaces?x=1#entry' }, actor);
    expect(saved.ledger.entries[0]).toEqual(expect.objectContaining({ date, updatedAt })); expect(ledger.entries).toEqual([]);
  });
  it.each(['workplan', 'year', 'item', 'quarter'] as const)('rejects internally complete but mismatched %s quarter association', kind => {
    const scoped: IProgressEntry = { ...entry, date: '2026-08-20', quarter: 'Q4', quarterReviewKey: 'person|2026|Q4',
      quarterReviewItemKey: 'person|2026|Q4|item', entryKey: 'person|2026|Q4|item|2026-08-20' };
    if (kind === 'workplan') scoped.quarterReviewKey = 'other-workplan|Q4';
    else if (kind === 'year') scoped.quarterReviewKey = 'person|2027|Q4';
    else if (kind === 'item') scoped.quarterReviewItemKey = 'person|2026|Q4|other-item';
    else scoped.quarter = 'Q3';
    scoped.entryKey = `${scoped.quarterReviewItemKey}|${scoped.date}`;
    expect(() => upsertProgressEntry(ledger, scoped, actor)).toThrow(/does not match/);
  });
  it('orders equal-date explicit timestamps by their instant without rewriting older source rows', () => {
    const earlier: IProgressEntry = { ...entry, entryKey: 'earlier', updatedAt: '2026-06-15T12:30:00+02:00' };
    const later: IProgressEntry = { ...entry, entryKey: 'later', updatedAt: '2026-06-15T11:00:00Z' };
    const source = { ...ledger, entries: [later] }; const before = JSON.stringify(source);
    const saved = upsertProgressEntry(source, earlier, actor);
    expect(saved.ledger.entries.map(item => item.entryKey)).toEqual(['earlier', 'later']);
    expect(saved.ledger.entries[0].updatedAt).toBe(earlier.updatedAt); expect(saved.ledger.entries[1]).toBe(later);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('retains finer timestamp fraction ordering across explicit timezone offsets', () => {
    const earlier = { ...entry, entryKey: 'earlier', updatedAt: '2026-06-15T12:00:00.123400+02:00' };
    const later = { ...entry, entryKey: 'later', updatedAt: '2026-06-15T10:00:00.123500Z' };
    expect(upsertProgressEntry({ ...ledger, entries: [later] }, earlier, actor).ledger.entries.map(item => item.entryKey)).toEqual(['earlier', 'later']);
  });
  it('preserves retained historical rows and their lexical fallback when timezone association was not recorded', () => {
    const legacy = { ...entry, entryKey: 'legacy', updatedAt: '2026-06-15T10:00:00' };
    const source = { ...ledger, entries: [legacy] }; const before = JSON.stringify(source);
    const saved = upsertProgressEntry(source, { ...entry, entryKey: 'new' }, actor);
    expect(saved.ledger.entries.map(item => item.entryKey)).toEqual(['legacy', 'new']);
    expect(saved.ledger.entries[0]).toBe(legacy); expect(JSON.stringify(source)).toBe(before);
  });
  it('creates then duplicate-safely updates the same chronological entry', () => {
    const created = upsertProgressEntry(ledger, entry, actor);
    expect(created.created).toBe(true);
    expect(created.ledger.entries).toHaveLength(1);
    const updated = upsertProgressEntry(created.ledger, { ...entry, note: 'Updated read-back.' }, actor);
    expect(updated.created).toBe(false);
    expect(updated.ledger.entries).toEqual([{ ...entry, note: 'Updated read-back.' }]);
    expect(updated.ledger.rowVersionToken).toBe(3);
  });

  it('blocks cross-employee, unsafe-link and locked updates', () => {
    expect(() => upsertProgressEntry(ledger, entry, { ...actor, personKey: 'other' })).toThrow(/not authorised/);
    expect(() => upsertProgressEntry(ledger, { ...entry, evidenceLink: 'ftp://example.invalid/file' }, actor)).toThrow(/HTTP/);
    expect(() => upsertProgressEntry({ ...ledger, locked: true }, entry, actor)).toThrow(/read-only/);
  });

  it('creates and updates one quarter-scoped text/link evidence entry without duplication', () => {
    const scoped: IProgressEntry = {
      ...entry,
      entryKey: 'person|2026|Q4|item|2026-08-20',
      quarterReviewKey: 'person|2026|Q4',
      quarterReviewItemKey: 'person|2026|Q4|item',
      quarter: 'Q4',
      date: '2026-08-20',
      note: 'KCF-KPI-015C synthetic linked evidence.',
      evidenceLink: 'https://www.samplefoundation.co.uk/'
    };
    const created = upsertProgressEntry(ledger, scoped, actor);
    const updated = upsertProgressEntry(created.ledger, { ...scoped, note: 'KCF-KPI-015C synthetic linked evidence updated.' }, actor);
    expect(created.created).toBe(true);
    expect(updated.created).toBe(false);
    expect(updated.ledger.entries).toHaveLength(1);
    expect(updated.ledger.entries[0]).toEqual(expect.objectContaining({
      quarterReviewKey: 'person|2026|Q4', quarter: 'Q4', evidenceLink: 'https://www.samplefoundation.co.uk/'
    }));
    expect(() => upsertProgressEntry(ledger, { ...scoped, entryKey: 'tampered' }, actor)).toThrow(/does not match/);
    expect(() => upsertProgressEntry(ledger, { ...scoped, quarterReviewItemKey: undefined }, actor)).toThrow(/complete/);
  });
});
