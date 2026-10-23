import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseUkDate, formatUkDate, parseAmountPence, newestFirst, totalPence, searchNominals, validateExpense } from '../.tools/domain-tests/domain/expenseRules.mjs';
import { MockExpensesService, DEMO_CLAIM } from '../.tools/domain-tests/services/MockExpensesService.mjs';
import { nominalMaster } from '../.tools/domain-tests/data/nominals.mjs';

const original = JSON.parse(fs.readFileSync(new URL('../../../design/data/nominals_approved_195.json', import.meta.url), 'utf8'));
const master = original.nominals;
const draft = overrides => ({ nominalCode: '20600', date: '11-10-2026', supplier: 'Synthetic seller',
  description: 'Synthetic test expense', amount: '0.10', receipt: { kind: 'no-receipt', reason: 'Synthetic test without a receipt' },
  notes: 'No real claim', ...overrides });
const command = (operationId, overrides = {}) => ({ claimId: DEMO_CLAIM.id, operationId, draft: draft(), ...overrides });

test('Bundled crest matches exact derived design header PNG bytes', () => {
  const preview = fs.readFileSync(new URL('../../../design/preview/KCF_Expenses_Design_Review_v3.html', import.meta.url), 'utf8');
  const embedded = /<img[^>]+src="data:image\/png;base64,([^"]+)"/.exec(preview);
  assert.ok(embedded, 'Approved embedded header PNG exists');
  assert.deepEqual(fs.readFileSync(new URL('../src/assets/foundation-logo.png', import.meta.url)), Buffer.from(embedded[1], 'base64'));
});

test('Generated master preserves all 195 entries, order, metadata and leading zeros', () => {
  assert.deepEqual(nominalMaster, master);
  assert.equal(master.length, 195);
  assert.equal(new Set(master.map(n => n.code)).size, 195);
  assert.equal(master[0].code, '00010');
});

test('UK dates validate actual leap-year days without local timezone conversion', () => {
  assert.equal(parseUkDate('29-02-2024'), '2024-02-29');
  assert.equal(parseUkDate('29-02-2000'), '2000-02-29');
  assert.equal(parseUkDate('29-02-1900'), undefined);
  for (const invalid of ['29-02-2026', '31-04-2026', '00-10-2026', '01-13-2026', '1-10-2026', '2026-10-11', '11/10/2026', '']) {
    assert.equal(parseUkDate(invalid), undefined, invalid);
  }
  assert.equal(formatUkDate('2026-10-11'), '11-10-2026');
});

test('Date ordering crosses day and month boundaries and retains deterministic ties', () => {
  const lines = [{ id: 'a', dateIso: '2026-09-30', sequence: 1 }, { id: 'b', dateIso: '2026-10-02', sequence: 2 },
    { id: 'c', dateIso: '2026-10-11', sequence: 3 }, { id: 'd', dateIso: '2026-10-11', sequence: 4 }];
  assert.deepEqual(newestFirst(lines).map(n => n.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(newestFirst([...lines].reverse()).map(n => n.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(lines.map(n => n.id), ['a', 'b', 'c', 'd']);
});

test('Amounts use exact integer pence and reject zero, negatives, exponents and excess precision', () => {
  assert.equal(parseAmountPence('0.10'), 10);
  assert.equal(parseAmountPence('17.6'), 1760);
  assert.equal(parseAmountPence('0012.50'), 1250);
  assert.equal(parseAmountPence(' 12 '), 1200);
  for (const value of ['0', '0.00', '-1', '1.001', '1e2', 'NaN', 'Infinity', '£4', '4,50', '9007199254740991']) assert.equal(parseAmountPence(value), undefined, value);
  assert.equal(totalPence([{ amountPence: 10 }, { amountPence: 20 }]), 30);
  assert.throws(() => totalPence([{ amountPence: Number.MAX_SAFE_INTEGER }, { amountPence: 1 }]));
});

test('Search finds exact codes and descriptions without losing unfiltered master records', () => {
  assert.equal(searchNominals(master, '').length, 195);
  assert.equal(searchNominals(master, '00010')[0].code, '00010');
  assert.ok(searchNominals(master, 'sChOoLs TRAVEL').some(n => n.code === '20600'));
  assert.equal(searchNominals(master, 'definitely absent synthetic xyz').length, 0);
  assert.equal(searchNominals(master, '.*').length, 0);
});

test('LT alias returns the full Lord\'s Taverners description and LT travel records', () => {
  const matches = searchNominals(master, 'LT');
  for (const n of master.filter(n => /lord.?s taverners/i.test(n.description) || /\blt\b/i.test(n.searchText))) assert.ok(matches.some(m => m.code === n.code), n.code);
  assert.ok(matches.some(n => n.code === '40000'));
  assert.ok(matches.some(n => n.code === '40600'));
});

test('Unselected nominal free text and wrong-month dates fail validation', () => {
  assert.ok(validateExpense(draft({ nominalCode: 'Schools travel' }), master, '2026-10').nominalCode);
  assert.ok(validateExpense(draft({ date: '30-09-2026' }), master, '2026-10').date);
  assert.deepEqual(validateExpense(draft(), master, '2026-10'), {});
});

test('Supplier, expense description and a receipt reference or reason are required', () => {
  for (const field of ['supplier', 'description']) assert.ok(validateExpense(draft({ [field]: ' ' }), master, '2026-10')[field]);
  assert.ok(validateExpense(draft({ receipt: { kind: 'no-receipt', reason: ' ' } }), master, '2026-10').receipt);
  assert.ok(validateExpense(draft({ receipt: { kind: 'demo-receipt', fileName: 'payload.exe' } }), master, '2026-10').receipt);
  for (const fileName of ['synthetic.pdf', 'demo.JPG', 'demo.png']) assert.deepEqual(validateExpense(draft({ receipt: { kind: 'demo-receipt', fileName } }), master, '2026-10'), {});
});

test('Synthetic seed has three latest-first rows and exactly £72.90 total', async () => {
  const service = new MockExpensesService(master);
  const lines = await service.expenseLines.list(DEMO_CLAIM.id);
  assert.deepEqual(lines.map(n => n.dateIso), ['2026-10-11', '2026-10-09', '2026-10-03']);
  assert.equal(totalPence(lines), 7290);
  assert.equal(service.mode, 'mock');
  assert.equal(service.receipts, undefined);
});

test('Add and edit retain one immutable ID and update totals exactly once', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  const added = await service.expenseLines.save(command('add'));
  const updated = await service.expenseLines.save(command('edit', { existingId: added.id, expectedVersion: added.version, draft: draft({ amount: '0.30', notes: 'Edited synthetic note' }) }));
  assert.equal(updated.id, added.id);
  assert.equal(updated.claimId, DEMO_CLAIM.id);
  assert.equal(updated.version, 2);
  const lines = await service.expenseLines.list(DEMO_CLAIM.id);
  assert.equal(lines.length, 1);
  assert.equal(totalPence(lines), 30);
  assert.equal(lines[0].notes, 'Edited synthetic note');
  assert.equal(lines[0].nominalDescription, master.find(n => n.code === '20600').description);
});

test('Two simultaneous duplicate mock requests produce exactly one line', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  const [a, b] = await Promise.all([service.expenseLines.save(command('same')), service.expenseLines.save(command('same'))]);
  assert.equal(a.id, b.id);
  assert.equal((await service.expenseLines.list(DEMO_CLAIM.id)).length, 1);
});

test('Duplicate receipt metadata is independent of object key ordering', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  const a = await service.expenseLines.save(command('same', { draft: draft({ receipt: { kind: 'demo-receipt', fileName: 'demo.pdf' } }) }));
  const b = await service.expenseLines.save(command('same', { draft: draft({ receipt: { fileName: 'demo.pdf', kind: 'demo-receipt' } }) }));
  assert.equal(a.id, b.id);
});

test('Reusing a mock operation ID for changed input is rejected without mutation', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  await service.expenseLines.save(command('same'));
  await assert.rejects(service.expenseLines.save(command('same', { draft: draft({ amount: '2.00' }) })), /different data/);
  assert.equal(totalPence(await service.expenseLines.list(DEMO_CLAIM.id)), 10);
});

