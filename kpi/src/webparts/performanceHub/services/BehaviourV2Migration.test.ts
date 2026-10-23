import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('Behaviour v02 additive dry-run migration', () => {
  it('validates deterministic additive-only synthetic migration state with no provisioning mode', () => {
    const root = resolve('.');
    const script = resolve(root, 'scripts', 'validate-behaviour-v2-migration.mjs');
    const result = spawnSync(process.execPath, [script, '--check'], { cwd: root, encoding: 'utf8' });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, dryRunOnly: true,
      provisioningExecuted: false, destructiveOperations: 0, operationCount: 51 });
    const prohibited = spawnSync(process.execPath, [script, '--provision'], { cwd: root, encoding: 'utf8' });
    expect(prohibited.status).not.toBe(0);
    expect(prohibited.stderr).toContain('no provisioning mode exists');
  });

  it('binds the manifest inventory to the exact synthetic fixture bytes and hash', () => {
    const root = resolve('.');
    const fixturePath = resolve(root, 'data', 'test-pilot', 'behaviour-framework-v2.synthetic.json');
    const fixture = readFileSync(fixturePath);
    const manifest = JSON.parse(readFileSync(resolve(root, 'data', 'test-pilot', 'manifest.json'), 'utf8')) as {
      files: Array<{ file: string; bytes: number; sha256: string }>;
    };
    const entry = manifest.files.find(value => value.file === 'behaviour-framework-v2.synthetic.json');
    expect(entry).toEqual({ file: 'behaviour-framework-v2.synthetic.json', bytes: fixture.byteLength,
      sha256: createHash('sha256').update(fixture).digest('hex') });
    const parsed = JSON.parse(fixture.toString('utf8')) as { synthetic: boolean; productionSafe: boolean;
      effectiveFrom: unknown; assignments: Array<{ email: string }>; cadenceRepresentations: unknown[] };
    expect(parsed).toMatchObject({ synthetic: true, productionSafe: false, effectiveFrom: null });
    expect(parsed.assignments.every(value => value.email.endsWith('.invalid'))).toBe(true);
    expect(parsed.cadenceRepresentations).toEqual(expect.arrayContaining([
      { cadence: 'TwiceYearly', periodKeys: ['H1', 'H2'], populationCreated: false }
    ]));
  });
});
