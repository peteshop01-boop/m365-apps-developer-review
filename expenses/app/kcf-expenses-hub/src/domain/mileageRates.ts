/** Offline reference validation only. A supplied snapshot is not a trusted tenant read. */
export class MileageValidationError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MileageValidationError';
    Object.setPrototypeOf(this, MileageValidationError.prototype);
  }
}

export function mileageCheck(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new MileageValidationError(code, message);
}

export function mileageRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mileageText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Date-only boundary: the future SharePoint reader must explicitly normalise its dates. */
export function validMileageDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export interface IMileageRateSnapshot {
  readonly listTitle: 'KCFEXP_TEST102_MileageRates';
  readonly snapshotVersion: string;
  readonly retrievedAtMs: number;
  readonly complete: boolean;
  readonly rows: unknown;
}

export interface ISelectedMileageRate {
  readonly listTitle: 'KCFEXP_TEST102_MileageRates';
  readonly snapshotVersion: string;
  readonly rowIndex: number;
  readonly title: string;
  readonly journeyDate: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly ratePerMileGbp: number;
  /** Integer units of GBP 0.0001; never integer pence or an assumed default rate. */
  readonly rateTenThousandthsGbp: number;
}

function rateUnits(value: unknown): number {
  mileageCheck(typeof value === 'number' && Number.isFinite(value) && value > 0,
    'RATE_VALUE', 'RatePerMile must be a positive numeric pound rate.');
  // Parse the numeric decimal representation. Multiplication by 10000 wrongly
  // rejects legitimate values such as 0.0003 because of binary floating point.
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  mileageCheck(match, 'RATE_PRECISION', 'RatePerMile must have at most four decimal places in pounds.');
  const units = Number(match[1] + (match[2] || '').padEnd(4, '0'));
  mileageCheck(Number.isSafeInteger(units) && units > 0, 'RATE_VALUE', 'RatePerMile is outside exact arithmetic bounds.');
  return units;
}

/** Inclusive effective dates, exactly one active match. Invalid rows fail closed,
 * including invalid inactive rows; no silent filtering of corrupt reference data. */
export function selectMileageRate(snapshot: IMileageRateSnapshot, journeyDate: string): ISelectedMileageRate {
  mileageCheck(validMileageDate(journeyDate), 'JOURNEY_DATE', 'Enter a valid journey date.');
  mileageCheck(snapshot && snapshot.listTitle === 'KCFEXP_TEST102_MileageRates'
    && mileageText(snapshot.snapshotVersion) && snapshot.complete === true
    && Number.isSafeInteger(snapshot.retrievedAtMs) && snapshot.retrievedAtMs >= 0 && Array.isArray(snapshot.rows),
  'RATE_SOURCE', 'A versioned central mileage-rate snapshot is required.');
  const matches: ISelectedMileageRate[] = [];
  Array.from(snapshot.rows).forEach((row: unknown, rowIndex: number) => {
    mileageCheck(mileageRecord(row) && mileageText(row.Title), 'RATE_ROW', 'Mileage rate row is malformed.');
    mileageCheck(typeof row.Active === 'boolean', 'RATE_ACTIVE', 'Mileage rate Active must be a boolean.');
    mileageCheck(validMileageDate(row.EffectiveFrom), 'RATE_DATE', 'Mileage rate start date is invalid.');
    const effectiveTo = row.EffectiveTo === '' || row.EffectiveTo === null ? null : row.EffectiveTo;
    mileageCheck(effectiveTo === null || validMileageDate(effectiveTo), 'RATE_DATE', 'Mileage rate end date is invalid.');
    mileageCheck(effectiveTo === null || effectiveTo >= row.EffectiveFrom, 'RATE_DATE', 'Mileage rate date range is reversed.');
    const units = rateUnits(row.RatePerMile);
    if (row.Active && row.EffectiveFrom <= journeyDate && (effectiveTo === null || journeyDate <= effectiveTo)) {
      matches.push({ listTitle: snapshot.listTitle, snapshotVersion: snapshot.snapshotVersion, rowIndex,
        title: row.Title, journeyDate, effectiveFrom: row.EffectiveFrom, effectiveTo,
        ratePerMileGbp: row.RatePerMile as number, rateTenThousandthsGbp: units });
    }
  });
  mileageCheck(matches.length === 1, matches.length ? 'RATE_OVERLAP' : 'RATE_GAP',
    'Exactly one active mileage rate must cover the journey date.');
  return Object.freeze(matches[0]);
}

export function mileageAmountPence(wholeMiles: number, rate: ISelectedMileageRate): number {
  mileageCheck(Number.isSafeInteger(wholeMiles) && wholeMiles >= 0, 'PAYABLE_MILES', 'Payable miles must be a non-negative whole number.');
  const units = rateUnits(rate.ratePerMileGbp);
  mileageCheck(units === rate.rateTenThousandthsGbp, 'RATE_VALUE', 'Mileage rate units do not reconcile.');
  mileageCheck(wholeMiles <= Math.floor(Number.MAX_SAFE_INTEGER / units), 'AMOUNT_OVERFLOW', 'Mileage amount exceeds exact arithmetic bounds.');
  const product = wholeMiles * units;
  // Positive commercial rounding, once, to GBP 0.01. No toFixed/epsilon trick.
  return Math.floor(product / 100) + (product % 100 >= 50 ? 1 : 0);
}
