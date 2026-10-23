import { mileageAmountPence, mileageCheck, mileageRecord, mileageText, selectMileageRate } from './mileageRates';
import type { IMileageRateSnapshot, ISelectedMileageRate } from './mileageRates';

/** No transport, SDK, credentials, clock, storage or provider-enable capability.
 * Schema: https://learn.microsoft.com/en-us/connectors/azuremaps/#getroute_response
 * Shape: https://learn.microsoft.com/en-us/rest/api/maps/route/post-route-directions?view=rest-maps-2025-01-01
 * Historical S03-009 lengthInMeters wording is NOT a provider response field.
 */
export const mileageProviderPolicy = Object.freeze({
  status: 'providerHeld' as const, canRequestRoute: false as const, canPersist: false as const,
  reason: 'Automatic routing is held until an enforceable no-charge limit is independently approved. Manual entry remains available.'
});

export type MileagePosition = readonly [number, number]; // GeoJSON longitude, latitude
export interface ILocationCandidate {
  readonly id: string;
  readonly label: string;
  readonly coordinates: MileagePosition;
  readonly countryCode: string;
  readonly match: 'matched' | 'ambiguous' | 'noMatch';
}
export interface IMileageLocationSelection {
  readonly queryKey: string;
  readonly resultQueryKey: string;
  readonly sourceVersion: string;
  readonly candidates: ReadonlyArray<ILocationCandidate>;
  readonly selectedId: string;
  readonly confirmed: boolean;
}
export interface ISelectedMileageLocation {
  readonly id: string;
  readonly label: string;
  readonly coordinates: MileagePosition;
  readonly countryCode: 'GB';
  readonly selectionKey: string;
}
export interface IMileageFreshness {
  readonly nowMs: number;
  /** Explicit offline validation policy, NOT a proven live provider lifetime. */
  readonly maxAgeMs: number;
}
export interface IMileageRouteRequest {
  readonly requestId: string;
  readonly travelMode: 'driving';
  readonly draftKey: string;
  readonly draftRevision: number;
  readonly fromSelectionKey: string;
  readonly toSelectionKey: string;
  readonly requestedAtMs: number;
}
export interface IMileageRouteResponse {
  readonly requestId: string;
  readonly receivedAtMs: number;
  readonly payload: unknown;
}
export interface IMileageOfflineLegInput {
  readonly request: IMileageRouteRequest;
  readonly response: IMileageRouteResponse;
}
export interface IMileageRouteLeg {
  readonly direction: 'outward' | 'return';
  readonly requestId: string;
  readonly requestedAtMs: number;
  readonly receivedAtMs: number;
  readonly from: ISelectedMileageLocation;
  readonly to: ISelectedMileageLocation;
  readonly rawMetres: number;
  readonly geometry: ReadonlyArray<ReadonlyArray<MileagePosition>>;
  readonly instructions: ReadonlyArray<string>;
  readonly provenance: {
    readonly evidence: 'offline-supplied-response';
    readonly schema: 'AzureMaps.GetRoute.GeoJSON.RoutePath';
    readonly sourceField: 'features[RoutePath].properties.distanceInMeters';
    readonly internalField: 'rawMetres';
    readonly units: 'metres';
    readonly featureIndex: number;
    readonly providerAuthenticated: false;
  };
}
export interface IOfflineMileagePreviewInput {
  readonly draftKey: string;
  readonly draftRevision: number;
  readonly journeyDate: string;
  readonly purpose: string;
  readonly programmeKey: string;
  readonly travelNominalCode: string;
  readonly from: IMileageLocationSelection;
  readonly to: IMileageLocationSelection;
  readonly returnJourney: boolean;
  readonly outward: IMileageOfflineLegInput;
  readonly reverse?: IMileageOfflineLegInput;
  readonly rates: IMileageRateSnapshot;
  readonly freshness: IMileageFreshness;
}
export interface IOfflineMileagePreview {
  readonly providerStatus: 'providerHeld';
  readonly canPersist: false;
  readonly mapRendered: false;
  readonly confirmation: 'unconfirmed' | 'confirmedOfflinePreview';
  /** Local change-detection key, NOT a signature, token or authorisation. */
  readonly previewKey: string;
  readonly journeyType: 'One-way' | 'Return';
  readonly journeyDate: string;
  readonly programmeKey: string;
  readonly travelNominalCode: string;
  readonly eligibility: 'unverified';
  readonly legs: ReadonlyArray<IMileageRouteLeg>;
  readonly totalRawMetres: number;
  readonly exactTotalMetres: string;
  readonly unroundedMiles: number;
  readonly payableMiles: number;
  readonly rate: ISelectedMileageRate;
  readonly amountPence: number;
  readonly amountGbpText: string;
  readonly notice: string;
}

