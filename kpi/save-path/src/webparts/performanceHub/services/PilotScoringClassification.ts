import type {
  AggregationMethod,
  MetricType,
  ScoringDirection
} from '../models/QuarterlyModels';

export type PilotScoringKpiId = 'SO1-001' | 'SO1-002' | 'SO1-016' | 'SO2-026';
export type PilotScoringClassificationStatus = 'PilotApproved' | 'RequiresControlDecision';

export interface IPilotScoringFields {
  aggregationMethod?: AggregationMethod | string;
  scoringDirection: ScoringDirection | string;
  metricType?: MetricType | string;
  unitLabel: string;
  percentageSourceScale?: 'Fraction' | 'Whole';
}

type IPilotResolvedScoringFields = Readonly<
  Required<Omit<IPilotScoringFields, 'percentageSourceScale'>>
  & Pick<IPilotScoringFields, 'percentageSourceScale'>
>;

export interface IPilotSourceTarget {
  kind: 'number' | 'text';
  value: number | string;
  numberFormat: string;
}

export interface IPilotScoringClassification {
  kpiId: PilotScoringKpiId;
  kpiVersionKey: `${PilotScoringKpiId}|v01`;
  status: PilotScoringClassificationStatus;
  classification: IPilotResolvedScoringFields;
  source: Readonly<{
    authority: 'KPI GOLD Performance V6';
    evidencePath: 'data/DEMOAPP_KPI_GOLD_VALIDATED_011C.json';
    sheet: 'KPI GOLD — LIVE SOURCE';
    table: 'KpiGoldLiveSource';
    sourceRow: number;
    wording: string;
    performanceYear: '2025/26';
    targets: Readonly<{
      yearEnd: IPilotSourceTarget;
      q1: IPilotSourceTarget;
      q2: IPilotSourceTarget;
      q3: IPilotSourceTarget;
      q4: IPilotSourceTarget;
    }>;
  }>;
  rationale: string;
}

const numberTarget = (value: number, numberFormat = 'General'): IPilotSourceTarget => ({
  kind: 'number',
  value,
  numberFormat
});

const textTarget = (value: string, numberFormat = 'General'): IPilotSourceTarget => ({
  kind: 'text',
  value,
  numberFormat
});

export const PILOT_SCORING_CLASSIFICATIONS: Readonly<Record<PilotScoringKpiId, IPilotScoringClassification>> = {
  'SO1-001': {
    kpiId: 'SO1-001',
    kpiVersionKey: 'SO1-001|v01',
    status: 'PilotApproved',
    classification: {
      aggregationMethod: 'DirectMetric',
      scoringDirection: 'HigherIsBetter',
      metricType: 'Count',
      unitLabel: 'programmes'
    },
    source: {
      authority: 'KPI GOLD Performance V6',
      evidencePath: 'data/DEMOAPP_KPI_GOLD_VALIDATED_011C.json',
      sheet: 'KPI GOLD — LIVE SOURCE',
      table: 'KpiGoldLiveSource',
      sourceRow: 3,
      wording: '200 Primary School Programmes delivered annually.',
      performanceYear: '2025/26',
      targets: {
        yearEnd: numberTarget(200), q1: numberTarget(70), q2: numberTarget(148), q3: numberTarget(200), q4: numberTarget(200)
      }
    },
    rationale: 'The wording names a count of delivered programmes and every approved target is numeric. Progress increases as delivered programmes approach the target; one official metric is used rather than summing employee Workplan relationships.'
  },
  'SO1-002': {
    kpiId: 'SO1-002',
    kpiVersionKey: 'SO1-002|v01',
    status: 'RequiresControlDecision',
    classification: {
      aggregationMethod: 'DirectMetric',
      scoringDirection: 'TBC',
      metricType: 'Score',
      unitLabel: 'score / 10'
    },
    source: {
      authority: 'KPI GOLD Performance V6',
      evidencePath: 'data/DEMOAPP_KPI_GOLD_VALIDATED_011C.json',
      sheet: 'KPI GOLD — LIVE SOURCE',
      table: 'KpiGoldLiveSource',
      sourceRow: 4,
      wording: 'Maintain average recommendation score ‘9.5/10’ from CTS Teacher Surveys.',
      performanceYear: '2025/26',
      targets: {
        yearEnd: numberTarget(9.5), q1: numberTarget(9.5), q2: numberTarget(9.5), q3: numberTarget(9.5), q4: numberTarget(9.5)
      }
    },
    rationale: 'The wording supports a score out of ten, but “maintain” does not resolve whether results should use HigherIsBetter or a controlled TargetRange and no range/tolerance parameters exist. It must remain NotRated until CONTROL decides the scoring rule.'
  },
  'SO1-016': {
    kpiId: 'SO1-016',
    kpiVersionKey: 'SO1-016|v01',
    status: 'PilotApproved',
    classification: {
      aggregationMethod: 'DirectMetric',
      scoringDirection: 'HigherIsBetter',
      metricType: 'Percentage',
      unitLabel: '%',
      percentageSourceScale: 'Fraction'
    },
    source: {
      authority: 'KPI GOLD Performance V6',
      evidencePath: 'data/DEMOAPP_KPI_GOLD_VALIDATED_011C.json',
      sheet: 'KPI GOLD — LIVE SOURCE',
      table: 'KpiGoldLiveSource',
      sourceRow: 18,
      wording: 'Increase the number of girls in national programmes to 35%',
      performanceYear: '2025/26',
      targets: {
        yearEnd: numberTarget(0.28), q1: numberTarget(0), q2: numberTarget(0.25), q3: numberTarget(0.28), q4: numberTarget(0.28)
      }
    },
    rationale: 'The wording explicitly defines a percentage and says increase, so Percentage, %, HigherIsBetter and one official DirectMetric are supported. Source targets are retained as decimal fractions; classification does not rescale them.'
  },
  'SO2-026': {
    kpiId: 'SO2-026',
    kpiVersionKey: 'SO2-026|v01',
    status: 'PilotApproved',
    classification: {
      aggregationMethod: 'Milestone',
      scoringDirection: 'Milestone',
      metricType: 'Milestone',
      unitLabel: 'milestone'
    },
    source: {
      authority: 'KPI GOLD Performance V6',
      evidencePath: 'data/DEMOAPP_KPI_GOLD_VALIDATED_011C.json',
      sheet: 'KPI GOLD — LIVE SOURCE',
      table: 'KpiGoldLiveSource',
      sourceRow: 28,
      wording: 'Publish Facilities Action Plan with accompanying progress log, annually.',
      performanceYear: '2025/26',
      targets: {
        yearEnd: textTarget('November 2026 Revision'),
        q1: textTarget('-'),
        q2: numberTarget(0.25, '0%'),
        q3: numberTarget(0.5, '0%'),
        q4: numberTarget(0.75, '0%')
      }
    },
    rationale: 'The source describes a defined publication deliverable and the controlled import already classifies it as Milestone without a data-quality flag. Classification is approved, but deterministic RAG still requires a separately approved ordered stage map.'
  }
};

export interface IPilotClassifiableRecord extends IPilotScoringFields {
  kpiId: string;
  kpiVersionKey: string;
}

export const resolvePilotScoringClassification = <T extends IPilotClassifiableRecord>(
  source: T
): T & Pick<IPilotScoringFields, 'percentageSourceScale'> => {
  const pilot = PILOT_SCORING_CLASSIFICATIONS[source.kpiId as PilotScoringKpiId];
  if (!pilot || pilot.status !== 'PilotApproved' || source.kpiVersionKey !== pilot.kpiVersionKey) return source;
  return Object.assign({}, source, pilot.classification);
};
