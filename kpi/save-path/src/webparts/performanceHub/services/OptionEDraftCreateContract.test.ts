import * as fs from 'fs';
import * as path from 'path';
import {
  OptionEDraftCreateContract, OptionEDraftCreateError,
  type IOptionEDraftCanonicalReadback, type IOptionEDraftCreateAuthority,
  type IOptionEDraftCreateInput, type IOptionEDraftCreateRequest,
  type IOptionEDraftNativeReceipt, type IOptionEDraftPerson
} from './OptionEDraftCreateContract';

const input = (email = 'alice@example.invalid', correlationKey = 'create:alice:2027'): IOptionEDraftCreateInput =>
  ({ authenticatedEmail: email, performanceYear: 2027, correlationKey });

const person = (email = 'alice@example.invalid', personKey = 'EMP-A', itemId = 11): IOptionEDraftCreateAuthority['people'][number] =>
  ({ itemId, email, personKey, managerPersonKey: 'MGR-1', active: true });

const authority = (): IOptionEDraftCreateAuthority => ({
  people: [person()], existing: [], ownDraftCreate: true, privateDraftReadback: true, rowVersionBefore: 0
});

const receipt = (): IOptionEDraftNativeReceipt => ({ itemId: 301, etag: '"1"', rowVersionToken: 1 });

const harness = (initial = authority()): {
  state: { authority: IOptionEDraftCreateAuthority; canonical?: IOptionEDraftCanonicalReadback };
  resolver: { resolve: jest.Mock };
  transport: { createOnce: jest.Mock; readCanonical: jest.Mock };
  contract: OptionEDraftCreateContract;
} => {
  const state: { authority: IOptionEDraftCreateAuthority; canonical?: IOptionEDraftCanonicalReadback } =
    { authority: initial };
  const resolver = { resolve: jest.fn(async (): Promise<IOptionEDraftCreateAuthority> => state.authority) };
  const transport = {
    createOnce: jest.fn(async (request: IOptionEDraftCreateRequest): Promise<IOptionEDraftNativeReceipt> => {
      state.canonical = { ...request.fields, ...receipt() };
      return receipt();
    }),
    readCanonical: jest.fn(async (): Promise<IOptionEDraftCanonicalReadback> => {
      if (!state.canonical) throw new Error('No canonical row');
      return state.canonical;
    })
  };
  return { state, resolver, transport, contract: new OptionEDraftCreateContract(resolver, transport, 50) };
};

const expectCode = async (operation: Promise<unknown>, code: string): Promise<void> => {
  await expect(operation).rejects.toMatchObject({ code });
};

type HostileOwnKey = 'data' | 'symbol' | 'accessor';
const hostileOwnKeys: readonly HostileOwnKey[] = ['data', 'symbol', 'accessor'];

const withHostileOwnKey = <T extends object>(value: T, kind: HostileOwnKey, onRead: () => void): T => {
  const expanded = { ...value } as T & Record<PropertyKey, unknown>;
  if (kind === 'data') Object.defineProperty(expanded, 'targetPersonKey', {
    enumerable: true, value: 'EMP-B'
  });
  else if (kind === 'symbol') Object.defineProperty(expanded, Symbol('targetPersonKey'), {
    enumerable: true, value: 'EMP-B'
  });
  else Object.defineProperty(expanded, 'targetPersonKey', { enumerable: true,
    get: (): string => { onRead(); return 'EMP-B'; } });
  return expanded;
};

const nullPrototypeRecord = <T extends object>(value: T): T => Object.assign(Object.create(null), value) as T;

type HostileArrayContainer = 'data' | 'symbol' | 'accessor' | 'spoofed-prototype';
const hostileArrayContainers: readonly HostileArrayContainer[] =
  ['data', 'symbol', 'accessor', 'spoofed-prototype'];

const withHostileArrayContainer = <T>(items: readonly T[], kind: HostileArrayContainer,
  onRead: () => void): T[] => {
  const expanded = [...items];
  if (kind === 'data') Object.defineProperty(expanded, 'delegatedRole', {
    enumerable: true, value: 'ADMIN'
  });
  else if (kind === 'symbol') Object.defineProperty(expanded, Symbol('delegatedRole'), {
    enumerable: true, value: 'ADMIN'
  });
  else if (kind === 'accessor') Object.defineProperty(expanded, 'delegatedRole', { enumerable: true,
    get: (): string => { onRead(); return 'ADMIN'; } });
  else {
    const prototype = Object.create(Array.prototype) as object;
    const spoofedArrayConstructor = { Array: (): void => undefined }.Array;
    Object.defineProperty(prototype, 'constructor', { value: spoofedArrayConstructor });
    Object.defineProperty(prototype, 'delegatedRole', {
      get: (): string => { onRead(); return 'ADMIN'; }
    });
    Object.setPrototypeOf(expanded, prototype);
  }
  return expanded;
};

