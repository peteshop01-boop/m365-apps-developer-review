import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(projectRoot, 'data', 'KCFKPI_KPI_GOLD_VALIDATED_011C.json');
const peoplePath = path.join(projectRoot, 'data', 'KCFKPI_PEOPLE_AUTHORISED_011B.csv');
const outputPath = path.join(projectRoot, 'data', 'KCFKPI_MASTER_IMPORT_R3.json');

const performanceYear = 2026;
const performanceYearLabel = '2025/26';
const effectiveFrom = '2025-11-01';
const effectiveTo = '2026-10-31';
const changeReference = 'KCF-KPI-011C-R3 / CONTROL authoritative V6 import';
const sourceOrigin = 'KPI GOLD Performance V6';
const preparedAt = new Date().toISOString();

const ownerAuthority = {
  PH: { displayName: 'Synthetic Person 02', email: 'person003@example.invalid' },
  CR: { displayName: 'Synthetic Person 06', email: 'person004@example.invalid' },
  JM: { displayName: 'Synthetic Person 04', email: 'person005@example.invalid' },
  HFL: { displayName: 'Synthetic Person 03', email: 'person006@example.invalid' },
  SH: { displayName: 'Synthetic Person 05', email: 'person007@example.invalid' }
};

const behaviourAuthority = [
  {
    id: 'BHV-01',
    name: 'Work as One Team',
    corporateValue: 'We unite as one Club',
    definition: "Works collaboratively across teams, shares information, supports colleagues and contributes beyond their immediate area where it helps KCF achieve better outcomes. Constructively challenges and accepts challenge in the organisation's best interests.",
    prompts: [
      'Shares information openly across teams.',
      'Offers help outside their immediate remit when it benefits KCF.',
      'Collaborates constructively with colleagues and departments.',
      'Challenges respectfully and accepts challenge.',
      'Puts Kent Cricket/Foundation outcomes ahead of silo interests.'
    ]
  },
  {
    id: 'BHV-02',
    name: 'Improve and Move Forward',
    corporateValue: 'We build the next chapter',
    definition: 'Looks for ways to improve how we work and the outcomes we achieve. Learns from experience, adapts when something is not working, welcomes new ideas and contributes to making KCF stronger for the future.',
    prompts: [
      'Looks for better ways of working.',
      'Learns from mistakes and adjusts.',
      'Welcomes constructive ideas and change.',
      'Uses evidence and feedback to improve.',
      "Thinks beyond today's task to longer-term impact."
    ]
  },
  {
    id: 'BHV-03',
    name: 'Show Respect and Listen',
    corporateValue: 'We respect the game and each other',
    definition: 'Treats colleagues, participants, partners and stakeholders with respect. Communicates openly, listens properly to different perspectives and uses constructive challenge and feedback to make better decisions and contributions.',
    prompts: [
      'Treats colleagues, participants and partners professionally.',
      'Listens before forming conclusions.',
      'Communicates openly and clearly.',
      'Values different perspectives.',
      'Handles disagreement and challenge constructively.'
    ]
  },
  {
    id: 'BHV-04',
    name: 'Bring Energy and Commitment',
    corporateValue: 'We work & play with energy',
    definition: 'Brings enthusiasm, positivity and commitment to their role. Responds constructively to challenges, follows through on commitments and represents Kent Cricket with pride and professionalism.',
    prompts: [
      'Brings enthusiasm and commitment.',
      'Follows through on agreed actions.',
      'Responds positively to setbacks.',
      'Contributes energy to the wider team.',
      'Represents Kent Cricket with pride and professionalism.'
    ]
  },
  {
    id: 'BHV-05',
    name: 'Own It and Put It Right',
    corporateValue: 'We take responsibility',
    definition: 'Takes ownership for their work, decisions and impact. Seeks advice where needed, makes informed decisions, maintains high standards, recognises what worked and takes action when something goes wrong rather than passing responsibility elsewhere.',
    prompts: [
      'Owns their work and its consequences.',
      'Raises risks/issues early.',
      'Seeks advice when needed.',
      'Acts to put problems right.',
      'Learns from successes and failures rather than repeating them.'
    ]
  }
];

