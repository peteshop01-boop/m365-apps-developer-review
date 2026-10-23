'use strict';
// Packages already compiled native app modules for a loopback-only browser check.
// No substitute prototype, SPFx host emulation, tenant transport or dev HTTPS server.
const path = require('node:path');
const fs = require('node:fs');
const webpack = require('webpack');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.tools/local-preview');
if (!fs.existsSync(path.join(root, 'lib/webparts/kcfExpensesHub/components/ProfileScreen.js'))) throw new Error('Run a successful native build before preview.');
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, 'entry.mjs'), `import * as React from 'react';
import * as ReactDom from 'react-dom';
import { KcfExpensesHub } from '../../lib/webparts/kcfExpensesHub/components/KcfExpensesHub.js';
import { MockExpensesService } from '../../lib/services/MockExpensesService.js';
import { nominalMaster } from '../../lib/data/nominals.js';
import logo from '../../lib/assets/foundation-logo.png';
ReactDom.render(React.createElement(KcfExpensesHub,{service:new MockExpensesService(nominalMaster),logoUrl:logo,instanceId:'local-source-preview'}),document.getElementById('app'));
`);
fs.writeFileSync(path.join(target, 'index.html'), '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KCF Expenses native component preview</title><style>body{margin:0;background:#d4e0ec;font-family:Segoe UI,Arial,sans-serif}#preview-context{height:96px;box-sizing:border-box;padding:12px 20px;color:#192e43;font-size:16px}#app{width:100%;margin:0 auto}@media(max-width:700px){#preview-context{height:72px;font-size:13px;padding:8px 12px}}</style></head><body><div id="preview-context"><strong>LOCAL SOURCE PREVIEW · NOT INSTALLED SHAREPOINT</strong><br>Actual Heft-compiled React modules · synthetic data only</div><div id="app"></div><script src="preview.js"></script></body></html>');
webpack({ mode: 'production', context: root, entry: path.join(target, 'entry.mjs'),
  output: { path: target, filename: 'preview.js', publicPath: '/' },
  resolve: { extensions: ['.js', '.mjs', '.css'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
  plugins: [new webpack.NormalModuleReplacementPlugin(/\.module\.scss$/, resource => { resource.request += '.css'; })],
  module: { rules: [
    { test: /\.module\.scss\.css$/, use: [path.join(__dirname, 'preview-style-loader.cjs'), { loader: require.resolve('css-loader'), options: { modules: { namedExport: false, localIdentName: '[name]__[local]__[hash:base64:5]' } } }] },
    { test: /\.png$/, type: 'asset/resource' }
  ] }
}, (error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; return; }
  console.log(stats.toString({ all: false, assets: true, warnings: true }));
  console.log('Local native-module preview built. SPFx host / installed TEST / QA credit: NONE.');
});
