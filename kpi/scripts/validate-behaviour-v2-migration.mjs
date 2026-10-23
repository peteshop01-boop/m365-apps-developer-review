import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(root, 'data', 'test-pilot', 'behaviour-framework-v2.synthetic.json');
const evidencePath = resolve(root, 'docs', 'evidence', 'KCF-KPI-TL-B029', 'behaviour-v2-migration-manifest.json');
const mode = process.argv[2] || '--check';
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const labels = [
  { value: 1, label: 'Developing', displayLabel: '1 Developing' },
  { value: 2, label: 'Effective', displayLabel: '2 Effective' },
  { value: 3, label: 'Exceptional', displayLabel: '3 Exceptional' }
];
const values = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'];
const tiers = ['IC_OFFICER', 'PEOPLE_MANAGER', 'SENIOR_LEADER'];

const additions = [
  { operation: 'AddList', list: 'KCFKPI_BehaviourFrameworkSets', purpose: 'Immutable published framework and labels' },
  { operation: 'AddList', list: 'KCFKPI_BehaviourFrameworkValues', purpose: 'Five Values and per-tier descriptors' },
  { operation: 'AddList', list: 'KCFKPI_PersonBehaviourAssignments', purpose: 'Explicit person tier/cadence assignment' },
  ...['FrameworkVersion', 'Published', 'Immutable', 'RatingLabelsJSON'].map(field => ({ operation: 'AddField', list: 'KCFKPI_BehaviourFrameworkSets', field })),
  ...['FrameworkVersion', 'ValueID', 'ValueTitle', 'CorporateValue', 'ICOfficerDescriptor', 'PeopleManagerDescriptor', 'SeniorLeaderDescriptor'].map(field => ({ operation: 'AddField', list: 'KCFKPI_BehaviourFrameworkValues', field })),
  ...['PersonKey', 'FrameworkVersion', 'RoleTier', 'Cadence', 'Active'].map(field => ({ operation: 'AddField', list: 'KCFKPI_PersonBehaviourAssignments', field })),
  ...['BehaviourFrameworkVersionV2', 'BehaviourRoleTierV2', 'BehaviourCadenceV2'].map(field => ({ operation: 'AddField', list: 'KCFKPI_People', field })),
  ...['BehaviourFrameworkVersion', 'BehaviourValueTitleSnapshot', 'BehaviourCorporateValueSnapshot', 'BehaviourRoleTierSnapshot', 'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot', 'BehaviourPeriodKeysSnapshotJSON', 'BehaviourRatingLabelsSnapshotJSON', 'BehaviourCommitmentV2', 'BehaviourPeriodCommitmentsV2JSON', 'BehaviourV2SelectedSuggestionKeysJSON'].map(field => ({ operation: 'AddField', list: 'KCFKPI_WorkplanItems', field })),
  ...['BehaviourFrameworkVersionSnapshot', 'BehaviourRoleTierSnapshot', 'BehaviourCadenceSnapshot'].map(field => ({ operation: 'AddField', list: 'KCFKPI_QuarterReviews', field })),
  ...['BehaviourFrameworkVersionSnapshot', 'BehaviourValueTitleSnapshot', 'BehaviourCorporateValueSnapshot', 'BehaviourRoleTierSnapshot', 'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot', 'BehaviourPeriodKeysSnapshotJSON', 'BehaviourPeriodSnapshot', 'BehaviourRatingLabelsSnapshotJSON', 'EmployeeBehaviourEvidenceV2', 'EmployeeBehaviourAssessmentV2', 'ManagerBehaviourEvidenceV2', 'ManagerBehaviourAssessmentV2', 'FinalBehaviourEvidenceV2', 'FinalBehaviourAssessmentV2'].map(field => ({ operation: 'AddField', list: 'KCFKPI_QuarterReviewItems', field }))
];

const fixtureText = await readFile(fixturePath, 'utf8');
const fixture = JSON.parse(fixtureText);
const fail = message => { throw new Error(`BEHAVIOUR_V2_MIGRATION_INVALID: ${message}`); };
if (fixture.synthetic !== true || fixture.productionSafe !== false || fixture.governedContentApproved !== false
  || fixture.effectiveFrom !== null) fail('fixture must be visibly synthetic, unapproved and have no invented effective date.');
if (fixture.framework?.frameworkVersion !== 'KCCC-BEHAVIOUR|v02' || fixture.framework.published !== true
  || fixture.framework.immutable !== true || JSON.stringify(fixture.framework.ratingOptions) !== JSON.stringify(labels)) {
  fail('framework identity, immutable publication or label-first map differs.');
}
if (fixture.framework.values.length !== 5 || values.some(id => fixture.framework.values.filter(value => value.valueId === id).length !== 1)
  || fixture.framework.values.some(value => value.frameworkVersion !== 'KCCC-BEHAVIOUR|v02'
    || Object.keys(value.descriptors).length !== 3 || tiers.some(tier => !value.descriptors[tier]?.startsWith('SYNTHETIC TEST ONLY')))) {
  fail('five stable Values and exactly one visibly synthetic descriptor per tier are required.');
}
if (fixture.assignments.length !== 1 || fixture.assignments[0].email.endsWith('.invalid') !== true
  || fixture.assignments[0].roleTier !== 'IC_OFFICER' || fixture.assignments[0].cadence !== 'Quarterly'
  || JSON.stringify(fixture.assignments[0].periodKeys) !== JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4'])) {
  fail('only the explicit synthetic Phase 1 Quarterly assignment is permitted.');
}
const twice = fixture.cadenceRepresentations.find(value => value.cadence === 'TwiceYearly');
if (!twice || JSON.stringify(twice.periodKeys) !== JSON.stringify(['H1', 'H2']) || twice.populationCreated !== false) {
  fail('TwiceYearly H1–H2 must be representable without Phase 2 population.');
}
const forbiddenOperation = additions.find(value => !['AddList', 'AddField'].includes(value.operation));
const forbiddenField = additions.find(value => value.field && /target|weight|average|rag|normalis|score|peer/i.test(value.field));
if (forbiddenOperation || forbiddenField) fail('migration contains a destructive or prohibited scoring field operation.');
const manifest = {
  contractVersion: 'kcf.kpi.behaviour-v2.migration.dry-run.v1', dryRunOnly: true,
  tenantCapable: false, provisioningExecuted: false, destructiveOperations: 0,
  fixture: 'data/test-pilot/behaviour-framework-v2.synthetic.json', fixtureSha256: sha256(fixtureText),
  operationCount: additions.length, additions
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
if (mode === '--write-evidence') {
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, manifestText, 'utf8');
} else if (mode !== '--check') {
  fail('usage is --check or --write-evidence; no provisioning mode exists.');
}
process.stdout.write(`${JSON.stringify({ mode, valid: true, dryRunOnly: true, provisioningExecuted: false,
  destructiveOperations: 0, operationCount: additions.length, fixtureSha256: sha256(fixtureText),
  manifestSha256: sha256(manifestText), evidence: mode === '--write-evidence' ? evidencePath : null }, null, 2)}\n`);
