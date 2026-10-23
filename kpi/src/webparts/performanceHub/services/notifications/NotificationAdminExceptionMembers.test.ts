import { buildNotificationAdminExceptionMembers as project } from './NotificationAdminExceptionMembers';
import { validateNotificationAdminExceptionPolicy as validate } from './NotificationAdminExceptionPolicyValidation';
import type { IAdminDataQualityIssue } from '../AdminDataQualityDomain';
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

// Exact policy seed from the existing pure-validator tests; variations below are synthetic.
const issue = (changes: Partial<IAdminDataQualityIssue> = {}): IAdminDataQualityIssue => ({
  issueKey: 'KPI|SO1-001|MISSING_PERCENTAGE_SOURCE_SCALE', kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|2026|v01', sourceIssueCode: 'MISSING_PERCENTAGE_SOURCE_SCALE',
  priority: 'P2', issueType: 'ScoringMetadata', scope: 'KPI',
  status: 'SourceDataRequired', sourceReference: 'SYNTHETIC:source',
  title: 'SYNTHETIC:scale issue', detail: 'SYNTHETIC:missing scale',
  recommendedResolution: 'SYNTHETIC:controlled correction', owner: 'PH', ...changes
});
const policy = (changes: object = {}) => validate({ ...seed, ...changes });