function position(value: unknown): value is MileagePosition {
  return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n))
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
function samePosition(a: MileagePosition, b: MileagePosition): boolean { return a[0] === b[0] && a[1] === b[1]; }
function frozenPosition(value: MileagePosition): MileagePosition { return Object.freeze([value[0], value[1]]) as MileagePosition; }

export function selectMileageLocation(selection: IMileageLocationSelection): ISelectedMileageLocation {
  mileageCheck(selection && mileageText(selection.queryKey) && selection.queryKey === selection.resultQueryKey
    && mileageText(selection.sourceVersion), 'LOCATION_STALE', 'Find locations again for the current address.');
  mileageCheck(selection.confirmed === true && mileageText(selection.selectedId)
    && Array.isArray(selection.candidates) && selection.candidates.length > 0,
  'LOCATION_SELECTION', 'Explicitly select and confirm a matching location.');
  const ids: string[] = [];
  Array.from(selection.candidates).forEach(candidate => {
    mileageCheck(candidate && mileageText(candidate.id) && mileageText(candidate.label) && position(candidate.coordinates)
      && mileageText(candidate.countryCode) && ['matched', 'ambiguous', 'noMatch'].includes(candidate.match),
    'LOCATION_INVALID', 'Location result is malformed.');
    mileageCheck(!ids.includes(candidate.id), 'LOCATION_AMBIGUOUS', 'Location identities are ambiguous.');
    ids.push(candidate.id);
  });
  const selected = selection.candidates.find(candidate => candidate.id === selection.selectedId);
  mileageCheck(selected && selected.match === 'matched', 'LOCATION_SELECTION', 'Select an unambiguous matching location.');
  mileageCheck(selected.countryCode === 'GB', 'LOCATION_COUNTRY', 'The selected location must be a verified GB match.');
  const coordinates = frozenPosition(selected.coordinates);
  return Object.freeze({ id: selected.id, label: selected.label, coordinates, countryCode: 'GB' as const,
    selectionKey: JSON.stringify([selection.queryKey, selection.sourceVersion, selected.id, selected.label, selected.countryCode, coordinates]) });
}

function fresh(timestamp: number, freshness: IMileageFreshness): void {
  mileageCheck(freshness && Number.isSafeInteger(freshness.nowMs) && freshness.nowMs >= 0
    && Number.isSafeInteger(freshness.maxAgeMs) && freshness.maxAgeMs > 0,
  'FRESHNESS_POLICY', 'A valid current time and explicit freshness policy are required.');
  mileageCheck(Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= freshness.nowMs
    && freshness.nowMs - timestamp <= freshness.maxAgeMs, 'STALE_RESULT', 'Results have expired or their time is invalid.');
}

