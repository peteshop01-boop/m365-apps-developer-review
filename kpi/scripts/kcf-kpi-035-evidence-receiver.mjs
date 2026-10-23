import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const outputPath = process.argv[2];
const port = Number(process.argv[3] || 4355);
const allowedOrigin = 'https://example.invalid';

if (!outputPath || !isAbsolute(outputPath)) throw new Error('An absolute evidence output path is required.');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('A valid localhost port is required.');

const headers = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
  'Cache-Control': 'no-store'
};

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, headers);
    response.end();
    return;
  }
  if (request.method !== 'POST' || request.url !== '/evidence' || request.headers.origin !== allowedOrigin) {
    response.writeHead(403, headers);
    response.end('Forbidden');
    return;
  }
  const chunks = [];
  let length = 0;
  request.on('data', chunk => {
    length += chunk.length;
    if (length > 10 * 1024 * 1024) request.destroy(new Error('Evidence body exceeded 10 MiB.'));
    else chunks.push(chunk);
  });
  request.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      JSON.parse(body.toString('utf8'));
      await writeFile(resolve(outputPath), body, { flag: 'wx' });
      response.writeHead(201, { ...headers, 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ outputPath: resolve(outputPath), bytes: body.length }));
      process.stdout.write(`${JSON.stringify({ outputPath: resolve(outputPath), bytes: body.length })}\n`);
      server.close();
    } catch (error) {
      response.writeHead(500, headers);
      response.end(String(error?.message || error));
      process.stderr.write(`${String(error?.stack || error)}\n`);
      server.close();
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({ listening: `http://127.0.0.1:${port}/evidence`, outputPath: resolve(outputPath) })}\n`);
});
