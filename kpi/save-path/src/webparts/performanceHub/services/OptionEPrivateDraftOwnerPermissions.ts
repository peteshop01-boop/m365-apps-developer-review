import type { IOptionENativeRoleReadback } from './OptionEWorkplanAclPlan';

/**
 * Ordinary-owner browser access to one uniquely secured private Draft item only.
 * Separate from the legacy Draft Editor role used by the control processor.
 * Edit Items depends on View Items, View Pages and Open:
 * https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels#permissions-and-dependent-permissions
 * Native bits: https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-wssfo3/6cb7384a-f3be-47fe-b051-3f2b14a8119d
 * This definition is not a native grant or permission to bind it at a parent scope.
 */
export const OPTION_E_PRIVATE_DRAFT_OWNER_ROLE = Object.freeze({
  name: 'DEMO KPI Private Draft Owner v1', roleTypeKind: 0, high: 0, low: 196613,
  rights: Object.freeze(['ViewListItems', 'EditListItems', 'Open', 'ViewPages']),
  explicitlyAbsent: Object.freeze(['AddListItems', 'DeleteListItems', 'ManagePermissions'])
});

/** A reviewed native receipt must identify one exact positive-ID custom role. */
export const isExactOptionEPrivateDraftOwnerRole = (role: IOptionENativeRoleReadback | undefined): boolean =>
  Boolean(role && Number.isSafeInteger(role.id) && role.id > 0
    && role.name === OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.name
    && role.roleTypeKind === OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.roleTypeKind
    && role.high === OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.high
    && role.low === OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.low);

const nativeUint32 = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF ? value : undefined;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 0xFFFFFFFF ? parsed : undefined;
};

/** Exact equality, never a subset-mask grant or an allowance for arbitrary extra bits. */
export const hasExactOptionEPrivateDraftOwnerEffectivePermissions = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const high = Object.getOwnPropertyDescriptor(value, 'High');
  const low = Object.getOwnPropertyDescriptor(value, 'Low');
  return Boolean(high && Object.prototype.hasOwnProperty.call(high, 'value')
    && low && Object.prototype.hasOwnProperty.call(low, 'value')
    && nativeUint32(high.value) === OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.high
    && nativeUint32(low.value) === OPTION_E_PRIVATE_DRAFT_OWNER_ROLE.low);
};

/** Missing, inherited, wrapped or continued metadata cannot establish this item's authority. */
export const hasExactOptionEPrivateDraftOwnerItemPermissions = (
  value: unknown, itemId: number, uniqueId: string
): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ['d', 'results', '@odata.nextLink', 'odata.nextLink', '__next'].some(key => key in value)) return false;
  const own = (key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value as unknown : undefined;
  };
  return own('Id') === itemId && own('UniqueId') === uniqueId && own('HasUniqueRoleAssignments') === true
    && hasExactOptionEPrivateDraftOwnerEffectivePermissions(own('EffectiveBasePermissions'));
};
