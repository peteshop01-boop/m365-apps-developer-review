import {
  QUARTERLY_EXTENSION_FIELDS,
  quarterlyFieldSchemaXml,
  validateQuarterlySchemaReadback
} from './QuarterlySchemaMigration';

describe('Quarterly schema migration contract', () => {
  it('defines exactly the 15 approved additive fields and exact choice values', () => {
    expect(QUARTERLY_EXTENSION_FIELDS).toHaveLength(15);
    expect(QUARTERLY_EXTENSION_FIELDS.map(field => field.internalName)).toEqual([
      'BTGRoute', 'BTGOwnerPersonKey', 'BTGDueDate', 'BTGStatus', 'BTGExpectedReturnToGreenDate',
      'BTGExpectedReducedOutcome', 'ReforecastProposedTarget', 'ReforecastProposedDate', 'ReforecastReason',
      'ReforecastApprovalStatus', 'EscalationDependency', 'EscalatedTo', 'EscalationTargetDecisionDate',
      'BehaviourExamples', 'ManagerBehaviourAssessment'
    ]);
    expect(QUARTERLY_EXTENSION_FIELDS.find(field => field.internalName === 'BTGRoute')?.choices).toEqual(['Recover', 'Mitigate', 'Reforecast', 'Escalate']);
    expect(QUARTERLY_EXTENSION_FIELDS.find(field => field.internalName === 'BTGStatus')?.choices).toEqual(['Draft', 'Active', 'Complete', 'Superseded', 'Escalated']);
  });

  it('generates non-destructive optional SharePoint field XML', () => {
    QUARTERLY_EXTENSION_FIELDS.forEach(field => {
      const xml = quarterlyFieldSchemaXml(field);
      expect(xml).toContain(`Name="${field.internalName}"`);
      expect(xml).toContain('Required="FALSE"');
      expect(xml).toContain('Indexed="FALSE"');
    });
    expect(quarterlyFieldSchemaXml(QUARTERLY_EXTENSION_FIELDS[0])).toContain('<CHOICE>Reforecast</CHOICE>');
  });

  it('fails closed on missing fields, wrong types, required/indexed drift or stray choices', () => {
    const good = QUARTERLY_EXTENSION_FIELDS.map(field => ({
      internalName: field.internalName,
      type: field.type === 'DateOnly' ? 'DateTime' : field.type,
      required: false,
      indexed: false,
      choices: field.choices || []
    }));
    expect(validateQuarterlySchemaReadback(good)).toEqual({ missingFields: [], mismatches: [] });
    const bad = good.slice(1);
    bad[0] = { ...bad[0], type: 'Number', required: true, indexed: true };
    const result = validateQuarterlySchemaReadback(bad);
    expect(result.missingFields).toEqual(['BTGRoute']);
    expect(result.mismatches).toHaveLength(3);
  });
});

