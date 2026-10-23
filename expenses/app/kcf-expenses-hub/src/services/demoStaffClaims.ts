import type { IDemoStaffClaim } from '../webparts/kcfExpensesHub/components/PageContracts';
/** No actual staff, records or roles. Immutable fixture source; root owns session flags. */
export const demoStaffClaims: ReadonlyArray<IDemoStaffClaim> = Array.from({ length: 24 }, (_, index) => ({
  id: `synthetic-colleague-${index}`, employeeName: `Demo colleague ${String.fromCharCode(65 + index)}`,
  managerName: index < 12 ? 'Synthetic manager A' : 'Synthetic manager B', month: '2026-10',
  status: index === 0 ? 'Submitted' as const : index === 1 ? 'Approved' as const : 'Draft' as const,
  selfApproval: false, financeAcknowledged: false,
  lines: index === 0 ? [
    { id: 'colleague-a-expense-1', kind: 'Expense' as const, dateIso: '2026-10-03', title: 'Demo station kiosk',
      detail: 'Synthetic travel expense. No receipt: fictional fixture only.', nominalCode: '20600', amountPence: 1760, version: 1 },
    { id: 'colleague-a-expense-2', kind: 'Expense' as const, dateIso: '2026-10-09', title: 'Demo transport supplier',
      detail: 'Synthetic programme visit. Filename reference demo-ticket.pdf only; no uploaded receipt.', nominalCode: '40600', amountPence: 4280, version: 1 },
    { id: 'colleague-a-mileage-1', kind: 'Mileage' as const, dateIso: '2026-10-11', title: 'Demo start → Demo sports ground',
      detail: 'CTS Schools · Return · outward 10.2 + reverse 9.8 =20 whole miles ×45p illustrative rate.', nominalCode: '20600', amountPence: 900, version: 1 }
  ] : []
}));
