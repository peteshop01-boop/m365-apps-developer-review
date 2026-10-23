import {
  PRODUCTION_SCORING_METADATA_SCHEMA,
  serialiseProductionScoringMetadata
} from './ProductionScoringMetadata';

export type Pilot015EDisposition =
  | 'DETERMINISTIC FIX'
  | 'CONTROL DECISION REQUIRED'
  | 'SOURCE DATA REQUIRED'
  | 'INTENTIONALLY TBC';

export interface IPilot015EAllowedPatch {
  AggregationMethod?: string;
  ScoringDirection?: string;
  MetricType?: string;
  UnitLabel?: string;
  RAGParametersJSON?: string;
}

export interface IPilot015ERemediationRecord {
  kpiId: string;
  kpiVersionKey: string;
  sourceRange: string;
  disposition: Pilot015EDisposition;
  finding: string;
  resolution: string;
  livePatch?: Readonly<IPilot015EAllowedPatch>;
}

export interface IPilot015EIdentitySnapshot {
  kpiId: string;
  kpiVersionKey: string;
  wording: string;
  pillar: string;
  workstream: string;
  ownerSourceCode?: string;
  accountableOwnerEmail?: string;
  targetVersionKey: string;
}

const fractionMetadata = serialiseProductionScoringMetadata({
  schemaVersion: PRODUCTION_SCORING_METADATA_SCHEMA,
  status: 'Approved',
  approvalReference: 'KCF-KPI-015E',
  source: 'KPI GOLD — LIVE SOURCE!B18:AE18',
  percentageSourceScale: 'Fraction'
});

const incompleteScoreMetadata = serialiseProductionScoringMetadata({
  schemaVersion: PRODUCTION_SCORING_METADATA_SCHEMA,
  status: 'Incomplete',
  source: 'KPI GOLD — LIVE SOURCE!B4:AE4',
  scoreMaximum: 10,
  targetScore: 9.5
});

