import { readFile } from 'node:fs/promises';

const manifestUrl = new URL('../config/nonproduction/sec-006-enablement-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const fields = Object.entries(manifest.migration.fields)
  .flatMap(([listTitle, listFields]) => listFields.map(field => ({ listTitle, ...field })));
assert(fields.length === 27, `Expected 27 custom fields; found ${fields.length}.`);
assert(new Set(fields.map(field => `${field.listTitle}|${field.name}`)).size === 27, 'Canonical field names are not unique at list grain.');
assert(!fields.some(field => field.name === 'FileRef'), 'FileRef must remain the built-in document-library property.');
assert(manifest.migration.strategy === 'ADDITIVE_ONLY' && manifest.migration.repurposeExistingFields === false,
  'Schema migration must be additive and must not repurpose fields.');

const employeeChoices = manifest.controlLists.KCFKPI_EmployeeCommands.choices;
const managerChoices = manifest.controlLists.KCFKPI_ManagerCommands.choices;
assert(employeeChoices.length === 16 && new Set(employeeChoices).size === 16, 'Employee legacy+V2 command union mismatch.');
assert(managerChoices.length === 8 && new Set(managerChoices).size === 8, 'Manager legacy+V2 command union mismatch.');
assert(manifest.controlLists.KCFKPI_CommandReceipts.unique.join('|') === 'ReceiptKey', 'ReceiptKey must be the only unique receipt key.');
assert(manifest.controlLists.KCFKPI_CommandReceipts.indexedNonUnique.includes('CommandKey'), 'CommandKey must be indexed but non-unique.');
assert(['SourceListId', 'SourceItemId', 'SourceItemVersion'].every(field =>
  manifest.controlLists.KCFKPI_CommandReceipts.trustedSourceFields.includes(field)), 'Receipt trusted-source fields are incomplete.');

assert(manifest.acl.privateRoots.length === 9 && new Set(manifest.acl.privateRoots).size === 9,
  'All nine private roots must be enumerated exactly once.');
assert(manifest.acl.breakInheritanceOnEveryPrivateRoot === true && manifest.acl.copyAssignments === false,
  'Private-root inheritance controls are not fail-closed.');
assert(manifest.acl.recalculate2027FromCurrentPeopleAndDelegations === true && manifest.acl.copy2026Permissions === false,
  '2027 ACLs must be recalculated rather than copied.');
assert(manifest.acl.delegateDirectPrivateRootGrantAllowed === false
  && manifest.acl.delegatedOperationsMediatedBy === 'A1_COMMAND_PROCESSOR'
  && manifest.acl.permanentHumanCanonicalFullControlAllowed === false
  && manifest.acl.systemAdminPrivateRootGrantAllowed === false
  && manifest.acl.canonicalHumanWriteAllowed === false
  && manifest.acl.receiptHumanWriteAllowed === false
  && manifest.acl.auditHumanWriteAllowed === false
  && manifest.acl.auditAppendAuthority === 'A1_ONLY'
  && manifest.acl.auditCreateRoute === 'GOVERNED_PROCESSOR_ONLY'
  && manifest.acl.auditPatchAllowed === false
  && manifest.acl.auditDeleteAllowed === false
  && manifest.acl.receiptCreateRoute === 'GOVERNED_PROCESSOR_ONLY'
  && manifest.acl.receiptPatchAllowed === false
  && manifest.acl.receiptDeleteAllowed === false
  && manifest.acl.recoveryOrBreakGlassMayWeakenImmutability === false
  && manifest.acl.automationRootPermissions.commandRoots === 'READ_ONLY'
  && manifest.acl.automationRootPermissions.canonicalRoots === 'PROCESSOR_NO_DELETE'
  && manifest.acl.automationRootPermissions.Audit === 'APPEND_ONLY'
  && manifest.acl.automationRootPermissions.CommandReceipts === 'APPEND_ONLY',
  'Delegated or System Admin standing private-root authority is not fail-closed.');

assert(manifest.target.siteUrl === null && manifest.target.liveProvisioningAllowed === false,
  'Live provisioning must remain blocked without an isolated target.');
assert(manifest.automation.identity === null && manifest.automation.backupOwner === null
  && manifest.automation.enablementAllowed === false, 'Automation must remain disabled until IT/CONTROL names both owners.');
assert(manifest.rpt005.serverSideOnly === true && manifest.rpt005.rawRowsToHumanBrowser === false
  && manifest.rpt005.minimumSelectedCohort === 5 && manifest.rpt005.minimumComplementCohort === 5,
  'RPT-005 projection/suppression controls are incomplete.');
assert(manifest.securityRemediation.action === 'KCF-KPI-027F'
  && manifest.securityRemediation.baselineSha === 'c173f8dd3d1c9b6f1468ef3bcc41381ba7b95c2b',
  '027F remediation identity does not reconcile to the independently blocked 027E baseline.');
assert(manifest.securityRemediation.sourceListIdentity.requireExactGuidTitleBinding === true
  && manifest.securityRemediation.sourceListIdentity.allowTitleOnly === false
  && manifest.securityRemediation.sourceListIdentity.allowGuidSyntaxOnly === false,
  'Source GUID/title binding is not fail-closed.');
assert(manifest.securityRemediation.systemAdmin.businessDecisionAuthority === false
  && manifest.securityRemediation.systemAdmin.standingPrivateRootAccess === false
  && manifest.securityRemediation.systemAdmin.canonicalWriteAuthority === false
  && manifest.securityRemediation.systemAdmin.controlledRoute === 'CreateWorkplanAmendmentV2'
  && manifest.securityRemediation.systemAdmin.requiresLockedApprovedWorkplan === true
  && manifest.securityRemediation.systemAdmin.siteCollectionAdministratorIdentityMustBeSeparate === true,
  'System Admin authority is broader than the exact CONTROL amendment case.');
assert(manifest.securityRemediation.amendmentReason.required === true
  && manifest.securityRemediation.amendmentReason.trimBeforeValidation === true
  && manifest.securityRemediation.amendmentReason.allowNullEmptyOrWhitespace === false
  && manifest.securityRemediation.amendmentReason.normalisation === 'NFC_BOUNDARY_ONLY'
  && manifest.securityRemediation.amendmentReason.rejectUnicodeFormatOrDefaultIgnorableOnly === true
  && manifest.securityRemediation.amendmentReason.preserveMeaningfulInternalCharacters === true
  && manifest.securityRemediation.amendmentReason.preserveTrimmedReasonInHistoryAndAudit === true,
  'Amendment reason validation/evidence is incomplete.');
assert(manifest.securityRemediation.controlCase.requiredBindings.length === 9
  && manifest.securityRemediation.controlCase.serverResolved === true
  && manifest.securityRemediation.controlCase.singleUse === true
  && manifest.securityRemediation.controlCase.clientBindingOverrideAllowed === false
  && manifest.securityRemediation.controlCase.replayAfterPartialIoAllowed === false
  && manifest.securityRemediation.controlCase.authoritativeStoreRequired === true
  && manifest.securityRemediation.controlCase.atomicConditionalConsumeRequired === true
  && manifest.securityRemediation.controlCase.storageConcurrency.join('|') === 'ETag|RowVersionToken'
  && manifest.securityRemediation.controlCase.readThenUnconditionalWriteAllowed === false
  && manifest.securityRemediation.controlCase.concurrentSuccessLimit === 1
  && manifest.securityRemediation.controlCase.consumedIdentityAndTimestampImmutable === true
  && manifest.securityRemediation.controlCase.partialIoRecoveryHoldRequired === true,
  'CONTROL case version, concurrency, consumption or replay controls are incomplete.');
assert(manifest.securityRemediation.delegation.unscopedDelegationAllowed === false
  && manifest.securityRemediation.delegation.requiredScope.includes('SubjectKey')
  && manifest.securityRemediation.delegation.requiredScope.includes('CommandType')
  && manifest.securityRemediation.delegation.requiredScope.includes('Partition')
  && manifest.securityRemediation.delegation.requiredScope.includes('ResourceKey')
  && manifest.securityRemediation.delegation.directPrivateRootGrantAllowed === false
  && manifest.securityRemediation.delegation.commandMediatedByAutomation === true
  && manifest.securityRemediation.delegation.revocationTimestampRequiredWhenRevoked === true
  && manifest.securityRemediation.delegation.revocationReasonRequiredWhenRevoked === true
  && manifest.securityRemediation.delegation.clientRevocationOverrideAllowed === false
  && manifest.securityRemediation.delegation.exactCrossBindingRequired === true
  && manifest.securityRemediation.delegation.aclAndProcessorSharedScopeResolver === true,
  'Delegation scope is not exact.');
assert(manifest.securityRemediation.payload.recursiveAllowList === true
  && manifest.securityRemediation.people.duplicateActivePersonKeyAllowed === false
  && manifest.securityRemediation.people.duplicateActiveEmailAllowed === false
  && manifest.securityRemediation.partialIo.recoveryHoldOnPartialWrite === true,
  'Payload, People or partial-I/O controls are incomplete.');
assert(manifest.securityRemediation.breakGlass.standingPersonalAccountAuthority === false
  && manifest.securityRemediation.breakGlass.timeLimited === true
  && manifest.securityRemediation.breakGlass.caseAuthorised === true
  && manifest.securityRemediation.breakGlass.mediatedByAutomation === true
  && manifest.securityRemediation.breakGlass.immutableAuditRequired === true,
  'Break-glass authority is standing, personal or unaudited.');
assert(manifest.rpt005.suppressionRuleVersion === 'SEC-006-K5-COMPLEMENT-2'
  && manifest.rpt005.filteredUniverseDimensions.length === 7
  && manifest.rpt005.suppressedRowsReturned === false
  && manifest.rpt005.zeroToFourIndistinguishable === true,
  '027C filtered-universe and non-disclosure suppression controls are incomplete.');
assert(Object.values(manifest.uatIdentities).every(identity => identity === null), 'UAT credentials must not be invented.');
assert(manifest.uatIdentityConstraints.SA1SiteCollectionAdministratorAllowed === false
  && manifest.uatIdentityConstraints.SA1CanonicalWriteAllowed === false
  && manifest.uatIdentityConstraints.A1InteractiveSignInAllowed === false
  && manifest.uatIdentityConstraints.A1MayOriginateBusinessDecision === false,
  'SA1/A1 separation constraints are incomplete.');
assert(manifest.productionChanges === 'NONE', 'Production changes must remain NONE.');

process.stdout.write(`${JSON.stringify({
  result: 'PASS',
  contractVersion: manifest.contractVersion,
  customFieldCount: fields.length,
  employeeCommandChoiceCount: employeeChoices.length,
  managerCommandChoiceCount: managerChoices.length,
  receiptTrustedSourceFieldCount: manifest.controlLists.KCFKPI_CommandReceipts.trustedSourceFields.length,
  privateRootCount: manifest.acl.privateRoots.length,
  projectionCount: manifest.rpt005.projections.length,
  securityRemediation: manifest.securityRemediation.action,
  suppressionRuleVersion: manifest.rpt005.suppressionRuleVersion,
  liveProvisioningAllowed: manifest.target.liveProvisioningAllowed,
  automationEnablementAllowed: manifest.automation.enablementAllowed,
  productionChanges: manifest.productionChanges
}, null, 2)}\n`);
