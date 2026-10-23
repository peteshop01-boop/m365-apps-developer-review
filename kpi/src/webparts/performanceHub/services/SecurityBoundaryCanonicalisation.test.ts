import {
  UnsafeBoundaryInputError,
  canonicalisePlainArray,
  canonicalisePlainRecord
} from './SecurityBoundaryCanonicalisation';

describe('descriptor-only security boundary canonicalisation', () => {
  it('accepts frozen plain data and returns a detached deeply frozen snapshot', () => {
    const source = Object.freeze({
      key: 'safe',
      nested: Object.freeze({ count: 2 }),
      values: Object.freeze(['one', 'two'])
    });
    const snapshot = canonicalisePlainRecord(source, 'Fixture', ['key', 'nested', 'values']);
    expect(snapshot).toEqual(source);
    expect(snapshot).not.toBe(source);
    expect(snapshot.nested).not.toBe(source.nested);
    expect(snapshot.values).not.toBe(source.values);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nested)).toBe(true);
    expect(Object.isFrozen(snapshot.values)).toBe(true);
  });

  it('rejects an accessor without executing its getter', () => {
    let getterReads = 0;
    const source = { key: 'safe' } as { key: string; value?: string };
    Object.defineProperty(source, 'value', {
      enumerable: true,
      configurable: true,
      get: () => { getterReads += 1; return 'unsafe'; }
    });
    expect(() => canonicalisePlainRecord(source, 'Accessor fixture', ['key', 'value']))
      .toThrow(UnsafeBoundaryInputError);
    expect(getterReads).toBe(0);
  });

  it('rejects custom prototypes, symbols, non-enumerable and unexpected descriptors', () => {
    expect(() => canonicalisePlainRecord(Object.create({ key: 'inherited' }), 'Prototype fixture', ['key']))
      .toThrow(/custom or null prototype/);

    const symbolSource = { key: 'safe' } as Record<PropertyKey, unknown>;
    symbolSource[Symbol('hidden')] = 'unsafe';
    expect(() => canonicalisePlainRecord(symbolSource, 'Symbol fixture', ['key']))
      .toThrow(/symbol properties/);

    const hiddenSource = { key: 'safe' } as { key: string; hidden?: string };
    Object.defineProperty(hiddenSource, 'hidden', { enumerable: false, value: 'unsafe' });
    expect(() => canonicalisePlainRecord(hiddenSource, 'Hidden fixture', ['key', 'hidden']))
      .toThrow(/non-enumerable/);

    expect(() => canonicalisePlainRecord({ key: 'safe', extra: 'unsafe' }, 'Extra fixture', ['key']))
      .toThrow(/unexpected properties/);
  });

  it('rejects reflection instability and never consumes a Proxy get trap', () => {
    let descriptorReads = 0;
    const unstable = new Proxy({ key: 'safe' }, {
      getOwnPropertyDescriptor: (target, property): PropertyDescriptor | undefined => {
        descriptorReads += 1;
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        return descriptor ? { ...descriptor, enumerable: descriptorReads % 2 === 0 } : undefined;
      }
    });
    expect(() => canonicalisePlainRecord(unstable, 'Unstable fixture', ['key']))
      .toThrow(/changed while the boundary was inspected/);

    let getReads = 0;
    const stable = new Proxy({ key: 'descriptor-value' }, {
      get: () => { getReads += 1; return 'get-trap-value'; }
    });
    expect(canonicalisePlainRecord(stable, 'Stable proxy fixture', ['key']).key).toBe('descriptor-value');
    expect(getReads).toBe(0);
  });

  it('rejects sparse arrays, array extras and cyclic input', () => {
    const sparse: string[] = new Array(2);
    sparse[0] = 'one';
    expect(() => canonicalisePlainArray(sparse, 'Sparse fixture')).toThrow(/holes or extra/);

    const extra = ['one'] as string[] & { extra?: string };
    extra.extra = 'unsafe';
    expect(() => canonicalisePlainArray(extra, 'Array extra fixture')).toThrow(/holes or extra/);

    const cyclic: Array<unknown> = [];
    cyclic.push(cyclic);
    expect(() => canonicalisePlainArray(cyclic, 'Cyclic fixture')).toThrow(/cyclic/);
  });
});
