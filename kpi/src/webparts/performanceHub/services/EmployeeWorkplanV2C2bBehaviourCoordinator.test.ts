jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_V2_ROLE_TIERS, BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourV2RoleTier, type IBehaviourLibraryV2Record } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { createEmployeeWorkplanV2C2bAnnualPlan } from './EmployeeWorkplanV2C2bAnnualCoordinator';
import type {
  IC2bNativePlanningObservations,
  IC2bNativeSourceObservation,
  IEmployeeWorkplanV2C2bNativeAdapter
} from './EmployeeWorkplanV2C2bNativeAdapter';
import type { IEmployeeV2AnnualAdmissionEnvelope } from './EmployeeWorkplanV2CommandTransport';
import type { C2bListAclImage } from './TestPilotCommandAdmissionC2b';
import type { C2bTrustedBehaviourV2Observations, C2bTrustedCommandSource } from './TestPilotCommandAdmissionC2bHandlers';

const source: C2bTrustedCommandSource = {
  listId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53', itemId: 29, itemVersion: '1.0'
};
const payload = {
  behaviourId: 'BHV-01', selectedSuggestionKeys: ['BHV-01-L1-01'], commitment: 'Synthetic commitment',
  periodCommitments: ['Q1', 'Q2', 'Q3', 'Q4'].map(period => ({ period, commitment: `Synthetic ${period}` })),
  displayOrder: 1, activeInWorkplan: true
};
const envelope = {
  schemaVersion: 'kcf.kpi.test-command.v2',
  binding: { commandKey: '88549f9a-40c4-46af-a371-c095f1e3af5b', commandType: 'UpsertBehaviourCommitmentV2',
    subjectType: 'WorkplanItem', subjectKey: 'BEHAVIOUR-V2-ITEM-001', personKey: 'PERSON-001',
    performanceYear: 2027, workplanKey: 'PERSON-001|2027' },
  expected: { header: { presence: 'Present', token: '5', etag: '"header-5"' },
    item: { presence: 'Absent' } }, payload
} as unknown as IEmployeeV2AnnualAdmissionEnvelope;
const observation = (payloadValue: typeof payload = payload): IC2bNativeSourceObservation => ({ source,
  sourceETag: '"source-1"', sourceRowVersion: '1.0', route: 'Employee', authorEmail: 'employee@example.invalid',
  envelope: { ...envelope, payload: payloadValue } as unknown as IEmployeeV2AnnualAdmissionEnvelope });
