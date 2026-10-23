import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const webpack = require('webpack');
const host = '127.0.0.1';
const port = Number(process.env.KCF_UNIFIED_PREVIEW_PORT || 4461);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 4455) throw new Error('Choose a free loopback port other than 4455.');
const out = path.join(root, 'temp', 'pm40-unified-preview');
const entry = path.join(out, 'entry.js');
fs.mkdirSync(out, { recursive: true });
const compiledHarness = path.join(root, 'lib/webparts/performanceHub/testing/UnifiedLocalPreviewHarness.js');
if (!fs.existsSync(compiledHarness)) throw new Error('Compile the local preview harness with heft build first.');
fs.writeFileSync(entry, `import { mountUnifiedLocalPreview } from ${JSON.stringify(compiledHarness.replaceAll('\\', '/'))};\nmountUnifiedLocalPreview(document.getElementById('integrated-root'));\n`);

const compiler = webpack({ mode: 'development', context: root, entry, devtool: false, cache: false,
  output: { path: out, filename: 'integrated.js', publicPath: '/' },
  resolve: { extensions: ['.js', '.json'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
  plugins: [new webpack.NormalModuleReplacementPlugin(/\.module\.scss$/, resource => { resource.request += '.css'; })],
  module: { rules: [{ test: /\.scss\.css$/, use: [{ loader: require.resolve('@microsoft/sp-css-loader'), options: {
    production: false, generateCssClassName: (name, file, content) => `${name}_${createHash('sha256').update(path.basename(file) + content).digest('hex').slice(0, 8)}`
  } }] }, { test: /\.(png|jpg|svg|woff2?|ttf|eot)$/, type: 'asset/resource' }] }
});
const stats = await new Promise((resolve, reject) => compiler.run((error, value) => error ? reject(error) : resolve(value)));
await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
if (stats.hasErrors()) throw new Error(JSON.stringify(stats.toJson({ all: false, errors: true }).errors));

const preview = path.join(root, 'preview', 'unified');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const source = pathname === '/' ? path.join(preview, 'index.html')
    : pathname === '/preview.css' || pathname === '/preview.js' ? path.join(preview, pathname.slice(1))
      : path.resolve(out, '.' + pathname);
  if (![preview, out].some(base => source.startsWith(base + path.sep)) || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.setHeader('Content-Type', types[path.extname(source)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store');
  response.end(fs.readFileSync(source));
});
server.listen(port, host, () => console.log(`PM40 unified synthetic preview http://${host}:${port}/ PID ${process.pid}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
