import { OPTION_E_CONTENT_PROCESSOR_MASKS, OPTION_E_NATIVE_ROLES } from './OptionEWorkplanPhysicalSchema';
import { OPTION_E_PRIVATE_DRAFT_OWNER_ROLE, isExactOptionEPrivateDraftOwnerRole,
  hasExactOptionEPrivateDraftOwnerEffectivePermissions, hasExactOptionEPrivateDraftOwnerItemPermissions } from './OptionEPrivateDraftOwnerPermissions';

const role = () => ({ id: 107, ...OPTION_E_PRIVATE_DRAFT_OWNER_ROLE });
const item = () => ({ Id: 71, UniqueId: 'd81bd8c7-87a3-4031-82f6-6ef258ddc775', HasUniqueRoleAssignments: true,
  EffectiveBasePermissions: { High: '0', Low: '196613' } });

describe('ordinary-owner private Draft permission contract', () => {
  it('contains the documented Edit Items dependencies without changing any legacy processor role', () => {
    expect(role()).toMatchObject({ name: 'DEMO KPI Private Draft Owner v1', roleTypeKind: 0, high: 0, low: 1 + 4 + 65536 + 131072 });
    expect(OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.low & (2 | 8 | 33554432)).toBe(0);
    expect(OPTION_E_NATIVE_ROLES.find(value => value.name === 'DEMO KPI Option E Draft Editor v1')?.low).toBe(5);
    expect(OPTION_E_NATIVE_ROLES.some(value => value.name === OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.name)).toBe(false);
    expect(OPTION_E_CONTENT_PROCESSOR_MASKS.DEMOAPP_Workplans).toBe(5);
  });

  it('requires the exact custom definition and captured positive native role ID', () => {
    expect(isExactOptionEPrivateDraftOwnerRole(role())).toBe(true);
    for (const change of [{ id: 0 }, { id: -1 }, { id: 1.5 }, { id: Number.MAX_SAFE_INTEGER + 1 },
      { name: 'DEMO KPI Option E Draft Editor v1' }, { name: 'Edit' }, { roleTypeKind: 6 }, { high: 1 }, { low: 5 },
      { low: 196615 }, { low: 196621 }, { low: 196613 + 33554432 }]) {
      expect(isExactOptionEPrivateDraftOwnerRole({ ...role(), ...change })).toBe(false);
    }
    expect(isExactOptionEPrivateDraftOwnerRole(undefined)).toBe(false);
  });

  it('accepts only the complete exact effective tuple in canonical native decimal form', () => {
    expect(hasExactOptionEPrivateDraftOwnerEffectivePermissions({ High: 0, Low: 196613 })).toBe(true);
    expect(hasExactOptionEPrivateDraftOwnerEffectivePermissions({ High: '0', Low: '196613' })).toBe(true);
    for (const value of [undefined, null, [], {}, { High: 0 }, { Low: 196613 },
      { High: false, Low: 196613 }, { High: '00', Low: '196613' }, { High: 0, Low: '0196613' },
      { High: 0, Low: '196613.0' }, { High: 0, Low: '0x30005' }, { High: 0, Low: ' 196613' },
      { High: 0, Low: 5 }, { High: 0, Low: 65541 }, { High: 0, Low: 131077 },
      { High: 0, Low: 196615 }, { High: 0, Low: 196621 }, { High: 0, Low: 196613 + 33554432 },
      { High: 1, Low: 196613 }, { High: 2147483647, Low: 4294967295 }]) {
      expect(hasExactOptionEPrivateDraftOwnerEffectivePermissions(value)).toBe(false);
    }
  });

  it('rejects inherited metadata, accessors, cross-item identity, nonunique ACLs and unsupported envelopes', () => {
    const exact = item();
    const check = (value: unknown) => hasExactOptionEPrivateDraftOwnerItemPermissions(value, exact.Id, exact.UniqueId);
    expect(check(exact)).toBe(true);
    for (const value of [undefined, null, [], Object.create(exact), { ...exact, Id: 72 }, { ...exact, Id: '71' },
      { ...exact, UniqueId: 'other' }, { ...exact, HasUniqueRoleAssignments: false },
      { ...exact, HasUniqueRoleAssignments: 'true' }, { ...exact, EffectiveBasePermissions: undefined },
      { ...exact, d: exact }, { ...exact, results: [exact] }, { ...exact, '@odata.nextLink': '' },
      { ...exact, 'odata.nextLink': null }, { ...exact, __next: undefined }]) expect(check(value)).toBe(false);
    const getter = jest.fn(() => ({ High: '0', Low: '196613' }));
    const accessor = { ...exact }; Object.defineProperty(accessor, 'EffectiveBasePermissions', { get: getter });
    expect(check(accessor)).toBe(false); expect(getter).not.toHaveBeenCalled();
    expect(hasExactOptionEPrivateDraftOwnerEffectivePermissions(Object.create(exact.EffectiveBasePermissions))).toBe(false);
  });
});
