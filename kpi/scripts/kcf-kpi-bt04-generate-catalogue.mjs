import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decisionPath = path.resolve(root, '..', '_CONTROL', 'ACTIVE', 'DECISIONS.md');
const outputPath = path.join(root, 'data', 'test-pilot', 'behaviour-catalogue.v2.json');
const typescriptPath = path.join(root, 'src', 'webparts', 'performanceHub', 'testing', 'BehaviourFrameworkV1ApprovedData.ts');
const EXPECTED_INSTRUCTION_SHA256 = '74F2AE0A7FDB33B72419CBF8897EEF0B45B23978583ABBF27DBF66581F504E8F';
const AUTHORITY = 'KCF-KPI-Sponsor-BEH-V1-001';
const COMMITMENT_LABEL = 'MY COMMITMENT';
const COMMITMENT_PROMPT = 'What will you actually do in your role to demonstrate this Behaviour?';
const EVIDENCE_LABEL = 'HOW WILL WE KNOW?';
const EVIDENCE_PROMPT = 'What would you, your manager or colleagues expect to see if you are making progress?';
const roleAuthority = [
  { code: 'L1', name: 'Individual Contributor / Coach', sortOrder: 1 },
  { code: 'L2', name: 'Manager', sortOrder: 2 },
  { code: 'L3', name: 'Senior Manager / Leader', sortOrder: 3 }
];
const legacyCatalogueLabel = { L1: 'Colleague', L2: 'People manager', L3: 'Senior leader' };
const governedSourceRowCanonicalFormat = 'KCF-KPI-BEHAVIOUR-V1-GOVERNED-ROWS-V1';
const governedSourceRowFields = [
  'BehaviourObjectiveKey', 'BehaviourKey', 'BehaviourTitle', 'CorporateValue',
  'RoleLevelCode', 'RoleLevelName', 'DropdownLabel', 'ObjectiveTitle',
  'ObjectiveDescription', 'SuggestedMeasure', 'SuggestedUnit', 'SuggestedEvidence',
  'Active', 'SortOrder', 'EffectiveFrom', 'EffectiveTo'
];

const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonicalScalar = value => {
  if (typeof value === 'string') return `S${Buffer.byteLength(value, 'utf8')}:${value};`;
  if (typeof value === 'boolean') return value ? 'B1;' : 'B0;';
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    const text = String(value);
    return `N${text.length}:${text};`;
  }
  if (value === null) return 'Z;';
  throw new Error('Governed source rows may contain only strings, safe integers, booleans and null.');
};
const canonicaliseGovernedSourceRows = sourceRows => `${canonicalScalar(governedSourceRowCanonicalFormat)}`
  + `F${governedSourceRowFields.length};${governedSourceRowFields.map(canonicalScalar).join('')}`
  + `R${sourceRows.length};${sourceRows.map(row => `O${governedSourceRowFields.length};`
    + governedSourceRowFields.map(field => canonicalScalar(row[field])).join('')).join('')}`;
const decision = fs.readFileSync(decisionPath, 'utf8').replaceAll('\r\n', '\n');
const recordedHash = decision.match(/KCF-KPI-Sponsor-BEH-V1-001[^\n]*Approved instruction SHA-256: `([A-F0-9]{64})`/s)?.[1];
assert.equal(recordedHash, EXPECTED_INSTRUCTION_SHA256, 'The recorded Sponsor instruction SHA-256 differs from the authorised action.');

const heading = '### KCF-KPI-Sponsor-BEH-V1-001 — exact approved 75-row catalogue wording';
const start = decision.indexOf(`${heading}\n`);
assert(start >= 0, 'The exact Sponsor-approved catalogue section is missing.');
const bodyStart = decision.indexOf('BEHAVIOUR 1\n', start);
const bodyEnd = decision.indexOf('\nThe exact block above is authoritative Product content.', bodyStart);
assert(bodyStart >= 0 && bodyEnd > bodyStart, 'The authoritative catalogue block boundaries are missing.');
const catalogueBlock = decision.slice(bodyStart, bodyEnd).trimEnd();

