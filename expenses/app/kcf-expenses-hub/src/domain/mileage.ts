import type { INominal } from './contracts';
import { parseUkDate } from './expenseRules';

export interface IMileageDraft {
  readonly date: string;
  readonly programme: string;
  readonly nominalCode: string;
  readonly from: string;
  readonly to: string;
  readonly returnJourney: boolean;
  readonly outwardMiles: string;
  readonly returnMiles: string;
  readonly purpose: string;
}
export interface IMileageLine extends IMileageDraft {
  readonly id: string;
  readonly claimId: string;
  readonly dateIso: string;
  readonly nominalDescription: string;
  readonly payableMiles: number;
  readonly ratePence: number;
  readonly amountPence: number;
  readonly version: number;
  readonly sequence: number;
}
export interface ISaveMileageCommand {
  readonly claimId: string;
  readonly operationId: string;
  readonly draft: IMileageDraft;
  readonly existingId?: string;
  readonly expectedVersion?: number;
}
export interface IMileageApi {
  list(claimId: string): Promise<ReadonlyArray<IMileageLine>>;
  save(command: ISaveMileageCommand): Promise<IMileageLine>;
}
/** Design mapping only. Live active/effective posting eligibility is not proved. */
export const demoProgrammes: ReadonlyArray<{ name: string; code: string }> = [
  { name: 'CTS Schools', code: '20600' }, { name: 'CTS Street', code: '20650' },
  { name: 'ACE', code: '25600' }, { name: 'Disability / LT', code: '40600' },
  { name: 'VI', code: '40700' }, { name: 'LD', code: '40800' },
  { name: 'Women & Girls', code: '55605' }, { name: 'Cricket Cities', code: '30600' },
  { name: 'Misc', code: '15700' }
];
export type MileageErrors = Partial<Record<keyof IMileageDraft, string>>;

function hundredths(value: string): number | undefined {
  const match = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 100 + Number(((match[2] || '') + '00').slice(0, 2)) : undefined;
}
/** Sum independently entered legs, round once to whole miles, then integer GBP pence. */
export function calculateMileage(draft: IMileageDraft, ratePence: number): { miles: number; pence: number } | undefined {
  const outward = hundredths(draft.outwardMiles);
  const reverse = draft.returnJourney ? hundredths(draft.returnMiles) : 0;
  if (outward === undefined || reverse === undefined || outward <= 0 || (draft.returnJourney && reverse <= 0)
    || !Number.isSafeInteger(ratePence) || ratePence <= 0) return undefined;
  const miles = Math.floor((outward + reverse + 50) / 100);
  const pence = miles * ratePence;
  return miles > 0 && Number.isSafeInteger(pence) ? { miles, pence } : undefined;
}
export function validateMileage(draft: IMileageDraft, master: ReadonlyArray<INominal>, month: string): MileageErrors {
  const errors: MileageErrors = {};
  const iso = parseUkDate(draft.date);
  if (!iso || iso.slice(0, 7) !== month) errors.date = 'Enter a real date in this demo month as dd-mm-yyyy.';
  if (!demoProgrammes.some(item => item.name === draft.programme)) errors.programme = 'Select a demo programme.';
  if (!master.some(item => item.code === draft.nominalCode && item.active && item.travel)) errors.nominalCode = 'Choose an active travel reference. Live eligibility is not verified.';
  if (!draft.from.trim()) errors.from = 'Enter a synthetic start location.';
  if (!draft.to.trim()) errors.to = 'Enter a synthetic destination.';
  if (!draft.purpose.trim()) errors.purpose = 'Describe the journey purpose.';
  const outward = hundredths(draft.outwardMiles);
  if (outward === undefined || outward <= 0) errors.outwardMiles = 'Enter positive manual miles, with at most two decimal places.';
  const reverse = hundredths(draft.returnMiles);
  if (draft.returnJourney && (reverse === undefined || reverse <= 0)) errors.returnMiles = 'Enter the reverse leg separately.';
  if (!errors.outwardMiles && !errors.returnMiles && !calculateMileage(draft, 45)) errors.outwardMiles = 'The journey must round to at least one payable mile.';
  return errors;
}
export function mileageTotal(lines: ReadonlyArray<IMileageLine>): number {
  const total = lines.reduce((sum, line) => sum + line.amountPence, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Mileage total is too large.');
  return total;
}
