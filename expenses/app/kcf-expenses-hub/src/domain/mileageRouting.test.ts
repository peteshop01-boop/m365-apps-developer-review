import { MileageValidationError, mileageAmountPence, selectMileageRate, validMileageDate } from './mileageRates';
import { buildOfflineMileagePreview, confirmOfflineMileagePreview, mileageProviderPolicy, selectMileageLocation } from './mileageRouting';
import type { IMileageRateSnapshot } from './mileageRates';
import type { IOfflineMileagePreviewInput, IMileageLocationSelection, IMileageOfflineLegInput, MileagePosition } from './mileageRouting';

// Deliberately synthetic coordinates, addresses, identities, rates and timestamps.
// None of these fixtures is a current tenant value or a genuine provider response.
const A: MileagePosition = [0.1, 51.2];
const B: MileagePosition = [0.2, 51.3];
const C: MileagePosition = [0.15, 51.25];
const now = 10000;
function location(id: string, coordinates: MileagePosition): IMileageLocationSelection {
  return { queryKey: `synthetic-${id}`, resultQueryKey: `synthetic-${id}`, sourceVersion: 'fictional-locations-v1',
    selectedId: id, confirmed: true, candidates: [{ id, label: `Fictional ${id}`, coordinates, countryCode: 'GB', match: 'matched' }] };
}
function row(rate = 0.3333): Record<string, unknown> {
  return { Title: 'Fictional policy', RatePerMile: rate, EffectiveFrom: '2026-10-01', EffectiveTo: '2026-10-31', Active: true };
}
function rates(rows: unknown = [row()]): IMileageRateSnapshot {
  return { listTitle: 'KCFEXP_TEST102_MileageRates', snapshotVersion: 'fictional-rates-v1', retrievedAtMs: 9000, complete: true, rows };
}
function payload(from: MileagePosition, to: MileagePosition, metres: number): Record<string, unknown> {
  return { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: from }, properties: { type: 'Waypoint', order: { inputIndex: 0 } } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: to }, properties: { type: 'Waypoint', order: { inputIndex: 1 } } },
    { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[from, C, to]] },
      properties: { type: 'RoutePath', distanceInMeters: metres, travelMode: 'driving' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: from },
      properties: { type: 'ManeuverPoint', instruction: { text: 'Fictional direction for offline review' } } }
  ] };
}
function leg(id: string, from: IMileageLocationSelection, to: IMileageLocationSelection, metres: number): IMileageOfflineLegInput {
  return { request: { requestId: id, travelMode: 'driving', draftKey: 'fictional-draft', draftRevision: 1,
    fromSelectionKey: selectMileageLocation(from).selectionKey, toSelectionKey: selectMileageLocation(to).selectionKey, requestedAtMs: 9000 },
  response: { requestId: id, receivedAtMs: 9500, payload: payload(from.candidates[0].coordinates, to.candidates[0].coordinates, metres) } };
}
function input(outward = 16093.44, reverse: number | undefined = 17702.784): IOfflineMileagePreviewInput {
  const from = location('A', A); const to = location('B', B);
  return { draftKey: 'fictional-draft', draftRevision: 1, journeyDate: '2026-10-21', purpose: 'Synthetic visit',
    programmeKey: 'fictional-programme', travelNominalCode: 'fictional-travel', from, to, returnJourney: reverse !== undefined,
    outward: leg('outward-1', from, to, outward), reverse: reverse === undefined ? undefined : leg('return-1', to, from, reverse),
    rates: rates(), freshness: { nowMs: now, maxAgeMs: 2000 } };
}
function oneWay(metres: number): IOfflineMileagePreviewInput {
  const value = input(metres);
  return { ...value, returnJourney: false, reverse: undefined };
}
// Mutation helper is confined to fake fixtures; production boundary accepts unknown JSON.
function changedPayload(value: IOfflineMileagePreviewInput, mutate: (body: any) => void): IOfflineMileagePreviewInput { // eslint-disable-line @typescript-eslint/no-explicit-any
  const body = JSON.parse(JSON.stringify(value.outward.response.payload));
  mutate(body);
  return { ...value, outward: { ...value.outward, response: { ...value.outward.response, payload: body } } };
}
function rejects(run: () => unknown, code?: string): void {
  let caught: unknown;
  try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(MileageValidationError);
  if (code) expect((caught as MileageValidationError).code).toBe(code);
}