const behaviours = [];
let behaviour;
let focus;
let pendingRole;
for (const rawLine of catalogueBlock.split('\n')) {
  const line = rawLine.trim();
  if (!line || /^=+$/.test(line)) continue;
  const behaviourMatch = line.match(/^BEHAVIOUR ([1-5])$/);
  if (behaviourMatch) {
    const number = Number(behaviourMatch[1]);
    behaviour = { number, behaviourKey: `BHV-0${number}`, title: '', focusAreas: [] };
    behaviours.push(behaviour);
    focus = undefined;
    pendingRole = undefined;
    continue;
  }
  assert(behaviour, `Content appeared before a Behaviour heading: ${line}`);
  if (!behaviour.title) {
    behaviour.title = line;
    continue;
  }
  const focusMatch = line.match(/^FOCUS ([1-5]) — (.+)$/);
  if (focusMatch) {
    const number = Number(focusMatch[1]);
    focus = { number, focusKey: `${behaviour.behaviourKey}-FOCUS-0${number}`, title: focusMatch[2], examples: {} };
    behaviour.focusAreas.push(focus);
    pendingRole = undefined;
    continue;
  }
  const role = roleAuthority.find(candidate => line === `${candidate.name}:`);
  if (role) {
    assert(focus, `Role appeared before a focus area: ${line}`);
    pendingRole = role;
    continue;
  }
  assert(focus && pendingRole, `Unexpected decision content: ${line}`);
  assert.equal(focus.examples[pendingRole.code], undefined, `Duplicate ${pendingRole.name} example for ${focus.focusKey}.`);
  focus.examples[pendingRole.code] = line;
  pendingRole = undefined;
}

assert.equal(behaviours.length, 5, 'Sponsor decision must contain five headline Behaviours.');
assert(behaviours.every(item => item.title && item.focusAreas.length === 5), 'Each Behaviour must contain exactly five focus areas.');
assert(behaviours.flatMap(item => item.focusAreas).every(item => roleAuthority.every(role => item.examples[role.code])),
  'Each focus area must contain all three approved role examples.');

const sourceRows = behaviours.flatMap(item => item.focusAreas.flatMap(area => roleAuthority.map(role => ({
  BehaviourObjectiveKey: `${item.behaviourKey}-${role.code}-0${area.number}`,
  BehaviourKey: item.behaviourKey,
  BehaviourTitle: item.title,
  CorporateValue: item.title,
  RoleLevelCode: role.code,
  RoleLevelName: role.name,
  DropdownLabel: `[${legacyCatalogueLabel[role.code]}] ${area.title}`,
  ObjectiveTitle: area.title,
  ObjectiveDescription: area.examples[role.code],
  SuggestedMeasure: COMMITMENT_PROMPT,
  SuggestedUnit: COMMITMENT_LABEL,
  SuggestedEvidence: EVIDENCE_PROMPT,
  Active: true,
  SortOrder: item.number * 1000 + role.sortOrder * 100 + area.number * 10,
  EffectiveFrom: '2026-11-01',
  EffectiveTo: null
}))));
assert.equal(sourceRows.length, 75, 'Sponsor decision must produce exactly 75 examples.');
assert.equal(new Set(sourceRows.map(row => row.BehaviourObjectiveKey)).size, 75, 'Every approved example needs one stable unique key.');
assert.equal(new Set(sourceRows.map(row => row.ObjectiveDescription)).size, 75, 'Every approved role example must be unique.');
const governedSourceRowsCanonical = canonicaliseGovernedSourceRows(sourceRows);
const governedSourceRowsCanonicalSha256 = sha256(governedSourceRowsCanonical);
const governedSourceRowsCanonicalUtf8ByteLength = Buffer.byteLength(governedSourceRowsCanonical, 'utf8');

