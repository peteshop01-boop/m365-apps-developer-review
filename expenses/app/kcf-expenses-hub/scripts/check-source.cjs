/* Dependency-free source checks; NOT an SPFx compiler/build or browser test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'src/webparts/kcfExpensesHub/components');
const sample = JSON.parse(fs.readFileSync(path.resolve(root, '../../design/data/nominals_approved_195.json'), 'utf8'));
const read = name => fs.readFileSync(path.join(folder, name), 'utf8').replace(/^\uFEFF/, '');
const nominalSource = read('approvedNominals.ts');
const copied = JSON.parse(nominalSource.slice(nominalSource.indexOf('= ') + 2).trim().replace(/;$/, ''));
assert.deepEqual(copied, sample.nominals, 'All 195 entries must match the source exactly');
assert.equal(copied.length, 195);
assert.equal(new Set(copied.map(n => n.code)).size, 195);
assert.ok(copied.filter(n => n.searchText.toLowerCase().includes('lt')).some(n => n.code === '40600'));
const preview = fs.readFileSync(path.resolve(root, '../../design/preview/KCF_Expenses_Design_Review_v3.html'), 'utf8');
const embedded = /<img[^>]+src="data:image\/png;base64,([^"]+)"/.exec(preview);
assert.deepEqual(fs.readFileSync(path.join(root, 'src/webparts/kcfExpensesHub/assets/foundation-portrait-white.png')), Buffer.from(embedded[1], 'base64'));
const service = stripTypeScriptTypes(read('ExpenseDataService.ts').replace(/export /g, ''));
const mock = stripTypeScriptTypes(read('MockExpenseDataService.ts').replace(/^import .*;\r?$/gm, '').replace(/export /g, ''));
const context = vm.createContext({ approvedNominals: copied });
vm.runInContext(service + '\n' + mock + '\nglobalThis.provider = new MockExpenseDataService(); globalThis.validate = validateExpense;', context);
(async () => {
  const provider = context.provider;
  const original = await provider.getExpenses();
  const draft = { date: '11-10-2026', supplier: 'Fictional supplier', description: 'Demo equipment', nominalCode: '40603', amount: '10.25', noReceiptReason: 'Fictional example', notes: 'Demo notes' };
  const added = await provider.saveExpense(draft);
  assert.equal(added.amountPence, 1025);
  assert.equal((await provider.getExpenses()).length, original.length + 1);
  const edited = await provider.saveExpense({ ...draft, amount: '12.30' }, added.id);
  assert.equal(edited.id, added.id);
  const lines = await provider.getExpenses();
  assert.equal(lines.length, original.length + 1);
  assert.equal(lines[0].id, added.id);
  assert.equal(lines.reduce((sum, l) => sum + l.amountPence, 0), 3680);
  for (const invalid of [{ date: '31-10-2026x' }, { date: '31-02-2026' }, { date: '01-11-2026' }, { nominalCode: 'free text' }, { noReceiptReason: '' }, { amount: '0' }, { amount: '1.001' }, { supplier: ' ' }]) {
    await assert.rejects(() => provider.saveExpense({ ...draft, ...invalid }));
    assert.equal((await provider.getExpenses()).length, lines.length);
  }
  await assert.rejects(() => provider.saveExpense(draft, 'forged-demo-id'));
  const detached = await provider.getExpenses(); detached[0].amountPence = 999;
  assert.equal((await provider.getExpenses())[0].amountPence, 1230);
  assert.equal((await provider.getNominals()).length, 195);
  console.log('PASS: exact 195-code snapshot, LT search reference, exact embedded PNG, mock Add/Edit, stable ID, ordering, penny totals, invalid-input zero mutation, unknown-ID rejection, detached reads.');
  console.log('NOT TESTED: TSX/SCSS compilation, rendered Add/Edit/Cancel, keyboard, desktop/physical phone, SharePoint or deployment.');
})().catch(error => { console.error(error); process.exitCode = 1; });
