import {
  approveDeliveryWeightOverride,
  bindAuthoritativeDeliveryWeightOverrideCapability,
  type IDeliveryWeightOverrideCapability,
  type IDeliveryWeightOverrideRequest
} from './CategoryWeightingPolicy';

const subject = (): {
  personKey: string;
  managerPersonKey: string;
  managerEmail: string;
} => ({
  personKey: 'employee-001',
  managerPersonKey: 'manager-001',
  managerEmail: 'manager.one@example.invalid'
});

const managerCapability = (): IDeliveryWeightOverrideCapability =>
  bindAuthoritativeDeliveryWeightOverrideCapability({
    personKey: 'manager-001',
    email: 'manager.one@example.invalid',
    appRoles: ['Manager'],
    active: true
  }, subject());

const adminCapability = (): IDeliveryWeightOverrideCapability =>
  bindAuthoritativeDeliveryWeightOverrideCapability({
    personKey: 'admin-001',
    email: 'admin.one@example.invalid',
    appRoles: ['SystemAdmin'],
    active: true
  }, subject());

const request = (patch: Partial<IDeliveryWeightOverrideRequest> = {}): IDeliveryWeightOverrideRequest => ({
  auditKey: 'approval-new',
  existingAuditKeys: ['approval-used'],
  current: { core: 70, impact: 30 },
  proposed: { core: 60, impact: 40 },
  reason: 'Approved operational balance',
  subjectPersonKey: 'employee-001',
  actorEmail: 'manager.one@example.invalid',
  actorRole: 'Manager',
  actorPersonKey: 'manager-001',
  assignedManagerPersonKey: 'manager-001',
  eventAt: '2026-09-21T02:45:00.000Z',
  sourceVersion: 7,
  state: 'Draft',
  ...patch
});

const accessorRequest = (
  field: keyof IDeliveryWeightOverrideRequest,
  value: unknown
): { source: IDeliveryWeightOverrideRequest; reads: () => number } => {
  const source = request();
  let reads = 0;
  Object.defineProperty(source, field, {
    enumerable: true,
    configurable: true,
    get: () => { reads += 1; return value; }
  });
  return { source, reads: () => reads };
};

