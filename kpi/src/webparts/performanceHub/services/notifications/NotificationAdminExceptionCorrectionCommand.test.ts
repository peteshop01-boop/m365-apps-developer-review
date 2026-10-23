jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
jest.mock('@microsoft/sp-core-library', () => ({ Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'synthetic-remediation-guid' }) } }));

import type { ICoreKpiCatalogueItem } from '../../models/ProductionModels';
import type { IAdminExceptionMember } from './NotificationAdminExceptionMembers';
import type { IAdminKpiDefinitionIdentity } from '../AdminKpiMasterDomain';
import { applyAdminKpiControlledRemediationSafeUat } from '../AdminKpiMasterDomain';
import { buildKpiDataQualityQueue } from '../KpiDataQuality';
import { projectKpiDataQualityIssues, buildAdminKpiControlledRemediationCommand } from '../AdminDataQualityDomain';
import { validateNotificationAdminExceptionPolicy } from './NotificationAdminExceptionPolicyValidation';
import { buildNotificationAdminExceptionMembers } from './NotificationAdminExceptionMembers';
import { buildNotificationAdminExceptionCorrectionCommand as bind } from './NotificationAdminExceptionCorrectionCommand';
const kpi = (overrides: Partial<ICoreKpiCatalogueItem> = {}): ICoreKpiCatalogueItem => ({
  kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|2026|v01',
  targetVersionKey: 'SO1-001|2026|target-v01',
  wording: 'Synthetic participation KPI',
  pillar: 'Participation',
  workstream: 'Schools',
  scoringDirection: 'TBC',
  metricType: 'Count',
  unitLabel: 'programmes',
  ownerSourceCode: 'PH',
  yearEndTargetValue: 200,
  q1TargetValue: 50,
  q2TargetValue: 100,
  q3TargetValue: 150,
  q4TargetValue: 200,
  ...overrides
});

const seed = {
    "schema": "KCF.NotificationAdminExceptionPolicy",
    "schemaVersion": "1.0.0",
    "policyKey": "SYNTHETIC:NOT013",
    "policyVersion": "SYNTHETIC:v1",
    "governanceReference": {
        "key": "SYNTHETIC:decision",
        "version": "SYNTHETIC:v1",
        "evidenceReference": "SYNTHETIC:unproved-reference"
    },
    "selectors": [
        {
            "issueTypes": [
                "ScoringMetadata"
            ],
            "priorities": [
                "P2"
            ],
            "statuses": [
                "SourceDataRequired"
            ]
        }
    ],
    "recipients": {
        "personKeys": [
            "SYNTHETIC:ADM001"
        ],
        "eligibleRoles": [
            "SystemAdmin"
        ],
        "governanceReference": {
            "key": "SYNTHETIC:recipient-approval",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        }
    },
    "delivery": {
        "mode": "ScheduledDigest",
        "scheduleReference": {
            "key": "SYNTHETIC:nondefault-calendar",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        },
        "channel": "Teams",
        "templateReference": {
            "key": "SYNTHETIC:template",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        },
        "correctionRouteReference": {
            "key": "SYNTHETIC:route",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        },
        "repeatMode": "OncePerIssueVersion",
        "repeatReference": {
            "key": "SYNTHETIC:repeat",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        },
        "retryPolicyReference": {
            "key": "SYNTHETIC:retry",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        }
    },
    "suppression": {
        "mode": "NoManualSuppression",
        "decisionContractReference": {
            "key": "SYNTHETIC:suppression",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        }
    },
    "resolution": {
        "mode": "ApprovedCorrectionAndAuthoritativeReadback",
        "evidenceContractReference": {
            "key": "SYNTHETIC:completion",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        }
    },
    "source": {
        "observationContractReference": {
            "key": "SYNTHETIC:observation",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        },
        "peopleContractReference": {
            "key": "SYNTHETIC:people",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        },
        "versionBindingReference": {
            "key": "SYNTHETIC:version",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        }
    },
    "audit": {
        "dispatchContractReference": {
            "key": "SYNTHETIC:audit",
            "version": "SYNTHETIC:v1",
            "evidenceReference": "SYNTHETIC:unproved-reference"
        }
    }
};

