export interface INominal { code: string; description: string; searchText: string; active: boolean; travel: boolean; sortOrder: number; }
export interface IExpenseDraft { date: string; supplier: string; description: string; nominalCode: string; amount: string; noReceiptReason: string; notes: string; }
export interface IExpenseLine extends IExpenseDraft { id: string; amountPence: number; }
/** A backend replacement must independently enforce identity, month, version and idempotency. */
export interface IExpenseDataService {
  readonly mode: 'mock' | 'sharepoint';
  getNominals(): Promise<INominal[]>;
  getExpenses(): Promise<IExpenseLine[]>;
  saveExpense(draft: IExpenseDraft, id?: string): Promise<IExpenseLine>;
}
export function validateExpense(draft: IExpenseDraft, nominals: INominal[]): string[] {
  const errors: string[] = [];
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(draft.date);
  if (!match) errors.push('Enter the date as dd-mm-yyyy.');
  else {
    const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) errors.push('Enter a valid calendar date.');
    else if (month !== 10 || year !== 2026) errors.push('This demo accepts October 2026 dates only.');
  }
  if (!draft.supplier.trim()) errors.push('Enter a supplier.');
  if (!draft.description.trim()) errors.push('Enter an expense description.');
  if (!nominals.some(n => n.code === draft.nominalCode)) errors.push('Select an exact nominal from the reference list.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(draft.amount) || Number(draft.amount) <= 0) errors.push('Enter an amount above zero, with at most two decimal places.');
  if (!draft.noReceiptReason.trim()) errors.push('Enter a reason for no receipt. Uploads are unavailable in this demo.');
  return errors;
}
export function newestFirst(lines: IExpenseLine[]): IExpenseLine[] {
  const key = (date: string): string => date.split('-').reverse().join('');
  return lines.slice().sort((a, b) => key(b.date).localeCompare(key(a.date)) || b.id.localeCompare(a.id));
}