describe('SEC-R034-F02 delivery override boundary repair', () => {
  it('rejects self-asserted System Admin authority without any bound capability', () => {
    const result = approveDeliveryWeightOverride(request({
      auditKey: 'self-admin',
      actorEmail: 'attacker@example.invalid',
      actorRole: 'SystemAdmin',
      actorPersonKey: 'attacker',
      assignedManagerPersonKey: undefined
    }));
    expect(result.accepted).toBe(false);
    expect(result.audit).toBeUndefined();
    expect(result.errors.join(' ')).toMatch(/authoritative, bound/);
  });

  it('rejects forged and copied capability objects', () => {
    const issued = managerCapability();
    const copied = { ...issued } as unknown as IDeliveryWeightOverrideCapability;
    const forged = {} as IDeliveryWeightOverrideCapability;
    expect(approveDeliveryWeightOverride(request(), copied).accepted).toBe(false);
    expect(approveDeliveryWeightOverride(request(), forged).accepted).toBe(false);
    expect(approveDeliveryWeightOverride(request(), issued).accepted).toBe(true);
  });

  it('derives exact Manager/SystemAdmin authority from canonical People projections', () => {
    expect(() => bindAuthoritativeDeliveryWeightOverrideCapability({
      personKey: 'manager-001', email: 'manager.one@example.invalid', appRoles: ['Manager'], active: false
    }, subject())).toThrow(/active Manager or System Admin/);
    expect(() => bindAuthoritativeDeliveryWeightOverrideCapability({
      personKey: 'manager-other', email: 'other@example.invalid', appRoles: ['Manager'], active: true
    }, subject())).toThrow(/exact assigned manager/);
    expect(() => bindAuthoritativeDeliveryWeightOverrideCapability({
      personKey: 'ambiguous', email: 'ambiguous@example.invalid', appRoles: ['Manager', 'SystemAdmin'], active: true
    }, subject())).toThrow(/one active Manager or System Admin/);

    const admin = approveDeliveryWeightOverride(request({
      auditKey: 'admin-approved',
      actorEmail: 'admin.one@example.invalid',
      actorRole: 'SystemAdmin',
      actorPersonKey: 'admin-001',
      assignedManagerPersonKey: undefined
    }), adminCapability());
    expect(admin).toEqual(expect.objectContaining({ accepted: true }));
    expect(admin.audit).toEqual(expect.objectContaining({
      actorEmail: 'admin.one@example.invalid', actorRole: 'SystemAdmin'
    }));
  });

  it('rejects a custom-prototype request before inherited authority is consumed', () => {
    const inherited = Object.create(request({ actorRole: 'SystemAdmin' })) as IDeliveryWeightOverrideRequest;
    const result = approveDeliveryWeightOverride(inherited, adminCapability());
    expect(result.accepted).toBe(false);
    expect(result.audit).toBeUndefined();
    expect(result.errors.join(' ')).toMatch(/custom or null prototype/);
  });

  it('rejects the replay-key accessor without executing its getter', () => {
    const hostile = accessorRequest('auditKey', 'approval-used');
    const result = approveDeliveryWeightOverride(hostile.source, managerCapability());
    expect(result.accepted).toBe(false);
    expect(result.audit).toBeUndefined();
    expect(hostile.reads()).toBe(0);
  });

  it.each([
    ['actorRole', 'SystemAdmin'],
    ['actorEmail', 'forged@example.invalid'],
    ['reason', ''],
    ['eventAt', 'not-a-time'],
    ['sourceVersion', 0],
    ['state', 'Locked']
  ] as Array<[keyof IDeliveryWeightOverrideRequest, unknown]>)(
    'rejects the %s accessor before validation/audit with zero getter execution', (field, value) => {
      const hostile = accessorRequest(field, value);
      const result = approveDeliveryWeightOverride(hostile.source, managerCapability());
      expect(result.accepted).toBe(false);
      expect(result.audit).toBeUndefined();
      expect(hostile.reads()).toBe(0);
    }
  );

  it('materialises proposed Proxy descriptors once and never consumes its get trap', () => {
    let proposedReads = 0;
    const target = request();
    const hostile = new Proxy(target, {
      get: (source, property, receiver): unknown => {
        if (property === 'proposed') {
          proposedReads += 1;
          return proposedReads < 3 ? { core: 60, impact: 40 } : { core: 200, impact: -100 };
        }
        return Reflect.get(source, property, receiver) as unknown;
      }
    });
    const result = approveDeliveryWeightOverride(hostile, managerCapability());
    expect(result).toEqual(expect.objectContaining({ accepted: true, weights: { core: 60, impact: 40 } }));
    expect(result.audit?.after).toEqual({ core: 60, impact: 40 });
    expect(proposedReads).toBe(0);
  });

  it('binds replay, identity, weights and audit to one immutable snapshot', () => {
    const source = request();
    const result = approveDeliveryWeightOverride(source, managerCapability());
    expect(result.accepted).toBe(true);
    source.existingAuditKeys = ['approval-new'];
    source.proposed = { core: 200, impact: -100 };
    source.actorEmail = 'forged@example.invalid';
    source.reason = '';
    source.eventAt = 'not-a-time';
    source.sourceVersion = 0;
    source.state = 'Locked';
    expect(result.weights).toEqual({ core: 60, impact: 40 });
    expect(result.audit).toEqual(expect.objectContaining({
      auditKey: 'approval-new',
      actorEmail: 'manager.one@example.invalid',
      actorRole: 'Manager',
      reason: 'Approved operational balance',
      eventAt: '2026-09-21T02:45:00.000Z',
      sourceVersion: 7,
      resultingState: 'Draft',
      after: { core: 60, impact: 40 }
    }));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.weights)).toBe(true);
    expect(Object.isFrozen(result.audit)).toBe(true);
    expect(Object.isFrozen(result.audit?.after)).toBe(true);

    const replayed = approveDeliveryWeightOverride(request({ existingAuditKeys: ['approval-new'] }), managerCapability());
    expect(replayed.accepted).toBe(false);
    expect(replayed.audit).toBeUndefined();
  });
});