const definition = (): IAdminKpiDefinitionIdentity => ({
  recordId: 17, kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|2026|v01', state: 'Active'
});
const request = (expectedDefinition: IAdminKpiDefinitionIdentity = definition()) => ({
  actionKey: 'SYNTHETIC:A029-action', resolutionEvidenceReference: 'SYNTHETIC:A029-reference',
  expectedDefinition, patch: { direction: 'HigherIsBetter' }
});
const member = (): IAdminExceptionMember => {
  const policy = validateNotificationAdminExceptionPolicy({ ...seed, selectors: [{
    issueTypes: ['ScoringMetadata'], priorities: ['P1'], statuses: ['ControlDecisionRequired']
  }] });
  return buildNotificationAdminExceptionMembers(policy, projectKpiDataQualityIssues(buildKpiDataQualityQueue([kpi()])))
    .members[0];
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('NOT013 exact member-bound correction command', () => {
  it('constructs the real existing command from original catalogue→queue→issue→member', () => {
    const value = member(); const result = bind(value, [definition()], request());
    expect(result).toEqual(buildAdminKpiControlledRemediationCommand(value.issue, [definition()], request()));
    expect(result.expectedDefinition).toEqual(definition());
    expect(Object.keys(result).sort()).toEqual(['actionKey', 'expectedDefinition', 'issueKey', 'issueKpiId',
      'issueSourceReference', 'issueStatus', 'issueType', 'patch', 'resolutionEvidenceReference', 'sourceIssueCode']);
  });
  it('rejects wrong, stale, year-shaped, case and padded target keys as exact opaque strings', () => {
    ['SYNTHETIC:wrong', 'SO1-001|2027|v01', 'so1-001|2026|v01', ' SO1-001|2026|v01 '].forEach(version => {
      const target = { ...definition(), kpiVersionKey: version };
      expect(() => bind(member(), [target], request(target))).toThrow();
    });
  });
  it('rejects wrong KPI, record/state and duplicate physical target observations', () => {
    [{ kpiId: 'so1-001' }, { kpiId: 'SO1-002' }, { recordId: 99 }, { state: 'Inactive' as const }].forEach(change => {
      expect(() => bind(member(), [definition()], request({ ...definition(), ...change }))).toThrow();
    });
    expect(() => bind(member(), [definition(), { ...definition(), recordId: 18 }], request())).toThrow();
    expect(() => bind(member(), [definition(), definition()], request())).toThrow();
    expect(() => bind(member(), [], request())).toThrow();
  });
  it('requires a positive safe integer record and a defined matching state', () => {
    [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].forEach(recordId => {
      const target = { ...definition(), recordId };
      expect(() => bind(member(), [target], request(target))).toThrow();
    });
    const invalid = { ...definition(), state: 'SYNTHETIC:invalid' as never };
    expect(() => bind(member(), [invalid], request(invalid))).toThrow();
    const inactive = { ...definition(), state: 'Inactive' as const };
    expect(bind(member(), [inactive], request(inactive)).expectedDefinition.state).toBe('Inactive');
  });
  it('rejects missing, blank, null or inconsistent member/source versions without legacy bypass', () => {
    [undefined, '', '  ', null, 3].forEach(version => {
      const value = clone(member()) as unknown as { issue: { kpiVersionKey?: unknown }; kpiVersionKey?: unknown };
      value.issue.kpiVersionKey = version; value.kpiVersionKey = version;
      expect(() => bind(value as IAdminExceptionMember, [definition()], request())).toThrow();
    });
    const value = clone(member()) as { kpiVersionKey: string };
    value.kpiVersionKey = 'SYNTHETIC:wrong';
    expect(() => bind(value as IAdminExceptionMember, [definition()], request())).toThrow();
  });
  it('rejects altered tuple, code/type/KPI, unsupported scope and IntentionallyTBC', () => {
    const mutations = [
      (value: any) => { value.memberKey = 'SYNTHETIC:wrong-tuple'; },
      (value: any) => { value.issue.kpiId = 'SO1-002'; },
      (value: any) => { value.issue.sourceIssueCode = 'SYNTHETIC:unknown'; },
      (value: any) => { value.issue.issueType = 'OwnerResolution'; },
      (value: any) => { value.issue.issueKey = 'SYNTHETIC:noncanonical'; },
      (value: any) => { value.issue.scope = 'People'; },
      (value: any) => { value.issue.status = 'IntentionallyTBC'; }
    ];
    mutations.forEach(mutate => { const value = clone(member()); mutate(value);
      expect(() => bind(value, [definition()], request())).toThrow(); });
  });
  it('rejects every advertised route identity and allowlist alteration', () => {
    ['contract', 'issueKey', 'kpiId', 'kpiVersionKey', 'sourceIssueCode'].forEach(field => {
      const value = clone(member()) as any; value.correctionRoute[field] = 'SYNTHETIC:wrong';
      expect(() => bind(value, [definition()], request())).toThrow();
    });
    [[], ['owner'], [...member().correctionRoute.allowedPatchFields, 'owner'],
      [...member().correctionRoute.allowedPatchFields].reverse()].forEach(fields => {
      const value = clone(member()) as any; value.correctionRoute.allowedPatchFields = fields;
      expect(() => bind(value, [definition()], request())).toThrow();
    });
  });
  it('retains actual builder provenance/patch guards', () => {
    expect(() => bind(member(), [definition()], { ...request(), actionKey: ' ' })).toThrow();
    expect(() => bind(member(), [definition()], { ...request(), resolutionEvidenceReference: '' })).toThrow();
    expect(() => bind(member(), [definition()], { ...request(), patch: {} })).toThrow();
    expect(() => bind(member(), [definition()], { ...request(), patch: { owner: 'SYNTHETIC:wrong-route' } })).toThrow();
    const value = clone(member()) as any; value.issue.sourceReference = ' ';
    expect(() => bind(value, [definition()], request())).toThrow();
  });
  it('binds concrete owner and KPI reporting routes from labelled catalogue variations', () => {
    const policy = validateNotificationAdminExceptionPolicy({ ...seed, selectors: [{
      issueTypes: ['OwnerResolution', 'ReportingReadiness'], priorities: ['P2'],
      statuses: ['Open', 'ControlDecisionRequired', 'SourceDataRequired']
    }] });
    const values = buildNotificationAdminExceptionMembers(policy, projectKpiDataQualityIssues(buildKpiDataQualityQueue([
      kpi({ dataQualityFlags: 'Unknown owner code', unitLabel: 'TBC' })
    ]))).members;
    expect(values.length).toBe(2);
    values.forEach(value => {
      const patch = value.issue.issueType === 'OwnerResolution'
        ? { owner: 'SYNTHETIC:attributable-owner' } : { unit: 'SYNTHETIC:attributable-unit' };
      const result = bind(value, [definition()], { ...request(), patch });
      expect(result.patch).toEqual(patch);
      expect(result.expectedDefinition).toEqual(definition());
    });
  });
  it('captures without accessor execution and returns isolated command data', () => {
    const value = member(); const definitions = [definition()];
    const req = { ...request(), patch: { scoringMetadataIssues: ['SYNTHETIC:issue'] } };
    const before = JSON.stringify([value, definitions, req]);
    const result = bind(value, definitions, req);
    expect(JSON.stringify([value, definitions, req])).toBe(before);
    result.expectedDefinition.recordId = 99;
    (result.patch.scoringMetadataIssues as string[]).push('SYNTHETIC:detached');
    expect(JSON.stringify([value, definitions, req])).toBe(before);
    let reads = 0; const malformed = clone(member());
    Object.defineProperty(malformed, 'memberKey', { enumerable: true, get: () => { reads++; return 'bad'; } });
    expect(() => bind(malformed, definitions, req)).toThrow();
    expect(reads).toBe(0);
  });
  it('does not infer a year or detect same-identity nonidentity changes without CAS', () => {
    const value = clone(member()) as any; const version = 'SYNTHETIC:opaque-without-year';
    value.issue.kpiVersionKey = version; value.kpiVersionKey = version;
    value.memberKey = JSON.stringify([value.issue.issueKey, version]); value.correctionRoute.kpiVersionKey = version;
    const target = { ...definition(), kpiVersionKey: version };
    expect(bind(value, [target], request(target)).expectedDefinition.kpiVersionKey).toBe(version);
    expect(bind(value, [{ ...target, syntheticNonidentityField: 'changed' } as IAdminKpiDefinitionIdentity], request(target))
      .expectedDefinition).toEqual(target);
  });
  it('rejects extra own identity fields before emitting a consumer-invalid command', () => {
    const extra = { ...definition(), unexpectedOwnedField: 'SYNTHETIC_ONLY' };
    expect(() => bind(member(), [definition()], request(extra))).toThrow();
    const hidden = definition(); Object.defineProperty(hidden, 'unexpectedHiddenField', { value: 'SYNTHETIC_ONLY' });
    expect(() => bind(member(), [definition()], request(hidden))).toThrow();
    const symbol = definition(); Object.defineProperty(symbol, Symbol('SYNTHETIC'), { value: 'SYNTHETIC_ONLY' });
    expect(() => bind(member(), [definition()], request(symbol))).toThrow();
  });
  it('rejects accessor and nonplain expected identities without reading accessors', () => {
    let reads = 0; const accessor = definition();
    Object.defineProperty(accessor, 'kpiId', { enumerable: true, get: () => { reads++; return 'SO1-001'; } });
    expect(() => bind(member(), [definition()], request(accessor))).toThrow();
    expect(reads).toBe(0);
    expect(() => bind(member(), [definition()], request(Object.assign(Object.create(null), definition())))).toThrow();
    expect(() => bind(member(), [definition()], request(Object.assign(Object.create({}), definition())))).toThrow();
  });
  it('rejects coherent padded versions while preserving clean opaque version input', () => {
    const coherentMember = (version: string): IAdminExceptionMember => {
      const value = member();
      return { ...value, kpiVersionKey: version, issue: { ...value.issue, kpiVersionKey: version },
        memberKey: JSON.stringify([value.issue.issueKey, version]),
        correctionRoute: { ...value.correctionRoute, kpiVersionKey: version } };
    };
    [' SO1-001|2026|v01 ', '\tSO1-001|2026|v01', 'SO1-001|2026|v01\n', ' '].forEach(version => {
      const value = coherentMember(version); const target = { ...definition(), kpiVersionKey: version };
      const before = JSON.stringify([value, target]);
      expect(() => bind(value, [target], request(target))).toThrow();
      expect(JSON.stringify([value, target])).toBe(before);
    });
    const version = 'opaque-Ω😀-vZ'; const value = coherentMember(version);
    const target = { ...definition(), kpiVersionKey: version };
    expect(bind(value, [target], request(target)).expectedDefinition.kpiVersionKey).toBe(version);
  });
  it('ordinary command passes the actual unchanged consumer shape and holds for absent opaque authority', () => {
    const command = bind(member(), [definition()], request()); let message = '';
    try { applyAdminKpiControlledRemediationSafeUat(undefined as never, command, undefined as never, undefined as never); }
    catch (error) { message = (error as Error).message; }
    expect(message).toBe('Controlled KPI remediation requires an opaque authoritative queue readback capability.');
  });
});