describe('EXP-S03-008/009/010/011; WEB-010/012: offline route calculation', () => {
  it('keeps asymmetric A-to-B and B-to-A evidence and sums raw metres once', () => {
    const preview = buildOfflineMileagePreview(input());
    expect(preview.legs.map(l => l.rawMetres)).toEqual([16093.44, 17702.784]);
    expect(preview.legs.map(l => [l.from.id, l.to.id])).toEqual([['A', 'B'], ['B', 'A']]);
    expect(preview.exactTotalMetres).toBe('33796.224');
    expect(preview.payableMiles).toBe(21);
    expect(preview.amountPence).toBe(700);
    expect(buildOfflineMileagePreview(oneWay(16093.44)).payableMiles).toBe(10);
  });
  it('does not round each leg even to two decimal miles before adding', () => {
    expect(buildOfflineMileagePreview(input(1000, 1413.5))).toMatchObject({ exactTotalMetres: '2413.5', payableMiles: 1, amountPence: 33 });
    expect(buildOfflineMileagePreview(input(804.672, 804.672)).payableMiles).toBe(1);
  });
  it.each([
    [788.57856, 0], [804.671999999, 0], [804.672, 1], [804.672000001, 1],
    [2397.92256, 1], [2414.015, 1], [2414.016, 2], [2414.017, 2], [0.0000001, 0], [Number.MIN_VALUE, 0]
  ])('raw %s metres rounds once to %s whole miles (0.49/0.50 and 1.49/1.50 included)', (metres, expected) => {
    const preview = buildOfflineMileagePreview(oneWay(metres));
    expect(preview.payableMiles).toBe(expected);
    if (!expected) expect(preview.amountGbpText).toBe('0.00');
  });
  it('handles a decimal half-mile sum without binary rounding crossing the boundary', () => {
    expect(buildOfflineMileagePreview(input(804.671999999, 0.000000001)).payableMiles).toBe(1);
    expect(buildOfflineMileagePreview(input(2414.015999999, 0.0000000009)).payableMiles).toBe(1);
  });
  it.each([0, -1, NaN, Infinity, -Infinity, Number.MAX_VALUE, '1609.344', null, undefined])('rejects invalid raw metres %s', distance => {
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[2].properties.distanceInMeters = distance; })), 'ROUTE_DISTANCE');
  });
  it('records verified field provenance without silently accepting lengthInMeters', () => {
    expect(buildOfflineMileagePreview(input()).legs[0].provenance).toEqual({ evidence: 'offline-supplied-response',
      schema: 'AzureMaps.GetRoute.GeoJSON.RoutePath', sourceField: 'features[RoutePath].properties.distanceInMeters',
      internalField: 'rawMetres', units: 'metres', featureIndex: 2, providerAuthenticated: false });
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => {
      body.features[2].properties.lengthInMeters = 1234; delete body.features[2].properties.distanceInMeters;
    })), 'ROUTE_DISTANCE');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[2].properties.lengthInMeters = 16093.44; })), 'ROUTE_SCHEMA');
  });
});

