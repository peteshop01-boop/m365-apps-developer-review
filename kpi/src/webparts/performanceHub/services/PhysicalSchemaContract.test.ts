import {
  KPI_MASTER_CATALOGUE_SELECT,
  PRODUCTION_QUERY_FIELD_CONTRACTS,
  PRODUCTION_QUERY_LIST_KEYS,
  assertProductionQueryFields
} from './ProductionQueryFieldContracts';

declare function require(name: string): {
  readFileSync?: (path: string, encoding: string) => string;
  resolve?: (...parts: string[]) => string;
};

const readFileSync = require('fs').readFileSync as (path: string, encoding: string) => string;
const resolve = require('path').resolve as (...parts: string[]) => string;

const APPROVED_ADDITIVE_PHYSICAL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  // KCF-KPI-011C added and read back these import-traceability helpers after
  // the original Production List Schema was published. Their controlled
  // evidence is docs/KCF-KPI-011C_MASTER_DATA_EVIDENCE.md.
  KCFKPI_KPIMaster: ['OwnerSourceCode', 'DataQualityFlags']
};

function approvedSchemaFields(schema: string, listTitle: string): Set<string> {
  const lines = schema.split(/\r?\n/);
  const titleToken = '`' + listTitle + '`';
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].indexOf('## ') === 0 && lines[index].indexOf(titleToken) >= 0) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) throw new Error(`Approved physical schema section not found for ${listTitle}.`);
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].indexOf('## ') === 0) {
      end = index;
      break;
    }
  }
  const section = lines.slice(start, end).join('\n');
  // Built-in SharePoint fields are present on every list and need not be repeated in each custom schema table.
  const fields = new Set<string>(['Id', 'Modified', 'Editor']);
  const row = /^\|\s*`([^`]+)`\s*\|/gm;
  let match = row.exec(section);
  while (match) {
    fields.add(match[1] === 'ID' ? 'Id' : match[1]);
    match = row.exec(section);
  }
  (APPROVED_ADDITIVE_PHYSICAL_FIELDS[listTitle] || []).forEach(field => fields.add(field));
  return fields;
}

describe('Production physical-schema query contract', () => {
  const schema = readFileSync(resolve('.', 'docs', 'PRODUCTION_LIST_SCHEMA.md'), 'utf8');

  PRODUCTION_QUERY_LIST_KEYS.forEach(key => {
    it(`${key} requests only fields present in the approved physical schema`, () => {
      const contract = PRODUCTION_QUERY_FIELD_CONTRACTS[key];
      const physicalFields = approvedSchemaFields(schema, contract.listTitle);
      const missing = contract.requiredFields.filter(field => !physicalFields.has(field));
      expect(missing).toEqual([]);
      expect(new Set(contract.requiredFields).size).toBe(contract.requiredFields.length);
      const required: readonly string[] = contract.requiredFields;
      expect(contract.optionalFields.filter(field => required.indexOf(field) >= 0)).toEqual([]);
    });
  });

  it('keeps organisational reporting and weighting outside the employee KPI Master select', () => {
    expect(PRODUCTION_QUERY_FIELD_CONTRACTS.kpiMaster.optionalFields).toContain('PortfolioWeight');
    expect(PRODUCTION_QUERY_FIELD_CONTRACTS.kpiMaster.optionalFields).toContain('KPIWeightWithinWorkstream');
    expect(PRODUCTION_QUERY_FIELD_CONTRACTS.kpiMaster.requiredFields).not.toContain('PortfolioWeight');
    expect(PRODUCTION_QUERY_FIELD_CONTRACTS.kpiMaster.requiredFields).not.toContain('KPIWeightWithinWorkstream');
    expect(KPI_MASTER_CATALOGUE_SELECT.split(',')).not.toContain('PortfolioWeight');
    expect(KPI_MASTER_CATALOGUE_SELECT.split(',')).not.toContain('KPIWeightWithinWorkstream');
  });

  it('allows approved required fields and fails fast for optional or unknown query fields', () => {
    expect(() => assertProductionQueryFields(
      'KCFKPI_KPIMaster',
      'KPIID,KPIWording',
      `DefinitionStatus eq 'Active' and IsCurrent eq 1`,
      'KPIID'
    )).not.toThrow();
    expect(() => assertProductionQueryFields(
      'KCFKPI_KPIMaster',
      'KPIID,KPIWeightWithinWorkstream',
      `DefinitionStatus eq 'Active'`,
      'KPIID'
    )).toThrow(/optional field\(s\).*KPIWeightWithinWorkstream/);
    expect(() => assertProductionQueryFields(
      'KCFKPI_KPIMaster',
      'KPIID,PortfolioWeight',
      `DefinitionStatus eq 'Active'`,
      'KPIID'
    )).toThrow(/optional field\(s\).*PortfolioWeight/);
    expect(() => assertProductionQueryFields(
      'KCFKPI_KPIMaster',
      'KPIID,FutureUnapprovedField',
      `DefinitionStatus eq 'Active'`,
      'KPIID'
    )).toThrow(/outside the approved physical contract.*FutureUnapprovedField/);
  });
});
