import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';

const packagePath = resolve('sharepoint', 'solution', 'kcf-performance-hub.sppkg');
const sourceBytes = await readFile(packagePath);
const source = await JSZip.loadAsync(sourceBytes);
const normalised = new JSZip();
const fixedDate = new Date(1980, 0, 1, 0, 0, 0);
const deterministicUuid = name => {
  const bytes = createHash('sha1')
    .update(`34bee229-16d5-4ecb-a2f8-a7ae2353c3bf:${name}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const canonicaliseGeneratedId = (name, bytes) => {
  const patterns = {
    'ClientSideAssets.xml': / Id="[0-9a-f-]{36}"/i,
    'ClientSideAssets.xml.config.xml': /<Id>[0-9a-f-]{36}<\/Id>/i,
    'feature_4e2966e1-c68c-4c61-9be5-b1e356c66893.xml.config.xml': /<Id>[0-9a-f-]{36}<\/Id>/i
  };
  const pattern = patterns[name];
  if (!pattern) return bytes;
  const sourceText = bytes.toString('utf8');
  const matches = sourceText.match(new RegExp(pattern.source, 'gi'));
  if (matches?.length !== 1) {
    throw new Error(`Expected one generated package ID in ${name}; found ${matches?.length ?? 0}.`);
  }
  const uuid = deterministicUuid(name);
  const replacement = name === 'ClientSideAssets.xml' ? ` Id="${uuid}"` : `<Id>${uuid}</Id>`;
  const outputText = sourceText.replace(pattern, replacement);
  return Buffer.from(outputText, 'utf8');
};

for (const name of Object.keys(source.files).sort()) {
  const entry = source.files[name];
  if (entry.dir) {
    normalised.file(name, '', { createFolders: false, date: fixedDate, dir: true });
  } else {
    normalised.file(name, canonicaliseGeneratedId(name, await entry.async('nodebuffer')), {
      binary: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
      createFolders: false,
      date: fixedDate
    });
  }
}

const outputBytes = await normalised.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
  platform: 'DOS',
  streamFiles: false
});
await writeFile(packagePath, outputBytes);

process.stdout.write(`${JSON.stringify({
  packagePath,
  entries: Object.keys(source.files).length,
  bytes: outputBytes.length,
  sha256: createHash('sha256').update(outputBytes).digest('hex').toUpperCase(),
  fixedZipTimestamp: '1980-01-01T00:00:00 local ZIP time'
}, null, 2)}\n`);