const catalogueRecord = (): IBehaviourLibraryV2Record => ({
  behaviourObjectiveKey: 'BHV-01-L1-01', behaviourKey: 'BHV-01',
  frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier: 'IC_OFFICER', sourceRoleLevelCode: 'L1',
  published: true, productionSafe: true, synthetic: false, objectiveTitle: 'Synthetic trusted suggestion',
  objectiveDescription: 'Synthetic trusted description', suggestedMeasure: 'Synthetic measure',
  suggestedUnit: 'Synthetic unit', suggestedEvidence: 'Synthetic evidence', active: true, sortOrder: 1,
  effectiveFrom: '2026-01-01'
});
const behaviourV2 = (): C2bTrustedBehaviourV2Observations => ({
  framework: { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, published: true, immutable: true,
    ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS.map(option => ({ ...option })),
    values: BEHAVIOUR_V2_VALUE_IDS.map((valueId, index) => ({ frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      valueId, title: `Synthetic Value ${index + 1}`, corporateValue: `Synthetic Corporate Value ${index + 1}`,
      descriptors: Object.fromEntries(BEHAVIOUR_V2_ROLE_TIERS.map(tier => [tier,
        `SYNTHETIC TEST ONLY ${valueId} ${tier}`])) as Record<BehaviourV2RoleTier, string> })) },
  assignment: { personKey: 'PERSON-001', frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    roleTier: 'IC_OFFICER', cadence: 'Quarterly', periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'] },
  catalogue: { complete: true, frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    applicableDate: '2026-09-12', records: [catalogueRecord()] }
});
const acl = (listPurpose: 'Workplans' | 'WorkplanItems'): C2bListAclImage => ({ listPurpose, acl: {
  containerKey: 'PERSON-001', breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
  allowedPrincipals: [], revokedPrincipalKeys: []
} });
const planning = (): IC2bNativePlanningObservations => {
  const fields = { WorkplanKey: 'PERSON-001|2027', PersonKey: 'PERSON-001', PerformanceYear: 2027,
    ManagerPersonKey: 'PERSON-002', ManagerEmail: 'manager@example.invalid', State: 'Draft',
    AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', WorkplanVersion: 1, RowVersionToken: 5 };
  return {
    employee: { personKey: 'PERSON-001', email: 'employee@example.invalid', displayName: 'Synthetic Employee',
      active: true, roles: ['Employee'], managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid' },
    manager: { personKey: 'PERSON-002', email: 'manager@example.invalid', displayName: 'Synthetic Manager',
      active: true, roles: ['Employee', 'Manager'], managerPersonKey: null, managerEmail: null },
    actor: { personKey: 'PERSON-001', email: 'employee@example.invalid', displayName: 'Synthetic Employee',
      active: true, roles: ['Employee'], managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid' },
    configuration: { schemaRevision: 'c2b-annual-v2', performanceYear: 2027,
      behaviourContractVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, initialState: 'Draft',
      initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready', processorPrincipalKey: 'PROCESSOR-001',
      adminPrincipalKeys: ['ADMIN-001'] },
    header: { workplanKey: 'PERSON-001|2027', personKey: 'PERSON-001', performanceYear: 2027,
      etag: '"header-5"', rowVersionToken: 5, state: 'Draft', accessState: 'EmployeeEdit',
      transitionStatus: 'Ready', fields }, currentItem: undefined, allItems: [],
    currentAcls: [acl('Workplans'), acl('WorkplanItems')], allocatedItemKey: envelope.binding.subjectKey,
    controlCases: [], behaviourV2: behaviourV2()
  };
};

const adapter = (second = observation(), includeBehaviour = true, first = observation(),
  mutatePlanning?: (value: IC2bNativePlanningObservations) => void): {
  value: IEmployeeWorkplanV2C2bNativeAdapter;
  planningRead: jest.Mock;
  writes: jest.Mock[];
} => {
  const planningRead = jest.fn(async () => {
    const result = planning();
    if (!includeBehaviour) delete (result as Partial<typeof result>).behaviourV2;
    mutatePlanning?.(result);
    return result;
  });
  const writes = Array.from({ length: 9 }, () => jest.fn());
  const value = {
    readCommandSourceTwice: jest.fn(async () => ({ first, second })),
    readPlanningObservations: planningRead,
    compareExchangeJournal: writes[0], persistEffectState: writes[1], compareExchangeWorkplan: writes[2],
    compareExchangeWorkplanItem: writes[3], consumeAuthoritativeControlCase: writes[4],
    reconcileEmployeeContainerAcl: writes[5], appendAudit: writes[6], createImmutableReceipt: writes[7],
    reconcileReceiptActorRead: writes[8]
  } as unknown as IEmployeeWorkplanV2C2bNativeAdapter;
  return { value, planningRead, writes };
};

const expectRejectedWithoutMutation = async (mock: ReturnType<typeof adapter>, message: RegExp,
  expectedPlanningReads = 1): Promise<void> => {
  const result = await createEmployeeWorkplanV2C2bAnnualPlan(mock.value, source, '2026-09-12T18:00:00Z')
    .then(value => ({ outcome: 'PLANNED', value }), error => ({ outcome: 'REJECTED',
      message: error instanceof Error ? error.message : String(error) }));
  expect(result).toMatchObject({ outcome: 'REJECTED', message: expect.stringMatching(message) });
  expect(JSON.stringify(result)).not.toMatch(/Saved|Accepted|Duplicate/);
  expect(mock.planningRead).toHaveBeenCalledTimes(expectedPlanningReads);
  expect(mock.writes.every(write => write.mock.calls.length === 0)).toBe(true);
};

describe('Behaviour v02 coordinator admission and trusted dispatch', () => {
  it('rejects forged or mixed paired-source versions before planning or effects', async () => {
    const forged = { ...observation(), commandSource: { version: 'kcf.kpi.command-source.v1' } } as IC2bNativeSourceObservation;
    await expectRejectedWithoutMutation(adapter(forged, true, forged), /COMMAND_PAIR_VERSION/, 0);
    await expectRejectedWithoutMutation(adapter(observation(), true, forged), /mixed command source versions/, 0);
  });
  it('dispatches the tenth route only after the source double read and trusted framework assignment', async () => {
    const mock = adapter();
    const result = await createEmployeeWorkplanV2C2bAnnualPlan(mock.value, source, '2026-09-12T18:00:00Z');
    expect(result.commandType).toBe('UpsertBehaviourCommitmentV2');
    expect(result.intendedImage.items[0].fields.BehaviourRoleTierSnapshot).toBe('IC_OFFICER');
    expect(mock.planningRead).toHaveBeenCalledTimes(1);
    expect(mock.writes.every(write => write.mock.calls.length === 0)).toBe(true);
  });

  it('rejects a changed second read before planning or any canonical write', async () => {
    const changed = observation(); changed.envelope = { ...changed.envelope,
      payload: { ...payload, commitment: 'Changed second read' } };
    const mock = adapter(changed);
    await expectRejectedWithoutMutation(mock, /changed between its two reads/, 0);
  });

  it('fails closed when the adapter omits governed Behaviour observations', async () => {
    const mock = adapter(observation(), false);
    await expectRejectedWithoutMutation(mock, /framework\/person assignment\/catalogue is missing/);
  });

  it('fails closed when the trusted Behaviour observation omits its mandatory catalogue', async () => {
    const mock = adapter(observation(), true, observation(), value => {
      const behaviour = value.behaviourV2 as Partial<C2bTrustedBehaviourV2Observations>;
      delete behaviour.catalogue;
    });
    await expectRejectedWithoutMutation(mock, /catalogue observation is missing/);
  });

  it('rejects a stale trusted catalogue date after both reads and before every mutation boundary', async () => {
    const mock = adapter(observation(), true, observation(), value => {
      value.behaviourV2!.catalogue!.applicableDate = '2026-09-11';
    });
    await expectRejectedWithoutMutation(mock, /applicable date is invalid or stale/);
  });

  it.each(['BHV-01-L2-01', 'BHV-01-L3-05', 'BHV-01-OBJ-01'])(
    'rejects hostile newly introduced key %s after reads without a false success or mutation', async key => {
      const hostile = observation({ ...payload, selectedSuggestionKeys: [key] });
      const mock = adapter(hostile, true, hostile);
      await expectRejectedWithoutMutation(mock, /legacy|crossed Value|unavailable|untrusted/);
    }
  );
});
