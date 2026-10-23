export interface IMasterDataQualityCounts {
  unknownOwnerCodes: number;
  tbcScoringDirections: number;
  unresolvedUnitLabels: number;
  missingQ1Targets: number;
  missingQ2Targets: number;
  organisationalWeightingAssigned: boolean;
}

export interface IReadBackRecord {
  key: string;
  values: { [field: string]: unknown };
}

export const buildMasterDataWarnings = (counts: IMasterDataQualityCounts): string[] => {
  const warnings: string[] = [];
  if (counts.unknownOwnerCodes > 0) warnings.push(`${counts.unknownOwnerCodes} KPI owner code requires CONTROL resolution.`);
  if (counts.tbcScoringDirections > 0) warnings.push(`${counts.tbcScoringDirections} KPI scoring directions remain TBC.`);
  if (counts.unresolvedUnitLabels > 0) warnings.push(`${counts.unresolvedUnitLabels} KPI unit labels remain TBC.`);
  if (counts.missingQ1Targets > 0) warnings.push(`${counts.missingQ1Targets} Annual Targets have no Q1 value or text.`);
  if (counts.missingQ2Targets > 0) warnings.push(`${counts.missingQ2Targets} Annual Targets have no Q2 value or text.`);
  if (!counts.organisationalWeightingAssigned) warnings.push('Organisational GOLD weighting remains unassigned.');
  return warnings;
};

export const findReadBackMismatches = (
  expected: IReadBackRecord[],
  actual: IReadBackRecord[]
): string[] => {
  const actualByKey = new Map(actual.map(record => [record.key, record.values]));
  const mismatches: string[] = [];
  expected.forEach(record => {
    const actualValues = actualByKey.get(record.key);
    if (!actualValues) {
      mismatches.push(`${record.key}: missing from read-back`);
      return;
    }
    Object.keys(record.values).forEach(field => {
      if (actualValues[field] !== record.values[field]) mismatches.push(`${record.key}.${field}: value mismatch`);
    });
  });
  actual.forEach(record => {
    if (!expected.some(expectedRecord => expectedRecord.key === record.key)) mismatches.push(`${record.key}: unexpected read-back record`);
  });
  return mismatches;
};
