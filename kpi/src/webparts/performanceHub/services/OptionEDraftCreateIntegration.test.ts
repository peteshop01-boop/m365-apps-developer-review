import {
  createOptionEDraftCreateIntegration,
  OptionEDraftCreateIntegrationError,
  type IOptionEDraftCreateBindingCapability,
  type IOptionEDraftCreateIntegrationInputs
} from './OptionEDraftCreateIntegration';
import {
  OptionEDraftCreateError,
  type IOptionEDraftCanonicalReadback,
  type IOptionEDraftCreateAuthority,
  type IOptionEDraftCreateInput,
  type IOptionEDraftCreateRequest,
  type IOptionEDraftNativeReceipt
} from './OptionEDraftCreateContract';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';

const input = (correlationKey = 'create:alice:2027'): IOptionEDraftCreateInput => ({
  authenticatedEmail: 'alice@example.invalid', performanceYear: 2027, correlationKey
});

const authority = (): IOptionEDraftCreateAuthority => ({
  people: [{ itemId: 11, email: 'alice@example.invalid', personKey: 'EMP-A',
    managerPersonKey: 'MGR-1', active: true }],
  existing: [], ownDraftCreate: true, privateDraftReadback: true, rowVersionBefore: 0
});

const binding = (): IOptionEDraftCreateBindingCapability => ({
  bindings: OPTION_E_WORKPLAN_LIST_BINDINGS,
  physicalIdentityVerified: true,
  privateItemAclVerified: true,
  physicalSchemaVerified: true,
  atomicCreateVerified: true,
  nativeReceiptVerified: true,
  privateReadbackVerified: true,
  trustedProcessorReceiptVerified: true,
  protectedState: 'Draft',
  transitionStatus: 'Ready'
});

const harness = (): {
  inputs: IOptionEDraftCreateIntegrationInputs;
  createOnce: jest.Mock;
  readCanonical: jest.Mock;
} => {
  let canonical: IOptionEDraftCanonicalReadback | undefined;
  const createOnce = jest.fn(async (request: IOptionEDraftCreateRequest): Promise<IOptionEDraftNativeReceipt> => {
    canonical = { ...request.fields, itemId: 301, etag: '"1"', rowVersionToken: 1 };
    return { itemId: 301, etag: '"1"', rowVersionToken: 1 };
  });
  const readCanonical = jest.fn(async (): Promise<IOptionEDraftCanonicalReadback> => {
    if (!canonical) throw new Error('No canonical Draft');
    return canonical;
  });
  return { createOnce, readCanonical, inputs: {
    authorityResolver: { resolve: jest.fn(async (): Promise<IOptionEDraftCreateAuthority> => authority()) },
    createOnlyTransport: { createOnce, readCanonical },
    bindingCapability: binding()
  } };
};

describe('Option E Draft Create production integration', () => {
  it('creates one synthetic own private Draft only after every protected Draft/Ready capability is injected', async () => {
    const h = harness();
    const route = createOptionEDraftCreateIntegration(h.inputs);
    expect(route.admission).toEqual({ admitted: true, code: 'ADMITTED' });
    await expect(route.create(input())).resolves.toMatchObject({
      itemId: 301, etag: '"1"', rowVersionToken: 1, recovered: false,
      fields: { personKey: 'EMP-A', managerPersonKey: 'MGR-1', state: 'DRAFT',
        managerReviewEligible: false, goldEligible: false }
    });
    expect(h.createOnce).toHaveBeenCalledTimes(1);
    expect(h.readCanonical).toHaveBeenCalledTimes(1);
    expect(Object.getPrototypeOf(route)).toBeNull();
    expect(Object.isFrozen(route)).toBe(true);
  });

  it('disables Create when inputs or any physical capability are absent', async () => {
    const h = harness();
    const absent = createOptionEDraftCreateIntegration();
    expect(absent.admission).toEqual({ admitted: false, code: 'INPUTS_ABSENT' });
    await expect(absent.create(input())).rejects.toBeInstanceOf(OptionEDraftCreateIntegrationError);

    const changed = { ...binding(), privateItemAclVerified: false } as unknown as IOptionEDraftCreateBindingCapability;
    const unverified = createOptionEDraftCreateIntegration({ ...h.inputs, bindingCapability: changed });
    expect(unverified.admission).toEqual({ admitted: false, code: 'BINDING_UNVERIFIED' });
    await expect(unverified.create(input())).rejects.toMatchObject({ code: 'BINDING_UNVERIFIED' });
    expect(h.createOnce).not.toHaveBeenCalled();
  });

  it('rejects inherited, extra and accessor dependencies without invoking hostile authority', async () => {
    const h = harness();
    const inheritedResolver = Object.create({ resolve: jest.fn(async () => authority()) });
    const inherited = createOptionEDraftCreateIntegration({ ...h.inputs, authorityResolver: inheritedResolver });
    expect(inherited.admission.code).toBe('RESOLVER_UNVERIFIED');

    const extraTransport = { ...h.inputs.createOnlyTransport, update: jest.fn() };
    const extra = createOptionEDraftCreateIntegration({ ...h.inputs, createOnlyTransport: extraTransport });
    expect(extra.admission.code).toBe('TRANSPORT_UNVERIFIED');

    let reads = 0;
    const hostile = { createOnlyTransport: h.inputs.createOnlyTransport, bindingCapability: binding() } as Record<string, unknown>;
    Object.defineProperty(hostile, 'authorityResolver', { enumerable: true,
      get: (): unknown => { reads++; return h.inputs.authorityResolver; } });
    const accessor = createOptionEDraftCreateIntegration(hostile);
    expect(accessor.admission.code).toBe('INPUTS_UNVERIFIED');
    await expect(accessor.create(input())).rejects.toMatchObject({ code: 'INPUTS_UNVERIFIED' });
    expect(reads).toBe(0);
    expect(h.createOnce).not.toHaveBeenCalled();
  });

  it('retains uncertain retry state and issues zero second Create calls', async () => {
    const h = harness();
    h.createOnce.mockRejectedValue(new Error('Connection outcome unknown'));
    const route = createOptionEDraftCreateIntegration(h.inputs);
    await expect(route.create(input())).rejects.toMatchObject({ code: 'CREATE_UNCERTAIN' });
    await expect(route.create(input())).rejects.toMatchObject({ code: 'CREATE_UNCERTAIN' });
    await expect(route.create(input('create:other:2027'))).rejects.toMatchObject({ code: 'CREATE_UNCERTAIN' });
    expect(h.createOnce).toHaveBeenCalledTimes(1);
    expect(h.readCanonical).not.toHaveBeenCalled();
  });

  it('does not admit success without the same native receipt and private canonical readback', async () => {
    const h = harness();
    h.readCanonical.mockResolvedValue({ itemId: 302, etag: '"2"', rowVersionToken: 1,
      workplanKey: 'EMP-A|2027', personKey: 'EMP-A', managerPersonKey: 'MGR-1', performanceYear: 2027,
      state: 'DRAFT', draftSchemaVersion: 'kcf.workplan-draft/v1', correlationKey: 'create:alice:2027',
      managerReviewEligible: false, goldEligible: false });
    const route = createOptionEDraftCreateIntegration(h.inputs);
    await expect(route.create(input())).rejects.toBeInstanceOf(OptionEDraftCreateError);
    await expect(route.create(input())).rejects.toMatchObject({ code: 'READBACK_MISMATCH' });
    expect(h.createOnce).toHaveBeenCalledTimes(1);
  });
});
