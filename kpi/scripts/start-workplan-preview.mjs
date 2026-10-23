import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const previewRoot = join(root, 'preview');
const host = '127.0.0.1';
const port = Number.parseInt(process.env.KCF_KPI_PREVIEW_PORT || '4340', 10);
const source = JSON.parse(await readFile(join(root, 'data', 'KCFKPI_MASTER_IMPORT_R3.json'), 'utf8'));
const targets = new Map(source.annualTargets.map(target => [target.KPIID, target]));
const catalogue = source.kpiMaster
  .filter(item => item.IsCurrent && item.DefinitionStatus === 'Active')
  .map(item => {
    const target = targets.get(item.KPIID) || {};
    return {
      id: item.KPIID,
      wording: item.KPIWording,
      pillar: item.Pillar,
      workstream: item.Workstream,
      unit: item.UnitLabel === 'TBC' ? '' : item.UnitLabel,
      annualTarget: target.YearEndTargetValue ?? target.YearEndTargetText ?? 'Not set',
      quarters: [target.Q1TargetValue ?? target.Q1TargetText ?? '—', target.Q2TargetValue ?? target.Q2TargetText ?? '—',
        target.Q3TargetValue ?? target.Q3TargetText ?? '—', target.Q4TargetValue ?? target.Q4TargetText ?? '—']
    };
  });

if (catalogue.length !== 109) throw new Error(`Expected 109 controlled Core KPIs, found ${catalogue.length}.`);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'], ['.json', 'application/json; charset=utf-8']
]);
const publicFiles = new Map([
  ['/', join(previewRoot, 'index.html')], ['/index.html', join(previewRoot, 'index.html')],
  ['/preview.css', join(previewRoot, 'preview.css')], ['/preview.js', join(previewRoot, 'preview.js')],
  ['/assets/kcf-foundation-landscape-white.png', join(root, 'src', 'webparts', 'performanceHub', 'assets', 'kcf-foundation-landscape-white.png')]
]);

const server = createServer(async (request, response) => {
  const requestPath = new URL(request.url || '/', `http://${host}:${port}`).pathname;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (requestPath === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok', mode: 'session-only', catalogue: catalogue.length }));
    return;
  }
  if (requestPath === '/catalogue.json') {
    response.writeHead(200, { 'Content-Type': contentTypes.get('.json') });
    response.end(JSON.stringify(catalogue));
    return;
  }
  const file = publicFiles.get(normalize(requestPath).replaceAll('\\', '/'));
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    response.writeHead(200, { 'Content-Type': contentTypes.get(extname(file)) || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Preview asset unavailable');
  }
});

server.listen(port, host, () => {
  console.log('KCF KPI Workplan local preview');
  console.log(`URL: http://${host}:${port}/`);
  console.log('Mode: SESSION ONLY — no SharePoint connection and no real data saved');
  console.log('Stop: press Ctrl+C in this window');
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
