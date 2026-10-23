'use strict';
// Finite static source-preview surface, only on IPv4 loopback. No mutation route.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../.tools/local-preview');
const landing = path.resolve(__dirname, '../../../site/landing');
const landingRoutes = new Map([
  ['/apps/', 'index.html'], ['/entry/', 'expenses-entry.html'],
  ['/apps/landing.css', 'landing.css'], ['/entry/landing.css', 'landing.css'],
  ['/apps/assets/foundation-portrait-white.png', 'assets/foundation-portrait-white.png'],
  ['/entry/assets/foundation-portrait-white.png', 'assets/foundation-portrait-white.png']
]);
const allowed = new Set(fs.readdirSync(root).filter(name => /^(index\.html|preview\.js|[a-f0-9]+\.png)$/.test(name)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((request, response) => {
  let parsed;
  try { parsed = new URL(request.url, 'http://127.0.0.1:4322'); }
  catch { response.writeHead(400); response.end(); return; }
  const name = parsed.pathname === '/' ? 'index.html' : parsed.pathname.slice(1);
  const landingName = landingRoutes.get(parsed.pathname);
  if (!['GET', 'HEAD'].includes(request.method) || parsed.search || (!allowed.has(name) && !landingName)) { response.writeHead(404); response.end(); return; }
  const filePath = landingName ? path.join(landing, landingName) : path.join(root, name);
  response.setHeader('Content-Type', types[path.extname(filePath)]);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src blob:; frame-src blob:; connect-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
  if (request.method === 'HEAD') response.end();
  else {
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { if (!response.headersSent) response.writeHead(404); response.end(); });
    stream.pipe(response);
  }
});
server.listen(4322, '127.0.0.1', () => console.log('Local compiled-component preview: http://127.0.0.1:4322 — no installed TEST claim.'));
