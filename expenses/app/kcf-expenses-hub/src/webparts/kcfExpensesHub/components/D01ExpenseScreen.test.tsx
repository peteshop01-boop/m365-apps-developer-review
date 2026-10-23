import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { D01ExpenseScreen } from './D01ExpenseScreen';
import { KcfExpensesHub } from './KcfExpensesHub';
import { MockExpensesService } from '../../../services/MockExpensesService';
import { ExpenseEntryAdapter, createHeldExpenseEntry } from '../../../services/persistence/ExpenseEntryAdapter';
import type { IExpenseEntryDraft, EntryAdmission } from '../../../services/persistence/ExpenseEntryAdapter';
import { ExpensePersistenceService } from '../../../services/persistence/ExpensePersistenceService';
import { creationIdentity } from '../../../services/persistence/PersistenceContract';
import type { IExpensePersistencePort, IPreparedExpense, IStoredExpense } from '../../../services/persistence/PersistenceContract';
import { nominalMaster } from '../../../data/nominals';
import { parseAmountPence, parseUkDate } from '../../../domain/expenseRules';

const { createHash } = jest.requireActual('crypto') as { createHash(name: string): { update(b: Uint8Array): { digest(format: string): string } } };
const digest = async (b: Uint8Array): Promise<string> => createHash('sha256').update(b).digest('hex');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const draft = (): IExpenseEntryDraft => ({ date: '21-10-2026', supplier: 'Synthetic supplier', description: 'Synthetic receipt journey',
  nominalCode: '00010', amount: '12.34', notes: 'Separate notes', receipt: { kind: 'none', reason: 'Synthetic missing receipt reason' } });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
const jpg = new Uint8Array([255, 216, 255, 1, 2]);
const pdf = new TextEncoder().encode('%PDF-1.4\nSynthetic\n%%EOF');

/** Test-only trusted processor, never imported by runtime. Models server actor,
 * parent/month/version, immutable creation ledger and raw file denial. Passing
 * this fake proves UI data flow, not any real SharePoint enforcement. */
class FakeTrustedProcessor {
  public record: IStoredExpense | undefined;
  public bytes: Uint8Array | undefined;
  public submitted: IPreparedExpense[] = [];
  public writes = 0;
  public pending = false;
  public loseBeforeWrite = false;
  public resolveCount = 0;
  public context(): EntryAdmission { return { state: 'Ready', context: { parentId: 101, parentEtag: '"3"', month: '2026-10',
    nominals: nominalMaster, eligibleNominalCodes: ['00010'], existingExpenseIds: this.record ? [this.record.line.id] : [],
    creationClearance: (this.pending && this.writes > 0) || (this.loseBeforeWrite && this.submitted.length > 0) ? 'Unresolved' : 'Clear' } }; }
  public port(actor = 11): IExpensePersistencePort {
    const ready = (): unknown => this.record ? { state: 'Ready', record: clone(this.record) } : { state: 'Absent' };
    return {
      resolve: async op => { this.resolveCount++; return actor !== 11 ? { state: 'Rejected' } : this.record?.operationId === op ? this.pending ? { state: 'Pending' } : ready() : { state: 'Absent' }; },
      submit: async c => {
        this.submitted.push(c);
        if (actor !== 11 || c.parentId !== 101 || c.parentEtag !== '"3"' || parseUkDate(c.date)?.slice(0, 7) !== '2026-10' || c.nominalCode !== '00010') return { state: 'Rejected' };
        if (this.loseBeforeWrite) throw new Error('PRIVATE_FAILURE');
        const fingerprint = await digest(new TextEncoder().encode(creationIdentity(c)));
        if (this.record) return this.record.operationId === c.operationId && this.record.requestFingerprint === fingerprint ? ready() : { state: 'Rejected' };
        if (c.receipt.kind === 'file' && await digest(c.receipt.bytes) !== c.receipt.sha256) return { state: 'Rejected' };
        this.record = { operationId: c.operationId, requestFingerprint: fingerprint, etag: '"1"', line: { id: 7001, parentId: 101,
          expenseLineKey: 'synthetic-line-7001', dateIso: parseUkDate(c.date)!, supplier: c.supplier, description: c.description,
          nominalCode: c.nominalCode, nominalDescription: nominalMaster.find(n => n.code === c.nominalCode)!.description,
          amountPence: parseAmountPence(c.amount)!, notes: c.notes, isVoided: false }, receipt: c.receipt.kind === 'none' ? { ...c.receipt }
            : { kind: 'file', expenseId: 7001, fileName: c.receipt.fileName, mediaType: c.receipt.mediaType, size: c.receipt.bytes.byteLength, sha256: c.receipt.sha256, storage: { kind: 'list-attachment' } } };
        if (c.receipt.kind === 'file') this.bytes = new Uint8Array(c.receipt.bytes);
        this.writes++;
        return this.pending ? { state: 'Pending' } : ready();
      },
      readExpense: async (parent, id) => actor === 11 && parent === 101 && id === this.record?.line.id ? ready() : { state: 'Rejected' },
      readReceipt: async r => {
        if (actor !== 11 || r.expenseId !== this.record?.line.id || !this.bytes) throw new Error('PRIVATE_DENIAL');
        return new Uint8Array(this.bytes);
      }
    };
  }
  public adapter(actor = 11): ExpenseEntryAdapter { return new ExpenseEntryAdapter(new ExpensePersistenceService(this.port(actor), digest), async () => this.context(), () => 'synthetic-operation-entry-001'); }
}

