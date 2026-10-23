import type { IAuthoritativeAdminEventHistoryCapability } from './IProductionDataService';
import { isAuthoritativeAdminEventHistoryCapability } from './AdminEventHistoryAuthority';
import {
  ADMIN_CONTROLLED_EVENT_TYPES,
  isCanonicalUtcTimestamp,
  type AdminControlledEventType
} from './AdminControlledVocabulary';

export { ADMIN_CONTROLLED_EVENT_TYPES, type AdminControlledEventType } from './AdminControlledVocabulary';
export type AdminControlledEventQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

/** Exact decision-independent fields used by the existing DEMOAPP_Audit physical contract. */
export interface IAdminControlledEventHistoryRecord {
  id: number;
  auditKey: string;
  eventType: AdminControlledEventType;
  subjectKey: string;
  performanceYear: number;
  quarter?: AdminControlledEventQuarter;
  actorEmail: string;
  actorRole: string;
  eventAt: string;
  reason?: string;
  beforeJson?: string;
  afterJson?: string;
  correlationKey: string;
  source: string;
  sourceReference?: string;
  success: boolean;
}

export interface IAdminEventHistoryFilters {
  actors?: readonly string[];
  states?: readonly string[];
  statuses?: readonly string[];
  performanceYears?: readonly number[];
  quarters?: readonly AdminControlledEventQuarter[];
}

export interface IAdminEventHistoryViewRecord extends IAdminControlledEventHistoryRecord {
  /** Read from an existing top-level State property in AfterJSON (or BeforeJSON as fallback). */
  state?: string;
  /** Read from an existing top-level Status property in AfterJSON (or BeforeJSON as fallback). */
  status?: string;
}

export interface IAdminEventHistoryFilterOptions {
  actors: readonly string[];
  states: readonly string[];
  statuses: readonly string[];
  performanceYears: readonly number[];
  quarters: readonly AdminControlledEventQuarter[];
}

export interface IAdminEventHistoryView {
  mode: 'ReadOnly';
  editAllowed: false;
  deleteAllowed: false;
  sourceList: 'DEMOAPP_Audit';
  authorisationSource: 'AuthoritativePeopleReadback';
  ordering: 'EventAtDescendingThenAuditKeyAscending';
  allEvents: readonly IAdminEventHistoryViewRecord[];
  filteredEvents: readonly IAdminEventHistoryViewRecord[];
  filters: Readonly<IAdminEventHistoryFilters>;
  filterOptions: Readonly<IAdminEventHistoryFilterOptions>;
}

const QUARTERS: readonly AdminControlledEventQuarter[] = Object.freeze(['Q1', 'Q2', 'Q3', 'Q4']);
const authorisedEventHistoryViews = new WeakSet<object>();
const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const assertNonBlank = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !clean(value)) {
    throw new Error(`Admin event history requires a non-blank ${field}.`);
  }
  return clean(value);
};

