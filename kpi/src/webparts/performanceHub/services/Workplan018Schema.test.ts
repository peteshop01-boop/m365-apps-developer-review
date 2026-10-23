import { WORKPLAN_018_SCHEMA, validateWorkplan018SchemaReadback, workplan018FieldSchemaXml } from './Workplan018Schema';

describe('KCF-KPI-018 physical schema contract', () => {
  it('extends four existing lists and creates one required library', () => {
    expect(WORKPLAN_018_SCHEMA.map(item => item.title)).toEqual([
      'KCFKPI_Workplans', 'KCFKPI_WorkplanItems', 'KCFKPI_QuarterReviews',
      'KCFKPI_QuarterReviewItems', 'KCFKPI_BehaviourObjectiveLibrary'
    ]);
    expect(WORKPLAN_018_SCHEMA.map(item => item.fields.length)).toEqual([1, 23, 4, 22, 11]);
    expect(WORKPLAN_018_SCHEMA.filter(item => item.createIfMissing).map(item => item.title)).toEqual(['KCFKPI_BehaviourObjectiveLibrary']);
  });

  it('uses globally unique field ids and internal names within each list', () => {
    const allIds: string[] = [];
    WORKPLAN_018_SCHEMA.forEach(list => list.fields.forEach(field => allIds.push(field.id)));
    expect(new Set(allIds).size).toBe(allIds.length);
    WORKPLAN_018_SCHEMA.forEach(list => expect(new Set(list.fields.map(field => field.internalName)).size).toBe(list.fields.length));
  });

  it('creates constrained schema XML without rich text', () => {
    const library = WORKPLAN_018_SCHEMA.find(item => item.title === 'KCFKPI_BehaviourObjectiveLibrary');
    const key = library?.fields.find(field => field.internalName === 'BehaviourObjectiveKey');
    const note = library?.fields.find(field => field.internalName === 'ObjectiveDescription');
    const effectiveFrom = library?.fields.find(field => field.internalName === 'EffectiveFrom');
    expect(workplan018FieldSchemaXml(key as NonNullable<typeof key>)).toMatch(/EnforceUniqueValues="TRUE"/);
    expect(workplan018FieldSchemaXml(note as NonNullable<typeof note>)).toMatch(/RichText="FALSE"/);
    expect(workplan018FieldSchemaXml(effectiveFrom as NonNullable<typeof effectiveFrom>)).toMatch(/Required="TRUE"/);
  });

  it('fails closed on missing fields or physical mismatches', () => {
    const definition = WORKPLAN_018_SCHEMA[0];
    expect(validateWorkplan018SchemaReadback(definition, [])).toEqual({ missingFields: ['CategoryWeightingReason'], mismatches: [] });
    expect(validateWorkplan018SchemaReadback(definition, [{
      internalName: 'CategoryWeightingReason', type: 'Text', required: true, indexed: true, enforceUniqueValues: false, choices: []
    }]).mismatches).toHaveLength(3);
  });
});