describe('GeoJSON, endpoint and return direction fail-closed boundary', () => {
  it.each([null, undefined, {}, [], { routes: [{ summary: { lengthInMeters: 1609.344 } }] },
    { type: 'Feature', features: [] }, { type: 'FeatureCollection', features: null }])('rejects a different/malformed provider schema %#', body => {
    const value = input();
    rejects(() => buildOfflineMileagePreview({ ...value, outward: { ...value.outward, response: { ...value.outward.response, payload: body } } }), 'ROUTE_SCHEMA');
  });
  it('rejects no or multiple RoutePath summaries, including duplicate alternatives', () => {
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features.splice(2, 1); })), 'ROUTE_SUMMARY');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features.push(body.features[2]); })), 'ROUTE_SUMMARY');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.alternativeRoutes = [payload(A, B, 1)]; })), 'ROUTE_AMBIGUOUS');
  });
  it.each(['RouteLeg', 'UnverifiedKind', '', null])('rejects unsupported feature kind %s rather than double counting summaries', kind => {
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features.push({ type: 'Feature', properties: { type: kind } }); })), 'ROUTE_SCHEMA');
  });
  it.each([null, {}, { type: 'LineString', coordinates: [A, B] }, { type: 'MultiLineString', coordinates: [] },
    { type: 'MultiLineString', coordinates: [[A]] }, { type: 'MultiLineString', coordinates: [[A, [NaN, 1], B]] },
    { type: 'MultiLineString', coordinates: [[A, [181, 1], B]] }, { type: 'MultiLineString', coordinates: [[A, [1, 91], B]] },
    { type: 'MultiLineString', coordinates: [[A, [1, 51, 7], B]] }, { type: 'MultiLineString', coordinates: [[A, ['1', 51], B]] }
  ])('rejects malformed geometry %#', geometry => {
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[2].geometry = geometry; })), 'ROUTE_GEOMETRY');
  });
  it('rejects geometry with the wrong direction or disconnected segments', () => {
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[2].geometry.coordinates = [[B, C, A]]; })), 'ROUTE_DIRECTION');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[2].geometry.coordinates = [[A, C], [[0.16, 51.26], B]]; })), 'ROUTE_GEOMETRY');
    expect(buildOfflineMileagePreview(changedPayload(input(), body => { body.features[2].geometry.coordinates = [[A, C], [C, B]]; })).payableMiles).toBe(21);
  });
  it('rejects foreign, swapped or missing route waypoints', () => {
    for (const coords of [[2.3, 48.8], [51.2, 0.1], B]) rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[0].geometry.coordinates = coords; })), 'ROUTE_ENDPOINT');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[1].properties.order.inputIndex = 0; })), 'ROUTE_ENDPOINT');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features.shift(); })), 'ROUTE_ENDPOINT');
  });
  it('does not assume a tolerance for a road-snapped different endpoint', () => {
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[0].geometry.coordinates = [0.100001, 51.2]; })), 'ROUTE_ENDPOINT');
  });
  it('requires plain-text directions and a bound driving request', () => {
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features.pop(); })), 'ROUTE_INSTRUCTION');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[3].properties.instruction = { formattedText: '<b>not plain text</b>' }; })), 'ROUTE_INSTRUCTION');
    rejects(() => buildOfflineMileagePreview(changedPayload(input(), body => { body.features[2].properties.travelMode = 'walking'; })), 'ROUTE_MODE');
    for (const travelMode of [undefined, 'walking', 'cycling']) {
      const value = input();
      rejects(() => buildOfflineMileagePreview({ ...value, outward: { ...value.outward,
        request: { ...value.outward.request, travelMode } } } as IOfflineMileagePreviewInput), 'ROUTE_BINDING');
    }
  });
  it('requires a distinct reverse response; never doubles or reuses outward', () => {
    const value = input(); const reverse = value.reverse!;
    rejects(() => buildOfflineMileagePreview({ ...value, reverse: undefined }), 'ROUTE_LEGS');
    rejects(() => buildOfflineMileagePreview({ ...value, returnJourney: false }), 'ROUTE_LEGS');
    rejects(() => buildOfflineMileagePreview({ ...value, reverse: value.outward }), 'ROUTE_BINDING');
    rejects(() => buildOfflineMileagePreview({ ...value, reverse: { ...reverse, response: { ...reverse.response, payload: value.outward.response.payload } } }), 'ROUTE_ENDPOINT');
    rejects(() => buildOfflineMileagePreview({ ...value, reverse: { request: { ...reverse.request, requestId: 'outward-1' }, response: { ...reverse.response, requestId: 'outward-1' } } }), 'ROUTE_DUPLICATE');
  });
  it('rejects sparse malformed arrays rather than silently skipping them', () => {
    const features = (payload(A, B, 1234).features as unknown[]); features.length += 1;
    const value = input();
    rejects(() => buildOfflineMileagePreview({ ...value, outward: { ...value.outward, response: { ...value.outward.response,
      payload: { type: 'FeatureCollection', features } } } }), 'ROUTE_SCHEMA');
    const sparseRows = [row()]; sparseRows.length += 1;
    rejects(() => selectMileageRate(rates(sparseRows), '2026-10-21'), 'RATE_ROW');
  });
});

