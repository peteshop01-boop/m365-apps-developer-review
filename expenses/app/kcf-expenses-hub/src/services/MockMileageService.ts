import type { ICurrentClaim, INominal } from '../domain/contracts';
import type { IMileageApi, IMileageDraft, IMileageLine, ISaveMileageCommand } from '../domain/mileage';
import { calculateMileage, mileageTotal, validateMileage } from '../domain/mileage';
import { parseUkDate } from '../domain/expenseRules';

/** Fixed fictional 45p rate; no route calls, storage, transport or role authority. */
export class MockMileageService implements IMileageApi {
  private lines: IMileageLine[] = [];
  private sequence = 0;
  private readonly completed = new Map<string, { signature: string; line: IMileageLine }>();
  private readonly master: ReadonlyArray<INominal>;
  private readonly claim: ICurrentClaim;
  public constructor(master: ReadonlyArray<INominal>, claim: ICurrentClaim) {
    this.master = master.map(item => ({ ...item })); this.claim = { ...claim };
  }
  public async list(claimId: string): Promise<ReadonlyArray<IMileageLine>> {
    this.checkClaim(claimId);
    return this.lines.slice().sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.sequence - a.sequence).map(line => ({ ...line }));
  }
  public async save(command: ISaveMileageCommand): Promise<IMileageLine> {
    this.checkClaim(command.claimId);
    if (this.claim.status !== 'Draft') throw new Error('Only the draft demo claim is editable.');
    if (!command.operationId.trim()) throw new Error('A demo operation ID is required.');
    const signature = JSON.stringify(command);
    const prior = this.completed.get(command.operationId);
    if (prior) {
      if (prior.signature !== signature) throw new Error('A repeated operation cannot contain different data.');
      return { ...prior.line };
    }
    const errors = validateMileage(command.draft, this.master, this.claim.month);
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
    const existing = command.existingId ? this.lines.find(line => line.id === command.existingId) : undefined;
    if (command.existingId && !existing) throw new Error('Journey is outside this demo claim.');
    if (existing && command.expectedVersion !== existing.version) throw new Error('Journey changed. Reopen it before editing.');
    const line = this.makeLine(command.draft, existing);
    const next = existing ? this.lines.map(item => item.id === existing.id ? line : item) : [...this.lines, line];
    mileageTotal(next);
    this.lines = next;
    this.completed.set(command.operationId, { signature, line });
    return { ...line };
  }
  private checkClaim(id: string): void { if (id !== this.claim.id) throw new Error('Unknown demo claim.'); }
  private makeLine(draft: IMileageDraft, existing?: IMileageLine): IMileageLine {
    const amount = calculateMileage(draft, 45);
    const nominal = this.master.find(item => item.code === draft.nominalCode);
    const dateIso = parseUkDate(draft.date);
    if (!amount || !nominal || !dateIso) throw new Error('Invalid demo journey.');
    const sequence = existing ? existing.sequence : ++this.sequence;
    return { ...draft, from: draft.from.trim(), to: draft.to.trim(), purpose: draft.purpose.trim(),
      returnMiles: draft.returnJourney ? draft.returnMiles : '',
      id: existing ? existing.id : `demo-mileage-${sequence}`, claimId: this.claim.id, dateIso,
      nominalDescription: nominal.description, payableMiles: amount.miles, ratePence: 45,
      amountPence: amount.pence, sequence, version: existing ? existing.version + 1 : 1 };
  }
}
