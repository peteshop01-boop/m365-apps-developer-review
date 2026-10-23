export {};

declare const require: (name: string) => {
  readFileSync?: (path: string, encoding: string) => string;
  resolve?: (...parts: string[]) => string;
};

const readFileSync = require('fs').readFileSync as (path: string, encoding: string) => string;
const resolve = require('path').resolve as (...parts: string[]) => string;

interface IFlowNode {
  type?: string;
  inputs?: { parameters?: { table?: string } };
  runtimeConfiguration?: { concurrency?: { runs?: number }; retryPolicy?: { type?: string } };
  actions?: Record<string, IFlowNode>;
  else?: { actions?: Record<string, IFlowNode> };
}

interface IFlowExport {
  properties: {
    connectionReferences: Record<string, {
      connection?: { connectionReferenceLogicalName?: string };
      api?: { name?: string };
    }>;
    definition: {
      contentVersion: string;
      triggers: Record<string, IFlowNode>;
      actions: Record<string, IFlowNode>;
    };
  };
}

const flowPath = resolve('.', 'tests', 'fixtures', 'employee-processor.synthetic.json');
const flowSource = readFileSync(flowPath, 'utf8');
const flow = JSON.parse(flowSource) as IFlowExport;

const visit = (actions: Record<string, IFlowNode>, visitor: (name: string, node: IFlowNode) => void): void => {
  Object.keys(actions).forEach(name => {
    const node = actions[name];
    visitor(name, node);
    if (node.actions) visit(node.actions, visitor);
    if (node.else?.actions) visit(node.else.actions, visitor);
  });
};