function adaptLeg(input: IMileageOfflineLegInput, direction: 'outward' | 'return',
  from: ISelectedMileageLocation, to: ISelectedMileageLocation, current: IOfflineMileagePreviewInput): IMileageRouteLeg {
  mileageCheck(input && input.request && input.response, 'ROUTE_MISSING', 'A separate response is required for each direction.');
  const { request, response } = input;
  mileageCheck(mileageText(request.requestId) && request.requestId === response.requestId && request.travelMode === 'driving'
    && request.draftKey === current.draftKey && request.draftRevision === current.draftRevision
    && request.fromSelectionKey === from.selectionKey && request.toSelectionKey === to.selectionKey,
  'ROUTE_BINDING', 'The route does not belong to these selected endpoints and this draft revision.');
  fresh(request.requestedAtMs, current.freshness);
  fresh(response.receivedAtMs, current.freshness);
  mileageCheck(response.receivedAtMs >= request.requestedAtMs, 'STALE_RESULT', 'The route predates its request.');
  const body = response.payload;
  mileageCheck(mileageRecord(body) && body.type === 'FeatureCollection' && Array.isArray(body.features),
    'ROUTE_SCHEMA', 'Expected an Azure Maps GeoJSON FeatureCollection.');
  mileageCheck(body.alternativeRoutes === undefined || (Array.isArray(body.alternativeRoutes) && body.alternativeRoutes.length === 0),
    'ROUTE_AMBIGUOUS', 'Alternative routes need a separate reviewed selection contract.');
  const features = body.features;
  const paths: number[] = [];
  const waypoints: Record<string, unknown>[] = [];
  const instructions: string[] = [];
  Array.from(features).forEach((feature: unknown, index: number) => {
    mileageCheck(mileageRecord(feature) && feature.type === 'Feature' && mileageRecord(feature.properties)
      && mileageText(feature.properties.type), 'ROUTE_SCHEMA', 'Route feature is malformed.');
    if (feature.properties.type === 'RoutePath') paths.push(index);
    else if (feature.properties.type === 'Waypoint') waypoints.push(feature);
    else if (feature.properties.type === 'ManeuverPoint') {
      mileageCheck(mileageRecord(feature.geometry) && feature.geometry.type === 'Point' && position(feature.geometry.coordinates)
        && mileageRecord(feature.properties.instruction) && mileageText(feature.properties.instruction.text),
      'ROUTE_INSTRUCTION', 'Route directions are malformed.');
      instructions.push(feature.properties.instruction.text);
    } else mileageCheck(false, 'ROUTE_SCHEMA', 'Unsupported route feature kind; verify the schema before adapting it.');
  });
  mileageCheck(paths.length === 1, 'ROUTE_SUMMARY', 'Exactly one RoutePath summary is required.');
  mileageCheck(instructions.length > 0, 'ROUTE_INSTRUCTION', 'Route directions are required for offline review.');
  mileageCheck(waypoints.length === 2, 'ROUTE_ENDPOINT', 'Exactly two ordered route waypoints are required.');
  [from, to].forEach((endpoint, index) => {
    const matches = waypoints.filter(w => mileageRecord(w.properties) && mileageRecord(w.properties.order) && w.properties.order.inputIndex === index);
    mileageCheck(matches.length === 1, 'ROUTE_ENDPOINT', 'Route waypoint order is missing or ambiguous.');
    const geometry = matches[0].geometry;
    // Strict equality is intentional: road-snapping tolerance is not approved.
    mileageCheck(mileageRecord(geometry) && geometry.type === 'Point' && position(geometry.coordinates)
      && samePosition(geometry.coordinates, endpoint.coordinates), 'ROUTE_ENDPOINT', 'Route endpoints differ from the selected locations.');
  });
  const path = features[paths[0]] as Record<string, unknown>;
  const properties = path.properties as Record<string, unknown>;
  const rawMetres = properties.distanceInMeters;
  mileageCheck(typeof rawMetres === 'number' && Number.isFinite(rawMetres) && rawMetres > 0 && rawMetres <= Number.MAX_SAFE_INTEGER,
    'ROUTE_DISTANCE', 'RoutePath must supply a positive finite numeric distanceInMeters.');
  mileageCheck(properties.lengthInMeters === undefined, 'ROUTE_SCHEMA', 'Unexpected distance alias: verify the provider schema.');
  mileageCheck(properties.travelMode === undefined || properties.travelMode === 'driving', 'ROUTE_MODE', 'Only a driving route is supported.');
  const geometry = path.geometry;
  mileageCheck(mileageRecord(geometry) && geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)
    && geometry.coordinates.length > 0, 'ROUTE_GEOMETRY', 'RoutePath requires MultiLineString geometry.');
  const segments: MileagePosition[][] = [];
  Array.from(geometry.coordinates).forEach((segment: unknown) => {
    mileageCheck(Array.isArray(segment) && segment.length >= 2 && Array.from(segment).every(position), 'ROUTE_GEOMETRY', 'Route geometry contains invalid positions.');
    segments.push(segment.map(p => frozenPosition(p as MileagePosition)));
  });
  mileageCheck(samePosition(segments[0][0], from.coordinates)
    && samePosition(segments[segments.length - 1][segments[segments.length - 1].length - 1], to.coordinates),
  'ROUTE_DIRECTION', 'Route geometry has the wrong direction or endpoints.');
  segments.forEach((segment, index) => {
    if (index > 0) mileageCheck(samePosition(segments[index - 1][segments[index - 1].length - 1], segment[0]),
      'ROUTE_GEOMETRY', 'Route geometry is disconnected.');
  });
  return Object.freeze({ direction, requestId: request.requestId, requestedAtMs: request.requestedAtMs, receivedAtMs: response.receivedAtMs,
    from, to, rawMetres, geometry: Object.freeze(segments.map(segment => Object.freeze(segment))), instructions: Object.freeze(instructions),
    provenance: Object.freeze({ evidence: 'offline-supplied-response' as const, schema: 'AzureMaps.GetRoute.GeoJSON.RoutePath' as const,
      sourceField: 'features[RoutePath].properties.distanceInMeters' as const, internalField: 'rawMetres' as const,
      units: 'metres' as const, featureIndex: paths[0], providerAuthenticated: false as const }) });
}

