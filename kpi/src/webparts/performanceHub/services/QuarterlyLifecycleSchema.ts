import type { QuarterReviewAuditEventType } from '../models/QuarterlyModels';

export const QUARTERLY_AUDIT_EVENT_TYPES: QuarterReviewAuditEventType[] = [
  'QuarterReviewCreated',
  'QuarterReviewSubmitted',
  'QuarterReviewChangesRequested',
  'QuarterReviewResubmitted',
  'QuarterReviewApproved',
  'QuarterReviewLocked',
  'QuarterReviewReopened',
  'RAGOverridden'
];

export interface IQuarterlyLifecycleSchemaReadback {
  quarterReviewItemListId: string;
  quarterReviewItemListUrl: string;
  auditListId: string;
  auditListUrl: string;
  statusUpdateRequired: boolean;
  statusUpdateType: string;
  auditEventTypeRequired: boolean;
  auditEventTypeChoices: string[];
  missingAuditEventTypes: QuarterReviewAuditEventType[];
  mismatches: string[];
  statusUpdateChanged: boolean;
  auditChoicesAdded: QuarterReviewAuditEventType[];
}

export const validateQuarterlyLifecycleSchema = (
  statusUpdate: { type: string; required: boolean },
  auditEventType: { type: string; required: boolean; choices: string[] }
): { missingAuditEventTypes: QuarterReviewAuditEventType[]; mismatches: string[] } => {
  const mismatches: string[] = [];
  if (statusUpdate.type !== 'Note') mismatches.push(`StatusUpdate type is ${statusUpdate.type}; expected Note.`);
  if (statusUpdate.required) mismatches.push('StatusUpdate must be optional at SharePoint storage level.');
  if (auditEventType.type !== 'Choice') mismatches.push(`Audit EventType type is ${auditEventType.type}; expected Choice.`);
  if (!auditEventType.required) mismatches.push('Audit EventType must remain required.');
  const missingAuditEventTypes = QUARTERLY_AUDIT_EVENT_TYPES.filter(choice => auditEventType.choices.indexOf(choice) < 0);
  return { missingAuditEventTypes, mismatches };
};