describe('EXP-S03-006/007: explicit current location choice', () => {
  it('permits explicit selection among distinct matches without auto-selecting the first', () => {
    const value = location('A', A);
    expect(selectMileageLocation({ ...value, candidates: [{ id: 'X', label: 'Other fictional match', coordinates: C, countryCode: 'GB', match: 'matched' }, ...value.candidates] }).id).toBe('A');
  });
  it.each([
    { confirmed: false }, { selectedId: '' }, { selectedId: 'other' }, { candidates: [] },
    { resultQueryKey: 'old address' }, { sourceVersion: '' }, { queryKey: '' }
  ])('rejects missing or stale selection %#', patch => { rejects(() => selectMileageLocation({ ...location('A', A), ...patch })); });
  it.each(['ambiguous', 'noMatch'])('rejects a selected %s result', match => {
    const value = location('A', A);
    rejects(() => selectMileageLocation({ ...value, candidates: [{ ...value.candidates[0], match } as typeof value.candidates[0]] }), 'LOCATION_SELECTION');
  });
  it('rejects duplicate identity, invalid coordinates and foreign selection', () => {
    const value = location('A', A); const candidate = value.candidates[0];
    rejects(() => selectMileageLocation({ ...value, candidates: [candidate, candidate] }), 'LOCATION_AMBIGUOUS');
    rejects(() => selectMileageLocation({ ...value, candidates: [{ ...candidate, countryCode: 'FR' }] }), 'LOCATION_COUNTRY');
    rejects(() => selectMileageLocation({ ...value, candidates: [{ ...candidate, coordinates: [Infinity, 51] }] }), 'LOCATION_INVALID');
  });
  it('invalidates selected location source version, label or coordinates and identical endpoints', () => {
    const value = input();
    rejects(() => buildOfflineMileagePreview({ ...value, from: { ...value.from, sourceVersion: 'v2' } }), 'ROUTE_BINDING');
    rejects(() => buildOfflineMileagePreview({ ...value, from: { ...value.from, candidates: [{ ...value.from.candidates[0], label: 'changed address' }] } }), 'ROUTE_BINDING');
    rejects(() => buildOfflineMileagePreview({ ...value, from: { ...value.from, candidates: [{ ...value.from.candidates[0], coordinates: C }] } }), 'ROUTE_BINDING');
    rejects(() => buildOfflineMileagePreview({ ...value, to: value.from }), 'LOCATION_SAME');
  });
});

