import { MileageEntryAdapter } from './MileageEntryAdapter';
import type { IMileageEntryContext, IMileageEntryPort, IStoredMileage } from './MileageEntryAdapter';
import type { IMileageDraft } from '../../domain/mileage';
import { calculateMileage } from '../../domain/mileage';
import { selectMileageRate, mileageAmountPence } from '../../domain/mileageRates';
import { nominalMaster } from '../../data/nominals';
import { parseUkDate } from '../../domain/expenseRules';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const mileageDraft = (): IMileageDraft => ({ date: '21-10-2026', programme: 'synthetic-programme', nominalCode: '20600', from: 'Synthetic A', to: 'Synthetic B', returnJourney: true, outwardMiles: '5.25', returnMiles: '6.30', purpose: 'Synthetic manual journey' });
/** Source harness only. No credentials, URLs, HTTP or imported production use. */
export class FakeMileageProcessor {
  public record: IStoredMileage | undefined;
  public submissions = 0;
  public reconciliations = 0;
  public ambiguous = false;
  public unavailable = false;
  public clearance: 'Clear' | 'Unresolved' = 'Clear';
  public contextValue: IMileageEntryContext = { actorId: 11, parentId: 101, parentEtag: '"3"', month: '2026-10',
    programmes: [{ key: 'synthetic-programme', name: 'Synthetic programme', nominalCodes: ['20600'] }],
    rates: { listTitle: 'KCFEXP_TEST102_MileageRates', snapshotVersion: 'synthetic-rate-v7', retrievedAtMs: 1, complete: true,
      rows: [{ Title: 'Synthetic four-decimal rate', Active: true, EffectiveFrom: '2026-01-01', EffectiveTo: null, RatePerMile: 0.1234 }] },
    existingIds: [], creationClearance: 'Clear' };
  public port(actor = 11): IMileageEntryPort {
    const read = (): unknown => actor !== 11 ? { state: 'Rejected' } : this.record ? { state: 'Ready', record: clone(this.record) } : { state: 'Pending' };
    return {
      context: async () => this.unavailable ? { state: 'Held' } : { state: 'Ready', context: clone({ ...this.contextValue, actorId: actor, existingIds: this.record ? [this.record.id] : [], creationClearance: this.clearance }) },
      submit: async c => {
        this.submissions++;
        if (actor !== 11 || c.parentId !== 101 || c.parentEtag !== '"3"' || c.expectedRateVersion !== 'synthetic-rate-v7') return { state: 'Rejected' };
        if (this.ambiguous) throw new Error('PRIVATE_TRANSPORT_DETAILS');
        if (this.record) return { state: 'Rejected' };
        const rate = selectMileageRate(this.contextValue.rates, parseUkDate(c.draft.date)!);
        const wholeMiles = calculateMileage(c.draft, 1)!.miles;
        this.record = { id: 801, requestId: 901, originatorId: actor, etag: '"1"', command: clone(c),
          programmeName: 'Synthetic programme', nominalDescription: nominalMaster.find(n => n.code === c.draft.nominalCode)!.description,
          wholeMiles, amountPence: mileageAmountPence(wholeMiles, rate), rate };
        return { state: 'Accepted' };
      },
      reconcile: async (p, op) => { this.reconciliations++; return p === 101 && (!this.record || this.record.command.operationId === op) ? read() : { state: 'Rejected' }; },
      recover: async p => p === 101 ? read() : { state: 'Rejected' },
      read: async (p, id) => p === 101 && id === this.record?.id ? read() : { state: 'Rejected' }
    };
  }
  public adapter(actor = 11): MileageEntryAdapter { return new MileageEntryAdapter(this.port(actor), () => 'mileage-synthetic-operation-0001'); }
}

