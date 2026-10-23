import { cloneC2b } from '../TestPilotCommandAdmissionC2b';

function freezeJsonValue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(freezeJsonValue);
  return Object.freeze(value);
}

/**
 * Takes an owned canonical JSON copy and recursively freezes it. Tenant execution inputs are deliberately
 * JSON-only; rejecting any other value prevents a caller-owned prototype, Map, Set or class instance from
 * becoming part of an already validated execution binding.
 */
export function immutableTenantInput<T>(value: T): T {
  return freezeJsonValue(cloneC2b(value)) as T;
}
