import {
  ADMIN_REPORTING_CONTROL_FIELDS,
  adminReportingControlFieldSchemaXml,
  validateAdminReportingControlSchemaReadback
} from './AdminReportingControlSchema';

describe('KCF-KPI-020B additive Reporting Control schema', () => {
  it('adds only the missing Output Definition requirement field', () => {
    expect(ADMIN_REPORTING_CONTROL_FIELDS.map(field => `${field.listTitle}.${field.internalName}`)).toEqual([
      'KCFKPI_OutputDefinitions.MappingRequirement'
    ]);
    expect(ADMIN_REPORTING_CONTROL_FIELDS.every(field => field.required)).toBe(true);
  });

  it('emits bounded SharePoint field XML with no fill-in output requirement', () => {
    const requirement = adminReportingControlFieldSchemaXml(ADMIN_REPORTING_CONTROL_FIELDS[0]);
    expect(requirement).toContain('<CHOICE>Required</CHOICE>');
    expect(requirement).toContain('<CHOICE>Optional</CHOICE>');
    expect(requirement).toContain('FillInChoice="FALSE"');
    expect(requirement).not.toContain('<Default>');
  });

  it('fails exact readback for a missing or mismatched field', () => {
    const exact = ADMIN_REPORTING_CONTROL_FIELDS.map(field => ({
      id: field.id,
      listTitle: field.listTitle,
      internalName: field.internalName,
      type: field.type,
      required: field.required,
      hidden: false,
      indexed: field.indexed,
      enforceUniqueValues: field.enforceUniqueValues,
      defaultValue: field.defaultValue,
      choices: field.choices || [],
      schemaXml: adminReportingControlFieldSchemaXml(field)
    }));
    expect(validateAdminReportingControlSchemaReadback(exact)).toEqual({ missingFields: [], mismatches: [] });
    expect(validateAdminReportingControlSchemaReadback([]).missingFields).toEqual([
      'KCFKPI_OutputDefinitions.MappingRequirement'
    ]);
    expect(validateAdminReportingControlSchemaReadback([
      { ...exact[0], choices: ['Required'], defaultValue: 'Required' }
    ]).mismatches).toHaveLength(2);
  });

  it('rejects a physical Choice field with fill-in values enabled', () => {
    const field = ADMIN_REPORTING_CONTROL_FIELDS[0];
    const readback = {
      id: field.id,
      listTitle: field.listTitle,
      internalName: field.internalName,
      type: field.type,
      required: field.required,
      hidden: false,
      indexed: field.indexed,
      enforceUniqueValues: field.enforceUniqueValues,
      choices: field.choices || [],
      schemaXml: adminReportingControlFieldSchemaXml(field).replace('FillInChoice="FALSE"', 'FillInChoice="TRUE"')
    };

    expect(validateAdminReportingControlSchemaReadback([readback]).mismatches).toEqual([
      'KCFKPI_OutputDefinitions.MappingRequirement: FillInChoice must be FALSE.'
    ]);
  });

  it('rejects a physical Choice field whose format is not Dropdown', () => {
    const field = ADMIN_REPORTING_CONTROL_FIELDS[0];
    const readback = {
      id: field.id,
      listTitle: field.listTitle,
      internalName: field.internalName,
      type: field.type,
      required: field.required,
      hidden: false,
      indexed: field.indexed,
      enforceUniqueValues: field.enforceUniqueValues,
      choices: field.choices || [],
      schemaXml: adminReportingControlFieldSchemaXml(field).replace('Format="Dropdown"', 'Format="RadioButtons"')
    };

    expect(validateAdminReportingControlSchemaReadback([readback]).mismatches).toEqual([
      'KCFKPI_OutputDefinitions.MappingRequirement: Choice Format must be Dropdown.'
    ]);
  });
});