describe('WEB-012: exact central rate, effective dates, final GBP rounding', () => {
  it.each([[0.3333, 21, 700], [0.3375, 21, 709], [0.005, 1, 1], [0.0049, 1, 0],
    [0.0003, 50, 2], [0.0029, 50, 15], [0.0051, 1, 1], [1.2345, 10, 1235], [0.0001, 50, 1]])
  ('numeric GBP rate %s × %s whole miles yields %s pence', (value, miles, pence) => {
    const selected = selectMileageRate(rates([row(value)]), '2026-10-21');
    expect(mileageAmountPence(miles, selected)).toBe(pence);
  });
  it('treats 33.33 as pounds, never guesses pence units', () => {
    expect(mileageAmountPence(1, selectMileageRate(rates([row(33.33)]), '2026-10-21'))).toBe(3333);
  });
  it.each([0, -1, NaN, Infinity, -Infinity, '0.3333', null, undefined, 0.33333, 0.00001, 0.333300000001, 1e20])('rejects invalid numeric GBP rate %s', value => {
    rejects(() => selectMileageRate(rates([{ ...row(), RatePerMile: value }]), '2026-10-21'));
  });
  it.each(['2026-10-01', '2026-10-31'])('includes effective boundary %s', date => {
    expect(selectMileageRate(rates(), date).rateTenThousandthsGbp).toBe(3333);
  });
  it.each([null, ''])('accepts explicit blank open end %s', end => {
    expect(selectMileageRate(rates([{ ...row(), EffectiveTo: end }]), '2030-01-01').title).toBe('Fictional policy');
  });
  it.each(['2026-09-30', '2026-11-01'])('rejects a rate gap on %s', date => { rejects(() => selectMileageRate(rates(), date), 'RATE_GAP'); });
  it('requires exactly one active match, rejecting overlap and duplicates', () => {
    rejects(() => selectMileageRate(rates([]), '2026-10-21'), 'RATE_GAP');
    rejects(() => selectMileageRate(rates([{ ...row(), Active: false }]), '2026-10-21'), 'RATE_GAP');
    rejects(() => selectMileageRate(rates([row(), row()]), '2026-10-21'), 'RATE_OVERLAP');
    rejects(() => selectMileageRate(rates([row(), { ...row(0.3375), EffectiveFrom: '2026-10-31', EffectiveTo: null }]), '2026-10-31'), 'RATE_OVERLAP');
    expect(selectMileageRate(rates([row(), { ...row(0.3375), EffectiveFrom: '2026-11-01', EffectiveTo: null }]), '2026-11-01').rateTenThousandthsGbp).toBe(3375);
  });
  it.each(['true', 'false', 0, 1, null, undefined])('rejects invalid Active flag %s', flag => {
    rejects(() => selectMileageRate(rates([{ ...row(), Active: flag }]), '2026-10-21'), 'RATE_ACTIVE');
  });
  it.each(['2026-02-29', '2026-04-31', '0000-01-01', '2026-00-10', '2026-13-01', '2026-10-00',
    '21-10-2026', '2026-10-21T00:00:00Z', '', '2026-1-01', null, undefined])('rejects invalid date %s independently', date => {
    expect(validMileageDate(date)).toBe(false);
    rejects(() => selectMileageRate(rates(), date as string), 'JOURNEY_DATE');
    rejects(() => selectMileageRate(rates([{ ...row(), EffectiveFrom: date }]), '2026-10-21'), 'RATE_DATE');
  });
  it('validates leap years, reversed ranges and invalid inactive rows', () => {
    expect(validMileageDate('2024-02-29')).toBe(true); expect(validMileageDate('2000-02-29')).toBe(true);
    expect(validMileageDate('2100-02-29')).toBe(false);
    rejects(() => selectMileageRate(rates([{ ...row(), EffectiveTo: '2026-09-30' }]), '2026-10-21'), 'RATE_DATE');
    rejects(() => selectMileageRate(rates([row(), { ...row(), Active: false, EffectiveTo: 'bad' }]), '2026-10-21'), 'RATE_DATE');
    rejects(() => selectMileageRate(rates([{ ...row(), EffectiveTo: undefined }]), '2026-10-21'), 'RATE_DATE');
  });
  it('requires a complete versioned central source and guards monetary overflow/forged units', () => {
    for (const patch of [{ listTitle: 'other' }, { snapshotVersion: '' }, { complete: false }, { rows: null }, { retrievedAtMs: NaN }]) {
      rejects(() => selectMileageRate({ ...rates(), ...patch } as IMileageRateSnapshot, '2026-10-21'), 'RATE_SOURCE');
    }
    const selected = selectMileageRate(rates(), '2026-10-21');
    rejects(() => mileageAmountPence(Number.MAX_SAFE_INTEGER, selected), 'AMOUNT_OVERFLOW');
    rejects(() => mileageAmountPence(1.5, selected), 'PAYABLE_MILES');
    rejects(() => mileageAmountPence(1, { ...selected, rateTenThousandthsGbp: 45 }), 'RATE_VALUE');
  });
});