export const KCF_KPI_015E_PILOT: readonly IPilot015ERemediationRecord[] = [
  {
    kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', sourceRange: 'B3:AE3', disposition: 'DETERMINISTIC FIX',
    finding: 'The approved live Master row still stores TBC/Number/TBC while the accepted pilot overlay proves a delivered-programme count.',
    resolution: 'Persist the accepted exact-version HigherIsBetter Count classification.',
    livePatch: { ScoringDirection: 'HigherIsBetter', MetricType: 'Count', UnitLabel: 'programmes' }
  },
  {
    kpiId: 'SO1-016', kpiVersionKey: 'SO1-016|v01', sourceRange: 'B18:AE18', disposition: 'DETERMINISTIC FIX',
    finding: 'The approved targets are decimal fractions but the live row has no explicit Percentage source-scale metadata.',
    resolution: 'Persist exact-version Fraction scale without rescaling source targets.',
    livePatch: { RAGParametersJSON: fractionMetadata }
  },
  {
    kpiId: 'SO2-026', kpiVersionKey: 'SO2-026|v01', sourceRange: 'B28:AE28', disposition: 'CONTROL DECISION REQUIRED',
    finding: 'Milestone classification is supported, but GOLD contains no approved ordered stage-name map.',
    resolution: 'Create no stage rows and retain NotRated until CONTROL approves a current versioned map.'
  },
  {
    kpiId: 'SO1-002', kpiVersionKey: 'SO1-002|v01', sourceRange: 'B4:AE4', disposition: 'CONTROL DECISION REQUIRED',
    finding: 'GOLD explicitly defines a score of 9.5/10, but not the minimum, scoring direction or TargetRange tolerances.',
    resolution: 'Persist only the unambiguous Score/unit and incomplete source metadata; retain direction TBC and NotRated.',
    livePatch: { MetricType: 'Score', UnitLabel: 'score / 10', RAGParametersJSON: incompleteScoreMetadata }
  },
  {
    kpiId: 'SO2-027', kpiVersionKey: 'SO2-027|v01', sourceRange: 'B29:AE29', disposition: 'CONTROL DECISION REQUIRED',
    finding: 'Currency-formatted cells conflict with the percentage wording; KPI Alignment explicitly leaves percentage-versus-pounds open.',
    resolution: 'Make no live correction; retain TBC/NotRated.'
  },
  {
    kpiId: 'SO3-042', kpiVersionKey: 'SO3-042|v01', sourceRange: 'B45:AE45', disposition: 'SOURCE DATA REQUIRED',
    finding: 'Low risk is semantically desirable, but Baseline and Target are categorical text rather than valid numeric LowerIsBetter inputs.',
    resolution: 'Require numeric baseline/target or an approved categorical-state policy; make no live correction.'
  },
  {
    kpiId: 'SO4-066', kpiVersionKey: 'SO4-066|v01', sourceRange: 'B69:AE69', disposition: 'SOURCE DATA REQUIRED',
    finding: 'Owner code JH is unresolved and percentage wording conflicts with numeric targets of 63.',
    resolution: 'Require owner and measure clarification; do not alter owner or scoring metadata.'
  },
  {
    kpiId: 'SO3-035', kpiVersionKey: 'SO3-035|v01', sourceRange: 'B37:AE37', disposition: 'SOURCE DATA REQUIRED',
    finding: 'The KPI is a nominations count, but Q1 target is absent.',
    resolution: 'Correct only Count/unit; do not fill Q1 and keep that period NotRated.',
    livePatch: { MetricType: 'Count', UnitLabel: 'nominations' }
  },
  {
    kpiId: 'SO1-003', kpiVersionKey: 'SO1-003|v01', sourceRange: 'B5:AE5', disposition: 'DETERMINISTIC FIX',
    finding: 'The wording and controlled targets unambiguously count participating local authorities.',
    resolution: 'Persist HigherIsBetter Count/unit without changing the text target.',
    livePatch: { ScoringDirection: 'HigherIsBetter', MetricType: 'Count', UnitLabel: 'local authorities' }
  },
  {
    kpiId: 'SO2-032', kpiVersionKey: 'SO2-032|v01', sourceRange: 'B34:AE34', disposition: 'SOURCE DATA REQUIRED',
    finding: 'The measure is a count of pitch inspections/reports, but wording 25 conflicts with an approved target of 5.',
    resolution: 'Correct only Count/unit; retain the target contradiction as a scoring blocker.',
    livePatch: { MetricType: 'Count', UnitLabel: 'pitch inspections / reports' }
  },
  {
    kpiId: 'SO1-006', kpiVersionKey: 'SO1-006|v01', sourceRange: 'B8:AE8', disposition: 'CONTROL DECISION REQUIRED',
    finding: 'Compound club-count and attendance wording has no approved single scored measure; KPI Alignment leaves it open.',
    resolution: 'Make no live correction; retain the current source classification pending CONTROL.'
  },
  {
    kpiId: 'S07-105', kpiVersionKey: 'S07-105|v01', sourceRange: 'B108:AE108', disposition: 'INTENTIONALLY TBC',
    finding: 'The wording supports a programme count, but the declining baseline/target does not prove LowerIsBetter.',
    resolution: 'Correct only Count/unit and leave direction TBC/NotRated.',
    livePatch: { MetricType: 'Count', UnitLabel: 'programmes' }
  }
] as const;

const ALLOWED_PATCH_FIELDS = new Set(['AggregationMethod', 'ScoringDirection', 'MetricType', 'UnitLabel', 'RAGParametersJSON']);

export const validatePilot015EPlan = (records: readonly IPilot015ERemediationRecord[]): string[] => {
  const errors: string[] = [];
  if (!records.length || records.length > 12) errors.push('The KCF-KPI-015E pilot must contain 1 to 12 KPI records.');
  if (new Set(records.map(record => record.kpiId)).size !== records.length) errors.push('The pilot contains duplicate KPI IDs.');
  records.forEach(record => {
    if (record.kpiVersionKey !== `${record.kpiId}|v01`) errors.push(`${record.kpiId} does not use the exact approved v01 KPI version.`);
    Object.keys(record.livePatch ?? {}).forEach(field => {
      if (!ALLOWED_PATCH_FIELDS.has(field)) errors.push(`${record.kpiId} attempts the forbidden field ${field}.`);
    });
  });
  return errors;
};

export const assertPilotIdentityUnchanged = (
  before: IPilot015EIdentitySnapshot,
  after: IPilot015EIdentitySnapshot
): void => {
  const keys: Array<keyof IPilot015EIdentitySnapshot> = [
    'kpiId', 'kpiVersionKey', 'wording', 'pillar', 'workstream', 'ownerSourceCode', 'accountableOwnerEmail', 'targetVersionKey'
  ];
  const changed = keys.filter(key => before[key] !== after[key]);
  if (changed.length) throw new Error(`Pilot remediation changed protected source identity fields: ${changed.join(', ')}.`);
};
