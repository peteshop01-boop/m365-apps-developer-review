import type {
  IEmployeeBehaviourCommitmentInputV2,
  IEmployeeCoreContributionInputV2,
  IEmployeeQuarterUpdateInputV2,
  IEmployeeV2WorkplanCommandContext
} from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IAnnualWorkplan, IProductionPerson } from '../models/ProductionModels';
import {
  EMPLOYEE_V2_CANONICAL_LISTS,
  EMPLOYEE_V2_CONTROL_PLANE_LISTS,
  EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES,
  EMPLOYEE_V2_MANAGER_COMMAND_TYPES,
  EMPLOYEE_V2_PHYSICAL_ASSETS
} from './EmployeeWorkplanV2PhysicalSchema';
import {
  assertEmployeeV2CommandContext,
  validateEmployeeBehaviourCommitmentInputV2,
  validateEmployeeCoreContributionInputV2,
  validateEmployeeCoreWeightingInputV2,
  validateEmployeeQuarterUpdateInputV2,
  validateEmployeeWorkplanDraftInputV2
} from './EmployeeWorkplanV2PersistencePolicy';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;

const employee: IProductionPerson = {
  id: 1, personKey: 'PERSON-001', displayName: 'Synthetic Employee',
  email: 'employee@example.invalid', appRoles: ['Employee'], active: true
};
const workplan: IAnnualWorkplan = {
  id: 10, etag: '"1"', workplanKey: 'PERSON-001|2027', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email,
  performanceYear: 2027, managerPersonKey: 'MANAGER-001', managerDisplayName: 'Synthetic Manager',
  managerEmail: 'manager@example.invalid', state: 'Draft', accessState: 'EmployeeEdit',
  transitionStatus: 'Ready', coreCategoryWeight: 70, personalCategoryWeight: 20,
  behaviourCategoryWeight: 10, rowVersionToken: 1
};
const context: IEmployeeV2WorkplanCommandContext = {
  commandKey: 'fb1f6035-236e-434c-ae05-a78003badd47', actor: employee, workplan
};

const quarters = [
  { quarter: 'Q1' as const, targetValue: 10 }, { quarter: 'Q2' as const, targetValue: 20 },
  { quarter: 'Q3' as const, targetValue: 30 }, { quarter: 'Q4' as const, targetValue: 40 }
];

const additive: IEmployeeCoreContributionInputV2 = {
  kpiId: 'SO1-001', role: 'DeliveryLead', contributionMethod: 'AdditiveDirect',
  annualTargetValue: 100, quarterTargets: quarters, displayOrder: 0, activeInWorkplan: true
};

const behaviour: IEmployeeBehaviourCommitmentInputV2 = {
  behaviourId: 'BHV-01', selectedSuggestionKeys: [], commitment: 'Work as one team',
  periodCommitments: [
    { period: 'Q1', commitment: 'Q1' }, { period: 'Q2', commitment: 'Q2' },
    { period: 'Q3', commitment: 'Q3' }, { period: 'Q4', commitment: 'Q4' }
  ], displayOrder: 1, activeInWorkplan: true
};

