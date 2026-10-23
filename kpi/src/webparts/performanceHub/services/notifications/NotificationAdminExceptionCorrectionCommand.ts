import { buildAdminKpiControlledRemediationCommand } from '../AdminDataQualityDomain';
import type { IAdminKpiRemediationRequest } from '../AdminDataQualityDomain';
import type { IAdminKpiControlledRemediationCommand, IAdminKpiDefinitionIdentity } from '../AdminKpiMasterDomain';
import {
  ADMIN_KPI_CONTROLLED_SOURCE_ISSUE_CODES,
  ADMIN_KPI_CONTROLLED_ISSUE_STATUSES,
  ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE,
  adminKpiIssueTypeForCode
} from '../AdminControlledVocabulary';
import { captureNotificationProtectedData } from './NotificationBoundary';
import type { IAdminExceptionMember } from './NotificationAdminExceptionMembers';

const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Pure snapshot-bound command construction; no policy/native authority, currentness, CAS or clearing. */
export const buildNotificationAdminExceptionCorrectionCommand = (
  member: IAdminExceptionMember,
  definitions: readonly IAdminKpiDefinitionIdentity[],
  request: IAdminKpiRemediationRequest
): IAdminKpiControlledRemediationCommand => {
  const captured = captureNotificationProtectedData({ member, definitions, request }, 'adminExceptionCorrection').value;
  const current = captured.member;
  const issue = current?.issue;
  const route = current?.correctionRoute;
  if (!issue || !route || issue.scope !== 'KPI' || !present(issue.kpiId)
    || !present(issue.sourceIssueCode) || ADMIN_KPI_CONTROLLED_SOURCE_ISSUE_CODES.indexOf(issue.sourceIssueCode) < 0
    || issue.issueType !== adminKpiIssueTypeForCode(issue.sourceIssueCode)
    || issue.issueKey !== `KPI|${issue.kpiId}|${issue.sourceIssueCode}`
    || !present(issue.kpiVersionKey) || issue.kpiVersionKey !== issue.kpiVersionKey.trim()
    || current.kpiVersionKey !== issue.kpiVersionKey
    || current.memberKey !== JSON.stringify([issue.issueKey, issue.kpiVersionKey])
    || issue.status === 'IntentionallyTBC' || ADMIN_KPI_CONTROLLED_ISSUE_STATUSES.indexOf(issue.status) < 0
    || ['P1', 'P2', 'P3'].indexOf(issue.priority) < 0) {
    throw new Error('Admin exception correction requires a consistent actionable versioned KPI member.');
  }
  const allowed = ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE[issue.issueType];
  if (!allowed?.length || route.contract !== 'buildAdminKpiControlledRemediationCommand'
    || route.issueKey !== issue.issueKey || route.kpiId !== issue.kpiId
    || route.kpiVersionKey !== issue.kpiVersionKey || route.sourceIssueCode !== issue.sourceIssueCode
    || !Array.isArray(route.allowedPatchFields) || route.allowedPatchFields.length !== allowed.length
    || route.allowedPatchFields.some((field, index) => field !== allowed[index])) {
    throw new Error('Admin exception correction route does not match the controlled vocabulary and source member.');
  }
  // The actual builder enforces exact unique target identity plus all existing provenance/patch guards.
  return buildAdminKpiControlledRemediationCommand(issue, captured.definitions, captured.request);
};
