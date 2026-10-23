// Closed technical1.1.0 API; wire1.0.0. No business selection or native authority.
export type NotificationAdminExceptionPolicyShape = {
    readonly schema: "KCF.NotificationAdminExceptionPolicy";
    readonly schemaVersion: "1.0.0";
    readonly policyKey: string;
    readonly policyVersion: string;
    readonly governanceReference: {
        readonly key: string;
        readonly version: string;
        readonly evidenceReference: string;
    };
    readonly selectors: ReadonlyArray<{
        readonly issueTypes: ReadonlyArray<"ScoringMetadata" | "TargetConfiguration" | "OwnerResolution" | "OrganisationalWeighting" | "ManagerRelationship" | "TeamConfiguration" | "ReportingReadiness">;
        readonly priorities: ReadonlyArray<"P1" | "P2" | "P3">;
        readonly statuses: ReadonlyArray<"Open" | "ControlDecisionRequired" | "SourceDataRequired" | "IntentionallyTBC">;
    }>;
    readonly recipients: {
        readonly personKeys: ReadonlyArray<string>;
        readonly eligibleRoles: ReadonlyArray<"SeniorManagerAdmin" | "SystemAdmin">;
        readonly governanceReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
    };
    readonly delivery: {
        readonly mode: "OnNewIssueVersion" | "ScheduledDigest";
        readonly scheduleReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
        readonly channel: "Email" | "Teams";
        readonly templateReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
        readonly correctionRouteReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
        readonly repeatMode: "OncePerIssueVersion" | "RepeatOnGovernedSchedule";
        readonly repeatReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
        readonly retryPolicyReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
    };
    readonly suppression: {
        readonly mode: "NoManualSuppression" | "ApprovedVersionedSuppression";
        readonly decisionContractReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
    };
    readonly resolution: {
        readonly mode: "ApprovedCorrectionAndAuthoritativeReadback";
        readonly evidenceContractReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
    };
    readonly source: {
        readonly observationContractReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
        readonly peopleContractReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
        readonly versionBindingReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
    };
    readonly audit: {
        readonly dispatchContractReference: {
            readonly key: string;
            readonly version: string;
            readonly evidenceReference: string;
        };
    };
};
export type PolicyShapeFindingCode = "MissingRequired" | "UnexpectedProperty" | "UnsupportedSchema" | "UnsupportedVersion" | "InvalidType" | "InvalidString" | "InvalidEnum" | "EmptySelection" | "DuplicateValue" | "DuplicateSelectorRule" | "UnsupportedRuntimeObject" | "AccessorProperty" | "SparseArray" | "CyclicOrAliasedInput" | "RuntimeInspectionFailed";
export type PolicyAuthorityHold = "PolicyApprovalUnproved" | "RecipientIdentityUnproved" | "SourceIdentityUnproved" | "CorrectionRouteUnavailable" | "ClearingEvidenceUnproved" | "ProducerAuthorityUnproved" | "ClockAuthorityUnproved" | "ResourceAuthorityUnproved" | "IssuerAuthorityUnproved" | "NativeNotificationDeliveryUnbound" | "NotificationAuditAppendPortUnavailable";
export interface PolicyShapeFinding {
    readonly path: string;
    readonly code: PolicyShapeFindingCode;
}
export type NotificationAdminExceptionPolicyValidationResult = {
    readonly status: "SHAPE_VALID_HOLD";
    readonly shapeValid: true;
    readonly policy: Readonly<NotificationAdminExceptionPolicyShape>;
    readonly findings: readonly [
    ];
    readonly holds: ReadonlyArray<PolicyAuthorityHold>;
} | {
    readonly status: "INVALID_HOLD";
    readonly shapeValid: false;
    readonly findings: ReadonlyArray<PolicyShapeFinding>;
    readonly holds: ReadonlyArray<PolicyAuthorityHold>;
};
