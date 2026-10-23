/** Delivery evidence review only. This module performs no HTTP, storage, tenant
 * mutation or runtime authorisation. Positive evidence always needs independent
 * review and separate Sponsor authority; a JSON assertion is not proof. */
export interface IListMetadata {
  readonly title: string;
  readonly uniqueAcl?: boolean;
  readonly readSecurity?: number;
  readonly writeSecurity?: number;
  readonly versioning?: boolean;
}
export interface IFieldMetadata {
  readonly internalName: string;
  readonly type: string;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  readonly unique?: boolean;
}
export interface IBackendEvidence {
  readonly environment: string;
  readonly capturedAtUtc: string;
  readonly metadataOnly: boolean;
  readonly observationComplete: boolean;
  readonly actorContext: 'UNVERIFIED' | 'ADMIN' | 'CLAIMANT' | 'MULTI_ACTOR';
  readonly expenseList: IListMetadata;
  readonly expenseFields: ReadonlyArray<IFieldMetadata>;
  readonly evidence: {
    readonly secureOriginator?: string;
    readonly claimantAndManagerNegativeTests?: string;
    readonly ownerAndMonthBinding?: string;
    readonly standardLicenceAndCost?: string;
    readonly liveNominalEqualityAndEligibility?: string;
    readonly appendOnlyAudit?: string;
    readonly idempotencyAndStaleVersion?: string;
  };
}
export interface IBackendReview {
  readonly decision: 'BLOCKED' | 'INDEPENDENT_REVIEW_REQUIRED';
  readonly tenantWritesAuthorised: false;
  readonly blockers: ReadonlyArray<string>;
}

/** Freshness interval is supplied by the review caller; there is no hidden
 * delivery expiry policy. Markers point reviewers to evidence, never approve it. */
export function reviewBackendEvidence(input: IBackendEvidence, nowUtc: string, maxAgeMinutes: number): IBackendReview {
  const blockers: string[] = [];
  const captured = Date.parse(input.capturedAtUtc);
  const now = Date.parse(nowUtc);
  if (!Number.isFinite(captured) || !Number.isFinite(now) || !Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0
    || captured > now || now - captured > maxAgeMinutes * 60000) blockers.push('CURRENT_EVIDENCE_UNVERIFIED');
  if (input.environment !== 'KCF Automation TEST') blockers.push('WRONG_ENVIRONMENT');
  if (!input.metadataOnly) blockers.push('RECORD_CUSTODY_REVIEW_REQUIRED');
  if (!input.observationComplete) blockers.push('OBSERVATION_INCOMPLETE');
  if (input.actorContext !== 'MULTI_ACTOR') blockers.push('ACTOR_NEGATIVE_TESTS_UNPROVEN');
  const list = input.expenseList;
  if (list.title !== 'KCFEXP_TEST102_ExpenseLines') blockers.push('WRONG_EXPENSE_LIST');
  if (typeof list.uniqueAcl !== 'boolean' || typeof list.versioning !== 'boolean'
    || ![1, 2].includes(list.readSecurity || 0) || ![1, 2, 4].includes(list.writeSecurity || 0)) blockers.push('LIST_SETTINGS_INCOMPLETE');
  if (list.uniqueAcl === false) blockers.push('INHERITED_ACL_REQUIRES_LEAST_PRIVILEGE_PROOF');
  if (list.readSecurity === 1 || list.writeSecurity === 1) blockers.push('ALL_ITEMS_SETTING_REQUIRES_SCOPE_PROOF');
  if (list.versioning === false) blockers.push('VERSION_HISTORY_UNPROVEN');
  const fields = input.expenseFields;
  if (new Set(fields.map(field => field.internalName)).size !== fields.length) blockers.push('DUPLICATE_FIELD_METADATA');
  for (const field of fields) {
    if (!field.internalName || !field.type || typeof field.required !== 'boolean'
      || typeof field.readOnly !== 'boolean' || typeof field.unique !== 'boolean') { blockers.push('FIELD_SETTINGS_INCOMPLETE'); break; }
  }
  const category = fields.find(field => field.internalName === 'ExpenseCategory');
  if (category?.required) blockers.push('REQUIRED_CATEGORY_CONFLICTS_WITH_WEB_006');
  const key = fields.find(field => field.internalName === 'ExpenseLineKey');
  if (key?.type !== 'Text' || !key.required || !key.unique) blockers.push('LINE_KEY_IDEMPOTENCY_UNPROVEN');
  const nominal = fields.find(field => field.internalName === 'NominalCode');
  if (nominal?.type !== 'Text') blockers.push('NOMINAL_TEXT_BINDING_UNPROVEN');
  const markers: Array<keyof IBackendEvidence['evidence']> = ['secureOriginator', 'claimantAndManagerNegativeTests',
    'ownerAndMonthBinding', 'standardLicenceAndCost', 'liveNominalEqualityAndEligibility', 'appendOnlyAudit', 'idempotencyAndStaleVersion'];
  for (const marker of markers) {
    if (!input.evidence[marker]?.trim()) blockers.push(`MISSING_EVIDENCE_${marker}`);
  }
  return Object.freeze({ decision: blockers.length ? 'BLOCKED' : 'INDEPENDENT_REVIEW_REQUIRED',
    tenantWritesAuthorised: false, blockers: Object.freeze(blockers) });
}
