/**
 * Canonicalises untrusted domain input without reading a supplied property.
 * Descriptor inspection does not invoke JavaScript getters. Stable data values
 * are copied recursively into inert frozen arrays and plain objects.
 */

export class UnsafeBoundaryInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UnsafeBoundaryInputError';
    Object.setPrototypeOf(this, UnsafeBoundaryInputError.prototype);
  }
}

type CanonicalPrimitive = string | number | boolean | undefined;

const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
const arrayIndexPattern = /^(0|[1-9]\d*)$/;

const fail = (label: string, detail: string): never => {
  throw new UnsafeBoundaryInputError(`${label} is not safe plain own data: ${detail}`);
};

const sameKeys = (left: readonly PropertyKey[], right: readonly PropertyKey[]): boolean =>
  left.length === right.length && left.every((key, index) => Object.is(key, right[index]));

const sameDescriptor = (left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean => {
  if (!left || !right) return false;
  const leftData = Object.prototype.hasOwnProperty.call(left, 'value');
  const rightData = Object.prototype.hasOwnProperty.call(right, 'value');
  if (leftData !== rightData || left.enumerable !== right.enumerable
    || left.configurable !== right.configurable) return false;
  return leftData
    ? left.writable === right.writable && Object.is(left.value, right.value)
    : Object.is(left.get, right.get) && Object.is(left.set, right.set);
};

interface IStableReflection {
  prototype: object;
  keys: string[];
  descriptors: Record<string, PropertyDescriptor>;
}

const stableReflection = (value: object, label: string): IStableReflection => {
  let firstPrototype: object;
  let firstKeys: PropertyKey[];
  let firstDescriptors: Record<string, PropertyDescriptor>;
  let secondPrototype: object;
  let secondKeys: PropertyKey[];
  let secondDescriptors: Record<string, PropertyDescriptor>;
  try {
    firstPrototype = Object.getPrototypeOf(value) as object;
    firstKeys = Reflect.ownKeys(value);
    firstDescriptors = Object.getOwnPropertyDescriptors(value);
    secondPrototype = Object.getPrototypeOf(value) as object;
    secondKeys = Reflect.ownKeys(value);
    secondDescriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(label, 'reflection failed.');
  }
  if (firstPrototype !== secondPrototype || !sameKeys(firstKeys, secondKeys)) {
    return fail(label, 'reflection changed while the boundary was inspected.');
  }
  if (firstKeys.some(key => typeof key !== 'string')) return fail(label, 'symbol properties are not allowed.');
  const stringKeys = firstKeys as string[];
  if (stringKeys.some(key => !sameDescriptor(firstDescriptors[key], secondDescriptors[key]))) {
    return fail(label, 'property descriptors changed while the boundary was inspected.');
  }
  return { prototype: firstPrototype, keys: stringKeys, descriptors: firstDescriptors };
};

const primitive = (value: unknown): value is CanonicalPrimitive => value === undefined
  || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const canonicalise = (
  value: unknown,
  label: string,
  completed: WeakMap<object, unknown>,
  visiting: WeakSet<object>
): unknown => {
  if (primitive(value)) return value;
  if (typeof value !== 'object') return fail(label, 'only JSON-like primitive, array and object values are allowed.');
  const source = value as object;
  if (visiting.has(source)) return fail(label, 'cyclic input is not allowed.');
  if (completed.has(source)) return completed.get(source);

  const reflected = stableReflection(source, label);
  if (Array.isArray(source)) {
    if (reflected.prototype !== Array.prototype) return fail(label, 'a custom array prototype is not allowed.');
    const lengthDescriptor = reflected.descriptors.length;
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
      return fail(label, 'the array length descriptor is invalid.');
    }
    const length = lengthDescriptor.value as number;
    const indexKeys = reflected.keys.filter(key => key !== 'length');
    if (indexKeys.some(key => !arrayIndexPattern.test(key) || Number(key) >= length)
      || indexKeys.length !== length) return fail(label, 'array holes or extra properties are not allowed.');
    const result: unknown[] = new Array(length);
    visiting.add(source);
    for (let index = 0; index < length; index += 1) {
      const descriptor = reflected.descriptors[String(index)];
      if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        visiting.delete(source);
        return fail(`${label}[${index}]`, 'an accessor or non-enumerable item is not allowed.');
      }
      result[index] = canonicalise(descriptor.value, `${label}[${index}]`, completed, visiting);
    }
    visiting.delete(source);
    const frozen = Object.freeze(result);
    completed.set(source, frozen);
    return frozen;
  }

  if (reflected.prototype !== Object.prototype) return fail(label, 'a custom or null prototype is not allowed.');
  const result: Record<string, unknown> = {};
  visiting.add(source);
  reflected.keys.forEach(key => {
    const descriptor = reflected.descriptors[key];
    if (dangerousKeys.has(key)) return fail(label, `the ${key} property is not allowed.`);
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return fail(`${label}.${key}`, 'accessor and non-enumerable properties are not allowed.');
    }
    Object.defineProperty(result, key, {
      value: canonicalise(descriptor.value, `${label}.${key}`, completed, visiting),
      enumerable: true,
      writable: false,
      configurable: false
    });
  });
  visiting.delete(source);
  const frozen = Object.freeze(result);
  completed.set(source, frozen);
  return frozen;
};

const assertAllowedKeys = (value: object, allowedKeys: readonly string[], label: string): void => {
  const allowed = new Set(allowedKeys);
  const extra = Object.keys(value).filter(key => !allowed.has(key));
  if (extra.length > 0) fail(label, `unexpected properties are present: ${extra.join(', ')}.`);
};

export const canonicalisePlainRecord = <T extends object>(
  value: T,
  label: string,
  allowedKeys?: readonly string[]
): Readonly<T> => {
  const snapshot = canonicalise(value, label, new WeakMap<object, unknown>(), new WeakSet<object>());
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return fail(label, 'a plain object is required.');
  if (allowedKeys) assertAllowedKeys(snapshot, allowedKeys, label);
  return snapshot as Readonly<T>;
};

export const canonicalisePlainArray = <T>(value: readonly T[], label: string): ReadonlyArray<Readonly<T>> => {
  const snapshot = canonicalise(value, label, new WeakMap<object, unknown>(), new WeakSet<object>());
  if (!Array.isArray(snapshot)) return fail(label, 'an array is required.');
  return snapshot as ReadonlyArray<Readonly<T>>;
};

export const assertCanonicalKeys = (
  value: object,
  allowedKeys: readonly string[],
  label: string
): void => assertAllowedKeys(value, allowedKeys, label);
