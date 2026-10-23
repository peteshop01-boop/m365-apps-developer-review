import type { IAdminDataQualityIssue } from '../AdminDataQualityDomain';
import {
  ADMIN_KPI_CONTROLLED_SOURCE_ISSUE_CODES,
  ADMIN_KPI_CONTROLLED_ISSUE_STATUSES,
  ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE,
  adminKpiIssueTypeForCode
} from '../AdminControlledVocabulary';
import { captureNotificationProtectedData } from './NotificationBoundary';
import type { NotificationAdminExceptionPolicyValidationResult } from './NotificationAdminExceptionPolicyModels';

export type AdminExceptionMemberReason = 'PolicyShapeUnavailable' | 'ManualSuppressionUnsupported'
  | 'ProtectedInputUnavailable' | 'UnsupportedCorrectionScope' | 'UnsupportedCorrectionType'
  | 'SourceIdentityInconsistent' | 'SourceVersionUnavailable' | 'IntentionallyTBC'
  | 'SelectorMismatch' | 'ConflictingSourceObservations';

export interface IAdminExceptionMemberFinding {
  readonly issueKey?: string;
  readonly kpiVersionKey?: string;
  readonly memberKey?: string;
  readonly reason: AdminExceptionMemberReason;
}

export interface IAdminExceptionMember {
  readonly memberKey: string;
  readonly issue: Readonly<IAdminDataQualityIssue>;
  readonly kpiVersionKey: string;
  readonly correctionRoute: {
    readonly contract: 'buildAdminKpiControlledRemediationCommand';
    readonly issueKey: string;
    readonly kpiId: string;
    readonly kpiVersionKey: string;
    readonly sourceIssueCode: string;
    readonly allowedPatchFields: readonly string[];
  };
}

export interface IAdminExceptionMemberPreview {
  readonly status: 'PREVIEW' | 'HOLD';
  readonly nativeDeliveryEnabled: false;
  readonly members: readonly IAdminExceptionMember[];
  readonly unselected: readonly IAdminExceptionMemberFinding[];
  readonly holds: readonly IAdminExceptionMemberFinding[];
}

const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
// JSON string tuple preserves exact component boundaries and versions without normalisation.
const memberIdentity = (issueKey: string, version: string): string => JSON.stringify([issueKey, version]);
const facts = (issue: Readonly<IAdminDataQualityIssue>): string => JSON.stringify([
  issue.issueKey, issue.kpiVersionKey, issue.priority, issue.issueType, issue.scope,
  issue.title, issue.detail, issue.recommendedResolution, issue.status, issue.sourceReference,
  issue.sourceIssueCode, issue.kpiId, issue.personKey, issue.teamKey, issue.pillar, issue.workstream, issue.owner
]);

