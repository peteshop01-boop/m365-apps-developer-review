type DataRecord = Record<string, unknown>;

const sameOwnKeys = (left: PropertyKey[], right: PropertyKey[]): boolean =>
  left.length === right.length && left.every((key, index) => key === right[index]);

const sameDescriptor = (left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean =>
  !!left && !!right
  && left.enumerable === right.enumerable
  && left.configurable === right.configurable
  && left.writable === right.writable
  && left.get === right.get
  && left.set === right.set
  && Object.is(left.value, right.value);

interface IDescriptorSurface {
  readonly prototype: object;
  readonly keys: PropertyKey[];
  readonly descriptors: ReadonlyMap<PropertyKey, PropertyDescriptor>;
}

const descriptorSurface = (value: object): IDescriptorSurface => {
  const keys = Reflect.ownKeys(value);
  const descriptors = new Map<PropertyKey, PropertyDescriptor>();
  keys.forEach(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) throw new Error('Quarterly trust boundary encountered an unstable property surface.');
    descriptors.set(key, descriptor);
  });
  return { prototype: Object.getPrototypeOf(value), keys, descriptors };
};

const assertStableSurface = (first: IDescriptorSurface, second: IDescriptorSurface, path: string): void => {
  if (first.prototype !== second.prototype || !sameOwnKeys(first.keys, second.keys)
    || first.keys.some(key => !sameDescriptor(first.descriptors.get(key), second.descriptors.get(key)))) {
    throw new Error(`${path} exposes an unstable object or Proxy surface.`);
  }
};

const materialize = (value: unknown, path: string, active: Set<object>): unknown => {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} rejects non-finite numbers.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new Error(`${path} accepts data values only.`);
  if (active.has(value)) throw new Error(`${path} rejects cyclic data.`);

  const first = descriptorSurface(value);
  const second = descriptorSurface(value);
  assertStableSurface(first, second, path);
  if (first.keys.some(key => typeof key === 'symbol')) throw new Error(`${path} rejects symbol keys.`);

  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (first.prototype !== Array.prototype) throw new Error(`${path} rejects custom array prototypes.`);
      const lengthDescriptor = first.descriptors.get('length');
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0) throw new Error(`${path} has an invalid array length.`);
      const expectedKeys = Array.from({ length }, (_, index) => String(index));
      const actualKeys = first.keys.filter(key => key !== 'length') as string[];
      if (!sameOwnKeys(actualKeys, expectedKeys)) throw new Error(`${path} rejects sparse arrays and extra array keys.`);
      const result: unknown[] = [];
      expectedKeys.forEach((key, index) => {
        const descriptor = first.descriptors.get(key)!;
        if ('get' in descriptor || 'set' in descriptor) throw new Error(`${path}[${index}] rejects accessors.`);
        if (!descriptor.enumerable) throw new Error(`${path}[${index}] must be enumerable data.`);
        result.push(materialize(descriptor.value, `${path}[${index}]`, active));
      });
      return Object.freeze(result);
    }

    if (first.prototype !== Object.prototype) throw new Error(`${path} rejects custom object prototypes.`);
    const result = Object.create(null) as DataRecord;
    first.keys.forEach(key => {
      const stringKey = key as string;
      const descriptor = first.descriptors.get(key)!;
      if ('get' in descriptor || 'set' in descriptor) throw new Error(`${path}.${stringKey} rejects accessors.`);
      if (!descriptor.enumerable) throw new Error(`${path}.${stringKey} must be enumerable data.`);
      Object.defineProperty(result, stringKey, {
        value: materialize(descriptor.value, `${path}.${stringKey}`, active),
        enumerable: true,
        configurable: false,
        writable: false
      });
    });
    return Object.freeze(result);
  } finally {
    active.delete(value);
  }
};

/**
 * Captures an untrusted data graph through property descriptors only. Getters
 * are never invoked, sparse arrays and custom surfaces are rejected, and the
 * returned graph is the sole immutable snapshot used after the boundary.
 */
export const materializeQuarterlyData = <T>(value: T, path: string): Readonly<T> =>
  materialize(value, path, new Set<object>()) as Readonly<T>;

export const quarterlyOwnDataValue = <T>(value: object, key: string, path: string): T | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')
    || Object.prototype.hasOwnProperty.call(descriptor, 'get')
    || Object.prototype.hasOwnProperty.call(descriptor, 'set')
    || !descriptor.enumerable) {
    throw new Error(`${path}.${key} must be an own enumerable data property.`);
  }
  return descriptor.value as T;
};

export const assertQuarterlyExactKeys = (
  value: object,
  allowedKeys: ReadonlyArray<string>,
  path: string,
  requiredKeys: ReadonlyArray<string> = []
): void => {
  const keys = Object.keys(value);
  const allowed = new Set(allowedKeys);
  const extra = keys.filter(key => !allowed.has(key));
  const missing = requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  if (extra.length || missing.length) {
    throw new Error(`${path} has an invalid exact shape${extra.length ? `; extra keys: ${extra.join(', ')}` : ''}${missing.length ? `; missing keys: ${missing.join(', ')}` : ''}.`);
  }
};