const timingConfig = [
  ['Quarter early review reminder', 'QuarterEarlyReviewReminderDays', 30, 'Days before quarter end for the early readiness reminder.'],
  ['Quarter preparation reminder', 'QuarterPreparationReminderDays', 14, 'Days before quarter end for the preparation reminder.'],
  ['Quarter final reminder', 'QuarterFinalReminderDays', 7, 'Days before quarter end for the final-update reminder.'],
  ['Employee submission allowance', 'EmployeeSubmissionDaysAfterQuarter', 7, 'Calendar days after quarter end allowed for employee submission.'],
  ['Manager review allowance', 'ManagerReviewDaysAfterSubmissionDeadline', 7, 'Further calendar days after the employee deadline allowed for manager review.']
].map(([Title, ConfigKey, NumberValue, Description]) => ({
  Title,
  ConfigKey,
  Category: 'Deadline',
  ValueType: 'Number',
  NumberValue,
  Environment: 'Production',
  Active: true,
  Description,
  ChangeReference: 'KCF-KPI-011C-R3',
  ApprovedAt: preparedAt,
  ApprovalSource: 'CONTROL / KCF-KPI-011C-R3'
}));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value); value = '';
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

const normalise = value => String(value ?? '').trim().toLowerCase();

function hasAnyTextTarget(record) {
  return ['YearEndTarget', 'Q1Target', 'Q2Target', 'Q3Target', 'Q4Target']
    .some(field => record[field]?.Kind === 'text');
}

function classify(record) {
  const wording = normalise(record.KPIWording);
  const textTarget = hasAnyTextTarget(record);
  const textTargetValues = ['YearEndTarget', 'Q1Target', 'Q2Target', 'Q3Target', 'Q4Target']
    .map(field => record[field]?.Text)
    .filter(Boolean);
  const numericTextTarget = textTargetValues.some(value => /^\s*\d+(?:\.\d+)?(?:\s+of\s+\d+|\s+[a-z])/i.test(value));
  const percentage = /%|percent|percentage|proportion|conversion rate|retention rate/.test(wording);
  const currency = /£|income|revenue|funding|fundraised|budget|financial contribution|cost saving/.test(wording);
  const explicitMilestone = /\b(stage|milestone|complete implementation|launch|establish|publish|approved plan|accreditation)\b/.test(wording);
  const statusJudgement = /\b(status|quality standard|compliance|framework|strategy in place)\b/.test(wording);

  let metricType = 'Number';
  if (percentage) metricType = 'Percentage';
  else if (currency) metricType = 'Currency';
  else if (numericTextTarget) metricType = 'Number';
  else if (explicitMilestone) metricType = 'Milestone';
  else if (textTarget || statusJudgement) metricType = 'TextStatus';

  let aggregationMethod = 'DirectMetric';
  if (metricType === 'Milestone') aggregationMethod = 'Milestone';
  else if (metricType === 'TextStatus') aggregationMethod = 'AccountableOwner';

  let scoringDirection = 'TBC';
  if (metricType === 'Milestone') scoringDirection = 'Milestone';
  else if (/\b(reduce|reduction|decrease|decreasing|fewer|lower|less than|under)\b/.test(wording)) scoringDirection = 'LowerIsBetter';
  else if (/\b(increase|growth|grow|more|at least|minimum|number of|deliver|reach|achieve|recruit|retain)\b/.test(wording)) scoringDirection = 'HigherIsBetter';

  const unitLabel = metricType === 'Percentage' ? '%' : metricType === 'Currency' ? '£' : metricType === 'Milestone' ? 'milestone' : metricType === 'TextStatus' ? 'status' : 'TBC';
  return { aggregationMethod, scoringDirection, metricType, unitLabel };
}