describe('KCF-KPI-027A Employee V2 persistence policy', () => {
  it('binds commands to a stable retry key, exact token and the authenticated employee', () => {
    expect(() => assertEmployeeV2CommandContext(context, 'Employee')).not.toThrow();
    expect(() => assertEmployeeV2CommandContext({ ...context, commandKey: 'not-stable' }, 'Employee')).toThrow(/stable lower-case GUID/);
    expect(() => assertEmployeeV2CommandContext({ ...context, workplan: { ...workplan, etag: '*' } }, 'Employee')).toThrow(/exact Workplan ETag/);
    expect(() => assertEmployeeV2CommandContext({ ...context, actor: { ...employee, personKey: 'OTHER' } }, 'Employee')).toThrow(/authenticated employee/);
  });

  it('accepts governed Core proposal fields but rejects protected authority and unresolved method inputs', () => {
    expect(() => validateEmployeeCoreContributionInputV2(additive)).not.toThrow();
    expect(() => validateEmployeeCoreContributionInputV2({
      ...additive, contributionUnit: 'schools'
    } as unknown as IEmployeeCoreContributionInputV2)).toThrow(/Protected Employee V2 field/);
    expect(() => validateEmployeeCoreContributionInputV2({
      ...additive, contributionMethod: 'AutomaticPercentage'
    } as unknown as IEmployeeCoreContributionInputV2)).toThrow(/approved value/);
    expect(() => validateEmployeeCoreContributionInputV2({ ...additive, quarterTargets: quarters.slice(0, 3) })).toThrow(/Exactly one separate Q1/);
  });

  it('fails closed for Shared, Weighted and Completion governance gaps', () => {
    expect(() => validateEmployeeCoreContributionInputV2({
      ...additive, contributionMethod: 'SharedTarget', annualTargetValue: undefined,
      annualTargetText: 'Shared delivery', quarterTargets: quarters.map(item => ({ quarter: item.quarter, targetText: 'Shared' })),
      sharedTargetRule: 'VisibleOnly', governanceReference: 'CONTROL-024'
    })).not.toThrow();
    expect(() => validateEmployeeCoreContributionInputV2({
      ...additive, contributionMethod: 'WeightedDenominator', annualTargetValue: undefined,
      annualTargetText: 'Weighted delivery', quarterTargets: quarters.map(item => ({ quarter: item.quarter, targetText: 'Weighted' })),
      denominatorNumerator: 10, denominatorValue: 0, denominatorUnit: 'schools',
      denominatorRuleReference: 'RULE', denominatorSourceReference: 'SOURCE'
    })).toThrow(/positive denominator/);
    expect(() => validateEmployeeCoreContributionInputV2({
      ...additive, contributionMethod: 'CompletionOversight', annualTargetValue: undefined,
      quarterTargets: quarters.map(item => ({ quarter: item.quarter, commitment: 'Deliver' }))
    })).toThrow(/What 100% looks like/);
  });

  it('keeps Equal derived, validates exact Custom 100 and rejects negative weights', () => {
    expect(() => validateEmployeeCoreWeightingInputV2({ mode: 'Equal' })).not.toThrow();
    expect(() => validateEmployeeCoreWeightingInputV2({ mode: 'Equal', customWeights: [{ kpiId: 'SO1-001', weight: 100 }] })).toThrow(/Automation-derived/);
    expect(() => validateEmployeeCoreWeightingInputV2({ mode: 'Custom', customWeights: [
      { kpiId: 'SO1-001', weight: 40 }, { kpiId: 'SO1-002', weight: 60 }
    ] })).not.toThrow();
    expect(() => validateEmployeeCoreWeightingInputV2({ mode: 'Custom', customWeights: [
      { kpiId: 'SO1-001', weight: -1 }, { kpiId: 'SO1-002', weight: 101 }
    ] })).toThrow(/values from 0 to 100/);
  });

  it('requires explicit zero-Personal treatment and never silently applies 90/0/10', () => {
    expect(() => validateEmployeeWorkplanDraftInputV2({
      coreCategoryWeight: 90, personalCategoryWeight: 0, behaviourCategoryWeight: 10,
      categoryWeightReason: 'No Personal KPI is agreed.', zeroPersonalProposal: {
        employeeReason: 'My role is fully covered by Core and Behaviours.',
        coreCategoryWeight: 90, personalCategoryWeight: 0, behaviourCategoryWeight: 10
      }
    })).not.toThrow();
    expect(() => validateEmployeeWorkplanDraftInputV2({
      coreCategoryWeight: 90, personalCategoryWeight: 0, behaviourCategoryWeight: 10,
      categoryWeightReason: 'No Personal KPI is agreed.'
    })).toThrow(/explicit employee zero-Personal proposal/);
  });

  it('accepts label-free Behaviour commitment content while protecting assessment ownership', () => {
    expect(() => validateEmployeeBehaviourCommitmentInputV2(behaviour)).not.toThrow();
    expect(() => validateEmployeeBehaviourCommitmentInputV2({
      ...behaviour, quarterRatings: { Q1: 4 }
    } as unknown as typeof behaviour)).toThrow(/Protected Employee V2 field/);
  });

  it('rejects a concatenated controlled suggestion key at the command boundary', () => {
    expect(() => validateEmployeeBehaviourCommitmentInputV2({
      ...behaviour,
      selectedSuggestionKeys: ['BHV-01-L1-01-L1-02']
    })).toThrow(/governed role-level/);
  });

  it('rejects a non-fixed Behaviour heading even when its supplied key has the same prefix', () => {
    expect(() => validateEmployeeBehaviourCommitmentInputV2({
      ...behaviour,
      behaviourId: 'BHV-99' as 'BHV-01',
      selectedSuggestionKeys: ['BHV-99-OBJ-01']
    })).toThrow(/fixed Behaviour/);
  });

  it.each([
    ['default-ignorable-only text', '\u200B'],
    ['a lone UTF-16 surrogate', '\uD800'],
    ['an interior control', 'Visible\u0000hidden'],
    ['text above the 100,000-character boundary', 'a'.repeat(100001)]
  ])('rejects unsafe commitment wording: %s', (_label, commitment) => {
    expect(() => validateEmployeeBehaviourCommitmentInputV2({
      ...behaviour,
      selectedSuggestionKeys: ['BHV-01-L1-01'],
      commitment
    })).toThrow(/visible commitment/);
  });

  it('accepts exact controlled keys, visible Unicode and exactly 100,000 commitment characters', () => {
    expect(() => validateEmployeeBehaviourCommitmentInputV2({
      ...behaviour,
      selectedSuggestionKeys: [1, 2, 3, 4, 5].map(index => `BHV-01-L1-0${index}`),
      commitment: 'Cricket 🏏 – cafe\u0301'
    })).not.toThrow();
    expect(() => validateEmployeeBehaviourCommitmentInputV2({
      ...behaviour,
      commitment: 'a'.repeat(100000)
    })).not.toThrow();
  });

  it('rejects duplicate, crossed Value and malformed role-level selections', () => {
    [
      ['BHV-01-L1-01', 'BHV-01-L1-01'],
      ['BHV-02-L1-01'],
      ['BHV-01-L1-00']
    ].forEach(selectedSuggestionKeys => {
      expect(() => validateEmployeeBehaviourCommitmentInputV2({
        ...behaviour,
        selectedSuggestionKeys
      })).toThrow(/governed role-level/);
    });
    expect(() => validateEmployeeBehaviourCommitmentInputV2({
      ...behaviour, selectedSuggestionKeys: ['BHV-01-L1-06']
    })).not.toThrow();
  });

  it('persists route-specific Recovery proposals without accepting a manager reforecast decision', () => {
    const update: IEmployeeQuarterUpdateInputV2 = {
      employeeActualValue: 45, employeeUpdate: 'Delivery is behind target.', contextMitigation: 'Partner capacity reduced.',
      recovery: {
        route: 'Reforecast', action: 'Propose a controlled target revision.', ownerPersonKey: 'PERSON-001',
        dueDate: '2027-02-20', nextReviewDate: '2027-02-27', proposedRevisedTarget: '80 schools',
        proposedRevisedDate: '2027-10-31', reforecastReason: 'Approved venue availability changed.'
      }
    };
    expect(() => validateEmployeeQuarterUpdateInputV2(update)).not.toThrow();
    expect(() => validateEmployeeQuarterUpdateInputV2({
      ...update, reforecastApprovalStatus: 'Approved'
    } as unknown as IEmployeeQuarterUpdateInputV2)).toThrow(/Protected Employee V2 field/);
  });

  it('maps only the retained canonical assets and the frozen SEC-002B command/receipt control plane', () => {
    expect(EMPLOYEE_V2_CANONICAL_LISTS).toEqual([
      'KCFKPI_Workplans', 'KCFKPI_WorkplanItems', 'KCFKPI_QuarterReviews',
      'KCFKPI_QuarterReviewItems', 'KCFKPI_Evidence', 'KCFKPI_Audit'
    ]);
    expect(EMPLOYEE_V2_CONTROL_PLANE_LISTS).toEqual([
      'KCFKPI_BehaviourFrameworkSets', 'KCFKPI_BehaviourFrameworkValues',
      'KCFKPI_PersonBehaviourAssignments',
      'KCFKPI_EmployeeCommands', 'KCFKPI_ManagerCommands', 'KCFKPI_CommandReceipts'
    ]);
    expect(EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES).toContain('UpsertCoreContributionV2');
    expect(EMPLOYEE_V2_MANAGER_COMMAND_TYPES).toContain('CreateWorkplanAmendmentV2');
    expect(EMPLOYEE_V2_PHYSICAL_ASSETS.find(asset => asset.listTitle === 'KCFKPI_WorkplanItems')?.fieldsUsed).toEqual(expect.arrayContaining([
      'ContributionMethod', 'Q1SuccessDefinition', 'WorkplanVersion', 'NonOverlapApproved',
      'BehaviourFrameworkVersion', 'BehaviourDescriptorSnapshot', 'BehaviourRatingLabelsSnapshotJSON'
    ]));
  });

  it('keeps every new V2 mutation behind command intake and canonical readback', () => {
    const transportSource = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'services', 'EmployeeWorkplanV2CommandTransport.ts'), 'utf8');
    const persistenceSource = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'services', 'SharePointEmployeeWorkplanV2PersistenceService.ts'), 'utf8');
    expect(transportSource).toContain("const EMPLOYEE_COMMANDS = 'KCFKPI_EmployeeCommands'");
    expect(transportSource).toContain("const MANAGER_COMMANDS = 'KCFKPI_ManagerCommands'");
    expect(transportSource).toContain("const RECEIPTS = 'KCFKPI_CommandReceipts'");
    expect((transportSource.match(/spHttpClient\.post\(/g) || [])).toHaveLength(1);
    expect(persistenceSource).not.toContain('spHttpClient.post(');
    expect(persistenceSource).toContain('this.transport.execute(request)');
    expect(persistenceSource).toContain('getWorkplanByKey');
    expect(persistenceSource).toContain('getQuarterByKey');
  });
});
