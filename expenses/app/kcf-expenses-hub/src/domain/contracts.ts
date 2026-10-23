/** Reference snapshot only. Reimbursement eligibility is a future verified data gate. */
import type { IMileageApi } from './mileage';

export interface INominal {
  readonly code: string;
  readonly description: string;
  readonly searchText: string;
  readonly active: boolean;
  readonly travel: boolean;
  readonly sortOrder: number;
}

export type ClaimStatus = 'Draft' | 'Submitted' | 'Approved' | 'Needs Changes';
export interface ICurrentClaim {
  readonly id: string;
  readonly month: string; // YYYY-MM, never interpreted in the browser timezone.
  readonly status: ClaimStatus;
  readonly ownerId: string;
  readonly mileageTotalPence: number;
}

/** Filename metadata in the mock is not an uploaded/persisted receipt. */
export type ReceiptChoice =
  | { readonly kind: 'demo-receipt'; readonly fileName: string }
  | { readonly kind: 'no-receipt'; readonly reason: string };

export interface IExpenseDraft {
  readonly nominalCode: string;
  readonly date: string; // Input/display dd-mm-yyyy; persisted mock line uses dateIso.
  readonly supplier: string;
  readonly description: string;
  readonly amount: string; // Decimal text, converted to integer pence without floating point.
  readonly receipt: ReceiptChoice;
  readonly notes: string;
}

export interface IExpenseLine {
  readonly id: string;
  readonly claimId: string;
  readonly nominalCode: string;
  readonly nominalDescription: string;
  readonly dateIso: string;
  readonly supplier: string;
  readonly description: string;
  readonly amountPence: number;
  readonly receipt: ReceiptChoice;
  readonly notes: string;
  readonly version: number;
  readonly sequence: number;
}

export interface ISaveExpenseCommand {
  readonly claimId: string;
  readonly operationId: string;
  readonly draft: IExpenseDraft;
  readonly existingId?: string;
  readonly expectedVersion?: number;
}

export interface INominalsApi { getAll(): Promise<ReadonlyArray<INominal>>; }
export interface ICurrentClaimApi { get(): Promise<ICurrentClaim>; }
export interface IExpenseLinesApi {
  list(claimId: string): Promise<ReadonlyArray<IExpenseLine>>;
  save(command: ISaveExpenseCommand): Promise<IExpenseLine>;
}

/** Future authenticated implementation only; D00 does not provide an upload route. */
export interface IReceiptReference {
  readonly id: string;
  readonly expenseId: string;
  readonly fileName: string;
  readonly mediaType: string;
}
export interface IReceiptApi {
  list(claimId: string, expenseId: string): Promise<ReadonlyArray<IReceiptReference>>;
  upload(claimId: string, expenseId: string, file: File, expectedVersion: number, operationId: string): Promise<IReceiptReference>;
  open(claimId: string, expenseId: string, receiptId: string): Promise<Blob>;
}

/** Inject one adapter into the web part. No tenant URL or caller-supplied role is accepted here. */
export interface IExpensesService {
  readonly mode: 'mock' | 'sharepoint-test';
  readonly nominals: INominalsApi;
  readonly currentClaim: ICurrentClaimApi;
  readonly expenseLines: IExpenseLinesApi;
  readonly mileage?: IMileageApi;
  readonly receipts?: IReceiptApi;
}
