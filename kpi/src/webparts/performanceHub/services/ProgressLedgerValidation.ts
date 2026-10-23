import type { IProductionPerson } from '../models/ProductionModels';
import type { IProgressEntry, IProgressLedger } from '../models/QuarterlyModels';
import { isActiveQuarterActor } from './QuarterReviewAuthorisation';

const isNonblankText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isDateOnly = (value: string): boolean => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

const isExplicitTimestamp = (value: string): boolean => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  && isDateOnly(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

// Date.parse resolves milliseconds; retain ordering of recorded finer fractions.
const timestampRemainder = (value: string): number => Number(((value.match(/\.(\d{1,9})/)?.[1] || '') + '000000000').slice(3, 9));

/** Retain the original stored string; validation never activates or fetches a URL. */
export const getProgressEvidenceHref = (value?: string): string | undefined => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return undefined;
  if (value.split('').some(character => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || code === 0x7f || character === '\\';
  })) return undefined;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname && !parsed.username && !parsed.password
      ? value : undefined;
  } catch {
    return undefined;
  }
};

export const upsertProgressEntry = (
  ledger: IProgressLedger,
  entry: IProgressEntry,
  actor: IProductionPerson
): { ledger: IProgressLedger; created: boolean } => {
  if (!isNonblankText(ledger.progressLedgerKey) || !isNonblankText(ledger.workplanKey) || !isNonblankText(ledger.workplanItemKey)
    || !isNonblankText(ledger.personKey) || !Number.isSafeInteger(ledger.performanceYear) || ledger.performanceYear < 1
    || typeof ledger.locked !== 'boolean' || !Array.isArray(ledger.entries)) {
    throw new Error('Progress ledger requires valid stable source keys, year, lock state and history.');
  }
  if (!Number.isSafeInteger(ledger.rowVersionToken) || ledger.rowVersionToken < 1 || ledger.rowVersionToken >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Progress ledger version cannot advance safely.');
  }
  if (!isActiveQuarterActor(actor)
    || !isNonblankText(entry.actorPersonKey) || !isNonblankText(entry.actorEmail)
    || actor.personKey !== ledger.personKey || actor.email.trim().toLowerCase() !== entry.actorEmail.trim().toLowerCase()
    || actor.personKey !== entry.actorPersonKey) throw new Error('Progress entry is not authorised for this employee ledger.');
  if (ledger.locked) throw new Error('Locked progress history is read-only.');
  if (!isNonblankText(entry.entryKey) || !isDateOnly(entry.date) || !isNonblankText(entry.note) || !isExplicitTimestamp(entry.updatedAt)) {
    throw new Error('Progress entry requires a stable key, valid date, meaningful note and UTC timestamp.');
  }
  const hasQuarterScope = Boolean(entry.quarterReviewKey || entry.quarterReviewItemKey || entry.quarter);
  if (hasQuarterScope && (!entry.quarterReviewKey?.trim() || !entry.quarterReviewItemKey?.trim() || !entry.quarter)) {
    throw new Error('Quarter-linked progress evidence requires complete review, item and quarter keys.');
  }
  if (hasQuarterScope && entry.entryKey !== `${entry.quarterReviewItemKey}|${entry.date}`) {
    throw new Error('Quarter-linked progress evidence key does not match the review item and date.');
  }
  if (hasQuarterScope && (['Q1', 'Q2', 'Q3', 'Q4'].indexOf(entry.quarter as string) < 0
    || entry.quarterReviewKey !== ledger.workplanKey + '|' + entry.quarter
    || entry.quarterReviewItemKey !== entry.quarterReviewKey + '|' + ledger.workplanItemKey)) {
    throw new Error('Quarter-linked progress evidence context does not match the annual ledger source.');
  }
  if (entry.evidenceLink && !getProgressEvidenceHref(entry.evidenceLink)) throw new Error('Progress evidence link must use valid HTTP(S) without credentials.');
  if (ledger.entries.filter(existing => existing.entryKey === entry.entryKey).length > 1) {
    throw new Error('Progress entry history is ambiguous: multiple matching entry keys.');
  }
  const existingIndex = ledger.entries.findIndex(existing => existing.entryKey === entry.entryKey);
  const entries = ledger.entries.slice();
  if (existingIndex >= 0) entries[existingIndex] = { ...entry };
  else entries.push({ ...entry });
  if (entries.length > 12) throw new Error('The approved annual progress ledger supports at most 12 chronological entries per Workplan Item.');
  entries.sort((left, right) => left.date.localeCompare(right.date)
    || (isExplicitTimestamp(left.updatedAt) && isExplicitTimestamp(right.updatedAt)
      ? Date.parse(left.updatedAt) - Date.parse(right.updatedAt) || timestampRemainder(left.updatedAt) - timestampRemainder(right.updatedAt)
      : left.updatedAt.localeCompare(right.updatedAt)));
  return {
    ledger: { ...ledger, entries, rowVersionToken: ledger.rowVersionToken + 1 },
    created: existingIndex < 0
  };
};
