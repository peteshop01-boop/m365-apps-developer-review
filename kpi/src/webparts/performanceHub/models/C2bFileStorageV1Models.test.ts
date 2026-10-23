/** @jest-environment node */
"use strict";
import { readFileSync } from 'fs';
import { join } from 'path';
import { assertContentPage, assertContentReference, assertStorageAcceptance, assertStorageBinding,
  dispatchFileState, dispatchCommandStorage, dispatchBehaviourStorage, parseStorageJson, parseStorageCanonical, storageAdd, storageCanonical, storageFraming,
  type C2bContentReferenceV1, type C2bStorageBindingV1 } from './C2bFileStorageV1Models';

const guid = 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1';
const target = { site: guid, web: guid, library: guid };
const locator = { u: guid, v: '1.0' as const, n: 100, h: 'A'.repeat(64) };
const reference = (): C2bContentReferenceV1 => ({ k: 'kcf.kpi.content-ref.v1', p: 'history', t: target,
  r: locator, z: 1, n: 1, h: 'B'.repeat(64), b: 'C'.repeat(64) });

describe('closed B file storage models', () => {
  test.each([[0, 1, 1, 2], [1000000, 1, 1, 2], [1000001, 2, 1, 3],
    [64000000, 64, 1, 65], [64000001, 65, 2, 68], [65000001, 66, 2, 69]])(
    'frames %d bytes without truncation', (bytes, leaves, depth, files) => {
      const f = storageFraming(bytes); expect([f.leaves, f.depth, f.files]).toEqual([leaves, depth, files]);
    });
  test('safe-integer edge remains exact and arithmetic overflow rejects', () => {
    expect(storageFraming(Number.MAX_SAFE_INTEGER).depth).toBe(6);
    for (const n of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => storageFraming(n)).toThrow();
    expect(() => storageAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });
  test.each(['{"a":1,"a":1}', '{ "a":1}', '\uFEFF{"a":1}', '{"a":1e0}', '{"a":"\\u0061"}'])(
    'rejects duplicate/noncanonical protocol JSON %s', wire => {
      expect(() => parseStorageCanonical(new TextEncoder().encode(wire))).toThrow();
    });
  test('rejects cycles, sparse arrays and invalid UTF8', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => storageCanonical(cycle)).toThrow(); expect(() => storageCanonical(new Array(2))).toThrow();
    expect(() => parseStorageCanonical(new Uint8Array([0xff]))).toThrow();
  });
  test('metadata parser preserves ordinary JSON but rejects nested and escaped duplicate keys', () => {
    expect(parseStorageJson(' { "name": "😀", "items": [true, false, null, -1.25e2] } ')).toEqual({ name: '😀', items: [true, false, null, -125] });
    for (const wire of ['{"a":{"Id":1,"\\u0049d":2}}', '{"Id":1,"Id":1}', '[1,]', '{"a":1,}', '01', '1e400', 'true garbage']) {
      expect(() => parseStorageJson(wire)).toThrow();
    }
  });
  test.each([
    { k: 'kcf.kpi.content-ref.v99' }, { url: 'https://foreign.invalid' }, { p: 'foreign' }, { z: 2 },
    { n: -1 }, { n: 0.5 }, { h: 'a'.repeat(64) }, { b: 'bad' }, { t: { ...target, extra: true } },
    { r: { ...locator, v: '2.0' } }, { r: { ...locator, n: 9481 } }, { r: { ...locator, url: '/foreign' } }
  ])('rejects structural descriptor attacks %j', mutation => {
    expect(() => assertContentReference({ ...reference(), ...mutation })).toThrow();
  });
  test('descriptor hashes do not bypass expected purpose, target or binding', () => {
    const expected = { purpose: 'history' as const, target, bindingSHA256: 'C'.repeat(64) };
    expect(() => assertContentReference(reference(), expected)).not.toThrow();
    for (const d of [{ ...reference(), p: 'command' }, { ...reference(), b: 'D'.repeat(64) },
      { ...reference(), t: { ...target, web: '8f3ae803-2f7c-48e9-a177-de8d5280bd08' } }]) {
      expect(() => assertContentReference(d, expected)).toThrow('CONTEXT');
    }
  });
  test('page dispatch rejects extra keys, wrong purpose, level and excessive fanout', () => {
    const page = { k: 'kcf.kpi.content-page.v1', p: 'history', l: 0, e: [locator] };
    for (const p of [{ ...page, extra: 1 }, { ...page, p: 'command' }, { ...page, l: 1 },
      { ...page, e: [] }, { ...page, e: Array.from({ length: 65 }, () => locator) }]) {
      expect(() => assertContentPage(p, 'history', 0)).toThrow();
    }
  });
  test('legacy values are never guessed from descriptor-looking text', () => {
    const wire = storageCanonical({ ...reference(), p: 'journal' });
    expect(dispatchFileState(wire, undefined, 'journal')).toEqual({ kind: 'legacy-inline', wire });
    expect(() => dispatchFileState(wire, 'v99', 'journal')).toThrow();
    const state = storageCanonical({ k: 'kcf.kpi.file-state.v1', p: 'journal', r: { ...reference(), p: 'journal' } });
    expect(dispatchFileState(state, 'kcf.kpi.file-state.v1', 'journal').kind).toBe('file');
    expect(() => dispatchFileState(state, 'kcf.kpi.file-state.v1', 'effect')).toThrow();
  });
  test('explicit command discriminator preserves raw legacy wire and rejects partial/unknown versions', () => {
    const wire = '{ "schemaVersion":"kcf.kpi.test-command.v2", "raw":"😀" }';
    expect(dispatchCommandStorage(wire)).toEqual({ kind: 'legacy-inline', wire });
    const descriptor = storageCanonical({ ...reference(), p: 'command' });
    expect(dispatchCommandStorage(descriptor).kind).toBe('file');
    for (const bad of ['{"schemaVersion":"v99"}', '{"k":"v99"}', storageCanonical(reference()),
      descriptor.slice(0, -1) + ',"k":"kcf.kpi.content-ref.v1"}']) expect(() => dispatchCommandStorage(bad)).toThrow();
  });
  test('Behaviour marker requires all four purpose-bound fields and unchanged selection companions', () => {
    const wires = { annual: storageCanonical({ ...reference(), p: 'annual' }),
      period: storageCanonical({ ...reference(), p: 'period' }), selection: storageCanonical({ ...reference(), p: 'selection' }),
      'selected-keys': storageCanonical({ ...reference(), p: 'selected-keys' }) };
    const context = { target, bindings: { annual: 'C'.repeat(64), period: 'C'.repeat(64),
      selection: 'C'.repeat(64), 'selected-keys': 'C'.repeat(64) }, selectionSHA256: 'B'.repeat(64), selectionUtf8Bytes: 1 };
    expect(dispatchBehaviourStorage(wires, undefined, context)).toEqual({ kind: 'legacy-inline', wires });
    expect(dispatchBehaviourStorage(wires, 'kcf.kpi.behaviour-storage.v1', context).kind).toBe('file');
    expect(() => dispatchBehaviourStorage(wires, 'v99', context)).toThrow();
    expect(() => dispatchBehaviourStorage({ ...wires, annual: 'employee plaintext' }, 'kcf.kpi.behaviour-storage.v1', context)).toThrow();
    expect(() => dispatchBehaviourStorage({ ...wires, 'selected-keys': wires.selection }, 'kcf.kpi.behaviour-storage.v1', context)).toThrow();
    expect(() => dispatchBehaviourStorage(wires, 'kcf.kpi.behaviour-storage.v1', { ...context, selectionUtf8Bytes: 2 })).toThrow();
  });
  const evidence = process.env.C2B_FROZEN_EVIDENCE;
  (evidence ? test : test.skip)('exact reviewed binding rejects author/role/catalogue/candidate/grant attacks', () => {
    const original = JSON.parse(readFileSync(join(evidence!, 'closed-binding-example.json'), 'utf8')) as C2bStorageBindingV1;
    assertStorageBinding(original);
    for (const [key, change] of Object.entries({
      source: { ...original.source, expectedActor: 'FOREIGN' },
      roles: { ...original.roles, effectiveRole: 'SystemAdmin' },
      catalogue: { ...original.catalogue, version: 'FOREIGN' },
      candidate: { ...original.candidate, commit: 'f'.repeat(40) },
      grant: { ...original.grant, issuerPrincipal: 'FOREIGN' }
    })) expect(() => assertStorageBinding({ ...original, [key]: change }, original)).toThrow();
    expect(() => assertStorageBinding({ ...original, extra: true })).toThrow();
    expect(() => assertStorageBinding({ ...original, source: { ...original.source, phase: 'ObservedSource' } })).toThrow();
    const seal = JSON.parse(readFileSync(join(evidence!, 'closed-acceptance-seal-example.json'), 'utf8'));
    expect(() => assertStorageAcceptance(seal)).not.toThrow();
    expect(() => assertStorageAcceptance({ ...seal, extra: true })).toThrow();
    expect(() => assertStorageAcceptance({ ...seal, k: 'v99' })).toThrow();
  });
});
