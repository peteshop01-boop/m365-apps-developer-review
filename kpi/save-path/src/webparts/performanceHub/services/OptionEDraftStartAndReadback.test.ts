import { createOptionEDraftCreateIntegration } from './OptionEDraftCreateIntegration';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';
import { startAndOpenVerifiedDraft } from './OptionEDraftStartAndReadback';
import type { IOptionEDraftCanonicalRecord, IOptionEDraftGateway } from './OptionEDraftSharePointGateway';

const year = 2026;
const workplanKey = 'PERSON-1|2026';
const correlationKey = 'START-PERSON-1-2026';
const fields = {
  workplanKey, personKey: 'PERSON-1', managerPersonKey: 'MANAGER-1', performanceYear: year,
  state: 'DRAFT' as const, draftSchemaVersion: 'demo.workplan-draft/v1' as const, correlationKey,
  managerReviewEligible: false as const, goldEligible: false as const
};
const input = { authenticatedEmail: 'employee@example.invalid', performanceYear: year, correlationKey };
const binding = {
  workplanKey, personKey: 'PERSON-1', performanceYear: year, workplanItemId: 7,
  workplanEtag: '"1"', rowVersionToken: 1, draftItemId: 9,
  draftSchemaVersion: 'demo.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
  email: input.authenticatedEmail
};
const record = (override: Record<string, unknown> = {}): IOptionEDraftCanonicalRecord =>
  ({ itemId: 9, binding: { ...binding, ...override } } as unknown as IOptionEDraftCanonicalRecord);

const admitted = () => {
  const createOnce = jest.fn(async () => ({ itemId: 7, etag: '"1"', rowVersionToken: 1 }));
  const readCanonical = jest.fn(async () => ({ itemId: 7, etag: '"1"', rowVersionToken: 1, ...fields }));
  const create = createOptionEDraftCreateIntegration({
    authorityResolver: {
      resolve: async () => ({
        people: [{ itemId: 2, email: input.authenticatedEmail, personKey: 'PERSON-1',
          managerPersonKey: 'MANAGER-1', active: true }],
        existing: [], ownDraftCreate: true, privateDraftReadback: true, rowVersionBefore: 0
      })
    },
    createOnlyTransport: { createOnce, readCanonical },
    bindingCapability: {
      bindings: OPTION_E_WORKPLAN_LIST_BINDINGS,
      physicalIdentityVerified: true, privateItemAclVerified: true, physicalSchemaVerified: true,
      atomicCreateVerified: true, nativeReceiptVerified: true, privateReadbackVerified: true,
      trustedProcessorReceiptVerified: true, protectedState: 'Draft', transitionStatus: 'Ready'
    }
  });
  return { create, createOnce, readCanonical };
};
const gateway = (stored: IOptionEDraftCanonicalRecord) => {
  const read = jest.fn(async () => stored);
  return { route: { read } as unknown as IOptionEDraftGateway, read };
};

describe('Start Workplan must reopen exact protected private Draft before showing success', () => {
  it('refuses an unconnected runtime before any private SharePoint read', async () => {
    const route = gateway(record());
    await expect(startAndOpenVerifiedDraft(createOptionEDraftCreateIntegration(), route.route, input))
      .rejects.toThrow(/not connected/);
    expect(route.read).not.toHaveBeenCalled();
  });
  it('allows exactly matched trusted creation plus protected private Draft readback', async () => {
    const create = admitted(), route = gateway(record());
    const canonical = await startAndOpenVerifiedDraft(create.create, route.route, input);
    expect(canonical.itemId).toBe(9);
    expect(create.createOnce).toHaveBeenCalledTimes(1);
    expect(create.readCanonical).toHaveBeenCalledWith(7);
    expect(route.read).toHaveBeenCalledWith({ performanceYear: year });
  });
  it.each([
    { workplanEtag: '"2"' },
    { workplanItemId: 8 },
    { rowVersionToken: 3 },
    { personKey: 'ANOTHER-EMPLOYEE' },
    { draftSchemaVersion: 'UNKNOWN' },
    { state: 'Submitted' }
  ])('rejects mismatched persisted control %p rather than claiming Saved', async (changed) => {
    const create = admitted(), route = gateway(record(changed));
    await expect(startAndOpenVerifiedDraft(create.create, route.route, input))
      .rejects.toThrow(/does not match/);
    expect(create.createOnce).toHaveBeenCalledTimes(1);
  });
});