test('Invalid mock saves perform zero writes', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  for (const [field, value] of [['nominalCode', '99999'], ['date', '31-02-2026'], ['date', '01-11-2026'], ['amount', '0'], ['supplier', '']]) {
    await assert.rejects(service.expenseLines.save(command(`${field}-${value}`, { draft: draft({ [field]: value }) })));
  }
  await assert.rejects(service.expenseLines.save(command('no-receipt', { draft: draft({ receipt: { kind: 'no-receipt', reason: '' } }) })));
  assert.equal((await service.expenseLines.list(DEMO_CLAIM.id)).length, 0);
});

test('Mock contract rejects a forged claim and an expense outside its held claim', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  await assert.rejects(service.expenseLines.list('other-claim'));
  await assert.rejects(service.expenseLines.save(command('forged', { claimId: 'other-claim' })));
  await assert.rejects(service.expenseLines.save(command('missing', { existingId: 'other-expense', expectedVersion: 1 })));
  assert.equal((await service.expenseLines.list(DEMO_CLAIM.id)).length, 0);
});

test('Mock stale edit is rejected and saved values remain intact', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  const line = await service.expenseLines.save(command('add'));
  await service.expenseLines.save(command('edit1', { existingId: line.id, expectedVersion: 1, draft: draft({ amount: '1.50' }) }));
  await assert.rejects(service.expenseLines.save(command('stale', { existingId: line.id, expectedVersion: 1, draft: draft({ amount: '2.50' }) })), /changed/);
  const saved = await service.expenseLines.list(DEMO_CLAIM.id);
  assert.equal(saved[0].version, 2);
  assert.equal(totalPence(saved), 150);
});

test('Submitted and approved mock claims refuse edits', async () => {
  for (const status of ['Submitted', 'Approved']) {
    const service = new MockExpensesService(master, { ...DEMO_CLAIM, status }, false);
    await assert.rejects(service.expenseLines.save(command('locked')), /draft/);
    assert.equal((await service.expenseLines.list(DEMO_CLAIM.id)).length, 0);
  }
});

test('Returned references cannot mutate the service; a new instance resets the demo', async () => {
  const service = new MockExpensesService(master, DEMO_CLAIM, false);
  const added = await service.expenseLines.save(command('add'));
  added.receipt.reason = 'Attempted external mutation';
  const returned = await service.expenseLines.list(DEMO_CLAIM.id);
  returned[0].supplier = 'Changed outside the service';
  returned[0].receipt.reason = 'Changed outside the service';
  const nominalRead = await service.nominals.getAll(); nominalRead[0].description = 'External mutation';
  const claim = await service.currentClaim.get(); claim.status = 'Submitted';
  const actual = await service.expenseLines.list(DEMO_CLAIM.id);
  assert.equal(actual[0].supplier, 'Synthetic seller');
  assert.equal(actual[0].receipt.reason, 'Synthetic test without a receipt');
  assert.equal((await service.nominals.getAll())[0].description, master[0].description);
  assert.equal((await service.currentClaim.get()).status, 'Draft');
  assert.equal((await new MockExpensesService(master, DEMO_CLAIM, false).expenseLines.list(DEMO_CLAIM.id)).length, 0);
});
