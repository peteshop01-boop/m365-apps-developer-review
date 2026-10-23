jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { IEmployeeV2CommandReceipt } from '../models/EmployeeWorkplanV2PersistenceModels';
import {
  DisabledEmployeeWorkplanV2C2bCommandGateway,
  LocallyValidatedEmployeeWorkplanV2C2bCommandGateway,
  type IEmployeeV2C2bAnnualCommandRequest
} from './EmployeeWorkplanV2C2bCommandGateway';
import {
  C2B_CONTRACT_VERSION,
  C2B_LIST_CAPABILITY_REQUIREMENTS,
  C2B_SCHEMA_REVISION,
  hashC2bCanonical,
  preflightC2bComposition
} from './TestPilotCommandAdmissionC2b';

const ids = C2B_LIST_CAPABILITY_REQUIREMENTS.map((_, index) =>
  `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const ready = preflightC2bComposition({
  contractVersion: C2B_CONTRACT_VERSION, enabled: true, environmentKind: 'NonProduction',
  environmentId: 'LOCAL-TEST', siteUrl: 'https://tenant.example.invalid/sites/kcf-test',
  siteCollectionId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53',
  webId: '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818', connectionReference: 'LOCAL-REFERENCE',
  lists: C2B_LIST_CAPABILITY_REQUIREMENTS.map((requirement, index) => ({
    purpose: requirement.purpose, listId: ids[index], schemaRevision: C2B_SCHEMA_REVISION
  }))
}, {
  environmentKind: 'NonProduction', environmentId: 'LOCAL-TEST',
  siteUrl: 'https://tenant.example.invalid/sites/kcf-test',
  siteCollectionId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53',
  webId: '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818', connectionReference: 'LOCAL-REFERENCE',
  lists: C2B_LIST_CAPABILITY_REQUIREMENTS.map((requirement, index) => ({
    purpose: requirement.purpose, listId: ids[index], schemaRevision: C2B_SCHEMA_REVISION,
    indexedFields: [...requirement.indexedFields], uniqueFields: [...requirement.uniqueFields],
    versioningEnabled: true, foldersEnabled: requirement.foldersEnabled, permissionCapability: requirement.permissionCapability
  }))
});

const key = (index: number): string => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const base = { personKey: 'PERSON-001', performanceYear: 2027 };
const requests: IEmployeeV2C2bAnnualCommandRequest[] = [
  { ...base, route: 'Employee', commandKey: key(1), commandType: 'CreateWorkplanDraft', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', payload: {} },
  { ...base, route: 'Employee', commandKey: key(2), commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', expectedRowVersionToken: 4, expectedHeaderETag: '"header-4"',
    payload: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, categoryWeightReason: undefined } },
  { ...base, route: 'Employee', commandKey: key(3), commandType: 'UpsertCoreContributionV2', subjectType: 'WorkplanItem',
    subjectKey: 'CORE-001', expectedRowVersionToken: 4,
    expectedHeaderETag: '"header-4"', expectedItemETag: '"core-1"', payload: {
      kpiId: 'KPI-001', role: 'DeliveryLead', contributionMethod: 'AdditiveDirect', annualTargetValue: 100,
      quarterTargets: [{ quarter: 'Q1', targetValue: 25 }, { quarter: 'Q2', targetValue: 50 },
        { quarter: 'Q3', targetValue: 75 }, { quarter: 'Q4', targetValue: 100 }], displayOrder: 1, activeInWorkplan: true
    } },
  { ...base, route: 'Employee', commandKey: key(4), commandType: 'UpsertPersonalItemV2', subjectType: 'WorkplanItem',
    subjectKey: 'PERSONAL-001', expectedRowVersionToken: 4,
    expectedHeaderETag: '"header-4"', expectedItemETag: '"personal-1"', payload: {
      wording: 'Synthetic outcome', measure: 'Completion', unitLabel: '%', displayOrder: 1, activeInWorkplan: true
    } },
  { ...base, route: 'Employee', commandKey: key(10), commandType: 'UpsertBehaviourCommitmentV2', subjectType: 'WorkplanItem',
    subjectKey: 'BEHAVIOUR-V2-ITEM-001', expectedRowVersionToken: 4,
    expectedHeaderETag: '"header-4"', payload: {
      behaviourId: 'BHV-01', selectedSuggestionKeys: ['BHV-01-OBJ-01'], commitment: 'Synthetic commitment',
      periodCommitments: [{ period: 'Q1', commitment: 'Q1' }, { period: 'Q2', commitment: 'Q2' },
        { period: 'Q3', commitment: 'Q3' }, { period: 'Q4', commitment: 'Q4' }],
      displayOrder: 1, activeInWorkplan: true
    } },
  { ...base, route: 'Employee', commandKey: key(5), commandType: 'SetCoreWeightingV2', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', expectedRowVersionToken: 4, expectedHeaderETag: '"header-4"', payload: { mode: 'Equal' } },
  { ...base, route: 'Employee', commandKey: key(6), commandType: 'SubmitWorkplan', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', expectedRowVersionToken: 4, expectedHeaderETag: '"header-4"', payload: {} },
  { ...base, route: 'Manager', commandKey: key(7), commandType: 'RequestWorkplanChanges', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', expectedRowVersionToken: 4, expectedHeaderETag: '"header-4"',
    payload: { reason: 'Clarify the measurable outcome.' } },
  { ...base, route: 'Manager', commandKey: key(8), commandType: 'ApproveAndLockWorkplan', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', expectedRowVersionToken: 4, expectedHeaderETag: '"header-4"', payload: {} },
  { ...base, route: 'Manager', commandKey: key(9), commandType: 'CreateWorkplanAmendmentV2', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', expectedRowVersionToken: 4, expectedHeaderETag: '"header-4"',
    payload: { reason: 'Controlled correction.', controlReference: 'CONTROL-KPI-016' } }
];

const receipt = (request: IEmployeeV2C2bAnnualCommandRequest,
  patch: Partial<IEmployeeV2CommandReceipt> = {}): IEmployeeV2CommandReceipt => {
  const purpose = request.route === 'Employee' ? 'EmployeeCommands' : 'ManagerCommands';
  const sourceListId = ids[C2B_LIST_CAPABILITY_REQUIREMENTS.findIndex(item => item.purpose === purpose)];
  const itemKeys = request.subjectType === 'WorkplanItem' ? [request.subjectKey] : [];
  const role = request.commandType === 'CreateWorkplanAmendmentV2' ? 'SystemAdmin'
    : request.route === 'Manager' ? 'Manager' : 'Employee';
  return {
    receiptKey: `${sourceListId}|17|1.0`, sourceListId, sourceItemId: 17, sourceItemVersion: '1.0',
    commandKey: request.commandKey, commandType: request.commandType, subjectType: request.subjectType,
    subjectKey: request.subjectKey, personKey: request.personKey, performanceYear: request.performanceYear,
    authenticatedActorEmail: role === 'Employee' ? 'employee@example.invalid'
      : role === 'Manager' ? 'manager@example.invalid' : 'admin@example.invalid',
    authenticatedActorPersonKey: role === 'Employee' ? request.personKey : role === 'Manager' ? 'MANAGER-001' : 'ADMIN-001',
    effectiveRole: role, processedByEmail: 'processor@example.invalid', processedAt: '2026-09-12T08:00:00Z',
    outcome: 'Accepted', validationCode: 'ACCEPTED', message: 'Terminal accepted after stable canonical proof.',
    processedPayloadSha256: hashC2bCanonical(JSON.parse(JSON.stringify(request.payload))),
    resultKeysJson: JSON.stringify([{ workplanKey: 'PERSON-001|2027',
      rowVersionToken: request.commandType === 'CreateWorkplanDraft' ? 2 : (request.expectedRowVersionToken || 0) + 2,
      etag: '"canonical-final"', itemKeys }]),
    auditKeysJson: JSON.stringify([`${request.commandKey}|AUDIT`]), correlationKey: `PROCESSOR-${request.commandKey}`,
    flowRunReference: `RUN-${request.commandKey}`, ...patch
  };
};

describe('A016 settled annual C2b gateway composition', () => {
  it('stops every command before submission when C2b is absent or disabled', async () => {
    const submit = jest.fn();
    for (const request of requests) {
      await expect(new DisabledEmployeeWorkplanV2C2bCommandGateway().executeAnnualCommand(request))
        .rejects.toThrow(/C2B_DISABLED/);
      const disabled = new LocallyValidatedEmployeeWorkplanV2C2bCommandGateway(
        { ready: false, code: 'C2B_DISABLED', reasons: ['disabled'] }, submit
      );
      await expect(disabled.executeAnnualCommand(request)).rejects.toThrow(/C2B_DISABLED/);
    }
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(requests.map(request => [request.commandType, request] as const))(
    'returns %s only after exact envelope, terminal receipt and expected+2 canonical proof reconcile',
    async (_commandType, request) => {
      const submit = jest.fn(async (submitted: IEmployeeV2C2bAnnualCommandRequest) => ({
        receipt: receipt(submitted), replayed: false
      }));
      const result = await new LocallyValidatedEmployeeWorkplanV2C2bCommandGateway(ready, submit)
        .executeAnnualCommand(request);
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({
        commandKey: request.commandKey, commandType: request.commandType, payload: JSON.parse(JSON.stringify(request.payload))
      }));
      expect(result).toMatchObject({
        receipt: { outcome: 'Accepted', commandKey: request.commandKey }, replayed: false,
        canonicalProof: { workplanKey: 'PERSON-001|2027', etag: '"canonical-final"' }
      });
    }
  );

  it('rejects queued/Held/failed, forged source/role, stale state and incomplete proof without success', async () => {
    const request = requests[2];
    const run = async (nextReceipt: IEmployeeV2CommandReceipt,
      nextRequest: IEmployeeV2C2bAnnualCommandRequest = request): Promise<void> => {
      const gateway = new LocallyValidatedEmployeeWorkplanV2C2bCommandGateway(ready,
        async () => ({ receipt: nextReceipt, replayed: false }));
      await gateway.executeAnnualCommand(nextRequest);
    };
    await expect(run(receipt(request, { outcome: 'RecoveryHold' }))).rejects.toThrow(/terminal accepted/);
    await expect(run(receipt(request, { outcome: 'Failed' }))).rejects.toThrow(/terminal accepted/);
    await expect(run(receipt(request, { outcome: 'Rejected' }))).rejects.toThrow(/terminal accepted/);
    await expect(run(receipt(request, { effectiveRole: 'Manager' }))).rejects.toThrow(/terminal accepted/);
    await expect(run(receipt(request, { sourceListId: ids[0] }))).rejects.toThrow(/terminal accepted/);
    await expect(run(receipt(request, { resultKeysJson: JSON.stringify([{
      workplanKey: 'PERSON-001|2027', rowVersionToken: 6, etag: '"canonical-final"', itemKeys: []
    }]) }))).rejects.toThrow(/affected item/);
    await expect(run(receipt(request), { ...request, expectedETag: '*' } as unknown as IEmployeeV2C2bAnnualCommandRequest))
      .rejects.toThrow(/exact admitted envelope/);
  });

  it('admits Behaviour v02 but rejects protected/scoring and unknown fields before submission', async () => {
    const submit = jest.fn();
    const gateway = new LocallyValidatedEmployeeWorkplanV2C2bCommandGateway(ready, submit);
    const behaviourRequest = requests.find(request => request.commandType === 'UpsertBehaviourCommitmentV2')!;
    await expect(gateway.executeAnnualCommand({ ...behaviourRequest, payload: {
      ...behaviourRequest.payload, targetRating: 3
    } })).rejects.toThrow(/unknown or missing admitted-envelope/);
    await expect(gateway.executeAnnualCommand({ ...requests[1], payload: {
      ...requests[1].payload, protectedServerField: true
    } })).rejects.toThrow(/unknown or missing admitted-envelope/);
    expect(submit).not.toHaveBeenCalled();
  });
});