describe('D01 file-to-persistence adapter, fake trusted port only', () => {
  it.each(['supplier', 'description'] as const)('R7 invalid stored %s retains operation and receipt custody', async name => {
    const t = new FakeTrustedProcessor(); t.pending = true; const adapter = t.adapter();
    const file = new File([png], 'receipt.png', { type: 'image/png' });
    const value = { ...draft(), receipt: { kind: 'file' as const, file } };
    expect((await adapter.save(value)).state).toBe('Pending'); const operation = adapter.currentOperationId;
    t.pending = false; t.record = { ...t.record!, line: { ...t.record!.line, [name]: 'x'.repeat(256) } };
    expect((await adapter.checkSave()).state).toBe('Pending'); expect((await adapter.save(value)).state).toBe('Pending');
    expect(adapter.currentOperationId).toBe(operation); expect(adapter.hasAttempt).toBe(true); expect(t.submitted).toHaveLength(1);
    expect(value.receipt.file).toBe(file); expect(t.bytes).toEqual(png);
  });
  it.each(['supplier', 'description'] as const)('R7 rejects long %s before reading a retained receipt, allowing correction', async name => {
    const t = new FakeTrustedProcessor(), adapter = t.adapter();
    const file = new File([png], 'receipt.png', { type: 'image/png' });
    const value = { ...draft(), [name]: 'x'.repeat(256), receipt: { kind: 'file' as const, file } };
    const read = jest.spyOn(FileReader.prototype, 'readAsArrayBuffer');
    try {
      expect((await adapter.save(value)).state).toBe('Rejected');
      expect(read).not.toHaveBeenCalled(); expect(adapter.hasAttempt).toBe(false); expect(t.submitted).toHaveLength(0);
      expect(value[name]).toHaveLength(256); expect(value.receipt.file).toBe(file);
      expect((await adapter.save({ ...value, [name]: 'x'.repeat(255) })).state).toBe('ReadbackVerified');
      expect(t.submitted).toHaveLength(1); expect(t.bytes).toEqual(png);
    } finally { read.mockRestore(); }
  });
  it('uses the immutable held runtime path without a demo parent or write bypass', async () => {
    const adapter = createHeldExpenseEntry();
    expect((await adapter.load()).state).toBe('Held'); expect((await adapter.save(draft())).state).toBe('Held');
    expect(adapter.hasAttempt).toBe(false); expect((await adapter.reopen(7001)).state).toBe('Held');
  });
  it('persists distinct reason/notes and reopens the same ID from another adapter instance', async () => {
    const t = new FakeTrustedProcessor(); const first = await t.adapter().save(draft());
    expect(first.state).toBe('ReadbackVerified'); expect(await t.adapter().reopen(7001)).toEqual(first);
    expect(t.record?.receipt).toEqual(draft().receipt); expect(t.record?.line.notes).toBe('Separate notes'); expect(t.writes).toBe(1);
  });
  it.each([['receipt.jpg', 'image/jpeg', jpg], ['receipt.png', 'image/png', png], ['receipt.pdf', 'application/pdf', pdf]])('passes exact %s bytes and reopens persisted bytes with another instance', async (name, type, bytes) => {
    const t = new FakeTrustedProcessor(); const file = new File([bytes as Uint8Array], name as string, { type: type as string });
    expect((await t.adapter().save({ ...draft(), receipt: { kind: 'file', file } })).state).toBe('ReadbackVerified');
    const reopened = t.adapter(); expect((await reopened.reopen(7001)).state).toBe('ReadbackVerified');
    const receipt = await reopened.openReceipt(7001); expect(receipt.state).toBe('ReceiptBytesVerified');
    if (receipt.state === 'ReceiptBytesVerified') { expect(receipt.bytes).toEqual(bytes); expect(receipt.fileName).toBe(name); }
    expect(t.bytes).toEqual(bytes); expect(t.writes).toBe(1);
  });
  it('coalesces duplicate clicks and only reads the same operation after an ambiguous save', async () => {
    const t = new FakeTrustedProcessor(); t.pending = true; const adapter = t.adapter(); const value = draft();
    const [a, b] = await Promise.all([adapter.save(value), adapter.save(value)]);
    expect(a).toEqual(b); expect(a.state).toBe('Pending'); expect(t.submitted).toHaveLength(1); expect(adapter.hasAttempt).toBe(true);
    const operation = adapter.currentOperationId; expect((await adapter.checkSave()).state).toBe('Pending');
    t.pending = false; expect((await adapter.checkSave()).state).toBe('ReadbackVerified');
    expect(adapter.currentOperationId).toBe(operation); expect(t.submitted).toHaveLength(1); expect(t.writes).toBe(1);
  });
  it('does not resubmit after a lost acknowledgement with an absent reconciliation result', async () => {
    const t = new FakeTrustedProcessor(); t.loseBeforeWrite = true; const adapter = t.adapter();
    expect((await adapter.save(draft())).state).toBe('Pending');
    expect((await adapter.save(draft())).state).toBe('Pending'); expect((await adapter.checkSave()).state).toBe('Pending');
    expect(t.submitted).toHaveLength(1); expect(t.writes).toBe(0);
  });
  it.each([{ date: '21-11-2026' }, { amount: '0' }, { nominalCode: '7000' }, { nominalCode: '00020' },
    { receipt: { kind: 'none', reason: '' } }, { parentId: 101 }, { actor: 11 }, { category: 'hidden' }])('rejects invalid/forged input %j with zero submissions', async mutation => {
    const t = new FakeTrustedProcessor(); const adapter = t.adapter();
    expect((await adapter.save({ ...draft(), ...mutation } as IExpenseEntryDraft)).state).toBe('Rejected'); expect(t.submitted).toHaveLength(0); expect(adapter.hasAttempt).toBe(false);
  });
  it('rejects zero-byte and signature-invalid file placeholders with no submit', async () => {
    const t = new FakeTrustedProcessor();
    for (const file of [new File([], 'receipt.png', { type: 'image/png' }), new File(['fake'], 'receipt.jpg', { type: 'image/jpeg' })]) {
      expect((await t.adapter().save({ ...draft(), receipt: { kind: 'file', file } })).state).toBe('Rejected');
    }
    expect(t.submitted).toHaveLength(0);
  });
  it('rejects a shadowed File.size over 10MiB before FileReader allocates a body', async () => {
    const t = new FakeTrustedProcessor(); const file = new File([new Uint8Array(10485761)], 'r.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 10 });
    const read = jest.spyOn(FileReader.prototype, 'readAsArrayBuffer');
    try {
      expect((await t.adapter().save({ ...draft(), receipt: { kind: 'file', file } })).state).toBe('Rejected');
      expect(read).not.toHaveBeenCalled(); expect(t.submitted).toHaveLength(0);
    } finally { read.mockRestore(); }
  });
  it('does not reopen a changed receipt version against the previously displayed line', async () => {
    const t = new FakeTrustedProcessor(); const adapter = t.adapter();
    await adapter.save({ ...draft(), receipt: { kind: 'file', file: new File([png], 'r.png', { type: 'image/png' }) } });
    t.record = { ...t.record!, etag: '"2"' };
    expect((await adapter.openReceipt(7001)).state).toBe('Unavailable');
    expect((await adapter.reopen(7001)).state).toBe('ReadbackVerified');
    expect((await adapter.openReceipt(7001)).state).toBe('ReceiptBytesVerified');
  });
  it('holds a new form session when the protected context reports an unresolved earlier save', async () => {
    const t = new FakeTrustedProcessor(); t.pending = true;
    expect((await t.adapter().save(draft())).state).toBe('Pending');
    expect((await t.adapter().save(draft())).state).toBe('Held');
    expect(t.submitted).toHaveLength(1); expect(t.writes).toBe(1);
  });
  it('rejects a stale context ETag at the processor without silently replacing it', async () => {
    const t = new FakeTrustedProcessor(); const c = t.context(); if (c.state !== 'Ready') throw new Error('test context');
    const adapter = new ExpenseEntryAdapter(new ExpensePersistenceService(t.port(), digest), async () => ({ state: 'Ready', context: { ...c.context, parentEtag: '"2"' } }), () => 'synthetic-operation-stale-001');
    expect((await adapter.save(draft())).state).toBe('Rejected'); expect(t.writes).toBe(0);
    expect(t.submitted[0].parentEtag).toBe('"2"');
  });
  it('rejects the unrelated actor on resolve/save, raw line and raw receipt', async () => {
    const t = new FakeTrustedProcessor(); await t.adapter().save({ ...draft(), receipt: { kind: 'file', file: new File([png], 'r.png', { type: 'image/png' }) } });
    expect((await t.adapter(22).save(draft())).state).toBe('Rejected'); expect((await t.adapter(22).reopen(7001)).state).toBe('Rejected');
    expect(await t.port(22).readExpense(101, 7001)).toEqual({ state: 'Rejected' });
    if (t.record?.receipt.kind === 'file') await expect(t.port(22).readReceipt(t.record.receipt)).rejects.toThrow('PRIVATE_DENIAL');
    expect(t.writes).toBe(1);
  });
  it('holds incomplete master/context and rejects arbitrary/demo line IDs', async () => {
    const t = new FakeTrustedProcessor(); const c = t.context();
    if (c.state !== 'Ready') throw new Error('test context');
    const adapter = new ExpenseEntryAdapter(new ExpensePersistenceService(t.port(), digest), async () => ({ state: 'Ready', context: { ...c.context, nominals: nominalMaster.slice(0, 3) } }));
    expect((await adapter.load()).state).toBe('Held'); expect((await adapter.save(draft())).state).toBe('Held');
    expect((await t.adapter().reopen('demo-001' as unknown as number)).state).toBe('Rejected'); expect(t.submitted).toHaveLength(0);
  });
});

describe('D01 actual React form, receipt capture and contained persisted preview', () => {
  let host: HTMLDivElement; let t: FakeTrustedProcessor; let originalImage: typeof Image;
  const tick = async (): Promise<void> => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); };
  function el<T extends Element>(selector: string): T { const value = host.querySelector<T>(selector); if (!value) throw new Error(selector); return value; }
  function button(label: string): HTMLButtonElement { const value = Array.from(host.querySelectorAll('button')).find(b => b.textContent === label); if (!value) throw new Error(label); return value; }
  function change(name: string, value: string): void { const input = el<HTMLInputElement>(`#entry-d01-${name}`); act(() => { input.value = value; Simulate.change(input); }); }
  async function render(adapter = t.adapter()): Promise<void> { await act(async () => { ReactDom.render(<D01ExpenseScreen adapter={adapter} idPrefix="entry" active />, host); }); }
  function fill(): void { change('date', '21-10-2026'); change('supplier', 'Synthetic supplier'); change('description', 'Synthetic receipt journey'); change('amount', '12.34'); change('nominal', '00010'); change('notes', 'Separate notes'); }
  async function submit(): Promise<void> { await act(async () => { Simulate.submit(el('form')); }); for (let i = 0; i < 50 && host.textContent?.includes('Checking the retained operation'); i++) await tick(); }
  async function choose(file: File): Promise<void> {
    const input = el<HTMLInputElement>('input[aria-label="Choose receipt photo or PDF"]'); Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { Simulate.change(input); });
    for (let i = 0; i < 60 && button('Save TEST expense').disabled; i++) await tick();
  }
  beforeEach(() => {
    t = new FakeTrustedProcessor(); host = document.createElement('div'); document.body.appendChild(host);
    URL.createObjectURL = jest.fn(() => 'blob:synthetic-only'); URL.revokeObjectURL = jest.fn(); originalImage = window.Image;
    window.Image = function (): HTMLImageElement {
      const image = document.createElement('img'); Object.defineProperty(image, 'naturalWidth', { value: 10 }); Object.defineProperty(image, 'naturalHeight', { value: 10 });
      Object.defineProperty(image, 'src', { get: () => 'blob:synthetic-only', set: () => { Promise.resolve().then(() => image.dispatchEvent(new Event('load'))).catch(() => undefined); } }); return image;
    } as unknown as typeof Image;
  });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); window.Image = originalImage; jest.restoreAllMocks(); });
  it.each(['supplier', 'description'] as const)('R7 focuses overlong %s, retains complete form/receipt, and saves after correction', async name => {
    await render(); fill(); await choose(new File([pdf], 'receipt.pdf', { type: 'application/pdf' }));
    change(name, 'x'.repeat(256)); await submit();
    expect(t.submitted).toHaveLength(0); expect(el<HTMLInputElement>(`#entry-d01-${name}`).value).toHaveLength(256);
    expect(document.activeElement).toBe(el(`#entry-d01-${name}`)); expect(host.textContent).toContain('255 characters');
    act(() => { Simulate.click(button('Close editor — retain form')); });
    act(() => { Simulate.click(button('Return to retained form')); });
    expect(el<HTMLInputElement>(`#entry-d01-${name}`).value).toHaveLength(256); expect(host.textContent).toContain('receipt.pdf');
    change(name, 'x'.repeat(255)); await submit();
    expect(t.submitted).toHaveLength(1); expect(t.bytes).toEqual(pdf); expect(t.record?.line[name]).toHaveLength(255);
  });
  it('is actually referenced by the hub with a held runtime, all195 codes and no Category control', async () => {
    await act(async () => { ReactDom.render(<KcfExpensesHub service={new MockExpensesService(nominalMaster)} instanceId="wired" />, host); });
    await act(async () => { Simulate.click(button('Open D01 TEST Save candidate (held)')); });
    expect(button('Save TEST expense').disabled).toBe(true); expect(host.textContent).toContain('Demo claim IDs are never used here');
    expect(host.querySelectorAll('#kcf-wired-d01-nominal option')).toHaveLength(196);
    expect(host.querySelector('input[name="Category"]')).toBeNull(); expect(t.writes).toBe(0);
  });
  it.each([['r.jpg', 'image/jpeg', jpg], ['r.png', 'image/png', png], ['r.pdf', 'application/pdf', pdf]])('saves actual selected %s bytes then unmounts/reopens same raw record and contained receipt', async (name, type, bytes) => {
    await render(); fill(); await choose(new File([bytes as Uint8Array], name as string, { type: type as string })); await submit();
    expect(host.textContent).toContain('Readback verified for expense 7001'); expect(t.bytes).toEqual(bytes); expect(t.writes).toBe(1);
    act(() => { ReactDom.unmountComponentAtNode(host); }); await render(t.adapter());
    await act(async () => { Simulate.click(button('Reopen expense 7001')); });
    for (let i = 0; i < 60 && !host.querySelector('[aria-label^="View local PDF"], [aria-label^="Enlarge local receipt"]'); i++) await tick();
    expect(host.textContent).toContain('BYTE READBACK / TEST NOT ACCEPTED');
    const open = host.querySelector<HTMLButtonElement>('[aria-label^="View local PDF"], [aria-label^="Enlarge local receipt"]'); expect(open).not.toBeNull();
    act(() => { Simulate.click(open!); }); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    if (type === 'application/pdf') expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe('');
    expect(t.writes).toBe(1);
  });
  it('keeps a selected receipt and every field through pending, close/return and check-only reconciliation', async () => {
    t.pending = true; await render(); fill(); await choose(new File([pdf], 'r.pdf', { type: 'application/pdf' })); await submit();
    expect(host.textContent).toContain('Save outcome pending'); expect(button('Save TEST expense').disabled).toBe(true);
    act(() => { Simulate.click(button('Close editor — retain form')); }); expect(el<HTMLFormElement>('form').hidden).toBe(true);
    act(() => { Simulate.click(button('Return to retained form')); });
    expect(el<HTMLInputElement>('#entry-d01-supplier').value).toBe('Synthetic supplier'); expect(el<HTMLInputElement>('#entry-d01-amount').value).toBe('12.34');
    expect(host.textContent).toContain('r.pdf'); expect(t.submitted).toHaveLength(1);
    t.pending = false; await act(async () => { Simulate.click(button('Check same save operation')); });
    expect(host.textContent).toContain('Readback verified for expense 7001'); expect(t.submitted).toHaveLength(1);
  });
  it('refreshes admission before first Save and retains the selected PDF and form if a prior request appears', async () => {
    let unresolved = false; const original = t.context.bind(t);
    t.context = () => { const value = original(); return value.state === 'Ready'
      ? { state: 'Ready', context: { ...value.context, creationClearance: unresolved ? 'Unresolved' : 'Clear' } } : value; };
    await render(); fill(); await choose(new File([pdf], 'retained.pdf', { type: 'application/pdf' }));
    unresolved = true; await submit();
    expect(t.submitted).toHaveLength(0); expect(t.writes).toBe(0);
    expect(el<HTMLInputElement>('#entry-d01-supplier').value).toBe('Synthetic supplier');
    expect(el<HTMLInputElement>('#entry-d01-amount').value).toBe('12.34'); expect(host.textContent).toContain('retained.pdf');
    expect(host.textContent).not.toContain('Readback verified');
    act(() => { Simulate.click(button('Close editor — retain form')); });
    act(() => { Simulate.click(button('Return to retained form')); });
    expect(host.textContent).toContain('retained.pdf'); expect(el<HTMLInputElement>('#entry-d01-supplier').value).toBe('Synthetic supplier');
  });
  it('keeps invalid/rejected fields and gives no false success or preview', async () => {
    await render(t.adapter(22)); fill();
    const reason = el<HTMLTextAreaElement>('[data-field="receipt"]'); act(() => { reason.value = 'Synthetic reason'; Simulate.change(reason); }); await submit();
    expect(host.textContent).toContain('rejected'); expect(el<HTMLInputElement>('#entry-d01-supplier').value).toBe('Synthetic supplier');
    expect(reason.value).toBe('Synthetic reason'); expect(host.querySelector('[aria-label^="Verified readback expense"]')).toBeNull(); expect(t.writes).toBe(0);
  });
  it('requires a no-receipt reason with zero writes and retains editable fields', async () => {
    await render(); fill(); await submit(); expect(t.submitted).toHaveLength(0); expect(el<HTMLInputElement>('#entry-d01-supplier').value).toBe('Synthetic supplier');
    const reason = el<HTMLTextAreaElement>('[data-field="receipt"]'); act(() => { reason.value = 'Synthetic reason'; Simulate.change(reason); }); await submit();
    expect(host.textContent).toContain('Readback verified for expense 7001'); expect(t.record?.receipt).toEqual({ kind: 'none', reason: 'Synthetic reason' });
  });
});