function targetFields(record) {
  const fields = {};
  const mapping = [
    ['YearEndTarget', 'YearEndTargetValue', 'YearEndTargetText'],
    ['Q1Target', 'Q1TargetValue', 'Q1TargetText'],
    ['Q2Target', 'Q2TargetValue', 'Q2TargetText'],
    ['Q3Target', 'Q3TargetValue', 'Q3TargetText'],
    ['Q4Target', 'Q4TargetValue', 'Q4TargetText']
  ];
  for (const [source, numberField, textField] of mapping) {
    const target = record[source];
    if (target.Kind === 'number') fields[numberField] = target.Value;
    if (target.Kind === 'text') fields[textField] = target.Text;
  }
  return fields;
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const people = parseCsv(await readFile(peoplePath, 'utf8'));
const peopleByEmail = new Map(people.map(person => [normalise(person.Email), person]));
const ownerMap = {};
const mappingErrors = [];
for (const [code, approved] of Object.entries(ownerAuthority)) {
  const person = peopleByEmail.get(approved.email);
  if (!person || person.DisplayName !== approved.displayName) mappingErrors.push(`${code} does not match the authorised People source.`);
  else ownerMap[code] = { personKey: person.PersonKey, displayName: person.DisplayName, email: normalise(person.Email) };
}

const kpiMaster = source.Records.map(record => {
  const owner = ownerMap[record.AccountableOwnerSourceCode];
  const classification = classify(record);
  const flags = [];
  if (!/^SO\d+-\d{3}$/.test(record.KPIID)) flags.push('Non-standard ID — Review');
  if (!owner) flags.push(`Unknown owner code — ${record.AccountableOwnerSourceCode}`);
  if (classification.scoringDirection === 'TBC' || classification.unitLabel === 'TBC') flags.push('Classification review required');
  return {
    Title: record.KPIID,
    KPIVersionKey: `${record.KPIID}|v01`,
    KPIID: record.KPIID,
    VersionNumber: 1,
    KPIWording: record.KPIWording,
    Pillar: record.Pillar,
    Workstream: record.Workstream,
    OwnerSourceCode: record.AccountableOwnerSourceCode,
    AccountableOwnerPersonKey: owner?.personKey ?? null,
    AccountableOwnerEmail: owner?.email ?? null,
    DefinitionStatus: 'Active',
    StrategyTarget: record.StrategyTarget,
    AggregationMethod: classification.aggregationMethod,
    ScoringDirection: classification.scoringDirection,
    MetricType: classification.metricType,
    UnitLabel: classification.unitLabel,
    ReportingStatus: 'Included',
    PortfolioWeight: null,
    KPIWeightWithinWorkstream: null,
    RAGRuleType: classification.metricType === 'Milestone' ? 'MilestoneRule' : 'ProgressThreshold',
    GreenThresholdPct: classification.metricType === 'Milestone' ? null : 100,
    AmberThresholdPct: classification.metricType === 'Milestone' ? null : 80,
    SourceOrigin: sourceOrigin,
    EffectiveFrom: effectiveFrom,
    EffectiveTo: null,
    IsCurrent: true,
    ChangeReference: changeReference,
    ApprovedByEmail: null,
    ApprovedAt: preparedAt,
    ApprovalStatus: 'Approved',
    ApprovalSource: 'CONTROL / authoritative V6 import',
    DataQualityFlags: flags.join('; ') || null,
    ClassificationEvidence: {
      sourceTargetKinds: ['YearEndTarget', 'Q1Target', 'Q2Target', 'Q3Target', 'Q4Target'].map(field => record[field].Kind),
      ruleVersion: 'KCF-KPI-011C-R3-v1'
    }
  };
});

const annualTargets = source.Records.map(record => {
  const missing = ['Q1', 'Q2', 'Q3', 'Q4'].filter(quarter => record[`${quarter}Target`].Kind === 'blank');
  return {
    Title: `${record.KPIID} ${performanceYearLabel}`,
    TargetVersionKey: `${record.KPIID}|${performanceYear}|v01`,
    KPIYearKey: `${record.KPIID}|${performanceYear}`,
    KPIID: record.KPIID,
    KPIVersionKey: `${record.KPIID}|v01`,
    PerformanceYear: performanceYear,
    PerformanceYearLabel: performanceYearLabel,
    VersionNumber: 1,
    ...targetFields(record),
    TargetStatus: 'Approved',
    IsCurrent: true,
    EffectiveFrom: effectiveFrom,
    EffectiveTo: effectiveTo,
    ChangeReference: changeReference,
    ChangeReason: missing.length ? `Missing historical target: ${missing.join(', ')}` : null,
    ApprovedByEmail: null,
    ApprovedAt: preparedAt,
    ApprovalStatus: 'Approved',
    ApprovalSource: 'CONTROL / authoritative V6 import'
  };
});

const behaviours = behaviourAuthority.map((behaviour, index) => ({
  Title: behaviour.name,
  BehaviourVersionKey: `${behaviour.id}|v01`,
  BehaviourID: behaviour.id,
  VersionNumber: 1,
  Description: behaviour.definition,
  AssessmentGuidance: `Corporate Value: ${behaviour.corporateValue}\n\nObservable prompts:\n${behaviour.prompts.map((prompt, promptIndex) => `${promptIndex + 1}. ${prompt}`).join('\n')}\n\nRating options: Exceeds expectations; Meets expectations; Developing; Not demonstrated / insufficient evidence.`,
  DefaultWorkplanWeight: 20,
  DisplayOrder: index + 1,
  Status: 'Published',
  EffectiveFrom: effectiveFrom,
  EffectiveTo: null,
  IsCurrent: true,
  ChangeReference: 'KCF-KPI-011C-R3 / CONTROL Behaviour framework v1.0',
  ApprovedByEmail: null,
  ApprovedAt: preparedAt,
  ApprovalStatus: 'Approved',
  ApprovalSource: 'CONTROL / KCF-KPI-011C-R3',
  CorporateValue: behaviour.corporateValue,
  Prompts: behaviour.prompts
}));

const unknownOwnerCodes = [...new Set(source.Records.map(record => record.AccountableOwnerSourceCode).filter(code => !ownerMap[code]))].sort();
const classificationCounts = kpiMaster.reduce((counts, record) => {
  for (const field of ['AggregationMethod', 'ScoringDirection', 'MetricType', 'UnitLabel']) {
    counts[field] ??= {};
    counts[field][record[field]] = (counts[field][record[field]] ?? 0) + 1;
  }
  return counts;
}, {});
const q1Missing = annualTargets.filter(target => target.Q1TargetValue == null && target.Q1TargetText == null).map(target => target.KPIID);
const q2Missing = annualTargets.filter(target => target.Q2TargetValue == null && target.Q2TargetText == null).map(target => target.KPIID);
const errors = [...mappingErrors];
if (kpiMaster.length !== 109 || new Set(kpiMaster.map(item => item.KPIID)).size !== 109) errors.push('KPI Master must contain 109 unique KPI IDs.');
if (annualTargets.length !== 109 || new Set(annualTargets.map(item => item.KPIYearKey)).size !== 109) errors.push('Annual Targets must contain 109 unique KPI/year keys.');
if (q1Missing.length !== 7 || q2Missing.length !== 5) errors.push(`Historical target gaps differ from CONTROL: Q1=${q1Missing.length}, Q2=${q2Missing.length}.`);
if (behaviours.length !== 5 || behaviours.some(item => item.Prompts.length !== 5) || behaviours.reduce((sum, item) => sum + item.DefaultWorkplanWeight, 0) !== 100) errors.push('Behaviour framework must be five headings, five prompts each and 100 total default weight.');
if (timingConfig.length !== 5 || timingConfig.some(item => !Number.isInteger(item.NumberValue) || item.NumberValue <= 0)) errors.push('Timing Config must contain five positive integer values.');
if (source.Records.some(record => record.SourceWeighting?.Kind !== 'blank')) errors.push('Unexpected V6 organisational weighting found; manual validation required.');

const payload = {
  action: 'KCF-KPI-011C-R3',
  preparedAt,
  source: {
    file: source.Source.FileName,
    sha256: source.Source.SHA256,
    authoritativeSheet: source.AuthoritativeTable.Sheet,
    authoritativeTable: source.AuthoritativeTable.Table
  },
  decisions: {
    nonStandardIdsAccepted: true,
    sourceOrganisationalWeightingPresent: false,
    sourceOrganisationalWeightingAction: 'Do not invent KPI/workstream/pillar weights.',
    approvedByPersonNotFabricated: true,
    numericBehaviourRatingConversionFrozen: false
  },
  ownerMap,
  unknownOwnerCodes,
  classificationCounts,
  quality: {
    errors,
    warnings: [
      ...(unknownOwnerCodes.length ? [`Unknown owner codes retained without People mapping: ${unknownOwnerCodes.join(', ')}`] : []),
      `${kpiMaster.filter(item => item.DataQualityFlags?.includes('Non-standard ID')).length} non-standard KPI IDs retained and flagged.`,
      `${kpiMaster.filter(item => item.ScoringDirection === 'TBC').length} KPI scoring directions require later controlled review.`,
      `${kpiMaster.filter(item => item.UnitLabel === 'TBC').length} KPI unit labels require later controlled review.`
    ],
    q1Missing,
    q2Missing
  },
  schemaAdjustmentsRequired: {
    KCFKPI_KPIMaster: {
      choiceAdditions: { AggregationMethod: ['TBC'], ScoringDirection: ['TBC'], MetricType: ['TextStatus'] },
      fields: ['OwnerSourceCode', 'DataQualityFlags', 'KPIWeightWithinWorkstream']
    },
    KCFKPI_Behaviours: { fields: ['DefaultWorkplanWeight'] }
  },
  kpiMaster,
  annualTargets,
  behaviours,
  timingConfig
};

payload.payloadSHA256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex').toUpperCase();
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: errors.length ? 'BLOCKED' : 'PASS_WITH_REPORTED_UNKNOWN_OWNER',
  outputPath,
  kpiMaster: kpiMaster.length,
  annualTargets: annualTargets.length,
  behaviours: behaviours.length,
  timingConfig: timingConfig.length,
  unknownOwnerCodes,
  q1Missing: q1Missing.length,
  q2Missing: q2Missing.length,
  classificationCounts,
  errors,
  payloadSHA256: payload.payloadSHA256
}, null, 2));
