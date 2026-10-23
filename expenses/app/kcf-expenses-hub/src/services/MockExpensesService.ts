import type { ICurrentClaim, ICurrentClaimApi, IExpenseDraft, IExpenseLine, IExpenseLinesApi, IExpensesService, INominal, INominalsApi, ISaveExpenseCommand } from '../domain/contracts';
import { newestFirst, parseAmountPence, parseUkDate, totalPence, validateExpense } from '../domain/expenseRules';
import { MockMileageService } from './MockMileageService';

export const DEMO_CLAIM: ICurrentClaim = {
  id: 'demo-claim-2026-10', month: '2026-10', status: 'Draft', ownerId: 'synthetic-claimant', mileageTotalPence: 0
};

function copyLine(line: IExpenseLine): IExpenseLine { return { ...line, receipt: { ...line.receipt } }; }
function fingerprint(command: ISaveExpenseCommand): string {
  return JSON.stringify([command.claimId, command.existingId, command.expectedVersion,
    command.draft.nominalCode, command.draft.date, command.draft.supplier, command.draft.description,
    command.draft.amount, command.draft.receipt.kind,
    command.draft.receipt.kind === 'no-receipt' ? command.draft.receipt.reason : command.draft.receipt.fileName,
    command.draft.notes]);
}

/** In-memory only. Mock guards demonstrate the contract; they are not tenant authorisation. */
export class MockExpensesService implements IExpensesService {
  public readonly mode = 'mock' as const;
  public readonly nominals: INominalsApi;
  public readonly currentClaim: ICurrentClaimApi;
  public readonly expenseLines: IExpenseLinesApi;
  public readonly mileage: MockMileageService;
  private readonly master: ReadonlyArray<INominal>;
  private readonly claim: ICurrentClaim;
  private lines: IExpenseLine[] = [];
  private sequence = 0;
  private readonly completed = new Map<string, { fingerprint: string; line: IExpenseLine }>();

  public constructor(nominals: ReadonlyArray<INominal>, claim: ICurrentClaim = DEMO_CLAIM, seed = true) {
    this.master = nominals.map(nominal => ({ ...nominal }));
    this.claim = { ...claim };
    this.mileage = new MockMileageService(this.master, this.claim);
    this.nominals = { getAll: async () => this.master.map(nominal => ({ ...nominal })) };
    this.currentClaim = { get: async () => ({ ...this.claim }) };
    this.expenseLines = {
      list: async claimId => { this.checkClaim(claimId); return newestFirst(this.lines).map(copyLine); },
      save: async command => this.save(command)
    };
    if (seed) this.seed();
  }

  private checkClaim(claimId: string): void {
    if (claimId !== this.claim.id) throw new Error('This mock service only holds the displayed demo claim.');
  }

  private seed(): void {
    const codes = ['20600', '40600', '55605'];
    const samples = [
      { date: '03-10-2026', supplier: 'Demo station kiosk', description: 'Synthetic travel expense', amount: '17.60' },
      { date: '09-10-2026', supplier: 'Demo transport supplier', description: 'Synthetic programme visit', amount: '42.80' },
      { date: '11-10-2026', supplier: 'Demo ticket desk', description: 'Synthetic travel ticket', amount: '12.50' }
    ];
    samples.forEach((sample, index) => {
      const nominal = this.master.find(item => item.code === codes[index]);
      if (!nominal) throw new Error('The approved reference snapshot is incomplete.');
      this.lines.push(this.makeLine({ ...sample, nominalCode: nominal.code,
        receipt: { kind: 'no-receipt', reason: 'Synthetic fixture — no real receipt exists.' }, notes: 'Demo data only.' }, nominal));
    });
  }

  private makeLine(draft: IExpenseDraft, nominal: INominal, existing?: IExpenseLine): IExpenseLine {
    const dateIso = parseUkDate(draft.date);
    const amountPence = parseAmountPence(draft.amount);
    if (!dateIso || amountPence === undefined) throw new Error('Expense validation failed.');
    const sequence = existing ? existing.sequence : ++this.sequence;
    return {
      id: existing ? existing.id : `demo-expense-${sequence.toString().padStart(3, '0')}`,
      claimId: this.claim.id, nominalCode: nominal.code, nominalDescription: nominal.description,
      dateIso, supplier: draft.supplier.trim(), description: draft.description.trim(), amountPence,
      receipt: draft.receipt.kind === 'no-receipt' ? { kind: 'no-receipt', reason: draft.receipt.reason.trim() }
        : { kind: 'demo-receipt', fileName: draft.receipt.fileName.trim() },
      notes: draft.notes.trim(), version: existing ? existing.version + 1 : 1, sequence
    };
  }

  private save(command: ISaveExpenseCommand): IExpenseLine {
    this.checkClaim(command.claimId);
    if (this.claim.status !== 'Draft') throw new Error('Only the draft demo claim is editable.');
    if (!command.operationId.trim()) throw new Error('A mock operation ID is required.');
    const signature = fingerprint(command);
    const previous = this.completed.get(command.operationId);
    if (previous) {
      if (previous.fingerprint !== signature) throw new Error('The same operation ID cannot save different data.');
      return copyLine(previous.line);
    }
    const errors = validateExpense(command.draft, this.master, this.claim.month);
    if (Object.keys(errors).length) throw new Error(Object.keys(errors).map(key => errors[key as keyof typeof errors]).join(' '));
    const nominal = this.master.find(item => item.code === command.draft.nominalCode);
    if (!nominal) throw new Error('Select an exact nominal.');
    const existing = command.existingId ? this.lines.find(line => line.id === command.existingId) : undefined;
    if (command.existingId && !existing) throw new Error('The expense is not in this demo claim.');
    if (existing && existing.version !== command.expectedVersion) throw new Error('This demo expense changed. Reopen it before editing.');
    const line = this.makeLine(command.draft, nominal, existing);
    const next = existing ? this.lines.map(item => item.id === line.id ? line : item) : this.lines.concat(line);
    totalPence(next); // Refuse an unsafe total before mutating the mock.
    this.lines = next;
    this.completed.set(command.operationId, { fingerprint: signature, line: copyLine(line) });
    return copyLine(line);
  }
}