const parseJsonObject = (value: string | undefined, field: string): Record<string, unknown> | undefined => {
  if (value === undefined) return undefined;
  const text = assertNonBlank(value, field);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Admin event history requires ${field} to contain valid JSON.`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`Admin event history requires ${field} to contain a JSON object.`);
  }
  return parsed;
};

const marker = (
  after: Record<string, unknown> | undefined,
  before: Record<string, unknown> | undefined,
  field: 'state' | 'status'
): string | undefined => {
  const read = (source: Record<string, unknown> | undefined): string | undefined => {
    if (!source) return undefined;
    const keys = Object.keys(source).filter(key => normalise(key) === field);
    if (keys.length > 1) throw new Error(`Admin event history contains ambiguous ${field} properties.`);
    if (keys.length === 0) return undefined;
    const value = source[keys[0]];
    if (typeof value !== 'string' || !clean(value)) {
      throw new Error(`Admin event history requires ${field} to be a non-blank string when present.`);
    }
    return clean(value);
  };
  return read(after) || read(before);
};

const assertSourceRecord = (record: IAdminControlledEventHistoryRecord): IAdminEventHistoryViewRecord => {
  if (!isRecord(record)) throw new Error('Admin event history records must be objects.');
  if (!Number.isSafeInteger(record.id) || record.id < 1) {
    throw new Error('Admin event history requires a positive physical item ID.');
  }
  const auditKey = assertNonBlank(record.auditKey, 'AuditKey');
  const eventType = assertNonBlank(record.eventType, 'EventType');
  if (!ADMIN_CONTROLLED_EVENT_TYPES.includes(eventType as AdminControlledEventType)) {
    throw new Error('Admin event history does not support EventType.');
  }
  const subjectKey = assertNonBlank(record.subjectKey, 'SubjectKey');
  if (!Number.isInteger(record.performanceYear) || record.performanceYear < 2000 || record.performanceYear > 2100) {
    throw new Error('Admin event history requires a supported PerformanceYear from 2000 to 2100.');
  }
  if (record.quarter !== undefined && !QUARTERS.includes(record.quarter)) {
    throw new Error('Admin event history requires Quarter to use the existing Q1-Q4 vocabulary.');
  }
  const actorEmail = assertNonBlank(record.actorEmail, 'ActorEmail');
  const actorRole = assertNonBlank(record.actorRole, 'ActorRole');
  const eventAt = assertNonBlank(record.eventAt, 'EventAt');
  if (!isCanonicalUtcTimestamp(eventAt)) {
    throw new Error('Admin event history requires EventAt to be a canonical millisecond-precision UTC timestamp.');
  }
  const correlationKey = assertNonBlank(record.correlationKey, 'CorrelationKey');
  const source = assertNonBlank(record.source, 'Source');
  if (typeof record.success !== 'boolean') throw new Error('Admin event history requires a boolean Success value.');
  const before = parseJsonObject(record.beforeJson, 'BeforeJSON');
  const after = parseJsonObject(record.afterJson, 'AfterJSON');
  const state = marker(after, before, 'state');
  const status = marker(after, before, 'status');
  const result: IAdminEventHistoryViewRecord = {
    id: record.id,
    auditKey,
    eventType: eventType as AdminControlledEventType,
    subjectKey,
    performanceYear: record.performanceYear,
    quarter: record.quarter,
    actorEmail,
    actorRole,
    eventAt,
    reason: record.reason === undefined ? undefined : assertNonBlank(record.reason, 'Reason'),
    beforeJson: record.beforeJson,
    afterJson: record.afterJson,
    correlationKey,
    source,
    sourceReference: record.sourceReference === undefined
      ? undefined : assertNonBlank(record.sourceReference, 'SourceReference'),
    success: record.success,
    state,
    status
  };
  return Object.freeze(result);
};

const uniqueStrings = (values: readonly string[]): readonly string[] => Object.freeze(values
  .filter((value, index, source) => source.findIndex(candidate => normalise(candidate) === normalise(value)) === index)
  .slice()
  .sort((left, right) => normalise(left).localeCompare(normalise(right))));

const assertStringFilter = (values: readonly string[] | undefined, field: string): readonly string[] | undefined => {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !clean(value))) {
    throw new Error(`Admin event history ${field} filter contains a malformed value.`);
  }
  const cleaned = values.map(value => clean(value));
  if (uniqueStrings(cleaned).length !== cleaned.length) {
    throw new Error(`Admin event history ${field} filter contains a duplicate value.`);
  }
  return Object.freeze(cleaned);
};

const validatedFilters = (filters: IAdminEventHistoryFilters): Readonly<IAdminEventHistoryFilters> => {
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) {
    throw new Error('Admin event history filters must be an object.');
  }
  const actors = assertStringFilter(filters.actors, 'actor');
  const states = assertStringFilter(filters.states, 'state');
  const statuses = assertStringFilter(filters.statuses, 'status');
  let performanceYears: readonly number[] | undefined;
  if (filters.performanceYears !== undefined) {
    if (!Array.isArray(filters.performanceYears)
      || filters.performanceYears.some(year => !Number.isInteger(year) || year < 2000 || year > 2100)
      || new Set(filters.performanceYears).size !== filters.performanceYears.length) {
      throw new Error('Admin event history PerformanceYear filter contains a malformed or duplicate value.');
    }
    performanceYears = Object.freeze(filters.performanceYears.slice());
  }
  let quarters: readonly AdminControlledEventQuarter[] | undefined;
  if (filters.quarters !== undefined) {
    if (!Array.isArray(filters.quarters)
      || filters.quarters.some(quarter => !QUARTERS.includes(quarter))
      || new Set(filters.quarters).size !== filters.quarters.length) {
      throw new Error('Admin event history Quarter filter contains a malformed or duplicate value.');
    }
    quarters = Object.freeze(filters.quarters.slice());
  }
  return Object.freeze({ actors, states, statuses, performanceYears, quarters });
};

const matches = (record: IAdminEventHistoryViewRecord, filters: IAdminEventHistoryFilters): boolean => (
  (!filters.actors?.length || filters.actors.some(actor => normalise(actor) === normalise(record.actorEmail)))
  && (!filters.states?.length || filters.states.some(state => normalise(state) === normalise(record.state)))
  && (!filters.statuses?.length || filters.statuses.some(status => normalise(status) === normalise(record.status)))
  && (!filters.performanceYears?.length || filters.performanceYears.includes(record.performanceYear))
  && (!filters.quarters?.length || Boolean(record.quarter && filters.quarters.includes(record.quarter)))
);

/**
 * Builds an immutable investigation view only for the established Admin application-role hook.
 * There is deliberately no append, edit or delete operation in this domain.
 */
const buildAdminEventHistoryView = (
  sourceRecords: readonly IAdminControlledEventHistoryRecord[],
  filters: IAdminEventHistoryFilters
): IAdminEventHistoryView => {
  if (!Array.isArray(sourceRecords)) throw new Error('Admin event history source must be an array.');

  const allEvents = sourceRecords.map(assertSourceRecord);
  if (new Set(allEvents.map(event => event.id)).size !== allEvents.length
    || new Set(allEvents.map(event => normalise(event.auditKey))).size !== allEvents.length) {
    throw new Error('Admin event history requires unique physical IDs and AuditKeys.');
  }
  allEvents.sort((left, right) => {
    const timestamp = Date.parse(right.eventAt) - Date.parse(left.eventAt);
    return timestamp || left.auditKey.localeCompare(right.auditKey);
  });

  const safeFilters = validatedFilters(filters);
  const frozenEvents = Object.freeze(allEvents.slice());
  const filteredEvents = Object.freeze(frozenEvents.filter(event => matches(event, safeFilters)));
  const filterOptions: IAdminEventHistoryFilterOptions = {
    actors: uniqueStrings(frozenEvents.map(event => event.actorEmail)),
    states: uniqueStrings(frozenEvents.map(event => event.state).filter((value): value is string => Boolean(value))),
    statuses: uniqueStrings(frozenEvents.map(event => event.status).filter((value): value is string => Boolean(value))),
    performanceYears: Object.freeze(Array.from(new Set(frozenEvents.map(event => event.performanceYear))).sort((a, b) => b - a)),
    quarters: Object.freeze(QUARTERS.filter(quarter => frozenEvents.some(event => event.quarter === quarter)))
  };

  const view: IAdminEventHistoryView = Object.freeze({
    mode: 'ReadOnly' as const,
    editAllowed: false as const,
    deleteAllowed: false as const,
    sourceList: 'DEMOAPP_Audit' as const,
    authorisationSource: 'AuthoritativePeopleReadback' as const,
    ordering: 'EventAtDescendingThenAuditKeyAscending' as const,
    allEvents: frozenEvents,
    filteredEvents,
    filters: safeFilters,
    filterOptions: Object.freeze(filterOptions)
  });
  authorisedEventHistoryViews.add(view);
  return view;
};

/** Rejects caller-created roles/objects before any source record is inspected or returned. */
export const investigateAdminEventHistory = (
  capability: IAuthoritativeAdminEventHistoryCapability,
  sourceRecords: readonly IAdminControlledEventHistoryRecord[],
  filters: IAdminEventHistoryFilters = {}
): IAdminEventHistoryView => {
  if (!isAuthoritativeAdminEventHistoryCapability(capability)) {
    throw new Error('Admin event history requires an opaque capability from the authoritative signed-in People readback.');
  }
  return buildAdminEventHistoryView(sourceRecords, filters);
};

/** Refilters only an already-authorised in-memory view; it cannot load or disclose a new source. */
export const filterAuthorisedAdminEventHistoryView = (
  authorisedView: IAdminEventHistoryView,
  filters: IAdminEventHistoryFilters = {}
): IAdminEventHistoryView => {
  if (!authorisedView
    || !authorisedEventHistoryViews.has(authorisedView)
    || authorisedView.authorisationSource !== 'AuthoritativePeopleReadback'
    || authorisedView.mode !== 'ReadOnly'
    || !Array.isArray(authorisedView.allEvents)) {
    throw new Error('Admin event history refiltering requires an already-authorised read-only view.');
  }
  return buildAdminEventHistoryView(authorisedView.allEvents, filters);
};
