import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const JSZip = require('jszip');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) =>
  index % 2 ? pairs : [...pairs, [item.replace(/^--/, ''), all[index + 1]]], []));
const packagePath = path.resolve(args.package || '');
assert.equal(packagePath.toLowerCase(), path.join(root, 'sharepoint/solution/kcf-performance-hub.sppkg').toLowerCase());
assert(fs.existsSync(packagePath), 'SPFx package is missing.');

const deterministicGuid = seed => {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};
const deterministicIds = {
  featureConfig: deterministicGuid('KCF|BT04|feature_4e2966e1-c68c-4c61-9be5-b1e356c66893.xml.config.xml'),
  clientAssetsFeature: deterministicGuid('KCF|BT04|ClientSideAssets.xml'),
  clientAssetsConfig: deterministicGuid('KCF|BT04|ClientSideAssets.xml.config.xml')
};
const source = await JSZip.loadAsync(fs.readFileSync(packagePath));
const sourceNames = Object.keys(source.files).sort((left, right) => left.localeCompare(right));
assert(sourceNames.includes('AppManifest.xml'));
assert(sourceNames.includes('ClientSideAssets.xml'));
assert(sourceNames.includes('ClientSideAssets.xml.config.xml'));
assert(sourceNames.includes('feature_4e2966e1-c68c-4c61-9be5-b1e356c66893.xml.config.xml'));
assert.equal(sourceNames.filter(name => /\.sppkg$/i.test(name)).length, 0);
assert.equal(sourceNames.filter(name => /\.map$|hot-update/i.test(name)).length, 0);

const entries = [];
for (const name of sourceNames) {
  const entry = source.files[name];
  entries.push({ name, dir: entry.dir, data: entry.dir ? undefined : await entry.async('nodebuffer') });
}
const textReplace = (name, transform) => {
  const entry = entries.find(candidate => candidate.name === name);
  assert(entry && entry.data, `${name} is missing.`);
  entry.data = Buffer.from(transform(entry.data.toString('utf8')), 'utf8');
};
textReplace('feature_4e2966e1-c68c-4c61-9be5-b1e356c66893.xml.config.xml', text =>
  text.replace(/<Id>[0-9a-f-]{36}<\/Id>/i, `<Id>${deterministicIds.featureConfig}</Id>`));
textReplace('ClientSideAssets.xml', text =>
  text.replace(/ Id="[0-9a-f-]{36}"/i, ` Id="${deterministicIds.clientAssetsFeature}"`));
textReplace('ClientSideAssets.xml.config.xml', text =>
  text.replace(/<Id>[0-9a-f-]{36}<\/Id>/i, `<Id>${deterministicIds.clientAssetsConfig}</Id>`));

const output = new JSZip();
const fixedDate = new Date('2000-01-01T00:00:00.000Z');
for (const entry of entries) {
  output.file(entry.name, entry.dir ? null : entry.data, {
    dir: entry.dir,
    date: fixedDate,
    createFolders: false,
    compression: entry.dir ? 'STORE' : 'DEFLATE',
    compressionOptions: entry.dir ? undefined : { level: 9 },
    dosPermissions: entry.dir ? 0x10 : 0,
    unixPermissions: entry.dir ? 0o40755 : 0o100644
  });
}
const bytes = await output.generateAsync({
  type: 'nodebuffer', platform: 'DOS', compression: 'DEFLATE', compressionOptions: { level: 9 },
  streamFiles: false, mimeType: 'application/octet-stream'
});
fs.writeFileSync(packagePath, bytes);

const verified = await JSZip.loadAsync(bytes);
assert.deepEqual(Object.keys(verified.files).sort((left, right) => left.localeCompare(right)), sourceNames);
for (const [name, expected] of [
  ['feature_4e2966e1-c68c-4c61-9be5-b1e356c66893.xml.config.xml', deterministicIds.featureConfig],
  ['ClientSideAssets.xml', deterministicIds.clientAssetsFeature],
  ['ClientSideAssets.xml.config.xml', deterministicIds.clientAssetsConfig]
]) {
  assert((await verified.file(name).async('string')).includes(expected), `${name} deterministic identity missing.`);
}
const sha256 = createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify({ packagePath, sha256, bytes: bytes.length, entries: sourceNames.length, deterministicIds }) + '\n');