describe('source-only Option E employee Draft Create/bind contract', () => {
  it('creates only an own private DRAFT and reports success after exact native readback', async () => {
    const h = harness();
    const result = await h.contract.create(input());
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.transport.readCanonical).toHaveBeenCalledWith(301);
    expect(h.transport.createOnce.mock.calls[0][0]).toEqual({
      idempotencyKey: 'EMP-A|2027', fields: {
        workplanKey: 'EMP-A|2027', personKey: 'EMP-A', managerPersonKey: 'MGR-1',
        performanceYear: 2027, state: 'DRAFT', draftSchemaVersion: 'demo.workplan-draft/v1',
        correlationKey: 'create:alice:2027', managerReviewEligible: false, goldEligible: false
      }
    });
    expect(result).toMatchObject({ itemId: 301, etag: '"1"', rowVersionToken: 1, recovered: false });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(['"native-1"', 'W/"native-weak-1"'])(
    'accepts an exact native entity tag %s', async etag => {
      const h = harness();
      h.transport.createOnce.mockImplementation(async (
        request: IOptionEDraftCreateRequest
      ): Promise<IOptionEDraftNativeReceipt> => {
        const native = { ...receipt(), etag };
        h.state.canonical = { ...request.fields, ...native };
        return native;
      });
      await expect(h.contract.create(input())).resolves.toMatchObject({ etag, recovered: false });
      expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
      expect(h.transport.readCanonical).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    '*', '* ', ' * ', ' "1"', '"1" ', '\u0000', 'abc', '""', '"a b"', '"a\tb"',
    '"a\u007Fb"', '"a"b"', 'w/"1"', 'W/"1', 'W/""', 'W/ "1"', 'W//"1"'
  ])('rejects an echoed malformed native entity tag %p and retains the rejection', async etag => {
    const h = harness();
    h.transport.createOnce.mockImplementation(async (
      request: IOptionEDraftCreateRequest
    ): Promise<IOptionEDraftNativeReceipt> => {
      const malformed = { ...receipt(), etag };
      h.state.canonical = { ...request.fields, ...malformed };
      return malformed;
    });
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.transport.readCanonical).toHaveBeenCalledTimes(1);
  });

  it('preserves exact null-prototype input, authority, Person, receipt and canonical records', async () => {
    const initial = nullPrototypeRecord({ ...authority(), people: [nullPrototypeRecord(person())] });
    const h = harness(initial);
    h.transport.createOnce.mockImplementation(async (
      request: IOptionEDraftCreateRequest
    ): Promise<IOptionEDraftNativeReceipt> => {
      h.state.canonical = nullPrototypeRecord({ ...request.fields, ...receipt() });
      return nullPrototypeRecord(receipt());
    });
    await expect(h.contract.create(nullPrototypeRecord(input()))).resolves.toMatchObject({
      itemId: 301, fields: { personKey: 'EMP-A', managerPersonKey: 'MGR-1', state: 'DRAFT' }
    });
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.transport.readCanonical).toHaveBeenCalledTimes(1);
  });

  it('preserves exact ordinary people and existing array containers', async () => {
    const create = harness({ ...authority(), people: [person()], existing: [] });
    await expect(create.contract.create(input())).resolves.toMatchObject({ recovered: false, itemId: 301 });
    expect(create.transport.createOnce).toHaveBeenCalledTimes(1);

    const recover = harness({ ...authority(), people: [person()], rowVersionBefore: 1,
      existing: [{ itemId: 301, correlationKey: 'create:alice:2027', personKey: 'EMP-A',
        performanceYear: 2027 }] });
    recover.state.canonical = { itemId: 301, etag: '"1"', rowVersionToken: 1,
      workplanKey: 'EMP-A|2027', personKey: 'EMP-A', managerPersonKey: 'MGR-1',
      performanceYear: 2027, state: 'DRAFT', draftSchemaVersion: 'demo.workplan-draft/v1',
      correlationKey: 'create:alice:2027', managerReviewEligible: false, goldEligible: false };
    await expect(recover.contract.create(input())).resolves.toMatchObject({ recovered: true, itemId: 301 });
    expect(recover.transport.createOnce).not.toHaveBeenCalled();
    expect(recover.transport.readCanonical).toHaveBeenCalledTimes(1);
  });

  it.each(hostileArrayContainers)(
    'rejects a people array container with %s authority before Create or getter execution',
    async kind => {
      let reads = 0;
      const people = withHostileArrayContainer([person()], kind, () => { reads++; });
      const h = harness({ ...authority(), people });
      await expectCode(h.contract.create(input()), 'IDENTITY_INVALID');
      expect(reads).toBe(0);
      expect(h.resolver.resolve).toHaveBeenCalledTimes(1);
      expect(h.transport.createOnce).not.toHaveBeenCalled();
      expect(h.transport.readCanonical).not.toHaveBeenCalled();
    }
  );

  it.each(hostileArrayContainers)(
    'rejects an existing array container with %s authority before Create or getter execution',
    async kind => {
      let reads = 0;
      const existing = withHostileArrayContainer([], kind, () => { reads++; });
      const h = harness({ ...authority(), existing });
      await expectCode(h.contract.create(input()), 'IDENTITY_INVALID');
      expect(reads).toBe(0);
      expect(h.resolver.resolve).toHaveBeenCalledTimes(1);
      expect(h.transport.createOnce).not.toHaveBeenCalled();
      expect(h.transport.readCanonical).not.toHaveBeenCalled();
    }
  );

  it('denies the exact SEC-PM57-A004-F01 expanded-authority probe before resolver or Create', async () => {
    const hostileInput = { ...input(), targetPersonKey: 'EMP-B' } as IOptionEDraftCreateInput;
    const hostilePerson = { ...person(), managerPersonKey: 'MGR-ATTACK', targetPersonKey: 'EMP-B',
      canManageAll: true } as IOptionEDraftPerson;
    const hostileAuthority = { ...authority(), people: [hostilePerson], targetPersonKey: 'EMP-B',
      delegatedRole: 'ADMIN' } as IOptionEDraftCreateAuthority;
    const h = harness(hostileAuthority);
    h.transport.createOnce.mockResolvedValue({ ...receipt(), writeScope: 'ALL_EMPLOYEES' });
    h.transport.readCanonical.mockResolvedValue({ itemId: 301, etag: '"1"', rowVersionToken: 1,
      workplanKey: 'EMP-A|2027', personKey: 'EMP-A', managerPersonKey: 'MGR-ATTACK', performanceYear: 2027,
      state: 'DRAFT', draftSchemaVersion: 'demo.workplan-draft/v1', correlationKey: 'create:alice:2027',
      managerReviewEligible: false, goldEligible: false, writeScope: 'ALL_EMPLOYEES'
    } as IOptionEDraftCanonicalReadback);
    await expectCode(h.contract.create(hostileInput), 'IDENTITY_INVALID');
    expect(h.resolver.resolve).not.toHaveBeenCalled();
    expect(h.transport.createOnce).not.toHaveBeenCalled();
    expect(h.transport.readCanonical).not.toHaveBeenCalled();
  });

  it.each(hostileOwnKeys)('rejects an extra %s key on input without getter, resolver or Create', async kind => {
    let reads = 0;
    const h = harness();
    const hostile = withHostileOwnKey(input(), kind, () => { reads++; });
    await expectCode(h.contract.create(hostile), 'IDENTITY_INVALID');
    expect(reads).toBe(0);
    expect(h.resolver.resolve).not.toHaveBeenCalled();
    expect(h.transport.createOnce).not.toHaveBeenCalled();
  });

  it.each(hostileOwnKeys)('rejects an extra %s key on resolver authority and People rows before Create', async kind => {
    for (const level of ['authority', 'person'] as const) {
      let reads = 0;
      const changed = level === 'authority'
        ? withHostileOwnKey(authority(), kind, () => { reads++; })
        : { ...authority(), people: [withHostileOwnKey(person(), kind, () => { reads++; })] };
      const h = harness(changed);
      await expectCode(h.contract.create(input()), 'IDENTITY_INVALID');
      expect(reads).toBe(0);
      expect(h.transport.createOnce).not.toHaveBeenCalled();
      expect(h.transport.readCanonical).not.toHaveBeenCalled();
    }
  });

  it.each(hostileOwnKeys)('rejects an extra %s key on an existing Draft before readback or Create', async kind => {
    let reads = 0;
    const existing = withHostileOwnKey({ itemId: 301, correlationKey: 'create:alice:2027',
      personKey: 'EMP-A', performanceYear: 2027 }, kind, () => { reads++; });
    const h = harness({ ...authority(), existing: [existing], rowVersionBefore: 1 });
    await expectCode(h.contract.create(input()), 'IDENTITY_INVALID');
    expect(reads).toBe(0);
    expect(h.transport.createOnce).not.toHaveBeenCalled();
    expect(h.transport.readCanonical).not.toHaveBeenCalled();
  });

  it.each(hostileOwnKeys)('rejects an extra %s key on the native receipt with zero second Create', async kind => {
    let reads = 0;
    const h = harness();
    h.transport.createOnce.mockImplementation(async (): Promise<IOptionEDraftNativeReceipt> =>
      withHostileOwnKey(receipt(), kind, () => { reads++; }));
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    expect(reads).toBe(0);
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.transport.readCanonical).not.toHaveBeenCalled();
  });

  it.each(hostileOwnKeys)('rejects an extra %s key on canonical readback with zero second Create', async kind => {
    let reads = 0;
    const h = harness();
    h.transport.readCanonical.mockImplementation(async (): Promise<IOptionEDraftCanonicalReadback> =>
      withHostileOwnKey(h.state.canonical!, kind, () => { reads++; }));
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    expect(reads).toBe(0);
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.transport.readCanonical).toHaveBeenCalledTimes(1);
  });

  it('separates two employees and cannot substitute foreign owner or manager', async () => {
    const h = harness();
    const alice = await h.contract.create(input());
    h.state.authority = { ...authority(), people: [person('bob@example.invalid', 'EMP-B', 12)] };
    const bob = await h.contract.create(input('bob@example.invalid', 'create:bob:2027'));
    expect(h.transport.createOnce.mock.calls.map(call => call[0].idempotencyKey)).toEqual(['EMP-A|2027', 'EMP-B|2027']);
    expect(alice.fields.personKey).toBe('EMP-A');
    expect(bob.fields.personKey).toBe('EMP-B');
    const foreign = harness({ ...authority(), people: [person('bob@example.invalid', 'EMP-B', 12)] });
    await expectCode(foreign.contract.create(input()), 'IDENTITY_INVALID');
    const substitutedManager = harness({ ...authority(), people: [{ ...person(), managerPersonKey: 'EMP-A' }] });
    await expectCode(substitutedManager.contract.create(input()), 'IDENTITY_INVALID');
    expect(foreign.transport.createOnce).not.toHaveBeenCalled();
    expect(substitutedManager.transport.createOnce).not.toHaveBeenCalled();
  });

  it('rejects missing, duplicate and inactive People identity before Create', async () => {
    for (const people of [[], [person(), person('alice@example.invalid', 'EMP-X', 12)],
      [{ ...person(), active: false }]]) {
      const h = harness({ ...authority(), people });
      await expect(h.contract.create(input())).rejects.toBeInstanceOf(OptionEDraftCreateError);
      expect(h.transport.createOnce).not.toHaveBeenCalled();
    }
  });

  it('rejects missing ACL capability, stale baseline and an existing foreign Draft', async () => {
    for (const changed of [
      { ownDraftCreate: false }, { privateDraftReadback: false }, { rowVersionBefore: 2 },
      { existing: [{ itemId: 17, correlationKey: 'other:create', personKey: 'EMP-X', performanceYear: 2027 }] }
    ]) {
      const h = harness({ ...authority(), ...changed });
      await expect(h.contract.create(input())).rejects.toBeInstanceOf(OptionEDraftCreateError);
      expect(h.transport.createOnce).not.toHaveBeenCalled();
    }
  });

  it('recovers an exact idempotent retry by private canonical read, without Create', async () => {
    const h = harness({ ...authority(), rowVersionBefore: 1,
      existing: [{ itemId: 301, correlationKey: 'create:alice:2027', personKey: 'EMP-A', performanceYear: 2027 }] });
    h.state.canonical = { itemId: 301, etag: '"1"', rowVersionToken: 1,
      workplanKey: 'EMP-A|2027', personKey: 'EMP-A', managerPersonKey: 'MGR-1',
      performanceYear: 2027, state: 'DRAFT', draftSchemaVersion: 'demo.workplan-draft/v1',
      correlationKey: 'create:alice:2027', managerReviewEligible: false, goldEligible: false };
    await expect(h.contract.create(input())).resolves.toMatchObject({ recovered: true, itemId: 301 });
    expect(h.transport.createOnce).not.toHaveBeenCalled();
  });

  it('handles a create race by re-resolving only the exact correlation', async () => {
    const h = harness();
    h.transport.createOnce.mockImplementation(async (): Promise<never> => {
      h.state.authority = { ...authority(), rowVersionBefore: 1,
        existing: [{ itemId: 301, correlationKey: 'create:alice:2027', personKey: 'EMP-A', performanceYear: 2027 }] };
      h.state.canonical = { ...receipt(), workplanKey: 'EMP-A|2027', personKey: 'EMP-A',
        managerPersonKey: 'MGR-1', performanceYear: 2027, state: 'DRAFT',
        draftSchemaVersion: 'demo.workplan-draft/v1', correlationKey: 'create:alice:2027',
        managerReviewEligible: false, goldEligible: false };
      throw new OptionEDraftCreateError('CREATE_CONFLICT');
    });
    await expect(h.contract.create(input())).resolves.toMatchObject({ recovered: true });
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.resolver.resolve).toHaveBeenCalledTimes(2);
  });

  it('does not treat a foreign or unresolved conflict as a successful retry', async () => {
    const h = harness();
    h.transport.createOnce.mockImplementation(async (): Promise<never> => {
      h.state.authority = { ...authority(), rowVersionBefore: 1,
        existing: [{ itemId: 302, correlationKey: 'foreign:create', personKey: 'EMP-B', performanceYear: 2027 }] };
      throw new OptionEDraftCreateError('CREATE_CONFLICT');
    });
    await expectCode(h.contract.create(input()), 'CREATE_CONFLICT');
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.transport.readCanonical).not.toHaveBeenCalled();
  });

  it('fails closed on an interrupted Create and never issues a second Create', async () => {
    const h = harness();
    h.transport.createOnce.mockImplementation((): Promise<never> => new Promise(() => undefined));
    await expectCode(h.contract.create(input()), 'CREATE_UNCERTAIN');
    await expectCode(h.contract.create(input()), 'CREATE_UNCERTAIN');
    await expectCode(h.contract.create(input('alice@example.invalid', 'create:other:2027')), 'CREATE_UNCERTAIN');
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
    expect(h.transport.readCanonical).not.toHaveBeenCalled();
  });

  it('rejects canonical owner, manager, status, eligibility and native-version mismatch', async () => {
    const mutations: Array<Partial<IOptionEDraftCanonicalReadback>> = [
      { personKey: 'EMP-B' }, { managerPersonKey: 'MGR-X' }, { state: 'Submitted' as 'DRAFT' },
      { managerReviewEligible: true as false }, { goldEligible: true as false },
      { itemId: 302 }, { etag: '"2"' }, { rowVersionToken: 0 }, { correlationKey: 'other:create' }
    ];
    for (const changed of mutations) {
      const h = harness();
      h.transport.readCanonical.mockImplementation(async (): Promise<IOptionEDraftCanonicalReadback> =>
        ({ ...h.state.canonical!, ...changed }));
      await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    }
  });

  it('rejects denied readback and failed transport without success feedback or fallback', async () => {
    const denied = harness();
    denied.transport.readCanonical.mockRejectedValue(new Error('ACL denied'));
    await expectCode(denied.contract.create(input()), 'READBACK_DENIED');
    const failed = harness();
    failed.transport.createOnce.mockRejectedValue(new Error('offline'));
    await expectCode(failed.contract.create(input()), 'CREATE_UNCERTAIN');
    expect(failed.transport.readCanonical).not.toHaveBeenCalled();
  });

  it('rejects missing native receipt and missing canonical readback', async () => {
    const noReceipt = harness();
    noReceipt.transport.createOnce.mockResolvedValue(undefined);
    await expectCode(noReceipt.contract.create(input()), 'READBACK_MISMATCH');
    const noCanonical = harness();
    noCanonical.transport.readCanonical.mockResolvedValue(undefined);
    await expectCode(noCanonical.contract.create(input()), 'READBACK_MISMATCH');
  });

  it('rejects a changing input year before authority resolution or Create', async () => {
    let reads = 0;
    const changing = input();
    Object.defineProperty(changing, 'performanceYear', { enumerable: true,
      get: (): number => ++reads <= 3 ? 2027 : 100000 });
    const h = harness();
    await expectCode(h.contract.create(changing), 'IDENTITY_INVALID');
    expect(reads).toBe(0);
    expect(h.resolver.resolve).not.toHaveBeenCalled();
    expect(h.transport.createOnce).not.toHaveBeenCalled();
  });

  it('rejects a changing personKey getter before Create', async () => {
    let reads = 0;
    const changing = { ...person() };
    Object.defineProperty(changing, 'personKey', { enumerable: true,
      get: (): string => ++reads <= 5 ? 'EMP-A' : 'EMP-X' });
    const h = harness({ ...authority(), people: [changing] });
    await expectCode(h.contract.create(input()), 'IDENTITY_INVALID');
    expect(reads).toBe(0);
    expect(h.transport.createOnce).not.toHaveBeenCalled();
  });

  it('rejects inherited capability flags with no own authority', async () => {
    const inherited = { ...authority() };
    delete (inherited as Partial<IOptionEDraftCreateAuthority>).ownDraftCreate;
    delete (inherited as Partial<IOptionEDraftCreateAuthority>).privateDraftReadback;
    Object.setPrototypeOf(inherited, { ownDraftCreate: true, privateDraftReadback: true });
    const h = harness(inherited);
    await expectCode(h.contract.create(input()), 'IDENTITY_INVALID');
    expect(h.transport.createOnce).not.toHaveBeenCalled();
  });

  it('rejects an own accessor capability even when it returns true', async () => {
    const accessors = { ...authority() };
    let reads = 0;
    Object.defineProperty(accessors, 'ownDraftCreate', { enumerable: true,
      get: (): boolean => { reads++; return true; } });
    const h = harness(accessors);
    await expectCode(h.contract.create(input()), 'IDENTITY_INVALID');
    expect(reads).toBe(0);
    expect(h.transport.createOnce).not.toHaveBeenCalled();
  });

  it('rejects non-plain and trapping authority records before Create', async () => {
    const nonPlainInput = Object.assign(new Date(), input()) as IOptionEDraftCreateInput;
    const h = harness();
    await expectCode(h.contract.create(nonPlainInput), 'IDENTITY_INVALID');
    const customPerson = Object.assign(Object.create({ inheritedOwner: 'EMP-X' }) as object, person()) as IOptionEDraftPerson;
    const custom = harness({ ...authority(), people: [customPerson] });
    await expectCode(custom.contract.create(input()), 'IDENTITY_INVALID');
    const trapped = harness();
    trapped.state.authority = new Proxy(authority(), {
      getOwnPropertyDescriptor: (): never => { throw new Error('trapped authority'); }
    });
    await expectCode(trapped.contract.create(input()), 'IDENTITY_INVALID');
    expect(h.transport.createOnce).not.toHaveBeenCalled();
    expect(custom.transport.createOnce).not.toHaveBeenCalled();
    expect(trapped.transport.createOnce).not.toHaveBeenCalled();
  });

  it('rejects accessor canonical readback without a verified result', async () => {
    const h = harness();
    h.transport.readCanonical.mockImplementation(async (): Promise<IOptionEDraftCanonicalReadback> => {
      const readback = { ...h.state.canonical! };
      Object.defineProperty(readback, 'personKey', { enumerable: true, get: (): string => 'EMP-A' });
      return readback;
    });
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    expect(h.transport.createOnce).toHaveBeenCalledTimes(1);
  });

  it('rejects an accessor native receipt before private readback', async () => {
    const h = harness();
    h.transport.createOnce.mockImplementation(async (): Promise<IOptionEDraftNativeReceipt> => {
      const native = receipt();
      Object.defineProperty(native, 'itemId', { enumerable: true, get: (): number => 301 });
      return native;
    });
    await expectCode(h.contract.create(input()), 'READBACK_MISMATCH');
    expect(h.transport.readCanonical).not.toHaveBeenCalled();
  });

  it('remains unbound to the shipped WebPart and protected gateway', () => {
    const root = path.resolve('src/webparts/performanceHub');
    for (const file of ['PerformanceHubWebPart.ts', 'components/IntegratedPerformanceHub.tsx',
      'services/OptionEProtectedDraftGateway.ts', 'services/OptionEProductionDataServiceFacade.ts']) {
      expect(fs.readFileSync(path.join(root, file), 'utf8')).not.toContain('OptionEDraftCreateContract');
    }
    const ui = fs.readFileSync(path.join(root, 'components/IntegratedPerformanceHub.tsx'), 'utf8');
    expect(ui).toContain('Save and Submit stay unavailable');
    expect(ui).toContain('readOptionEDraftCreateAdmission(optionEDraftCreateIntegration).admitted');
    expect(ui).toContain('Start My Workplan is unavailable. Nothing has been saved or created.');
  });
});
