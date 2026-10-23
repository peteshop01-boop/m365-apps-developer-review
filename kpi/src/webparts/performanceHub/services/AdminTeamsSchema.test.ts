import {
  ADMIN_TEAMS_FIELDS,
  ADMIN_TEAMS_INITIAL_ROWS,
  ADMIN_TEAMS_LIST_DESCRIPTION,
  ADMIN_TEAMS_LIST_SETTINGS,
  ADMIN_TEAMS_TITLE_FIELD,
  adminTeamsFieldSchemaXml,
  type IAdminTeamsFieldReadback,
  validateAdminTeamsFields,
  validateAdminTeamsListSettings,
  validateAdminTeamsTitleField
} from './AdminTeamsSchema';

const exactFieldReadback = (): IAdminTeamsFieldReadback[] => ADMIN_TEAMS_FIELDS.map(field => ({
  id: `{${field.id.toUpperCase()}}`,
  internalName: field.internalName,
  type: field.type,
  required: field.required,
  hidden: false,
  indexed: field.indexed,
  enforceUniqueValues: field.enforceUniqueValues,
  defaultValue: field.defaultValue,
  schemaXml: adminTeamsFieldSchemaXml(field)
}));

describe('KCFKPI_Teams physical schema contract', () => {
  it('contains the approved five custom fields and no notification metadata', () => {
    expect(ADMIN_TEAMS_FIELDS.map(field => field.internalName)).toEqual([
      'TeamKey',
      'TeamName',
      'TeamLeadPersonKey',
      'Active',
      'SortOrder'
    ]);
    expect(ADMIN_TEAMS_FIELDS).toHaveLength(5);
    expect(JSON.stringify(ADMIN_TEAMS_FIELDS)).not.toMatch(/notification|email|channel|webhook/i);
  });

  it('keeps built-in Title optional and hidden because TeamName is the business label', () => {
    expect(ADMIN_TEAMS_TITLE_FIELD).toEqual({ internalName: 'Title', required: false, hidden: true });
    const fields = exactFieldReadback().concat([{
      id: '{387dc6b4-3ee6-4761-a6a0-ea83b95538d8}',
      internalName: 'Title',
      type: 'Text',
      required: false,
      hidden: true,
      indexed: false,
      enforceUniqueValues: false,
      schemaXml: '<Field Name="Title" Type="Text" Required="FALSE" Hidden="TRUE" />'
    }]);
    expect(validateAdminTeamsTitleField(fields)).toEqual([]);
    fields[fields.length - 1] = { ...fields[fields.length - 1], required: true, hidden: false };
    expect(validateAdminTeamsTitleField(fields)).toEqual([
      'Title: Required true, expected false.',
      'Title: Hidden false, expected true.'
    ]);
  });

  it('freezes exact types, indexes, uniqueness and defaults', () => {
    expect(ADMIN_TEAMS_FIELDS).toEqual([
      expect.objectContaining({
        internalName: 'TeamKey', type: 'Text', required: true,
        indexed: true, enforceUniqueValues: true, maxLength: 255
      }),
      expect.objectContaining({
        internalName: 'TeamName', type: 'Text', required: true,
        indexed: false, enforceUniqueValues: false, maxLength: 255
      }),
      expect.objectContaining({
        internalName: 'TeamLeadPersonKey', type: 'Text', required: false,
        indexed: true, enforceUniqueValues: false, maxLength: 255
      }),
      expect.objectContaining({
        internalName: 'Active', type: 'Boolean', required: true,
        indexed: true, enforceUniqueValues: false, defaultValue: '1'
      }),
      expect.objectContaining({
        internalName: 'SortOrder', type: 'Number', required: true,
        indexed: false, enforceUniqueValues: false, decimalPlaces: 0, minimum: 0
      })
    ]);
    expect(ADMIN_TEAMS_FIELDS.filter(field => field.defaultValue !== undefined)
      .map(field => field.internalName)).toEqual(['Active']);
  });

  it('emits exact SharePoint field XML including unique key and Boolean default', () => {
    const byName = (name: string): string => {
      const field = ADMIN_TEAMS_FIELDS.filter(candidate => candidate.internalName === name)[0];
      if (!field) throw new Error(`Missing test field ${name}.`);
      return adminTeamsFieldSchemaXml(field);
    };
    expect(byName('TeamKey')).toMatch(/Type="Text"/);
    expect(byName('TeamKey')).toMatch(/Indexed="TRUE"/);
    expect(byName('TeamKey')).toMatch(/EnforceUniqueValues="TRUE"/);
    expect(byName('TeamKey')).toMatch(/MaxLength="255"/);
    expect(byName('Active')).toMatch(/Type="Boolean"/);
    expect(byName('Active')).toMatch(/Default="1"/);
    expect(byName('SortOrder')).toMatch(/Type="Number"/);
    expect(byName('SortOrder')).toMatch(/Decimals="0"/);
    expect(byName('SortOrder')).toMatch(/Min="0"/);
  });

  it('accepts exact field read-back and detects type, index, unique and default drift', () => {
    expect(validateAdminTeamsFields(exactFieldReadback())).toEqual({ missingFields: [], mismatches: [] });
    const changed = exactFieldReadback();
    changed[0] = { ...changed[0], type: 'Note', hidden: true, indexed: false, enforceUniqueValues: false };
    changed[3] = {
      ...changed[3],
      defaultValue: '0',
      schemaXml: changed[3].schemaXml.replace('Default="1"', 'Default="0"')
    };
    const result = validateAdminTeamsFields(changed);
    expect(result.mismatches).toEqual(expect.arrayContaining([
      'TeamKey: type Note, expected Text.',
      'TeamKey: Hidden true, expected false.',
      'TeamKey: Indexed false, expected true.',
      'TeamKey: EnforceUniqueValues false, expected true.',
      'Active: default 0, expected 1.'
    ]));
  });

  it('freezes generic-list settings and accepts a genuinely empty initial state', () => {
    expect(ADMIN_TEAMS_LIST_SETTINGS).toEqual({
      baseTemplate: 100,
      enableVersioning: true,
      enableFolderCreation: false,
      onQuickLaunch: false,
      hidden: false
    });
    expect(ADMIN_TEAMS_INITIAL_ROWS).toEqual([]);
    expect(validateAdminTeamsListSettings({
      baseTemplate: 100,
      description: ADMIN_TEAMS_LIST_DESCRIPTION,
      enableVersioning: true,
      enableFolderCreation: false,
      onQuickLaunch: false,
      hidden: false,
      itemCount: 0
    })).toEqual([]);
  });

  it('detects physical list-setting drift', () => {
    expect(validateAdminTeamsListSettings({
      baseTemplate: 101,
      description: 'Changed',
      enableVersioning: false,
      enableFolderCreation: true,
      onQuickLaunch: true,
      hidden: true,
      itemCount: -1
    })).toEqual(expect.arrayContaining([
      'BaseTemplate 101, expected 100.',
      'Description does not match the approved Teams contract.',
      'EnableVersioning false, expected true.',
      'EnableFolderCreation true, expected false.',
      'OnQuickLaunch true, expected false.',
      'Hidden true, expected false.',
      'ItemCount -1 is invalid.'
    ]));
  });
});
