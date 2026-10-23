import { validateNotificationAdminExceptionPolicy as validate } from './NotificationAdminExceptionPolicyValidation';
import { NotificationAdminExceptionPolicyValidationResult, PolicyShapeFindingCode } from './NotificationAdminExceptionPolicyModels';
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
const expectedHolds = ['PolicyApprovalUnproved', 'RecipientIdentityUnproved', 'SourceIdentityUnproved',
    'CorrectionRouteUnavailable', 'ClearingEvidenceUnproved', 'ProducerAuthorityUnproved', 'ClockAuthorityUnproved',
    'ResourceAuthorityUnproved', 'IssuerAuthorityUnproved', 'NativeNotificationDeliveryUnbound', 'NotificationAuditAppendPortUnavailable'];
type Data = {
    [key: string]: unknown;
};
function fresh(): Data { return JSON.parse(JSON.stringify(seed)) as Data; }
function record(root: unknown, ...path: string[]): Data {
    let value: unknown = root;
    for (const key of path)
        value = (value as Data)[key];
    return value as Data;
}
function list(root: unknown, ...path: string[]): unknown[] { return record(root, ...path) as unknown as unknown[]; }
function walk(value: unknown, action: (value: object) => void): void {
    if (value !== null && typeof value === 'object') {
        action(value);
        for (const key of Object.keys(value))
            walk((value as Data)[key], action);
    }
}
function invariant(result: Readonly<NotificationAdminExceptionPolicyValidationResult>): void {
    expect(result.holds).toEqual(expectedHolds);
    expect(Object.keys(result)).toEqual(result.shapeValid
        ? ['status', 'shapeValid', 'policy', 'findings', 'holds'] : ['status', 'shapeValid', 'findings', 'holds']);
    walk(result, value => expect(Object.isFrozen(value)).toBe(true));
    for (const finding of result.findings)
        expect(Object.keys(finding)).toEqual(['path', 'code']);
}
function valid(input: unknown): Extract<NotificationAdminExceptionPolicyValidationResult, {
    status: 'SHAPE_VALID_HOLD';
}> {
    const result = validate(input);
    invariant(result);
    expect(result.status).toBe('SHAPE_VALID_HOLD');
    if (result.status !== 'SHAPE_VALID_HOLD')
        throw new Error('Expected valid held synthetic shape');
    expect(result.findings).toEqual([]);
    return result;
}
function invalid(input: unknown, code?: PolicyShapeFindingCode, path?: string): Readonly<NotificationAdminExceptionPolicyValidationResult> {
    const result = validate(input);
    invariant(result);
    expect(result.status).toBe('INVALID_HOLD');
    expect(Object.prototype.hasOwnProperty.call(result, 'policy')).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    if (code)
        expect(result.findings.some(finding => finding.code === code && (path === undefined || finding.path === path))).toBe(true);
    return result;
}
describe('NOT013 pure prerequisite technical1.1.0 / wire1.0.0', () => {
    test('nondefault synthetic policy remains unapproved and holds all eleven authorities', () => {
        const result = valid(fresh());
        expect(result.policy.delivery.channel).toBe('Teams');
        expect(result.policy.selectors[0].priorities).toEqual(['P2']);
    });
    test('complete detached recursive freeze preserves unfrozen caller data', () => {
        const input = fresh();
        const before = JSON.stringify(input);
        const result = valid(input);
        const raw = new Set<object>();
        walk(input, value => { raw.add(value); expect(Object.isFrozen(value)).toBe(false); });
        walk(result, value => expect(raw.has(value)).toBe(false));
        expect(JSON.stringify(input)).toBe(before);
        input.policyKey = 'changed';
        expect(result.policy.policyKey).toBe(seed.policyKey);
    });
    test('passive deeply frozen and null-prototype own-data records are supported', () => {
        const frozen = fresh();
        walk(frozen, Object.freeze);
        valid(frozen);
        const passive = fresh();
        Object.setPrototypeOf(passive, null);
        Object.setPrototypeOf(record(passive, 'recipients'), null);
        valid(passive);
    });
    test('original reordered selector duplicate is refused at selectors', () => {
        const input = fresh();
        input.selectors = [
            { issueTypes: ['OwnerResolution', 'ScoringMetadata'], priorities: ['P3', 'P2'], statuses: ['Open', 'SourceDataRequired'] },
            { issueTypes: ['ScoringMetadata', 'OwnerResolution'], priorities: ['P2', 'P3'], statuses: ['SourceDataRequired', 'Open'] }
        ];
        invalid(input, 'DuplicateSelectorRule', '/selectors');
    });
    test('original inherited policy is refused', () => { invalid(Object.create(fresh()), 'UnsupportedRuntimeObject', ''); });
    test('original getter and array accessor are refused without invocation', () => {
        let calls = 0;
        const input = fresh();
        Object.defineProperty(input, 'policyKey', { enumerable: true, get() { calls++; throw new Error('PRIVATE'); } });
        invalid(input, 'AccessorProperty', '');
        const second = fresh();
        Object.defineProperty(list(second, 'recipients', 'personKeys'), '0', { enumerable: true, get() { calls++; return 'private'; } });
        invalid(second, 'AccessorProperty', '/recipients/personKeys');
        expect(calls).toBe(0);
    });
    test('original nested symbol and custom array property produce redacted containing paths', () => {
        const input = fresh();
        Object.defineProperty(record(input, 'recipients'), Symbol('PRIVATE'), { value: 'secret', enumerable: true });
        expect(JSON.stringify(invalid(input, 'UnsupportedRuntimeObject', '/recipients'))).not.toContain('PRIVATE');
        const second = fresh();
        Object.defineProperty(list(second, 'recipients', 'personKeys'), 'secret', { value: 'private', enumerable: true });
        expect(JSON.stringify(invalid(second, 'UnexpectedProperty', '/recipients/personKeys'))).not.toContain('secret');
    });
    const boundaries: readonly [
        string,
        (input: Data) => void,
        PolicyShapeFindingCode,
        string
    ][] = [
        ['nonenumerable object', p => Object.defineProperty(record(p, 'recipients'), 'private', { value: 1 }), 'UnsupportedRuntimeObject', '/recipients'],
        ['array symbol', p => Object.defineProperty(list(p, 'selectors'), Symbol('private'), { value: 1 }), 'UnsupportedRuntimeObject', '/selectors'],
        ['array accessor', p => Object.defineProperty(list(p, 'selectors'), '0', { enumerable: true, get() { throw new Error('getter'); } }), 'AccessorProperty', '/selectors'],
        ['sparse array', p => { delete list(p, 'selectors')[0]; }, 'SparseArray', '/selectors'],
        ['custom array prototype', p => Object.setPrototypeOf(list(p, 'selectors'), {}), 'UnsupportedRuntimeObject', '/selectors'],
        ['custom object prototype', p => Object.setPrototypeOf(record(p, 'delivery'), {}), 'UnsupportedRuntimeObject', '/delivery'],
        ['shared alias', p => { record(p, 'delivery').scheduleReference = p.governanceReference; }, 'CyclicOrAliasedInput', '/delivery/scheduleReference'],
        ['cycle', p => { record(p, 'source').peopleContractReference = p; }, 'CyclicOrAliasedInput', '/source/peopleContractReference'],
        ['extra record key', p => { record(p, 'audit')['PRIVATE_EMAIL@example.invalid'] = 'secret'; }, 'UnexpectedProperty', '/audit'],
        ['reference version missing', p => { delete record(p, 'governanceReference').version; }, 'MissingRequired', '/governanceReference/version'],
        ['empty reference', p => { record(p, 'governanceReference').key = ''; }, 'InvalidString', '/governanceReference/key'],
        ['space reference', p => { record(p, 'governanceReference').key = ' value '; }, 'InvalidString', '/governanceReference/key'],
        ['unsupported version', p => { p.schemaVersion = '2.0.0'; }, 'UnsupportedVersion', '/schemaVersion'],
        ['unsupported schema', p => { p.schema = 'PRIVATE'; }, 'UnsupportedSchema', '/schema'],
        ['unknown issue', p => { record(p, 'selectors', '0').issueTypes = ['PRIVATE']; }, 'InvalidEnum', '/selectors/0/issueTypes/0'],
        ['lowercase priority', p => { record(p, 'selectors', '0').priorities = ['p2']; }, 'InvalidEnum', '/selectors/0/priorities/0'],
        ['Resolved unavailable', p => { record(p, 'selectors', '0').statuses = ['Resolved']; }, 'InvalidEnum', '/selectors/0/statuses/0'],
        ['allAdmin unavailable', p => { record(p, 'recipients').eligibleRoles = ['allAdmin']; }, 'InvalidEnum', '/recipients/eligibleRoles/0'],
        ['no missing channel default', p => { delete record(p, 'delivery').channel; }, 'MissingRequired', '/delivery/channel'],
        ['duplicate person', p => { record(p, 'recipients').personKeys = ['A', 'A']; }, 'DuplicateValue', '/recipients/personKeys'],
        ['empty selectors', p => { p.selectors = []; }, 'EmptySelection', '/selectors']
    ];
    for (const [name, mutate, code, path] of boundaries)
        test(name, () => { const input = fresh(); mutate(input); invalid(input, code, path); });
    const unsupported: readonly unknown[] = [undefined, null, () => 1, Symbol('private'), BigInt(1), NaN, Infinity, 0, true, new Date(), Object('x')];
    unsupported.forEach((value, index) => {
        test('unsupported root ' + index, () => { invalid(value); });
        test('unsupported string scalar ' + index, () => { const input = fresh(); input.policyKey = value; invalid(input, 'InvalidType', '/policyKey'); });
    });
    test('caller toJSON, valueOf, toString and iterator are never invoked', () => {
        let calls = 0;
        const input = fresh();
        input.toJSON = () => { calls++; return seed; };
        invalid(input, 'UnexpectedProperty', '');
        const second = fresh();
        second.policyKey = { toString() { calls++; return 'x'; }, valueOf() { calls++; return 'x'; } };
        invalid(second, 'InvalidType');
        const third = fresh();
        Object.defineProperty(list(third, 'selectors'), Symbol.iterator, { value: () => { calls++; throw new Error('PRIVATE'); } });
        invalid(third, 'UnsupportedRuntimeObject');
        expect(calls).toBe(0);
    });
    for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'])
        test('reflection exception ' + trap + ' is root-redacted', () => {
            const handler = { [trap]: () => { throw new Error('PRIVATE_RAW_EXCEPTION'); } };
            const result = invalid(new Proxy(fresh(), handler), 'RuntimeInspectionFailed', '');
            expect(result.findings).toEqual([{ path: '', code: 'RuntimeInspectionFailed' }]);
            expect(JSON.stringify(result)).not.toContain('PRIVATE');
        });
    test('Proxy traps may run or lie; accepted reflected snapshot remains detached HOLD', () => {
        let calls = 0;
        const input = fresh();
        Object.setPrototypeOf(input, { hostile: true });
        const result = valid(new Proxy(input, { getPrototypeOf() { calls++; return Object.prototype; }, get() { throw new Error('raw get'); } }));
        expect(calls).toBeGreaterThan(0);
        expect(Object.getPrototypeOf(result.policy)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(result.policy, 'hostile')).toBe(false);
    });
    test('rejected parent stops before malicious child traversal', () => {
        const input = fresh();
        let calls = 0;
        Object.setPrototypeOf(record(input, 'recipients'), {});
        Object.defineProperty(record(input, 'recipients'), 'personKeys', { enumerable: true, get() { calls++; return ['secret']; } });
        expect(invalid(input).findings).toEqual([{ path: '/recipients', code: 'UnsupportedRuntimeObject' }]);
        expect(calls).toBe(0);
    });
    test('canonical enum triples, shorter prefixes, ordinal keys and reordered equality', () => {
        const input = fresh();
        input.selectors = [
            { issueTypes: ['ScoringMetadata', 'OwnerResolution'], priorities: ['P3', 'P1'], statuses: ['SourceDataRequired', 'Open'] },
            { issueTypes: ['ScoringMetadata'], priorities: ['P2'], statuses: ['IntentionallyTBC'] }
        ];
        record(input, 'recipients').personKeys = ['z', 'a', 'A', '😀', '\uE000'];
        record(input, 'recipients').eligibleRoles = ['SystemAdmin', 'SeniorManagerAdmin'];
        const second = fresh();
        second.selectors = list(input, 'selectors').map(rule => ({
            issueTypes: list(rule, 'issueTypes').slice().reverse(), priorities: list(rule, 'priorities').slice().reverse(), statuses: list(rule, 'statuses').slice().reverse()
        })).reverse();
        record(second, 'recipients').personKeys = list(input, 'recipients', 'personKeys').slice().reverse();
        record(second, 'recipients').eligibleRoles = list(input, 'recipients', 'eligibleRoles').slice().reverse();
        const result = valid(input);
        expect(result).toEqual(valid(second));
        expect(result.policy.recipients.personKeys).toEqual(['A', 'a', 'z', '😀', '\uE000']);
        expect(result.policy.selectors[0].issueTypes).toEqual(['ScoringMetadata']);
        expect(result.policy.selectors[1].priorities).toEqual(['P1', 'P3']);
    });
    test('distinct overlapping products are permitted without projection or dedup identity', () => {
        const input = fresh();
        list(input, 'selectors').push({ issueTypes: ['ScoringMetadata', 'OwnerResolution'], priorities: ['P2'], statuses: ['SourceDataRequired'] });
        valid(input);
    });
    test('schema order preserves exact strings irrespective of caller insertion order', () => {
        const input = fresh();
        input.policyKey = 'Exact:ÄA';
        const reversed: Data = {};
        for (const key of Object.keys(input).reverse())
            reversed[key] = input[key];
        const result = valid(reversed);
        expect(Object.keys(result.policy)).toEqual(Object.keys(seed));
        expect(result.policy.policyKey).toBe('Exact:ÄA');
    });
    test('deterministic closed diagnostics are ordinal and never echo supplied secrets', () => {
        const input = fresh();
        input.policyVersion = '';
        input.policyKey = '';
        record(input, 'delivery').channel = 'PRIVATE';
        const result = invalid(input);
        expect(result).toEqual(validate(input));
        expect(result.findings).toEqual(result.findings.slice().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
        expect(JSON.stringify(result)).not.toContain('PRIVATE');
    });
    test('missing root schema', () => { const p = fresh(); delete p.schema; invalid(p, 'MissingRequired', '/schema'); });
    test('missing root schemaVersion', () => { const p = fresh(); delete p.schemaVersion; invalid(p, 'MissingRequired', '/schemaVersion'); });
    test('missing root policyKey', () => { const p = fresh(); delete p.policyKey; invalid(p, 'MissingRequired', '/policyKey'); });
    test('missing root policyVersion', () => { const p = fresh(); delete p.policyVersion; invalid(p, 'MissingRequired', '/policyVersion'); });
    test('missing root governanceReference', () => { const p = fresh(); delete p.governanceReference; invalid(p, 'MissingRequired', '/governanceReference'); });
    test('missing root selectors', () => { const p = fresh(); delete p.selectors; invalid(p, 'MissingRequired', '/selectors'); });
    test('missing root recipients', () => { const p = fresh(); delete p.recipients; invalid(p, 'MissingRequired', '/recipients'); });
    test('missing root delivery', () => { const p = fresh(); delete p.delivery; invalid(p, 'MissingRequired', '/delivery'); });
    test('missing root suppression', () => { const p = fresh(); delete p.suppression; invalid(p, 'MissingRequired', '/suppression'); });
    test('missing root resolution', () => { const p = fresh(); delete p.resolution; invalid(p, 'MissingRequired', '/resolution'); });
    test('missing root source', () => { const p = fresh(); delete p.source; invalid(p, 'MissingRequired', '/source'); });
    test('missing root audit', () => { const p = fresh(); delete p.audit; invalid(p, 'MissingRequired', '/audit'); });
    test('complete reference governanceReference key', () => { const p = fresh(); delete record(p, "governanceReference").key; invalid(p, 'MissingRequired', "/governanceReference/key"); });
    test('complete reference governanceReference version', () => { const p = fresh(); delete record(p, "governanceReference").version; invalid(p, 'MissingRequired', "/governanceReference/version"); });
    test('complete reference governanceReference evidenceReference', () => { const p = fresh(); delete record(p, "governanceReference").evidenceReference; invalid(p, 'MissingRequired', "/governanceReference/evidenceReference"); });
    test('nonempty selectors', () => { const p = fresh(); record(p).selectors = []; invalid(p, 'EmptySelection', "/selectors"); });
    test('nonempty selectors/0/issueTypes', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = []; invalid(p, 'EmptySelection', "/selectors/0/issueTypes"); });
    test('exact enum selectors/0/issueTypes ScoringMetadata', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = ["ScoringMetadata"]; valid(p); });
    test('exact enum selectors/0/issueTypes TargetConfiguration', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = ["TargetConfiguration"]; valid(p); });
    test('exact enum selectors/0/issueTypes OwnerResolution', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = ["OwnerResolution"]; valid(p); });
    test('exact enum selectors/0/issueTypes OrganisationalWeighting', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = ["OrganisationalWeighting"]; valid(p); });
    test('exact enum selectors/0/issueTypes ManagerRelationship', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = ["ManagerRelationship"]; valid(p); });
    test('exact enum selectors/0/issueTypes TeamConfiguration', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = ["TeamConfiguration"]; valid(p); });
    test('exact enum selectors/0/issueTypes ReportingReadiness', () => { const p = fresh(); record(p, "selectors", "0").issueTypes = ["ReportingReadiness"]; valid(p); });
    test('nonempty selectors/0/priorities', () => { const p = fresh(); record(p, "selectors", "0").priorities = []; invalid(p, 'EmptySelection', "/selectors/0/priorities"); });
    test('exact enum selectors/0/priorities P1', () => { const p = fresh(); record(p, "selectors", "0").priorities = ["P1"]; valid(p); });
    test('exact enum selectors/0/priorities P2', () => { const p = fresh(); record(p, "selectors", "0").priorities = ["P2"]; valid(p); });
    test('exact enum selectors/0/priorities P3', () => { const p = fresh(); record(p, "selectors", "0").priorities = ["P3"]; valid(p); });
    test('nonempty selectors/0/statuses', () => { const p = fresh(); record(p, "selectors", "0").statuses = []; invalid(p, 'EmptySelection', "/selectors/0/statuses"); });
    test('exact enum selectors/0/statuses Open', () => { const p = fresh(); record(p, "selectors", "0").statuses = ["Open"]; valid(p); });
    test('exact enum selectors/0/statuses ControlDecisionRequired', () => { const p = fresh(); record(p, "selectors", "0").statuses = ["ControlDecisionRequired"]; valid(p); });
    test('exact enum selectors/0/statuses SourceDataRequired', () => { const p = fresh(); record(p, "selectors", "0").statuses = ["SourceDataRequired"]; valid(p); });
    test('exact enum selectors/0/statuses IntentionallyTBC', () => { const p = fresh(); record(p, "selectors", "0").statuses = ["IntentionallyTBC"]; valid(p); });
    test('nonempty recipients/personKeys', () => { const p = fresh(); record(p, "recipients").personKeys = []; invalid(p, 'EmptySelection', "/recipients/personKeys"); });
    test('nonempty recipients/eligibleRoles', () => { const p = fresh(); record(p, "recipients").eligibleRoles = []; invalid(p, 'EmptySelection', "/recipients/eligibleRoles"); });
    test('exact enum recipients/eligibleRoles SeniorManagerAdmin', () => { const p = fresh(); record(p, "recipients").eligibleRoles = ["SeniorManagerAdmin"]; valid(p); });
    test('exact enum recipients/eligibleRoles SystemAdmin', () => { const p = fresh(); record(p, "recipients").eligibleRoles = ["SystemAdmin"]; valid(p); });
    test('complete reference recipients/governanceReference key', () => { const p = fresh(); delete record(p, "recipients", "governanceReference").key; invalid(p, 'MissingRequired', "/recipients/governanceReference/key"); });
    test('complete reference recipients/governanceReference version', () => { const p = fresh(); delete record(p, "recipients", "governanceReference").version; invalid(p, 'MissingRequired', "/recipients/governanceReference/version"); });
    test('complete reference recipients/governanceReference evidenceReference', () => { const p = fresh(); delete record(p, "recipients", "governanceReference").evidenceReference; invalid(p, 'MissingRequired', "/recipients/governanceReference/evidenceReference"); });
    test('complete reference delivery/scheduleReference key', () => { const p = fresh(); delete record(p, "delivery", "scheduleReference").key; invalid(p, 'MissingRequired', "/delivery/scheduleReference/key"); });
    test('complete reference delivery/scheduleReference version', () => { const p = fresh(); delete record(p, "delivery", "scheduleReference").version; invalid(p, 'MissingRequired', "/delivery/scheduleReference/version"); });
    test('complete reference delivery/scheduleReference evidenceReference', () => { const p = fresh(); delete record(p, "delivery", "scheduleReference").evidenceReference; invalid(p, 'MissingRequired', "/delivery/scheduleReference/evidenceReference"); });
    test('complete reference delivery/templateReference key', () => { const p = fresh(); delete record(p, "delivery", "templateReference").key; invalid(p, 'MissingRequired', "/delivery/templateReference/key"); });
    test('complete reference delivery/templateReference version', () => { const p = fresh(); delete record(p, "delivery", "templateReference").version; invalid(p, 'MissingRequired', "/delivery/templateReference/version"); });
    test('complete reference delivery/templateReference evidenceReference', () => { const p = fresh(); delete record(p, "delivery", "templateReference").evidenceReference; invalid(p, 'MissingRequired', "/delivery/templateReference/evidenceReference"); });
    test('complete reference delivery/correctionRouteReference key', () => { const p = fresh(); delete record(p, "delivery", "correctionRouteReference").key; invalid(p, 'MissingRequired', "/delivery/correctionRouteReference/key"); });
    test('complete reference delivery/correctionRouteReference version', () => { const p = fresh(); delete record(p, "delivery", "correctionRouteReference").version; invalid(p, 'MissingRequired', "/delivery/correctionRouteReference/version"); });
    test('complete reference delivery/correctionRouteReference evidenceReference', () => { const p = fresh(); delete record(p, "delivery", "correctionRouteReference").evidenceReference; invalid(p, 'MissingRequired', "/delivery/correctionRouteReference/evidenceReference"); });
    test('complete reference delivery/repeatReference key', () => { const p = fresh(); delete record(p, "delivery", "repeatReference").key; invalid(p, 'MissingRequired', "/delivery/repeatReference/key"); });
    test('complete reference delivery/repeatReference version', () => { const p = fresh(); delete record(p, "delivery", "repeatReference").version; invalid(p, 'MissingRequired', "/delivery/repeatReference/version"); });
    test('complete reference delivery/repeatReference evidenceReference', () => { const p = fresh(); delete record(p, "delivery", "repeatReference").evidenceReference; invalid(p, 'MissingRequired', "/delivery/repeatReference/evidenceReference"); });
    test('complete reference delivery/retryPolicyReference key', () => { const p = fresh(); delete record(p, "delivery", "retryPolicyReference").key; invalid(p, 'MissingRequired', "/delivery/retryPolicyReference/key"); });
    test('complete reference delivery/retryPolicyReference version', () => { const p = fresh(); delete record(p, "delivery", "retryPolicyReference").version; invalid(p, 'MissingRequired', "/delivery/retryPolicyReference/version"); });
    test('complete reference delivery/retryPolicyReference evidenceReference', () => { const p = fresh(); delete record(p, "delivery", "retryPolicyReference").evidenceReference; invalid(p, 'MissingRequired', "/delivery/retryPolicyReference/evidenceReference"); });
    test('complete reference suppression/decisionContractReference key', () => { const p = fresh(); delete record(p, "suppression", "decisionContractReference").key; invalid(p, 'MissingRequired', "/suppression/decisionContractReference/key"); });
    test('complete reference suppression/decisionContractReference version', () => { const p = fresh(); delete record(p, "suppression", "decisionContractReference").version; invalid(p, 'MissingRequired', "/suppression/decisionContractReference/version"); });
    test('complete reference suppression/decisionContractReference evidenceReference', () => { const p = fresh(); delete record(p, "suppression", "decisionContractReference").evidenceReference; invalid(p, 'MissingRequired', "/suppression/decisionContractReference/evidenceReference"); });
    test('complete reference resolution/evidenceContractReference key', () => { const p = fresh(); delete record(p, "resolution", "evidenceContractReference").key; invalid(p, 'MissingRequired', "/resolution/evidenceContractReference/key"); });
    test('complete reference resolution/evidenceContractReference version', () => { const p = fresh(); delete record(p, "resolution", "evidenceContractReference").version; invalid(p, 'MissingRequired', "/resolution/evidenceContractReference/version"); });
    test('complete reference resolution/evidenceContractReference evidenceReference', () => { const p = fresh(); delete record(p, "resolution", "evidenceContractReference").evidenceReference; invalid(p, 'MissingRequired', "/resolution/evidenceContractReference/evidenceReference"); });
    test('complete reference source/observationContractReference key', () => { const p = fresh(); delete record(p, "source", "observationContractReference").key; invalid(p, 'MissingRequired', "/source/observationContractReference/key"); });
    test('complete reference source/observationContractReference version', () => { const p = fresh(); delete record(p, "source", "observationContractReference").version; invalid(p, 'MissingRequired', "/source/observationContractReference/version"); });
    test('complete reference source/observationContractReference evidenceReference', () => { const p = fresh(); delete record(p, "source", "observationContractReference").evidenceReference; invalid(p, 'MissingRequired', "/source/observationContractReference/evidenceReference"); });
    test('complete reference source/peopleContractReference key', () => { const p = fresh(); delete record(p, "source", "peopleContractReference").key; invalid(p, 'MissingRequired', "/source/peopleContractReference/key"); });
    test('complete reference source/peopleContractReference version', () => { const p = fresh(); delete record(p, "source", "peopleContractReference").version; invalid(p, 'MissingRequired', "/source/peopleContractReference/version"); });
    test('complete reference source/peopleContractReference evidenceReference', () => { const p = fresh(); delete record(p, "source", "peopleContractReference").evidenceReference; invalid(p, 'MissingRequired', "/source/peopleContractReference/evidenceReference"); });
    test('complete reference source/versionBindingReference key', () => { const p = fresh(); delete record(p, "source", "versionBindingReference").key; invalid(p, 'MissingRequired', "/source/versionBindingReference/key"); });
    test('complete reference source/versionBindingReference version', () => { const p = fresh(); delete record(p, "source", "versionBindingReference").version; invalid(p, 'MissingRequired', "/source/versionBindingReference/version"); });
    test('complete reference source/versionBindingReference evidenceReference', () => { const p = fresh(); delete record(p, "source", "versionBindingReference").evidenceReference; invalid(p, 'MissingRequired', "/source/versionBindingReference/evidenceReference"); });
    test('complete reference audit/dispatchContractReference key', () => { const p = fresh(); delete record(p, "audit", "dispatchContractReference").key; invalid(p, 'MissingRequired', "/audit/dispatchContractReference/key"); });
    test('complete reference audit/dispatchContractReference version', () => { const p = fresh(); delete record(p, "audit", "dispatchContractReference").version; invalid(p, 'MissingRequired', "/audit/dispatchContractReference/version"); });
    test('complete reference audit/dispatchContractReference evidenceReference', () => { const p = fresh(); delete record(p, "audit", "dispatchContractReference").evidenceReference; invalid(p, 'MissingRequired', "/audit/dispatchContractReference/evidenceReference"); });
    test('trailing newline reference is refused without normalisation', () => { const p = fresh(); p.policyKey = 'key\n'; invalid(p, 'InvalidString', '/policyKey'); });
});