/** Exact positive decimal arithmetic over the provider number's decimal value.
 * Avoid binary sums crossing a half-mile boundary; no leg rounding or BigInt/SDK dependency. */
function decimal(value: number): { digits: string; scale: number } {
  const [mantissa, exponentText] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponentText || 0);
  return { digits: whole + fraction + '0'.repeat(Math.max(0, -scale)), scale: Math.max(0, scale) };
}
function addDigits(a: string, b: string): string {
  const size = Math.max(a.length, b.length);
  a = a.padStart(size, '0'); b = b.padStart(size, '0');
  let carry = 0; let result = '';
  for (let index = size - 1; index >= 0; index--) {
    const sum = Number(a[index]) + Number(b[index]) + carry;
    result = String(sum % 10) + result; carry = Math.floor(sum / 10);
  }
  return (carry ? String(carry) : '') + result;
}
function routeTotal(legs: ReadonlyArray<IMileageRouteLeg>): { exactTotalMetres: string; totalRawMetres: number; unroundedMiles: number; payableMiles: number } {
  const decimals = legs.map(leg => decimal(leg.rawMetres));
  const scale = Math.max(3, ...decimals.map(d => d.scale));
  const digits = decimals.reduce((sum, d) => addDigits(sum, d.digits + '0'.repeat(scale - d.scale)), '0').padStart(scale + 1, '0');
  const exactTotalMetres = (digits.slice(0, -scale) + '.' + digits.slice(-scale)).replace(/^0+(?=\d)/, '').replace(/0+$/, '').replace(/\.$/, '');
  const totalRawMetres = Number(exactTotalMetres);
  // Long division by integer millimetres per mile. Remainder remains <1609344.
  let quotient = ''; let remainder = 0;
  for (const digit of digits) {
    const next = remainder * 10 + Number(digit);
    quotient += String(Math.floor(next / 1609344)); remainder = next % 1609344;
  }
  const fractionalDigits = scale - 3;
  quotient = quotient.padStart(fractionalDigits + 1, '0');
  const whole = fractionalDigits ? quotient.slice(0, -fractionalDigits) : quotient;
  const roundUp = fractionalDigits ? Number(quotient[quotient.length - fractionalDigits]) >= 5 : remainder * 2 >= 1609344;
  const payableMiles = Number(whole) + (roundUp ? 1 : 0);
  mileageCheck(Number.isFinite(totalRawMetres) && Number.isSafeInteger(payableMiles), 'DISTANCE_OVERFLOW', 'Journey distance exceeds exact arithmetic bounds.');
  return { exactTotalMetres, totalRawMetres, unroundedMiles: totalRawMetres / 1609.344, payableMiles };
}

