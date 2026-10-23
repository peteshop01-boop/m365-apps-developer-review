import { NotificationAdminExceptionPolicyShape, NotificationAdminExceptionPolicyValidationResult, PolicyAuthorityHold, PolicyShapeFinding, PolicyShapeFindingCode } from './NotificationAdminExceptionPolicyModels';
type ShapeNode = {
    kind: 'string';
    literal?: string;
    values?: readonly string[];
    text?: true;
} | {
    kind: 'record';
    fields: readonly (readonly [
        string,
        ShapeNode
    ])[];
} | {
    kind: 'list';
    item: ShapeNode;
};
interface SnapshotRecord {
    [key: string]: Snapshot;
}
type Snapshot = string | SnapshotRecord | Snapshot[];
const reference: ShapeNode = { kind: 'record', fields: [['key', { kind: 'string', text: true }], ['version', { kind: 'string', text: true }], ['evidenceReference', { kind: 'string', text: true }]] };
const issueTypes: readonly string[] = ["ScoringMetadata", "TargetConfiguration", "OwnerResolution", "OrganisationalWeighting", "ManagerRelationship", "TeamConfiguration", "ReportingReadiness"];
const priorities: readonly string[] = ["P1", "P2", "P3"];
const statuses: readonly string[] = ["Open", "ControlDecisionRequired", "SourceDataRequired", "IntentionallyTBC"];
const policyShape: ShapeNode = { kind: 'record', fields: [["schema", { kind: 'string', literal: "KCF.NotificationAdminExceptionPolicy" }], ["schemaVersion", { kind: 'string', literal: "1.0.0" }], ["policyKey", { kind: 'string', text: true }], ["policyVersion", { kind: 'string', text: true }], ["governanceReference", reference], ["selectors", { kind: 'list', item: { kind: 'record', fields: [["issueTypes", { kind: 'list', item: { kind: 'string', values: ["ScoringMetadata", "TargetConfiguration", "OwnerResolution", "OrganisationalWeighting", "ManagerRelationship", "TeamConfiguration", "ReportingReadiness"] } }], ["priorities", { kind: 'list', item: { kind: 'string', values: ["P1", "P2", "P3"] } }], ["statuses", { kind: 'list', item: { kind: 'string', values: ["Open", "ControlDecisionRequired", "SourceDataRequired", "IntentionallyTBC"] } }]] } }], ["recipients", { kind: 'record', fields: [["personKeys", { kind: 'list', item: { kind: 'string', text: true } }], ["eligibleRoles", { kind: 'list', item: { kind: 'string', values: ["SeniorManagerAdmin", "SystemAdmin"] } }], ["governanceReference", reference]] }], ["delivery", { kind: 'record', fields: [["mode", { kind: 'string', values: ["OnNewIssueVersion", "ScheduledDigest"] }], ["scheduleReference", reference], ["channel", { kind: 'string', values: ["Email", "Teams"] }], ["templateReference", reference], ["correctionRouteReference", reference], ["repeatMode", { kind: 'string', values: ["OncePerIssueVersion", "RepeatOnGovernedSchedule"] }], ["repeatReference", reference], ["retryPolicyReference", reference]] }], ["suppression", { kind: 'record', fields: [["mode", { kind: 'string', values: ["NoManualSuppression", "ApprovedVersionedSuppression"] }], ["decisionContractReference", reference]] }], ["resolution", { kind: 'record', fields: [["mode", { kind: 'string', literal: "ApprovedCorrectionAndAuthoritativeReadback" }], ["evidenceContractReference", reference]] }], ["source", { kind: 'record', fields: [["observationContractReference", reference], ["peopleContractReference", reference], ["versionBindingReference", reference]] }], ["audit", { kind: 'record', fields: [["dispatchContractReference", reference]] }]] };
const authorityHolds: readonly PolicyAuthorityHold[] = [
    'PolicyApprovalUnproved', 'RecipientIdentityUnproved', 'SourceIdentityUnproved',
    'CorrectionRouteUnavailable', 'ClearingEvidenceUnproved', 'ProducerAuthorityUnproved',
    'ClockAuthorityUnproved', 'ResourceAuthorityUnproved', 'IssuerAuthorityUnproved',
    'NativeNotificationDeliveryUnbound', 'NotificationAuditAppendPortUnavailable'
];
function ordinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
function freezeResult(value: unknown): void {
    if (value !== null && typeof value === 'object') {
        const record = value as {
            [key: string]: unknown;
        };
        for (const key of Object.keys(record))
            freezeResult(record[key]);
        Object.freeze(value);
    }
}
function selectorOrder(left: Snapshot, right: Snapshot): number {
    const a = left as SnapshotRecord;
    const b = right as SnapshotRecord;
    const dimensions: readonly (readonly [
        string,
        readonly string[]
    ])[] = [
        ['issueTypes', issueTypes], ['priorities', priorities], ['statuses', statuses]
    ];
    for (const [key, declaration] of dimensions) {
        const aa = a[key] as string[];
        const bb = b[key] as string[];
        for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
            const difference = declaration.indexOf(aa[i]) - declaration.indexOf(bb[i]);
            if (difference)
                return difference;
        }
        if (aa.length !== bb.length)
            return aa.length - bb.length;
    }
    return 0;
}
/** Passive own-data only; Proxy reflection may execute or lie. All shapes/references remain untrusted HOLD. */
export function validateNotificationAdminExceptionPolicy(input: unknown): Readonly<NotificationAdminExceptionPolicyValidationResult> {
    const findings: PolicyShapeFinding[] = [];
    let visited = new Set<object>();
    function reject(path: string, code: PolicyShapeFindingCode): undefined {
        findings.push({ path, code });
        return undefined;
    }
    function capture(value: unknown, node: ShapeNode, path: string): Snapshot | undefined {
        if (node.kind === 'string') {
            if (typeof value !== 'string')
                return reject(path, 'InvalidType');
            if (node.literal !== undefined && value !== node.literal) {
                return reject(path, path === '/schema' ? 'UnsupportedSchema'
                    : path === '/schemaVersion' ? 'UnsupportedVersion' : 'InvalidEnum');
            }
            if (node.values && node.values.indexOf(value) === -1)
                return reject(path, 'InvalidEnum');
            if (node.text && !/^\S(?:.*\S)?$/.test(value))
                return reject(path, 'InvalidString');
            return value;
        }
        if (value === null || typeof value !== 'object')
            return reject(path, 'InvalidType');
        if (visited.has(value))
            return reject(path, 'CyclicOrAliasedInput');
        visited.add(value);
        const prototype = Object.getPrototypeOf(value);
        const keys: (string | symbol)[] = Object.getOwnPropertyNames(value);
        for (const symbol of Object.getOwnPropertySymbols(value)) keys.push(symbol);
        const descriptors = Object.getOwnPropertyDescriptors(value);
        if (node.kind === 'list' ? prototype !== Array.prototype
            : prototype !== Object.prototype && prototype !== null) {
            return reject(path, 'UnsupportedRuntimeObject');
        }
        for (const key of keys) {
            if (typeof key !== 'string')
                return reject(path, 'UnsupportedRuntimeObject');
        }
        for (const key of keys as string[]) {
            if (!Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) {
                return reject(path, 'AccessorProperty');
            }
        }
        for (const key of keys as string[]) {
            if (!(node.kind === 'list' && key === 'length') && !descriptors[key].enumerable) {
                return reject(path, 'UnsupportedRuntimeObject');
            }
        }
        if (node.kind === 'record') {
            if (Array.isArray(value))
                return reject(path, 'InvalidType');
            for (const key of keys as string[]) {
                if (!node.fields.some(field => field[0] === key))
                    return reject(path, 'UnexpectedProperty');
            }
            const missing = node.fields.filter(field => !Object.prototype.hasOwnProperty.call(descriptors, field[0]));
            if (missing.length) {
                for (const [key] of missing)
                    reject(path + '/' + key, 'MissingRequired');
                return undefined;
            }
            const result: SnapshotRecord = {};
            const startingCount = findings.length;
            for (const [key, field] of node.fields) {
                const ownValue: unknown = descriptors[key].value;
                const captured = capture(ownValue, field, path + '/' + key);
                if (captured !== undefined)
                    result[key] = captured;
            }
            return findings.length === startingCount ? result : undefined;
        }
        if (!Array.isArray(value))
            return reject(path, 'InvalidType');
        const lengthDescriptor = descriptors.length;
        const length: unknown = lengthDescriptor && lengthDescriptor.value;
        if (!lengthDescriptor || lengthDescriptor.enumerable || typeof length !== 'number'
            || !Number.isFinite(length) || Math.floor(length) !== length || length < 0) {
            return reject(path, 'UnsupportedRuntimeObject');
        }
        for (const key of keys as string[]) {
            if (key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) {
                return reject(path, 'UnexpectedProperty');
            }
        }
        if (keys.length !== length + 1)
            return reject(path, 'SparseArray');
        for (let i = 0; i < length; i++) {
            if (!Object.prototype.hasOwnProperty.call(descriptors, String(i)))
                return reject(path, 'SparseArray');
        }
        if (length === 0)
            return reject(path, 'EmptySelection');
        const result: Snapshot[] = [];
        const startingCount = findings.length;
        for (let i = 0; i < length; i++) {
            const ownValue: unknown = descriptors[String(i)].value;
            const captured = capture(ownValue, node.item, path + '/' + i);
            if (captured !== undefined)
                result.push(captured);
        }
        if (findings.length !== startingCount)
            return undefined;
        if (node.item.kind === 'string') {
            const strings = result as string[];
            if (new Set(strings).size !== strings.length)
                return reject(path, 'DuplicateValue');
            const declaration = node.item.values;
            strings.sort(declaration ? (a, b) => declaration.indexOf(a) - declaration.indexOf(b) : ordinal);
        }
        else if (path === '/selectors') {
            result.sort(selectorOrder);
            for (let i = 1; i < result.length; i++) {
                if (selectorOrder(result[i - 1], result[i]) === 0)
                    return reject(path, 'DuplicateSelectorRule');
            }
        }
        return result;
    }
    let snapshot: Snapshot | undefined;
    try {
        snapshot = capture(input, policyShape, '');
        if (findings.length === 0) {
            visited = new Set<object>();
            snapshot = capture(snapshot, policyShape, '');
        }
    }
    catch {
        findings.length = 0;
        reject('', 'RuntimeInspectionFailed');
    }
    findings.sort((a, b) => ordinal(a.path, b.path) || ordinal(a.code, b.code));
    const result: NotificationAdminExceptionPolicyValidationResult = findings.length
        ? { status: 'INVALID_HOLD', shapeValid: false, findings, holds: authorityHolds.slice() }
        : { status: 'SHAPE_VALID_HOLD', shapeValid: true,
            policy: snapshot as unknown as NotificationAdminExceptionPolicyShape, findings: [], holds: authorityHolds.slice() };
    freezeResult(result);
    return result;
}