describe('KCF-KPI-036 Employee TEST processor contract', () => {
  it('is bound exclusively to the six authorised KCFKPI_TEST_* list GUIDs used by this processor', () => {
    const expected = [
      'c89a7c3c-4ad7-45ca-ae17-5c108c318598',
      '3e05ec37-95ce-4a30-a56c-ff2437bf9bed',
      '47210791-25f1-416e-ab24-832c8b6448ec',
      '98f2a280-46a7-40b5-a37d-db97b02fc826',
      '3eb157c8-6290-4e1b-ad6b-d41e4a2293b9',
      '59a00c55-5ceb-4561-a5d5-0942edb5ad6d'
    ].sort();
    const tables = new Set<string>();
    Object.keys(flow.properties.definition.triggers).forEach(name => {
      const trigger = flow.properties.definition.triggers[name];
      if (trigger.inputs?.parameters?.table) tables.add(trigger.inputs.parameters.table);
    });
    visit(flow.properties.definition.actions, (_name, node) => {
      if (node.inputs?.parameters?.table) tables.add(node.inputs.parameters.table);
    });

    expect(Array.from(tables).sort()).toEqual(expected);
    expect(flowSource).not.toMatch(/KCFKPI_(?!TEST_)(EmployeeCommands|Workplans|WorkplanItems|CommandReceipts|Audit)/);
    expect(flowSource).not.toContain('40ec1c73-a802-40ec-a6a2-cde0cba1d182');
  });

  it('uses SharePoint Standard only, concurrency one and no uncontrolled action retry', () => {
    const trigger = flow.properties.definition.triggers.When_an_item_is_created;
    expect(trigger.runtimeConfiguration?.concurrency?.runs).toBe(1);
    expect(flow.properties.connectionReferences.shared_sharepointonline).toEqual(expect.objectContaining({
      connection: { connectionReferenceLogicalName: 'new_sharedsharepointonline_0237e' },
      api: { name: 'shared_sharepointonline' }
    }));
    const openApiActions: Array<{ name: string; type?: string }> = [];
    visit(flow.properties.definition.actions, (name, node) => {
      if (node.type === 'OpenApiConnection') {
        openApiActions.push({ name, type: node.runtimeConfiguration?.retryPolicy?.type });
      }
    });
    expect(openApiActions.length).toBeGreaterThan(0);
    expect(openApiActions.every(action => action.type === 'None')).toBe(true);
    expect(flowSource).not.toMatch(/shared_(office365|teams|outlook|http|sql|commondataservice)/i);
  });

  it('persists and receipts the complete Employee Draft with physical Behaviour fields', () => {
    expect(flow.properties.definition.contentVersion).toBe('1.0.36.1');
    expect(flowSource).toContain('BehaviourSelectedSuggestionKeysJ');
    expect(flowSource).toContain('BehaviourCustomObjective');
    expect(flowSource).toContain("selectedSuggestionKeys");
    expect(flowSource).toContain("customObjective");
    expect(flowSource).toContain("CoreCategoryWeight");
    expect(flowSource).toContain("PersonalCategoryWeight");
    expect(flowSource).toContain("BehaviourCategoryWeight");
    expect(flowSource).toContain("AuthenticatedActorEmail");
    expect(flowSource).toContain("ProcessedPayloadSHA256");
    expect(flowSource).toContain("ResultKeysJSON");
    expect(flowSource).toContain("AuditKeysJSON");
  });

  it('reads the exact command twice and binds identity only from authoritative SharePoint metadata', () => {
    expect(flowSource).toContain('Get_Command_Authoritative_1');
    expect(flowSource).toContain('Get_Command_Authoritative_2');
    expect(flowSource).toContain('c89a7c3c-4ad7-45ca-ae17-5c108c318598');
    expect(flowSource).toContain('Filter_Active_People_For_Author');
    expect(flowSource).toContain("['Author']?['Email']");
    expect(flowSource).toContain("['Editor']?['Email']");
    expect(flowSource).toContain("Created");
    expect(flowSource).toContain("Modified");
    expect(flowSource).toContain("{VersionNumber}");
    expect(flowSource).toContain("@odata.etag");
    expect(flowSource.indexOf('Get_Command_Authoritative_1'))
      .toBeLessThan(flowSource.indexOf('Parse_JSON_Payload'));
    expect(flowSource.indexOf('Get_Command_Authoritative_2'))
      .toBeLessThan(flowSource.indexOf('Create_TEST_Workplan'));
    expect(flowSource).not.toContain("'item/PersonKey': \"@triggerBody()?['PersonKey']\"");
  });

  it('uses an exact fail-closed payload schema and handles malformed JSON with one rejection route', () => {
    expect(flowSource).toContain('Parse_JSON_Payload');
    expect(flowSource).toContain('Handle_Malformed_JSON');
    expect(flowSource).toContain('additionalProperties');
    expect(flowSource).toContain('uniqueItems');
    expect(flowSource).toContain('^[\\\\x20-\\\\x7E]');
    expect(flowSource).toContain('UNEXPECTED_OR_MALFORMED_PAYLOAD');
    expect(flowSource).toContain('MALFORMED_JSON');
  });

  it('freezes Behaviour headings and keys while preserving valid selection/custom variants', () => {
    ['OBJ-01', 'OBJ-02', 'OBJ-03', 'OBJ-04', 'OBJ-05'].forEach(key => expect(flowSource).toContain(key));
    expect(flowSource).not.toContain('OBJ-06');
    expect(flowSource).toContain('Validate_Behaviour_Key_Heading_Binding');
    expect(flowSource).toContain('SELECTION_ONLY_OR_CUSTOM_ONLY_OR_COMBINED');
    expect(flowSource).toContain('CROSS_HEADING_OR_UNKNOWN_BEHAVIOUR_KEY');
  });

  it('validates before replay classification and binds replay to the complete authoritative envelope', () => {
    const receiptIndex = flowSource.indexOf('Get_TEST_Receipts_After_Validation');
    expect(receiptIndex).toBeGreaterThan(flowSource.indexOf('Parse_JSON_Payload'));
    expect(receiptIndex).toBeGreaterThan(flowSource.indexOf('Filter_Active_People_For_Author'));
    expect(flowSource).toContain('Filter_Exact_Receipt_Binding');
    expect(flowSource).toContain('Filter_Receipt_Collision');
    expect(flowSource).toContain('SOURCE_BINDING_COLLISION');
    expect(flowSource).toContain("SourceItemVersion");
    expect(flowSource).toContain("AuthenticatedActorEmail");
    expect(flowSource).toContain("AuthenticatedActorPersonKey");
    expect(flowSource).toContain("ETAG|");
    expect(flowSource).toContain("@workflow()?['run']?['name']");
    expect(flowSource).not.toContain("where\": \"@equals(item()?['CommandKey'], triggerBody()?['CommandKey'])");
  });

  it('guards retained QA source item 6 before any official write', () => {
    expect(flowSource).toContain('Guard_Retained_QA_Command_6');
    expect(flowSource).toContain('KCF-KPI-036|QA|2098|DRAFT|V1');
    expect(flowSource).toContain('KCF-KPI-036|20260904T123131Z|QA');
    expect(flowSource).toContain('RETAINED_QA_SOURCE_ORPHAN');
    expect(flowSource.indexOf('Guard_Retained_QA_Command_6'))
      .toBeLessThan(flowSource.indexOf('Create_TEST_Workplan'));
  });
});