const rows = sourceRows.map(row => ({
  targetKey: row.BehaviourObjectiveKey,
  behaviourKey: row.BehaviourKey,
  roleLevelCode: row.RoleLevelCode,
  focusKey: `${row.BehaviourKey}-FOCUS-${row.BehaviourObjectiveKey.slice(-2)}`,
  focusArea: row.ObjectiveTitle,
  exampleText: row.ObjectiveDescription,
  suggestedTarget: row.ObjectiveDescription,
  suggestedMeasure: row.SuggestedMeasure,
  suggestedUnit: row.SuggestedUnit,
  suggestedEvidence: row.SuggestedEvidence,
  status: 'Published',
  sortOrder: row.SortOrder,
  effectiveFrom: row.EffectiveFrom,
  effectiveTo: row.EffectiveTo
}));
const decisionContent = { behaviours };
const document = {
  catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS',
  catalogueVersion: 'KCF-BHV-PD03-2026.09-v1',
  revision: 1,
  schemaVersion: '2.0',
  status: 'Published',
  effectiveFrom: '2026-11-01',
  effectiveTo: null,
  authority: AUTHORITY,
  approvedInstructionSha256: EXPECTED_INSTRUCTION_SHA256,
  decisionContentSha256: sha256(JSON.stringify(decisionContent)),
  source: {
    path: '_CONTROL/ACTIVE/DECISIONS.md#KCF-KPI-Sponsor-BEH-V1-001',
    catalogueBlockSha256: sha256(catalogueBlock),
    rowSha256: sha256(JSON.stringify(rows))
  },
  headlineBehaviours: behaviours.map(item => ({ behaviourKey: item.behaviourKey, title: item.title, sortOrder: item.number })),
  roleLevels: roleAuthority,
  ratingScale: ['Developing', 'Effective', 'Exceptional'],
  selectionGuidance: { recommendedMinimum: 3, recommendedMaximum: 5, hardMaximum: null },
  ux: {
    exampleTerminology: 'Examples / prompts — not mandatory targets',
    ownCommitmentAction: '+ WRITE MY OWN BEHAVIOUR COMMITMENT',
    commitmentLabel: COMMITMENT_LABEL,
    commitmentPrompt: COMMITMENT_PROMPT,
    evidenceLabel: EVIDENCE_LABEL,
    evidencePrompt: EVIDENCE_PROMPT,
    managerStatuses: ['AGREED', 'CHANGES REQUESTED']
  },
  rows
};

const output = `${JSON.stringify(document, null, 2)}\n`;
const typescript = `// Generated from ${AUTHORITY} by scripts/kcf-kpi-bt04-generate-catalogue.mjs. Do not hand edit.\n`
  + `import type { IBehaviourCatalogueSourceRow } from '../services/BehaviourLibraryCatalogue';\n\n`
  + `export const APPROVED_BEHAVIOUR_V1_AUTHORITY = ${JSON.stringify(AUTHORITY)};\n`
  + `export const APPROVED_BEHAVIOUR_V1_INSTRUCTION_SHA256 = ${JSON.stringify(EXPECTED_INSTRUCTION_SHA256)};\n`
  + `export const APPROVED_BEHAVIOUR_V1_DECISION_CONTENT_SHA256 = ${JSON.stringify(document.decisionContentSha256)};\n`
  + `export const APPROVED_BEHAVIOUR_V1_CATALOGUE_BLOCK_SHA256 = ${JSON.stringify(document.source.catalogueBlockSha256)};\n`
  + `export const APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_CANONICAL_FORMAT = ${JSON.stringify(governedSourceRowCanonicalFormat)};\n`
  + `export const APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_FIELDS: ReadonlyArray<keyof IBehaviourCatalogueSourceRow> = Object.freeze(${JSON.stringify(governedSourceRowFields)});\n`
  + `export const APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256 = ${JSON.stringify(governedSourceRowsCanonicalSha256)};\n`
  + `export const APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH = ${governedSourceRowsCanonicalUtf8ByteLength};\n`
  + `const approvedBehaviourV1SourceRows: IBehaviourCatalogueSourceRow[] = ${JSON.stringify(sourceRows, null, 2)};\n`
  + `approvedBehaviourV1SourceRows.forEach(row => Object.freeze(row));\n`
  + `export const APPROVED_BEHAVIOUR_V1_SOURCE_ROWS: ReadonlyArray<IBehaviourCatalogueSourceRow> = Object.freeze(approvedBehaviourV1SourceRows);\n`;

const mode = process.argv[2];
if (mode === '--write') {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(typescriptPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  fs.writeFileSync(typescriptPath, typescript, 'utf8');
} else if (mode === '--check') {
  assert.equal(fs.readFileSync(outputPath, 'utf8'), output, 'Generated catalogue differs from the Sponsor decision.');
  assert.equal(fs.readFileSync(typescriptPath, 'utf8'), typescript, 'Generated TypeScript catalogue differs from the Sponsor decision.');
} else {
  throw new Error('Use --write or --check.');
}

process.stdout.write(`${JSON.stringify({ mode, authority: AUTHORITY, approvedInstructionSha256: EXPECTED_INSTRUCTION_SHA256,
  behaviourCount: behaviours.length, focusAreaCount: behaviours.flatMap(item => item.focusAreas).length,
  rowCount: rows.length, uniqueExampleCount: new Set(rows.map(row => row.exampleText)).size,
  decisionContentSha256: document.decisionContentSha256, catalogueBlockSha256: document.source.catalogueBlockSha256,
  rowSha256: document.source.rowSha256, outputSha256: sha256(output),
  governedSourceRowsCanonicalSha256, governedSourceRowsCanonicalUtf8ByteLength })}\n`);
