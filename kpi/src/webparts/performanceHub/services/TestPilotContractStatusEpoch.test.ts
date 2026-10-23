import { readFileSync } from 'fs';
import { ModelHeader, SafeBusinessRow, StableSnapshot, TrustedCommandSource, TestStatus } from '../models/TestPilotContracts';
import { safeRejectedStatus, verifyStatus, stableRead, SAFE_MESSAGES } from './TestRuntimeBindings';
const f = JSON.parse(readFileSync('data/test-pilot/command-fixtures.json', 'utf8')) as { source: TrustedCommandSource; header: ModelHeader; rows: SafeBusinessRow[] };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function snapshot(epoch: unknown = f.source.correlationKey): StableSnapshot {
  const h = { ...f.header, etag: '"3"', rowVersionToken: 2, correlation: epoch } as ModelHeader;
  return { before: { ...h }, after: { ...h }, complete: true, pages: clone([f.rows]) };
}
function accepted(source = f.source, token = 2): TestStatus {
  return { ...safeRejectedStatus(source, '2026-09-08T12:00:00Z')!, StatusKey: `${source.listId}:${source.itemId}:${encodeURIComponent(source.version)}:SAVED`,
    Outcome: 'Accepted', EventCode: 'SAVED', SafeMessage: SAFE_MESSAGES.SAVED, SubjectKey: source.subjectKey, WorkplanKey: source.workplanKey,
    WorkplanVersion: 1, RowVersionToken: token, ResultKeysJSON: JSON.stringify(source.resultKeys) };
}
describe('SEC-C1-002 dedicated status verifier committed-command epoch', () => {
  it('accepts the correct same-command epoch with complete canonical proof', () => {
    expect(verifyStatus(accepted(), f.source, snapshot(), f.rows)).toBe(true);
  });
  it('rejects the original wrong-both-header epoch despite identical valid rows, identity and tokens', () => {
    const wrong = snapshot('OTHER-COMMAND-EPOCH'); expect(stableRead(wrong, f.rows)).toBe(true);
    expect(wrong.pages).toEqual(snapshot().pages); expect(wrong.after.rowVersionToken).toBe(accepted().RowVersionToken);
    expect(verifyStatus(accepted(), f.source, wrong, f.rows)).toBe(false);
  });
  it.each(['before', 'after'] as const)('rejects wrong %s epoch rather than accepting a mixed read', side => {
    const s = snapshot(); s[side].correlation = 'OTHER-COMMAND-EPOCH';
    expect(verifyStatus(accepted(), f.source, s, f.rows)).toBe(false);
  });
  it.each([null, '', ' ', '\n', 0, false, {}, ['LOCAL-CORR-01']])('rejects absent/malformed canonical epoch %j', epoch => {
    expect(verifyStatus(accepted(), f.source, snapshot(epoch), f.rows)).toBe(false);
  });
  it('rejects missing canonical epoch properties', () => {
    const s = snapshot(); delete (s.before as Partial<ModelHeader>).correlation; delete (s.after as Partial<ModelHeader>).correlation;
    expect(verifyStatus(accepted(), f.source, s, f.rows)).toBe(false);
  });
  it('rejects an absent snapshot or absent public status without manufacturing success', () => {
    expect(verifyStatus(accepted(), f.source)).toBe(false); expect(verifyStatus(undefined, f.source, snapshot(), f.rows)).toBe(false);
    expect(safeRejectedStatus(undefined, '2026-09-08T12:00:00Z')).toBeUndefined();
  });
  it('does not let a forged status plus forged matching headers override the trusted source epoch', () => {
    const status = { ...accepted(), CorrelationKey: 'FORGED-EPOCH' };
    expect(verifyStatus(status, f.source, snapshot('FORGED-EPOCH'), f.rows)).toBe(false);
  });
  it.each([null, '', ' ', '\n', 0, false, {}, 'x'.repeat(1025)])('rejects malformed source/status epoch even when all observations echo it: %j', epoch => {
    const source = { ...f.source, correlationKey: epoch } as TrustedCommandSource;
    const status = { ...accepted(), CorrelationKey: epoch };
    expect(verifyStatus(status, source, snapshot(epoch), f.rows)).toBe(false);
  });
  it('same-value idempotent update needs its own new committed epoch; old rows alone cannot prove it', () => {
    const next: TrustedCommandSource = { ...f.source, commandKey: 'LOCAL-CMD-NEXT', itemId: f.source.itemId + 1, correlationKey: 'LOCAL-CORR-NEXT' };
    const old = snapshot(); const current = snapshot(next.correlationKey);
    current.before.rowVersionToken = current.after.rowVersionToken = 4;
    current.before.etag = current.after.etag = '"5"';
    expect(current.pages).toEqual(old.pages);
    expect(verifyStatus(accepted(next, 4), next, current, f.rows)).toBe(true);
    // Isolate the epoch from value/token differences: keep matching new tokens but the old command epoch.
    const stale = clone(current); stale.before.correlation = stale.after.correlation = f.source.correlationKey;
    expect(stableRead(stale, f.rows)).toBe(true); expect(verifyStatus(accepted(next, 4), next, stale, f.rows)).toBe(false);
  });
  it('CreateWorkplanDraft also requires its own epoch, not an existing matching header', () => {
    const source: TrustedCommandSource = { ...f.source, commandType: 'CreateWorkplanDraft', subjectType: 'Workplan', subjectKey: f.source.workplanKey,
      resultKeys: [f.source.workplanKey!], correlationKey: 'LOCAL-CREATE-EPOCH' };
    expect(verifyStatus(accepted(source), source, snapshot(source.correlationKey), f.rows)).toBe(true);
    expect(verifyStatus(accepted(source), source, snapshot(), f.rows)).toBe(false);
  });
  it.each([
    ['REJECTED', 'Rejected'], ['DUPLICATE', 'Duplicate'], ['FAILED', 'Failed'], ['HELD', 'RecoveryHold']
  ] as const)('preserves safe non-Accepted %s status without claiming canonical success', (event, outcome) => {
    const s: TestStatus = { ...safeRejectedStatus(f.source, '2026-09-08T12:00:00Z')!,
      StatusKey: `${f.source.listId}:${f.source.itemId}:${encodeURIComponent(f.source.version)}:${event}`, EventCode: event, Outcome: outcome, SafeMessage: SAFE_MESSAGES[event] };
    expect(verifyStatus(s, f.source)).toBe(true); expect(s.Outcome).not.toBe('Accepted');
    expect(verifyStatus({ ...s, CorrelationKey: 'OTHER' }, f.source)).toBe(false);
  });
  it('retains strict actor, source, subject, version and full-row proof with the correct epoch', () => {
    for (const patch of [{ ActorPersonKey: 'OTHER' }, { PersonKey: 'OTHER' }, { SourceItemId: 1 }, { SourceItemETag: '"7"' },
      { SubjectKey: 'OTHER' }, { WorkplanKey: 'OTHER' }, { RowVersionToken: 3 }, { WorkplanVersion: 2 }, { PerformanceYear: 2026 }, { ResultKeysJSON: '["OTHER"]' }]) {
      expect(verifyStatus({ ...accepted(), ...patch }, f.source, snapshot(), f.rows)).toBe(false);
    }
    expect(verifyStatus(accepted(), f.source, { ...snapshot(), complete: false }, f.rows)).toBe(false);
    expect(verifyStatus(accepted(), f.source, { ...snapshot(), pages: [] }, f.rows)).toBe(false);
  });
});