describe('Preview freshness, confirmation and the permanent offline provider hold', () => {
  it.each([-1, NaN, Infinity, 8000 - 1, 10001, 9000.5])('rejects stale/invalid/future request time %s', requestedAtMs => {
    const value = input();
    rejects(() => buildOfflineMileagePreview({ ...value, outward: { ...value.outward, request: { ...value.outward.request, requestedAtMs } } }), 'STALE_RESULT');
  });
  it('rejects a response before its request and stale rate snapshot', () => {
    const value = input();
    rejects(() => buildOfflineMileagePreview({ ...value, outward: { ...value.outward, response: { ...value.outward.response, receivedAtMs: 8999 } } }), 'STALE_RESULT');
    rejects(() => buildOfflineMileagePreview({ ...value, rates: { ...value.rates, retrievedAtMs: 7999 } }), 'STALE_RESULT');
  });
  it.each([{ nowMs: NaN, maxAgeMs: 1000 }, { nowMs: 10000, maxAgeMs: 0 }, { nowMs: 10000, maxAgeMs: Infinity }])('rejects missing/invalid freshness policy %#', freshness => {
    rejects(() => buildOfflineMileagePreview({ ...input(), freshness }), 'FRESHNESS_POLICY');
  });
  it('rejects late response identity and changed draft identity/revision', () => {
    const value = input();
    rejects(() => buildOfflineMileagePreview({ ...value, outward: { ...value.outward, response: { ...value.outward.response, requestId: 'old' } } }), 'ROUTE_BINDING');
    rejects(() => buildOfflineMileagePreview({ ...value, draftRevision: 2 }), 'ROUTE_BINDING');
    rejects(() => buildOfflineMileagePreview({ ...value, draftKey: 'another' }), 'ROUTE_BINDING');
  });
  it('requires explicit current offline preview confirmation without enabling maps or Save', () => {
    const value = input(); const preview = buildOfflineMileagePreview(value);
    expect(preview.confirmation).toBe('unconfirmed');
    rejects(() => confirmOfflineMileagePreview(value, preview.previewKey, false), 'CONFIRMATION_STALE');
    rejects(() => confirmOfflineMileagePreview(value, '', true), 'CONFIRMATION_STALE');
    expect(confirmOfflineMileagePreview(value, preview.previewKey, true)).toMatchObject({ confirmation: 'confirmedOfflinePreview',
      providerStatus: 'providerHeld', canPersist: false, mapRendered: false, eligibility: 'unverified' });
    expect(mileageProviderPolicy).toMatchObject({ status: 'providerHeld', canRequestRoute: false, canPersist: false });
  });
  it.each(['date', 'rate', 'rateVersion', 'programme', 'nominal', 'purpose', 'distance', 'return'])('invalidates confirmation when %s changes', change => {
    const value = input(); const old = buildOfflineMileagePreview(value);
    const changes: Record<string, IOfflineMileagePreviewInput> = {
      date: { ...value, journeyDate: '2026-10-22' }, rate: { ...value, rates: rates([row(0.3375)]) },
      rateVersion: { ...value, rates: { ...value.rates, snapshotVersion: 'v2' } },
      programme: { ...value, programmeKey: 'other' }, nominal: { ...value, travelNominalCode: 'other' },
      purpose: { ...value, purpose: 'another reason' }, distance: changedPayload(value, b => { b.features[2].properties.distanceInMeters += 1; }),
      return: { ...value, returnJourney: false, reverse: undefined }
    };
    rejects(() => confirmOfflineMileagePreview(changes[change], old.previewKey, true), 'CONFIRMATION_STALE');
  });
  it('rechecks expiry on confirmation even with an identical key', () => {
    const value = input(); const old = buildOfflineMileagePreview(value);
    rejects(() => confirmOfflineMileagePreview({ ...value, freshness: { nowMs: 12001, maxAgeMs: 2000 } }, old.previewKey, true), 'STALE_RESULT');
  });
  it('is deterministic and detached from later changes to supplied geometry', () => {
    const value = input(); const before = JSON.stringify(value); const preview = buildOfflineMileagePreview(value);
    expect(buildOfflineMileagePreview(value)).toEqual(preview); expect(JSON.stringify(value)).toBe(before);
    expect(Object.isFrozen(preview)).toBe(true); expect(Object.isFrozen(preview.legs[0].geometry[0][0])).toBe(true);
    expect(Object.isFrozen(preview.rate)).toBe(true); expect(Object.isFrozen(mileageProviderPolicy)).toBe(true);
  });
  it('calls no network, storage or provider during preview or confirmation', () => {
    const xhr = jest.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('Network forbidden'); });
    const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage forbidden'); });
    const oldFetch = globalThis.fetch;
    const fetchSpy = jest.fn(() => { throw new Error('Paid/provider calls forbidden'); });
    globalThis.fetch = fetchSpy;
    try {
      const value = input(); const preview = buildOfflineMileagePreview(value);
      confirmOfflineMileagePreview(value, preview.previewKey, true);
      expect(fetchSpy).not.toHaveBeenCalled(); expect(xhr).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
    } finally { globalThis.fetch = oldFetch; xhr.mockRestore(); storage.mockRestore(); }
  });
});
