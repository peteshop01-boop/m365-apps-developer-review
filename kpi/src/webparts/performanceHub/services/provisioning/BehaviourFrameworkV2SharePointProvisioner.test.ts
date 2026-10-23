import type { IBehaviourFrameworkV2ProvisioningPlan, IBehaviourFrameworkV2TenantSnapshot } from './BehaviourFrameworkV2SharePointProvisioner';
import {
  BEHAVIOUR_FRAMEWORK_V2_EXECUTION_LOCK,
  BEHAVIOUR_FRAMEWORK_V2_SHAREPOINT_SCHEMAS,
  applyBehaviourFrameworkV2SyntheticPlan,
  createBehaviourFrameworkV2TestPublicationTrustAdapter,
  createEmptyBehaviourFrameworkV2TenantSnapshot,
  inspectBehaviourFrameworkV2TenantReadback,
  mapBehaviourFrameworkV2SharePointRows,
  planBehaviourFrameworkV2Provisioning,
  rollbackBehaviourFrameworkV2SyntheticPlan
} from './BehaviourFrameworkV2SharePointProvisioner';
import {
  APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_FIELDS,
  APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256,
  APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH,
  APPROVED_BEHAVIOUR_V1_SOURCE_ROWS
} from '../../testing/BehaviourFrameworkV1ApprovedData';

const adapter = (
  actorEmail = 'Product.Admin@Example.Invalid',
  occurredAt = '2026-09-21T17:45:00.000Z'
): ReturnType<typeof createBehaviourFrameworkV2TestPublicationTrustAdapter> =>
  createBehaviourFrameworkV2TestPublicationTrustAdapter({
  getAuthenticatedEmail: () => actorEmail,
  getUtcNow: () => new Date(occurredAt)
});

const issuePlan = (
  current: IBehaviourFrameworkV2TenantSnapshot,
  actorEmail?: string,
  occurredAt?: string
): ReturnType<typeof planBehaviourFrameworkV2Provisioning> =>
  planBehaviourFrameworkV2Provisioning(current, adapter(actorEmail, occurredAt).issue());

const mutatePlan = (
  plan: IBehaviourFrameworkV2ProvisioningPlan,
  changes: Readonly<Record<string, unknown>>
): IBehaviourFrameworkV2ProvisioningPlan => ({ ...plan, ...changes }) as IBehaviourFrameworkV2ProvisioningPlan;