/** Builds renderable data, never renders a map or approves a financial write. */
export function buildOfflineMileagePreview(input: IOfflineMileagePreviewInput): IOfflineMileagePreview {
  mileageCheck(input && mileageText(input.draftKey) && Number.isSafeInteger(input.draftRevision) && input.draftRevision >= 0
    && typeof input.returnJourney === 'boolean' && mileageText(input.purpose)
    && mileageText(input.programmeKey) && mileageText(input.travelNominalCode), 'DRAFT', 'A complete current journey draft is required.');
  const rate = selectMileageRate(input.rates, input.journeyDate);
  fresh(input.rates.retrievedAtMs, input.freshness);
  const from = selectMileageLocation(input.from); const to = selectMileageLocation(input.to);
  mileageCheck(!samePosition(from.coordinates, to.coordinates), 'LOCATION_SAME', 'Start and destination must be distinct locations.');
  mileageCheck(input.returnJourney ? !!input.reverse : input.reverse === undefined, 'ROUTE_LEGS', 'Supply exactly the requested outward and return legs.');
  const legs = [adaptLeg(input.outward, 'outward', from, to, input)];
  if (input.returnJourney) {
    const reverse = adaptLeg(input.reverse as IMileageOfflineLegInput, 'return', to, from, input);
    mileageCheck(reverse.requestId !== legs[0].requestId, 'ROUTE_DUPLICATE', 'Return routing needs a distinct B-to-A request.');
    legs.push(reverse);
  }
  const total = routeTotal(legs);
  const amountPence = mileageAmountPence(total.payableMiles, rate);
  const previewKey = JSON.stringify([input.draftKey, input.draftRevision, input.journeyDate, input.purpose,
    input.programmeKey, input.travelNominalCode, input.returnJourney, input.rates.retrievedAtMs, rate, legs, total, amountPence]);
  return Object.freeze({ providerStatus: 'providerHeld' as const, canPersist: false as const, mapRendered: false as const,
    confirmation: 'unconfirmed' as const, previewKey, journeyType: input.returnJourney ? 'Return' as const : 'One-way' as const,
    journeyDate: input.journeyDate, programmeKey: input.programmeKey, travelNominalCode: input.travelNominalCode,
    eligibility: 'unverified' as const, legs: Object.freeze(legs), ...total, rate, amountPence,
    amountGbpText: `${Math.floor(amountPence / 100)}.${String(amountPence % 100).padStart(2, '0')}`,
    notice: 'Offline route preview only. No live route, rendered map, approved eligibility or Save. ' + mileageProviderPolicy.reason });
}

/** Revalidates current data/time; any changed route, date, rate or allocation needs
 * another review. Confirmation has no effect on providerHeld or canPersist. */
export function confirmOfflineMileagePreview(input: IOfflineMileagePreviewInput, reviewedPreviewKey: string, confirmed: boolean): IOfflineMileagePreview {
  const preview = buildOfflineMileagePreview(input);
  mileageCheck(confirmed === true && mileageText(reviewedPreviewKey) && reviewedPreviewKey === preview.previewKey,
    'CONFIRMATION_STALE', 'Review the current route preview and explicitly confirm it.');
  return Object.freeze({ ...preview, confirmation: 'confirmedOfflinePreview' as const });
}
