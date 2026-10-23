import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const JSZip = require('jszip');
const port = Number(process.env.KCF_PACKAGE_HOST_PORT || 4472);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid loopback port');
const origin = `http://127.0.0.1:${port}`;
const packagePath = path.join(root, 'sharepoint/solution/kcf-performance-hub.sppkg');
const bytes = fs.readFileSync(packagePath);
const hash = data => createHash('sha256').update(data).digest('hex').toUpperCase();
const zip = await JSZip.loadAsync(bytes);
const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
const app = await zip.file('AppManifest.xml')?.async('string');
if (!app || !/Version="1\.0\.0\.0"/.test(app)) throw new Error('Unexpected AppManifest');
const webparts = entries.filter(name => /\/WebPart_[^/]+\.xml$/.test(name));
if (webparts.length !== 1) throw new Error('Ambiguous webpart manifest');
const xml = await zip.file(webparts[0]).async('string');
const attribute = xml.match(/ComponentManifest="([^"]+)"/);
if (!attribute) throw new Error('Missing component manifest');
const manifest = JSON.parse(attribute[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
const loader = manifest.loaderConfig;
if (loader.internalModuleBaseUrls.length !== 1 || loader.internalModuleBaseUrls[0] !== 'HTTPS://SPCLIENTSIDEASSETLIBRARY/') throw new Error('Unexpected asset base');
const resources = loader.scriptResources;
const assets = new Map();
for (const [id, resource] of Object.entries(resources)) {
  if (resource.type !== 'path' || !/^[\w.-]+\.js$/.test(resource.path)) continue;
  const name = `ClientSideAssets/${resource.path}`;
  if (!zip.file(name)) throw new Error(`Missing package asset: ${name}`);
  assets.set(id, { name, url: `/assets/${resource.path}`, bytes: await zip.file(name).async('nodebuffer') });
}
const entry = assets.get(loader.entryModuleId);
const strings = assets.get('PerformanceHubWebPartStrings');
if (!entry || !strings || assets.size !== 2) throw new Error('Unexpected package entry/string assets');
if (!entry.bytes.includes(Buffer.from(`define("${manifest.id}_${manifest.version}"`))) throw new Error('AMD module identity mismatch');
const referencedImages = [];
for (const name of entries.filter(name => /^ClientSideAssets\/[\w.-]+\.(png|jpg|svg)$/.test(name))) {
  const filename = path.posix.basename(name);
  if (!entry.bytes.includes(Buffer.from(filename))) continue;
  referencedImages.push({ name, url: `/assets/${filename}`, bytes: await zip.file(name).async('nodebuffer') });
}
const info = { packageSha256: hash(bytes), packageBytes: bytes.length, appVersion: '1.0.0.0', componentId: manifest.id,
  componentVersion: manifest.version, moduleId: `${manifest.id}_${manifest.version}`, manifestPath: webparts[0],
  entry: { name: entry.name, url: entry.url, sha256: hash(entry.bytes) },
  strings: { name: strings.name, url: strings.url, sha256: hash(strings.bytes) },
  images: referencedImages.map(image => ({ name: image.name, url: image.url, sha256: hash(image.bytes) })) };
const preview = path.join(root, 'preview/package-host');
const fixtureModule = path.join(root, 'lib-commonjs/webparts/performanceHub/test/ReportingDecisionFixtures.js');
if (!fs.existsSync(fixtureModule)) throw new Error('Compile the focused synthetic Reporting fixture before starting the host');
const { buildDecisionReportingDataset } = require(fixtureModule);
const validDataset = buildDecisionReportingDataset();
const malformedDataset = structuredClone(validDataset);
malformedDataset.core.executive.rows[0].submissionState = 'Hostile';
const vendor = new Map([
  ['/vendor/require.js', path.join(root, 'node_modules/requirejs/require.js')],
  ['/vendor/react.js', path.join(root, 'node_modules/react/umd/react.production.min.js')],
  ['/vendor/react-dom.js', path.join(root, 'node_modules/react-dom/umd/react-dom.production.min.js')]
]);
const files = new Map([
  ['/package-host/', [fs.readFileSync(path.join(preview, 'index.html')), 'text/html; charset=utf-8']],
  ['/package-host/host.js', [fs.readFileSync(path.join(preview, 'host.js')), 'application/javascript; charset=utf-8']],
  ['/package-host/config.json', [Buffer.from(JSON.stringify(info)), 'application/json; charset=utf-8']],
  ['/package-host/valid-fixture.json', [Buffer.from(JSON.stringify(validDataset)), 'application/json; charset=utf-8']],
  ['/package-host/malformed-fixture.json', [Buffer.from(JSON.stringify(malformedDataset)), 'application/json; charset=utf-8']],
  [entry.url, [entry.bytes, 'application/javascript; charset=utf-8']],
  [strings.url, [strings.bytes, 'application/javascript; charset=utf-8']]
]);
for (const image of referencedImages) files.set(image.url, [image.bytes, image.name.endsWith('.png') ? 'image/png' : image.name.endsWith('.jpg') ? 'image/jpeg' : 'image/svg+xml']);
for (const [url, source] of vendor) files.set(url, [fs.readFileSync(source), 'application/javascript; charset=utf-8']);
const server = createServer((request, response) => {
  if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403); response.end('Host denied'); return; }
  if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end('Read only'); return; }
  let url;
  try { url = new URL(request.url, origin); } catch { response.writeHead(400); response.end(); return; }
  if (url.origin !== origin || !files.has(url.pathname)) { response.writeHead(404); response.end('Not found'); return; }
  const [body, type] = files.get(url.pathname);
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" });
  response.end(body);
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ url: `${origin}/package-host/`, ...info })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