describe('BT-04 fixed Behaviour v1 package adapter and synthetic provisioning contract', () => {
  it('binds the exact approved hashes, metadata, 5/25/75 tuple set and every approved target text', () => {
    const empty = createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|BT04');
    const plan = issuePlan(empty);
    const payloads = mapBehaviourFrameworkV2SharePointRows(plan);

    expect(BEHAVIOUR_FRAMEWORK_V2_SHAREPOINT_SCHEMAS.map(row => row.title)).toEqual([
      'KCFKPI_BehaviourRoleLevels', 'KCFKPI_BehaviourFocusCatalogue', 'KCFKPI_BehaviourCataloguePublications'
    ]);
    expect(plan.executionLock).toBe(BEHAVIOUR_FRAMEWORK_V2_EXECUTION_LOCK);
    expect(plan.catalogue).toEqual(expect.objectContaining({
      catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS',
      catalogueVersion: 'KCF-BHV-PD03-2026.09-v1',
      revision: 1,
      schemaVersion: '2.0',
      status: 'Published',
      effectiveFrom: '2026-11-01'
    }));
    expect(plan.catalogue.headlineBehaviours).toEqual([
      { behaviourKey: 'BHV-01', title: 'WE TAKE RESPONSIBILITY', sortOrder: 1 },
      { behaviourKey: 'BHV-02', title: 'WE UNITE AS ONE CLUB', sortOrder: 2 },
      { behaviourKey: 'BHV-03', title: 'WE BUILD THE NEXT CHAPTER', sortOrder: 3 },
      { behaviourKey: 'BHV-04', title: 'WE RESPECT THE GAME & EACH OTHER', sortOrder: 4 },
      { behaviourKey: 'BHV-05', title: 'WE WORK & PLAY WITH ENERGY', sortOrder: 5 }
    ]);
    expect(plan.catalogue.roleLevels).toEqual([
      { code: 'L1', name: 'Individual Contributor / Coach', sortOrder: 1 },
      { code: 'L2', name: 'Manager', sortOrder: 2 },
      { code: 'L3', name: 'Senior Manager / Leader', sortOrder: 3 }
    ]);
    expect(plan.catalogue.ratingScale).toEqual(['Developing', 'Effective', 'Exceptional']);
    expect(plan.catalogue.selectionGuidance).toEqual({
      recommendedMinimum: 3, recommendedMaximum: 5, hardMaximum: null
    });
    expect(plan.publication).toEqual(expect.objectContaining({
      sequence: 1,
      sourcePath: 'data/test-pilot/behaviour-catalogue.v2.json',
      sourceSha256: '851ba6c4c315986adb17f3fc0adcfdafba59b225bd97201918462cc85ad338a4',
      contentSha256: 'fadbc5d795ab7f092d984ef19f91b936bc23337f828f53eb5b0c86cadbce709c',
      contentCanonicalUtf8ByteLength: 35668,
      rowCount: 75,
      headlineCount: 5,
      roleLevelCount: 3,
      actorEmail: 'product.admin@example.invalid',
      occurredAt: '2026-09-21T17:45:00.000Z',
      result: 'Published'
    }));
    expect(plan.planKey).toContain('74f2ae0a7fdb33b72419cbf8897eef0b45b23978583abbf27dbf66581f504e8f');
    expect(plan.planKey).toContain('1f8827c906a31701bffd56a5ce9d072b676754f20aae67d016bf57e11669f8f7');
    expect(plan.planKey).toContain('483e6a9ba2594b4b0aaef6d856076b7995142254d063b5f76ba5c72d97f98ae5');
    expect(plan.planKey).toContain('3420f5d1fdf3e427f65e2f54fb86545dfc94699992f818921ae7783d790f15e4');
    expect(plan.planKey).toContain(APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256);
    expect(APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH).toBe(35668);

    expect(payloads).toHaveLength(75);
    expect(new Set(payloads.map(row => row.TargetKey))).toHaveProperty('size', 75);
    expect(new Set(plan.catalogue.rows.map(row => row.focusKey))).toHaveProperty('size', 25);
    const sourceByTarget = new Map(APPROVED_BEHAVIOUR_V1_SOURCE_ROWS.map(row => [row.BehaviourObjectiveKey, row]));
    plan.catalogue.rows.forEach(row => {
      const source = sourceByTarget.get(row.targetKey);
      const payload = payloads.find(candidate => candidate.TargetKey === row.targetKey);
      expect(source).toBeDefined();
      expect(payload).toEqual({
        TargetKey: source?.BehaviourObjectiveKey,
        CatalogueVersion: 'KCF-BHV-PD03-2026.09-v1',
        ContentSha256: APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256,
        ContentCanonicalUtf8ByteLength: APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH,
        BehaviourKey: source?.BehaviourKey,
        RoleLevelCode: source?.RoleLevelCode,
        FocusArea: source?.ObjectiveTitle,
        SuggestedTarget: source?.ObjectiveDescription,
        SuggestedMeasure: source?.SuggestedMeasure,
        SuggestedUnit: source?.SuggestedUnit,
        SuggestedEvidence: source?.SuggestedEvidence,
        EffectiveStatus: 'Published',
        EffectiveFrom: source?.EffectiveFrom,
        EffectiveTo: null,
        SortOrder: source?.SortOrder
      });
    });
    for (let behaviour = 1; behaviour <= 5; behaviour += 1) {
      for (let focus = 1; focus <= 5; focus += 1) {
        const focusKey = `BHV-0${behaviour}-FOCUS-0${focus}`;
        expect(plan.catalogue.rows.filter(row => row.focusKey === focusKey).map(row => row.roleLevelCode).sort())
          .toEqual(['L1', 'L2', 'L3']);
      }
    }
  });

  it('fails closed in fresh processes for pre-load/post-load field and array mutation attacks', () => {
    const approvedModulePath = String(require.resolve('../../testing/BehaviourFrameworkV1ApprovedData'));
    const provisionerModulePath = String(require.resolve('./BehaviourFrameworkV2SharePointProvisioner'));
    const nodeExecutable = (process as unknown as { execPath: string }).execPath;
    const execFileSync = (require as unknown as (moduleName: string) => {
      execFileSync: (executable: string, args: string[], options: Readonly<Record<string, unknown>>) => string;
    })('child_process').execFileSync;
    const childScript = String.raw`
      'use strict';
      const [approvedPath, provisionerPath, loadOrder, attackJson] = process.argv.slice(1);
      process.env.NODE_ENV = 'test';
      const attack = JSON.parse(attackJson);
      let provisioner;
      if (loadOrder === 'post') provisioner = require(provisionerPath);
      const approved = require(approvedPath);
      const rows = approved.APPROVED_BEHAVIOUR_V1_SOURCE_ROWS;
      const originalFirst = rows[0];
      const originalSecond = rows[1];
      const originalFieldValue = attack.kind === 'field' ? rows[0][attack.field] : undefined;
      const mutate = targetRows => {
        if (attack.kind === 'field') targetRows[0][attack.field] = attack.value;
        else if (attack.operation === 'replace') targetRows[0] = { ...targetRows[0], ObjectiveDescription: 'ATTACK' };
        else if (attack.operation === 'delete') delete targetRows[0];
        else if (attack.operation === 'push') targetRows.push(targetRows[0]);
        else if (attack.operation === 'swap') [targetRows[0], targetRows[1]] = [targetRows[1], targetRows[0]];
        else if (attack.operation === 'length') targetRows.length = 74;
      };
      let mutationThrew = false;
      try { mutate(rows); } catch { mutationThrew = true; }
      const unchanged = attack.kind === 'field'
        ? Object.is(rows[0][attack.field], originalFieldValue)
        : rows.length === 75 && rows[0] === originalFirst && rows[1] === originalSecond
          && Object.prototype.hasOwnProperty.call(rows, 0);
      if (!provisioner) provisioner = require(provisionerPath);
      const adapter = provisioner.createBehaviourFrameworkV2TestPublicationTrustAdapter({
        getAuthenticatedEmail: () => 'fresh.process@example.invalid',
        getUtcNow: () => new Date('2026-09-21T23:15:00.000Z')
      });
      const state = provisioner.createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|FRESH|' + loadOrder);
      const plan = provisioner.planBehaviourFrameworkV2Provisioning(state, adapter.issue());
      const mapped = provisioner.mapBehaviourFrameworkV2SharePointRows(plan);
      process.stdout.write(JSON.stringify({
        mutationThrew,
        unchanged,
        arrayFrozen: Object.isFrozen(rows),
        rowsFrozen: rows.every(Object.isFrozen),
        digest: plan.publication.contentSha256,
        byteLength: plan.publication.contentCanonicalUtf8ByteLength,
        mappedDigestCount: new Set(mapped.map(row => row.ContentSha256)).size,
        mappedDigest: mapped[0].ContentSha256,
        rowCount: mapped.length,
        target: mapped[0].SuggestedTarget
      }));
    `;
    const forgedChildScript = String.raw`
      'use strict';
      const [approvedPath, provisionerPath, attackJson] = process.argv.slice(1);
      process.env.NODE_ENV = 'test';
      const attack = JSON.parse(attackJson);
      const approved = require(approvedPath);
      const rows = approved.APPROVED_BEHAVIOUR_V1_SOURCE_ROWS.map(row => ({ ...row }));
      if (attack.kind === 'field') rows[0][attack.field] = attack.value;
      else if (attack.operation === 'replace') rows[0] = { ...rows[0], ObjectiveDescription: 'ATTACK' };
      else if (attack.operation === 'delete') delete rows[0];
      else if (attack.operation === 'push') rows.push({ ...rows[0] });
      else if (attack.operation === 'swap') [rows[0], rows[1]] = [rows[1], rows[0]];
      else if (attack.operation === 'length') rows.length = 74;
      require.cache[approvedPath].exports.APPROVED_BEHAVIOUR_V1_SOURCE_ROWS = rows;
      let message = '';
      try { require(provisionerPath); } catch (error) { message = String(error && error.message ? error.message : error); }
      process.stdout.write(JSON.stringify({ failedClosed: Boolean(message), message }));
    `;
    const fieldValue = (field: string): string | number | boolean => {
      if (field === 'Active') return false;
      if (field === 'SortOrder') return 999999;
      if (field === 'EffectiveTo') return '2099-01-01';
      return `ATTACK:${field}`;
    };
    const fieldAttacks = APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_FIELDS.map(field => ({
      kind: 'field', field, value: fieldValue(field)
    }));
    const arrayAttacks = ['replace', 'delete', 'push', 'swap', 'length'].map(operation => ({
      kind: 'array', operation
    }));
    const run = (script: string, args: string[]): Record<string, unknown> => JSON.parse(execFileSync(
      nodeExecutable,
      ['-e', script, ...args],
      { encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_ENV: 'test' } }
    ));

    [...fieldAttacks, ...arrayAttacks].forEach(attack => {
      ['pre', 'post'].forEach(loadOrder => {
        const result = run(childScript, [
          approvedModulePath, provisionerModulePath, loadOrder, JSON.stringify(attack)
        ]);
        expect(result).toEqual(expect.objectContaining({
          mutationThrew: true,
          unchanged: true,
          arrayFrozen: true,
          rowsFrozen: true,
          digest: APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256,
          byteLength: APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH,
          mappedDigestCount: 1,
          mappedDigest: APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256,
          rowCount: 75,
          target: 'Deliver what I agree and flag problems early rather than letting deadlines slip.'
        }));
      });
      const forged = run(forgedChildScript, [approvedModulePath, provisionerModulePath, JSON.stringify(attack)]);
      expect(forged.failedClosed).toBe(true);
      expect(forged.message).toMatch(/approvedGovernedSourceRows|canonical content/);
    });
  }, 120000);

  it('installs, applies, verifies readback, rolls back and replans idempotently from module-issued state', () => {
    const legacyRows = Object.freeze([{ LegacyKey: 'KEEP', nested: { positions: [0, 'one', null] } }]);
    const empty = createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|BT04', legacyRows);
    const plan = issuePlan(empty);
    expect(plan.operation).toBe('Install');
    const applied = applyBehaviourFrameworkV2SyntheticPlan(empty, plan);
    expect(applied.legacyRows).toEqual(legacyRows);
    expect(inspectBehaviourFrameworkV2TenantReadback(plan, applied)).toEqual([]);
    expect(rollbackBehaviourFrameworkV2SyntheticPlan(applied, plan)).toEqual(empty);

    const repeated = issuePlan(applied, 'Second.Actor@Example.Invalid', '2026-09-21T18:00:00.000Z');
    expect(repeated.operation).toBe('NoChange');
    expect(repeated.publication.sequence).toBe(2);
    expect(repeated.publication.actorEmail).toBe('second.actor@example.invalid');
    const reapplied = applyBehaviourFrameworkV2SyntheticPlan(applied, repeated);
    expect(inspectBehaviourFrameworkV2TenantReadback(repeated, reapplied)).toEqual([]);
    expect(mapBehaviourFrameworkV2SharePointRows(repeated)).toHaveLength(75);
    expect(rollbackBehaviourFrameworkV2SyntheticPlan(reapplied, repeated)).toEqual(applied);
  });

  it('requires a hidden one-use capability and derives actor/time without caller publication inputs', () => {
    const empty = createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|BT04');
    const trustAdapter = adapter('AUTHENTICATED.USER@EXAMPLE.INVALID', '2026-09-21T19:00:00.000Z');
    const capability = trustAdapter.issue();
    expect(Object.keys(capability)).toEqual([]);
    expect(Object.isFrozen(capability)).toBe(true);

    expect(() => planBehaviourFrameworkV2Provisioning(empty, {} as never)).toThrow(/non-forgeable/);
    expect(() => planBehaviourFrameworkV2Provisioning(empty, { ...capability } as never)).toThrow(/non-forgeable/);
    expect(() => planBehaviourFrameworkV2Provisioning(empty, new Proxy(capability, {}) as never)).toThrow(/non-forgeable/);
    expect(() => planBehaviourFrameworkV2Provisioning(empty, {
      actorEmail: 'attacker@example.invalid', occurredAt: '2099-01-01T00:00:00.000Z',
      catalogueVersion: 'KCF-BHV-PD03-2099.01-v9'
    } as never)).toThrow(/non-forgeable/);

    const plan = planBehaviourFrameworkV2Provisioning(empty, capability);
    expect(plan.publication.actorEmail).toBe('authenticated.user@example.invalid');
    expect(plan.publication.occurredAt).toBe('2026-09-21T19:00:00.000Z');
    expect(() => planBehaviourFrameworkV2Provisioning(empty, capability)).toThrow(/unused/);
    expect(() => planBehaviourFrameworkV2Provisioning(empty, undefined as never)).toThrow(/non-forgeable/);

    const parameterlessIssue = trustAdapter.issue as unknown as (
      actorEmail: string,
      occurredAt: string,
      sequence: number
    ) => Parameters<typeof planBehaviourFrameworkV2Provisioning>[1];
    const secondCapability = parameterlessIssue('attacker@example.invalid', '2099-01-01T00:00:00.000Z', 999);
    const second = planBehaviourFrameworkV2Provisioning(createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|SECOND'),
      secondCapability);
    expect(second.publication.actorEmail).toBe('authenticated.user@example.invalid');
    expect(second.publication.occurredAt).toBe('2026-09-21T19:00:00.000Z');
    expect(second.publication.sequence).toBe(1);

    const consumedByFailure = adapter().issue();
    expect(() => planBehaviourFrameworkV2Provisioning({ ...empty } as IBehaviourFrameworkV2TenantSnapshot,
      consumedByFailure)).toThrow(/module-issued/);
    expect(() => planBehaviourFrameworkV2Provisioning(empty, consumedByFailure)).toThrow(/unused/);
  });

  it('keeps production issuance unavailable without a genuine platform-owned authenticated context', () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => createBehaviourFrameworkV2TestPublicationTrustAdapter({
        getAuthenticatedEmail: () => 'actor@example.invalid',
        getUtcNow: () => new Date('2026-09-21T20:00:00.000Z')
      })).toThrow(/Production publication capability issuance is unavailable/);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('rejects undefined collisions, holes and structural substitutions for apply, rollback and readback', () => {
    const before = createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|BT04', [{
      keep: 'value', nested: { present: true }, positions: [0, 'one']
    }]);
    const plan = issuePlan(before);
    const applied = applyBehaviourFrameworkV2SyntheticPlan(before, plan);
    const rootUndefined = { ...before, injected: undefined } as IBehaviourFrameworkV2TenantSnapshot;
    const nestedUndefined = { ...before, legacyRows: [{
      keep: 'value', nested: { present: true, injected: undefined }, positions: [0, 'one']
    }] };
    const legacyUndefined = { ...before, legacyRows: [{
      keep: 'value', nested: { present: true }, positions: [0, 'one'], injected: undefined
    }] };
    const arrayUndefined = { ...before, legacyRows: [{
      keep: 'value', nested: { present: true }, positions: [0, undefined]
    }] };
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[0] = 0;
    const arrayHole = { ...before, legacyRows: [{ keep: 'value', nested: { present: true }, positions: sparse }] };
    [rootUndefined, nestedUndefined, legacyUndefined, arrayUndefined, arrayHole].forEach(changed => {
      expect(() => applyBehaviourFrameworkV2SyntheticPlan(changed as IBehaviourFrameworkV2TenantSnapshot, plan))
        .toThrow(/Protected input/);
    });

    const alteredStates: IBehaviourFrameworkV2TenantSnapshot[] = [
      { ...before, legacyRows: [{ keep: 'value', nested: {}, positions: [0, 'one'] }] },
      { ...before, legacyRows: [{ keep: 'value', nested: { present: true, extra: true }, positions: [0, 'one'] }] },
      { ...before, legacyRows: [{ keep: 1, nested: { present: true }, positions: [0, 'one'] }] },
      { ...before, legacyRows: [{ keep: 'value', nested: { present: true }, positions: [-0, 'one'] }] }
    ];
    alteredStates.forEach(changed => {
      expect(() => applyBehaviourFrameworkV2SyntheticPlan(changed, plan)).toThrow(/pre-state/);
    });

    const rollbackUndefined = { ...applied, legacyRows: [{ injected: undefined }] };
    expect(() => rollbackBehaviourFrameworkV2SyntheticPlan(rollbackUndefined, plan)).toThrow(/Protected input/);
    expect(inspectBehaviourFrameworkV2TenantReadback(plan, rollbackUndefined)).toEqual([
      'Readback protected shape is invalid.'
    ]);
    expect(inspectBehaviourFrameworkV2TenantReadback(plan, {
      ...applied, legacyRows: [{ keep: 'value', nested: { present: true }, positions: [-0, 'one'] }]
    })).toContain('Readback changed protected legacy rows.');
  });

  it('rejects accessors, Proxies, custom prototypes, symbols, non-enumerables, cycles and reflection changes', () => {
    const before = createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|BT04', [{ keep: true }]);
    const plan = issuePlan(before);
    const applied = applyBehaviourFrameworkV2SyntheticPlan(before, plan);
    let getterExecutions = 0;
    const accessor = { ...before };
    Object.defineProperty(accessor, 'bindingKey', {
      enumerable: true,
      get: () => {
        getterExecutions += 1;
        return 'LOCAL|BT04';
      }
    });
    expect(() => applyBehaviourFrameworkV2SyntheticPlan(accessor, plan)).toThrow(/accessor/);
    expect(getterExecutions).toBe(0);

    let proxyGets = 0;
    const proxy = new Proxy(before, {
      get(target, property) {
        proxyGets += 1;
        return (target as unknown as Record<PropertyKey, unknown>)[property];
      }
    });
    expect(applyBehaviourFrameworkV2SyntheticPlan(proxy, plan)).toEqual(applied);
    expect(proxyGets).toBe(0);

    const customPrototype = Object.assign(Object.create({ inherited: true }), before);
    const symbolValue = { ...before } as IBehaviourFrameworkV2TenantSnapshot & { [key: symbol]: boolean };
    symbolValue[Symbol('hostile')] = true;
    const nonEnumerable = { ...before };
    Object.defineProperty(nonEnumerable, 'hidden', { enumerable: false, value: true });
    const cycle = { ...before } as IBehaviourFrameworkV2TenantSnapshot & { cycle?: unknown };
    cycle.cycle = cycle;
    [customPrototype, symbolValue, nonEnumerable, cycle].forEach(value => {
      expect(() => applyBehaviourFrameworkV2SyntheticPlan(value, plan)).toThrow(/Protected input/);
    });

    let descriptorReads = 0;
    const switching = new Proxy(before, {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(target, property);
        if (property === 'bindingKey' && descriptor) {
          descriptorReads += 1;
          return { ...descriptor, value: descriptorReads === 1 ? 'LOCAL|BT04' : 'SWITCHED|BINDING' };
        }
        return descriptor;
      }
    });
    expect(() => applyBehaviourFrameworkV2SyntheticPlan(switching, plan)).toThrow(/Protected input/);
    expect(descriptorReads).toBe(2);

    let planGets = 0;
    const proxyPlan = new Proxy(plan, {
      get(target, property) {
        planGets += 1;
        return (target as unknown as Record<PropertyKey, unknown>)[property];
      }
    });
    expect(() => mapBehaviourFrameworkV2SharePointRows(proxyPlan)).toThrow(/exact module-issued plan/);
    expect(planGets).toBe(0);
    expect(inspectBehaviourFrameworkV2TenantReadback(proxyPlan, applied)).toContain(
      'Readback requires the exact generated plan object.'
    );
    expect(planGets).toBe(0);
  });

  it('rejects every caller substitution and the SEC-R035 tuple/text reproductions before mapping', () => {
    const empty = createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|BT04');
    const plan = issuePlan(empty);
    const movedRow = plan.catalogue.rows.map(row => row.targetKey === 'BHV-01-L1-01'
      ? { ...row, focusKey: 'BHV-01-FOCUS-02' }
      : row);
    const attackPlans: IBehaviourFrameworkV2ProvisioningPlan[] = [
      mutatePlan(plan, { catalogue: { ...plan.catalogue, catalogueVersion: 'KCF-BHV-PD03-2099.01-v9' } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue, revision: 999 } }),
      mutatePlan(plan, { publication: { ...plan.publication, sourcePath: 'foreign/catalogue.json' } }),
      mutatePlan(plan, { publication: { ...plan.publication, sourceSha256: 'c'.repeat(64) } }),
      mutatePlan(plan, { publication: { ...plan.publication, contentSha256: 'c'.repeat(64) } }),
      mutatePlan(plan, { publication: { ...plan.publication, contentCanonicalUtf8ByteLength: 1 } }),
      mutatePlan(plan, { publication: { ...plan.publication, rowCount: 74 } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue, status: 'Retired' } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue,
        headlineBehaviours: plan.catalogue.headlineBehaviours.map((row, index) => index ? row : { ...row, title: 'FORGED' }) } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue,
        roleLevels: plan.catalogue.roleLevels.map((row, index) => index ? row : { ...row, name: 'FORGED' }) } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue, effectiveFrom: '2099-01-01' } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue, rows: movedRow } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue, rows: plan.catalogue.rows.slice(1) } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue, rows: plan.catalogue.rows.concat(plan.catalogue.rows[0]) } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue,
        rows: plan.catalogue.rows.map((row, index) => index ? row : { ...row, targetKey: 'BHV-01-L1-02' }) } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue,
        rows: plan.catalogue.rows.map((row, index) => index ? row : { ...row, roleLevelCode: 'L2' }) } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue,
        rows: plan.catalogue.rows.map((row, index) => index ? row : { ...row, behaviourKey: 'BHV-02' }) } }),
      mutatePlan(plan, { catalogue: { ...plan.catalogue,
        rows: plan.catalogue.rows.map((row, index) => index ? row : { ...row, suggestedTarget: 'Approved-looking alternative' }) } })
    ];
    attackPlans.forEach(attack => {
      expect(() => mapBehaviourFrameworkV2SharePointRows(attack)).toThrow(/exact module-issued plan/);
    });
    expect(() => mapBehaviourFrameworkV2SharePointRows(plan.catalogue as never)).toThrow(/exact module-issued plan/);
    expect(mapBehaviourFrameworkV2SharePointRows(plan).find(row => row.TargetKey === 'BHV-01-L1-01')).toEqual(
      expect.objectContaining({
        BehaviourKey: 'BHV-01',
        RoleLevelCode: 'L1',
        FocusArea: 'OWN COMMITMENTS',
        SuggestedTarget: 'Deliver what I agree and flag problems early rather than letting deadlines slip.'
      })
    );
  });

  it('rejects forged plans and foreign/unissued state without reading hostile objects', () => {
    const empty = createEmptyBehaviourFrameworkV2TenantSnapshot('LOCAL|BT04');
    const plan = issuePlan(empty);
    const applied = applyBehaviourFrameworkV2SyntheticPlan(empty, plan);
    expect(() => applyBehaviourFrameworkV2SyntheticPlan(empty, { ...plan } as IBehaviourFrameworkV2ProvisioningPlan))
      .toThrow(/exact generated plan/);
    expect(() => rollbackBehaviourFrameworkV2SyntheticPlan(applied, { ...plan } as IBehaviourFrameworkV2ProvisioningPlan))
      .toThrow(/exact generated plan/);

    let foreignReads = 0;
    const foreign = new Proxy({ ...applied }, {
      get(target, property) {
        foreignReads += 1;
        return (target as unknown as Record<PropertyKey, unknown>)[property];
      }
    });
    expect(() => planBehaviourFrameworkV2Provisioning(foreign, adapter().issue())).toThrow(/module-issued/);
    expect(foreignReads).toBe(0);
  });
});
