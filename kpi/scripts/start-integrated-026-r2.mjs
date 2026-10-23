import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { CertificateStore } from '@rushstack/debug-certificate-manager';

const PORT = 4330;
const WORKBENCH_BOOTSTRAP_PORT = 4321;
const MARKER = 'KCF-KPI-026-R3-RENDERED-DEFECT-REPAIR-4330';
const MANIFEST = path.resolve('temp', 'build', 'manifests.js');

const listening = port => new Promise(resolveListening => {
  const socket = net.connect({ host: '127.0.0.1', port });
  const finish = value => { socket.destroy(); resolveListening(value); };
  socket.setTimeout(250);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
});

if (await listening(PORT)) {
  process.stderr.write(`${MARKER}: port ${PORT} is already occupied; refusing to attach to an unknown candidate.\n`);
  process.exit(2);
}
if (await listening(WORKBENCH_BOOTSTRAP_PORT)) {
  process.stderr.write(`${MARKER}: Workbench bootstrap port ${WORKBENCH_BOOTSTRAP_PORT} is occupied; refusing to attach to a foreign candidate.\n`);
  process.exit(2);
}

const certificateStore = new CertificateStore();
if (!certificateStore.certificateData || !certificateStore.keyData) {
  process.stderr.write(`${MARKER}: trusted Rushstack development certificate is unavailable.\n`);
  process.exit(2);
}

// SharePoint Workbench still probes its legacy bootstrap path. This candidate
// owns that path and proxies it only to the dedicated 4330 runtime. Every URL
// written into the manifest remains pinned to 4330.
const bootstrap = https.createServer({
  cert: certificateStore.certificateData,
  key: certificateStore.keyData
}, (request, response) => {
  const requestedPath = request.url === '/temp/manifests.js'
    ? '/temp/build/manifests.js'
    : request.url;
  const proxy = https.request({
    hostname: 'localhost', port: PORT, path: requestedPath,
    method: request.method, headers: request.headers, rejectUnauthorized: false
  }, upstream => {
    response.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(response);
  });
  proxy.on('error', error => {
    response.writeHead(502, { 'Content-Type': 'text/plain' });
    response.end(`${MARKER}: bootstrap proxy failed: ${error.message}`);
  });
  request.pipe(proxy);
});
bootstrap.listen(WORKBENCH_BOOTSTRAP_PORT, '0.0.0.0', () => {
  process.stdout.write(`${MARKER}: trusted Workbench bootstrap owns legacy port ${WORKBENCH_BOOTSTRAP_PORT}; candidate assets remain on ${PORT}.\n`);
});

const child = spawn(process.execPath, [
  path.resolve('node_modules', '@rushstack', 'heft', 'bin', 'heft'),
  'start', '--clean', '--nobrowser'
], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });

const patchManifest = () => {
  try {
    if (!existsSync(MANIFEST)) return;
    const original = readFileSync(MANIFEST, 'utf8');
    // During --clean webpack creates/truncates this path before writing the
    // complete loader. Never turn that transient file into a marker-only
    // manifest; wait for the actual web-part manifest before rewriting URLs.
    if (original.length < 500 || !original.includes('fdda2947-ce80-4419-abe4-2f51bb7e0423')) return;
    const withoutMarker = original.replace(/\s*\/\* KCF-KPI-026-R3-RENDERED-DEFECT-REPAIR-4330 \*\/\s*$/, '');
    const isolated = withoutMarker.replace(/https?:\/\/localhost:\d+/g, `https://localhost:${PORT}`);
    const next = `${isolated.trimEnd()}\n/* ${MARKER} */\n`;
    if (next !== original) {
      writeFileSync(MANIFEST, next, 'utf8');
      process.stdout.write(`${MARKER}: manifest rewritten to self-contained https://localhost:${PORT}.\n`);
    }
  } catch (error) {
    if (!['EBUSY', 'EPERM', 'UNKNOWN'].includes(error?.code)) throw error;
  }
};

const timer = setInterval(patchManifest, 250);
const stop = signal => {
  clearInterval(timer);
  bootstrap.close();
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('exit', code => {
  clearInterval(timer);
  bootstrap.close();
  process.exitCode = code === null ? 1 : code;
});
