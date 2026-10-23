import { IExpenseDataService, IExpenseDraft, IExpenseLine, INominal, newestFirst, validateExpense } from './ExpenseDataService';
import { approvedNominals } from './approvedNominals';
/** Instance memory only. Reload/remount discards simulated changes. No network or storage. */
export class MockExpenseDataService implements IExpenseDataService {
  public readonly mode = 'mock' as const;
  private sequence = 2;
  private lines: IExpenseLine[] = [{
    id: 'demo-000001', date: '08-10-2026', supplier: 'Demo sports shop',
    description: 'Practice equipment (fictional)', nominalCode: '40603',
    amount: '24.50', amountPence: 2450, noReceiptReason: 'Fictional example', notes: 'Simulated line only'
  }];
  public async getNominals(): Promise<INominal[]> { return approvedNominals.map(n => ({ ...n })); }
  public async getExpenses(): Promise<IExpenseLine[]> { return newestFirst(this.lines.map(l => ({ ...l }))); }
  public async saveExpense(draft: IExpenseDraft, id?: string): Promise<IExpenseLine> {
    const errors = validateExpense(draft, approvedNominals);
    if (errors.length) throw new Error(errors.join(' '));
    if (id && !this.lines.some(line => line.id === id)) throw new Error('The demo line no longer exists.');
    const line: IExpenseLine = { ...draft, id: id || 'demo-' + String(this.sequence++).padStart(6, '0'), amountPence: Math.round(Number(draft.amount) * 100) };
    this.lines = id ? this.lines.map(item => item.id === id ? line : item) : this.lines.concat(line);
    return { ...line };
  }
}
