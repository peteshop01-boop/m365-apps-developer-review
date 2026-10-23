import type { IExpenseDraft, IExpenseLine, INominal } from './contracts';

export type ExpenseField = 'nominalCode' | 'date' | 'supplier' | 'description' | 'amount' | 'receipt' | 'notes';
export type ExpenseErrors = Partial<Record<ExpenseField, string>>;

export function parseUkDate(value: string): string | undefined {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return undefined;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatUkDate(iso: string): string {
  const parts = iso.split('-');
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function parseAmountPence(value: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return undefined;
  const fraction = ((match[2] || '') + '00').slice(0, 2);
  const pence = Number(match[1]) * 100 + Number(fraction);
  return Number.isSafeInteger(pence) && pence > 0 ? pence : undefined;
}

export function formatMoney(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function normalise(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '');
}

export function searchNominals(nominals: ReadonlyArray<INominal>, query: string): INominal[] {
  const words = normalise(query).trim().split(/\s+/).filter(Boolean);
  return nominals.filter(nominal => {
    // Expand the approved Lord's Taverners description for the Sponsor's LT alias.
    const alias = /lord.?s taverners/i.test(nominal.description) ? ' LT' : '';
    const haystack = normalise(`${nominal.code} ${nominal.description} ${nominal.searchText}${alias}`);
    return words.every(word => haystack.indexOf(word) >= 0);
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

export function newestFirst(lines: ReadonlyArray<IExpenseLine>): IExpenseLine[] {
  return lines.slice().sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.sequence - a.sequence || a.id.localeCompare(b.id));
}

export function totalPence(lines: ReadonlyArray<IExpenseLine>): number {
  const total = lines.reduce((sum, line) => sum + line.amountPence, 0);
  if (!Number.isSafeInteger(total)) throw new Error('The total is too large to represent accurately.');
  return total;
}

export function validateExpense(draft: IExpenseDraft, nominals: ReadonlyArray<INominal>, claimMonth: string): ExpenseErrors {
  const errors: ExpenseErrors = {};
  if (!nominals.some(nominal => nominal.code === draft.nominalCode && nominal.active)) {
    errors.nominalCode = 'Choose an exact nominal code from the reference list.';
  }
  const iso = parseUkDate(draft.date);
  if (!iso) errors.date = 'Enter a real date as dd-mm-yyyy.';
  else if (iso.slice(0, 7) !== claimMonth) errors.date = 'Use a date in this demo claim month.';
  if (!draft.supplier.trim()) errors.supplier = 'Enter the supplier.';
  if (!draft.description.trim()) errors.description = 'Describe the expense.';
  if (parseAmountPence(draft.amount) === undefined) errors.amount = 'Enter a positive GBP amount with at most two decimal places.';
  if (draft.receipt.kind === 'no-receipt' && !draft.receipt.reason.trim()) errors.receipt = 'Explain why there is no receipt.';
  if (draft.receipt.kind === 'demo-receipt' && !/\.(jpe?g|png|pdf|heic|heif)$/i.test(draft.receipt.fileName.trim())) {
    errors.receipt = 'Select a supported local photo or PDF. No file is uploaded.';
  }
  return errors;
}