describe('NOT013 actionable KPI member preview (labelled synthetic variations)', () => {
  it('produces concrete members and the exact existing correction route', () => {
    const result = project(policy(), [issue()]);
    expect(result.status).toBe('PREVIEW');
    expect(result.nativeDeliveryEnabled).toBe(false);
    expect(result.members.length).toBe(1);
    expect(result.members[0].memberKey).toBe(JSON.stringify([issue().issueKey, issue().kpiVersionKey]));
    expect(result.members[0].correctionRoute.contract).toBe('buildAdminKpiControlledRemediationCommand');
    expect(result.members[0].correctionRoute.allowedPatchFields).toEqual([
      'measureType', 'direction', 'aggregationMethod', 'scoringPolicyApproved', 'scoringPolicyReference', 'scoringMetadataIssues'
    ]);
  });
  it('requires type AND priority AND status within a single rule', () => {
    [issue({ priority: 'P1' }), issue({ status: 'Open' }), issue({
      issueKey: 'KPI|SO1-001|UNKNOWN_OWNER_CODE', sourceIssueCode: 'UNKNOWN_OWNER_CODE', issueType: 'OwnerResolution'
    })].forEach(row => {
      const result = project(policy(), [row]);
      expect(result.members.length).toBe(0);
      expect(result.unselected[0].reason).toBe('SelectorMismatch');
    });
    const splitRules = policy({ selectors: [
      { issueTypes: ['ScoringMetadata'], priorities: ['P1'], statuses: ['SourceDataRequired'] },
      { issueTypes: ['OwnerResolution'], priorities: ['P2'], statuses: ['SourceDataRequired'] }
    ] });
    expect(project(splitRules, [issue()]).members.length).toBe(0);
  });
  it('collapses duplicate observations and overlapping policy rules', () => {
    const overlapping = policy({ selectors: [seed.selectors[0], {
      issueTypes: ['ScoringMetadata', 'OwnerResolution'], priorities: ['P1', 'P2', 'P3'], statuses: ['SourceDataRequired']
    }] });
    expect(project(overlapping, [issue(), issue(), issue()]).members.length).toBe(1);
  });
  it('holds conflicting same-tuple facts even when one observation would be unselected', () => {
    ['priority', 'status', 'detail', 'sourceReference', 'owner'].forEach(field => {
      const changes = field === 'priority' ? { priority: 'P1' as const }
        : field === 'status' ? { status: 'IntentionallyTBC' as const } : { [field]: 'SYNTHETIC:changed' };
      const result = project(policy(), [issue(), issue(changes)]);
      expect(result.status).toBe('HOLD');
      expect(result.members.length).toBe(0);
      expect(result.holds[0].reason).toBe('ConflictingSourceObservations');
    });
    expect(project(policy(), [issue(), issue({ issueType: 'OwnerResolution' })]).members.length).toBe(0);
    expect(project(policy(), [issue(), issue({ scope: 'People' })]).members.length).toBe(0);
  });
  it('keeps changed versions distinct and stable regardless of input order', () => {
    const rows = [issue({ kpiVersionKey: 'SYNTHETIC:v2' }), issue()];
    const result = project(policy(), rows);
    expect(result.members.length).toBe(2);
    expect(result).toEqual(project(policy(), rows.slice().reverse()));
    expect(result.members.map(member => member.memberKey)).toEqual(result.members.map(member => member.memberKey).sort());
  });
  it('holds missing versions and inconsistent code/type/canonical key identities', () => {
    expect(project(policy(), [issue({ kpiVersionKey: undefined })]).holds[0].reason).toBe('SourceVersionUnavailable');
    [issue({ sourceIssueCode: 'SYNTHETIC:unknown' as never }), issue({ issueType: 'OwnerResolution' }),
      issue({ issueKey: 'SYNTHETIC:wrong' })].forEach(row => {
      const result = project(policy(), [row]);
      expect(result.members.length).toBe(0);
      expect(result.holds[0].reason).toBe('SourceIdentityInconsistent');
    });
  });
  it('keeps IntentionallyTBC and unsupported types/domains explicit and unselected', () => {
    const broad = policy({ selectors: [{ issueTypes: ['ScoringMetadata', 'TargetConfiguration', 'ReportingReadiness'],
      priorities: ['P1', 'P2', 'P3'], statuses: ['IntentionallyTBC', 'SourceDataRequired'] }] });
    const result = project(broad, [issue({ status: 'IntentionallyTBC' }), issue({
      issueKey: 'KPI|SO1-001|MISSING_TARGET', sourceIssueCode: 'MISSING_TARGET', issueType: 'TargetConfiguration'
    }), issue({ scope: 'Reporting', issueKey: 'Reporting|SYNTHETIC:report' }),
    issue({ scope: 'People', issueKey: 'Manager|SYNTHETIC:person' }),
    issue({ scope: 'Teams', issueKey: 'Team|SYNTHETIC:team' }),
    issue({ scope: 'Weighting', issueKey: 'Weighting|SYNTHETIC:workstream' })]);
    expect(result.members.length).toBe(0);
    expect(result.unselected.length).toBe(6);
    expect(result.unselected.map(item => item.reason).sort()).toEqual([
      'IntentionallyTBC', 'UnsupportedCorrectionScope', 'UnsupportedCorrectionScope',
      'UnsupportedCorrectionScope', 'UnsupportedCorrectionScope', 'UnsupportedCorrectionType'
    ]);
  });
  it('supports owner and KPI reporting field routes at configured P3', () => {
    const broad = policy({ selectors: [{ issueTypes: ['OwnerResolution', 'ReportingReadiness'],
      priorities: ['P3'], statuses: ['Open'] }] });
    const result = project(broad, [issue({ issueKey: 'KPI|SO1-001|UNKNOWN_OWNER_CODE',
      sourceIssueCode: 'UNKNOWN_OWNER_CODE', issueType: 'OwnerResolution', priority: 'P3', status: 'Open' }),
    issue({ issueKey: 'KPI|SO1-001|MISSING_UNIT_LABEL', sourceIssueCode: 'MISSING_UNIT_LABEL',
      issueType: 'ReportingReadiness', priority: 'P3', status: 'Open' })]);
    expect(result.members.length).toBe(2);
    expect(result.members.map(member => member.correctionRoute.allowedPatchFields)).toEqual([['unit', 'reportingStatus'], ['owner']]);
  });
  it('does not mutate inputs, invoke accessors or expose recipients/dispatch/clearing', () => {
    const validated = policy(); const rows = [issue()]; const before = JSON.stringify([validated, rows]);
    const result = project(validated, rows);
    expect(JSON.stringify([validated, rows])).toBe(before);
    expect(Object.keys(result).sort()).toEqual(['holds', 'members', 'nativeDeliveryEnabled', 'status', 'unselected']);
    expect(Object.isFrozen(result.members[0].issue)).toBe(true);
    let reads = 0; const accessor = issue();
    Object.defineProperty(accessor, 'detail', { enumerable: true, get: () => { reads++; return 'bad'; } });
    expect(project(validated, [accessor]).status).toBe('HOLD');
    expect(reads).toBe(0);
    expect(project(validated, []).members.length).toBe(0);
  });
  it('holds invalid policy and manual suppression without native port calls', () => {
    expect(project(validate({}), [issue()]).status).toBe('HOLD');
    expect(project(policy({ suppression: { ...seed.suppression, mode: 'ApprovedVersionedSuppression' } }), [issue()])
      .holds[0].reason).toBe('ManualSuppressionUnsupported');
  });
});
