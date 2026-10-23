import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const [bundlePath, outputDirectory] = process.argv.slice(2);
if (!bundlePath || !outputDirectory || !isAbsolute(bundlePath) || !isAbsolute(outputDirectory)) {
  throw new Error('Usage: node kcf-kpi-035-extract-schema-evidence.mjs <absolute-bundle-path> <absolute-output-directory>');
}

const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
if (bundle.action !== 'KCF-KPI-035' || bundle.testSchema?.listCount !== 11 || bundle.testSchema?.pass !== true) {
  throw new Error('The evidence bundle is not a passing KCF-KPI-035 eleven-list readback.');
}

const exportValue = {
  action: bundle.action,
  version: bundle.testSchema.version,
  siteUrl: bundle.testSchema.siteUrl,
  sourcePrefix: bundle.testSchema.sourcePrefix,
  targetPrefix: bundle.testSchema.targetPrefix,
  listCount: bundle.testSchema.listCount,
  lists: bundle.testSchema.lists,
  syntheticRows: bundle.testSchema.syntheticRows,
  capturedAt: bundle.testSchema.capturedAt,
  contractPayloadSha256: bundle.testSchema.sha256,
  physicalNameMapping: bundle.longInternalNameReconciliation
};
const content = `${JSON.stringify(exportValue, null, 2)}\n`;
const outputPath = join(outputDirectory, 'KCF-KPI-035_CANONICAL_TEST_SCHEMA.json');
await writeFile(outputPath, content, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({
  outputPath,
  bytes: Buffer.byteLength(content),
  sha256: createHash('sha256').update(content).digest('hex').toUpperCase(),
  contractPayloadSha256: bundle.testSchema.sha256
})}\n`);