/** Pure, recipient-neutral KPI correction preview. No ledger, clearing, authority or dispatch. */
export const buildNotificationAdminExceptionMembers = (
  validatedPolicy: NotificationAdminExceptionPolicyValidationResult,
  issues: readonly IAdminDataQualityIssue[]
): IAdminExceptionMemberPreview => {
  const members: IAdminExceptionMember[] = [];
  const unselected: IAdminExceptionMemberFinding[] = [];
  const holds: IAdminExceptionMemberFinding[] = [];
  const finish = (): IAdminExceptionMemberPreview => {
    const ordered = (items: IAdminExceptionMemberFinding[]): IAdminExceptionMemberFinding[] =>
      items.filter((item, index) => items.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index)
        .sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
    return captureNotificationProtectedData<IAdminExceptionMemberPreview>({
      status: holds.length ? 'HOLD' : 'PREVIEW', nativeDeliveryEnabled: false,
      members: members.sort((left, right) => compare(left.memberKey, right.memberKey)),
      unselected: ordered(unselected), holds: ordered(holds)
    }, 'adminExceptionMemberPreview').value;
  };
  let input: Readonly<{ validatedPolicy: NotificationAdminExceptionPolicyValidationResult; issues: readonly IAdminDataQualityIssue[] }>;
  try {
    input = captureNotificationProtectedData({ validatedPolicy, issues }, 'adminExceptionMembers').value;
  } catch {
    holds.push({ reason: 'ProtectedInputUnavailable' });
    return finish();
  }
  if (!input.validatedPolicy.shapeValid || input.validatedPolicy.status !== 'SHAPE_VALID_HOLD') {
    holds.push({ reason: 'PolicyShapeUnavailable' });
    return finish();
  }
  const policy = input.validatedPolicy.policy;
  if (policy.suppression.mode !== 'NoManualSuppression') {
    holds.push({ reason: 'ManualSuppressionUnsupported' });
    return finish();
  }
  const observations = new Map<string, Readonly<IAdminDataQualityIssue>[]>();
  const inconsistentTuples = new Set<string>();
  const observedFacts = new Map<string, string>();
  input.issues.forEach(issue => {
    if (!present(issue.issueKey) || !present(issue.kpiVersionKey)) return;
    const key = memberIdentity(issue.issueKey, issue.kpiVersionKey);
    const prior = observedFacts.get(key);
    if (prior !== undefined && prior !== facts(issue)) inconsistentTuples.add(key);
    observedFacts.set(key, facts(issue));
  });
  input.issues.forEach(issue => {
    const finding = (reason: AdminExceptionMemberReason): IAdminExceptionMemberFinding => ({
      issueKey: issue.issueKey, kpiVersionKey: issue.kpiVersionKey, reason
    });
    if (present(issue.issueKey) && present(issue.kpiVersionKey)
      && inconsistentTuples.has(memberIdentity(issue.issueKey, issue.kpiVersionKey))) {
      holds.push(finding('ConflictingSourceObservations'));
      return;
    }
    if (issue.scope !== 'KPI') {
      unselected.push(finding('UnsupportedCorrectionScope'));
      return;
    }
    if (!present(issue.kpiId) || !present(issue.sourceIssueCode)
      || ADMIN_KPI_CONTROLLED_SOURCE_ISSUE_CODES.indexOf(issue.sourceIssueCode) < 0
      || issue.issueType !== adminKpiIssueTypeForCode(issue.sourceIssueCode)
      || issue.issueKey !== `KPI|${issue.kpiId}|${issue.sourceIssueCode}`
      || !present(issue.sourceReference) || ADMIN_KPI_CONTROLLED_ISSUE_STATUSES.indexOf(issue.status) < 0
      || ['P1', 'P2', 'P3'].indexOf(issue.priority) < 0) {
      holds.push(finding('SourceIdentityInconsistent'));
      if (present(issue.issueKey) && present(issue.kpiVersionKey)) {
        inconsistentTuples.add(memberIdentity(issue.issueKey, issue.kpiVersionKey));
      }
      return;
    }
    if (!present(issue.kpiVersionKey)) {
      if (!ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE[issue.issueType]?.length) {
        unselected.push(finding('UnsupportedCorrectionType'));
      } else if (issue.status === 'IntentionallyTBC') {
        unselected.push(finding('IntentionallyTBC'));
      } else {
        holds.push(finding('SourceVersionUnavailable'));
      }
      return;
    }
    const key = memberIdentity(issue.issueKey, issue.kpiVersionKey);
    observations.set(key, (observations.get(key) || []).concat(issue));
  });
  // Inspect every versioned observation before selection: status/priority conflicts cannot evade the hold.
  observations.forEach((rows, memberKey) => {
    const issue = rows[0];
    const finding = (reason: AdminExceptionMemberReason): IAdminExceptionMemberFinding => ({
      issueKey: issue.issueKey, kpiVersionKey: issue.kpiVersionKey, memberKey, reason
    });
    if (inconsistentTuples.has(memberKey) || rows.some(row => facts(row) !== facts(issue))) {
      holds.push(finding('ConflictingSourceObservations'));
      return;
    }
    const allowedFields = ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE[issue.issueType];
    if (!allowedFields?.length) {
      unselected.push(finding('UnsupportedCorrectionType'));
      return;
    }
    if (issue.status === 'IntentionallyTBC') {
      unselected.push(finding('IntentionallyTBC'));
      return;
    }
    if (!policy.selectors.some(rule => rule.issueTypes.indexOf(issue.issueType) >= 0
      && rule.priorities.indexOf(issue.priority) >= 0 && rule.statuses.indexOf(issue.status) >= 0)) {
      unselected.push(finding('SelectorMismatch'));
      return;
    }
    members.push({
      memberKey, issue, kpiVersionKey: issue.kpiVersionKey!,
      correctionRoute: {
        contract: 'buildAdminKpiControlledRemediationCommand', issueKey: issue.issueKey,
        kpiId: issue.kpiId!, kpiVersionKey: issue.kpiVersionKey!, sourceIssueCode: issue.sourceIssueCode!,
        allowedPatchFields: allowedFields.slice()
      }
    });
  });
  return finish();
};
