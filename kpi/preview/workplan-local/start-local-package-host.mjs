import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
export const sha256=bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
export async function extractPackage(bytes,JSZip,expectedSha256) {
  const actual=sha256(bytes);
  if (!/^[A-F0-9]{64}$/.test(expectedSha256) || actual !== expectedSha256) throw new Error('Package SHA-256 does not match the explicit frozen input');
  const zip=await JSZip.loadAsync(bytes),entries=Object.keys(zip.files).filter(name => !zip.files[name].dir);
  const app=await zip.file('AppManifest.xml')?.async('string');
  const appTag=app?.match(/<App(?=[\s>])[^>]*>/)?.[0];
  const appVersion=appTag?.match(/\sVersion="([\d.]+)"/)?.[1];
  if (!appVersion) throw new Error('Missing AppManifest version');
  const webparts=entries.filter(name => /\/WebPart_[^/]+\.xml$/.test(name));
  if (webparts.length !== 1) throw new Error('Expected one supplied webpart manifest');
  const xml=await zip.file(webparts[0]).async('string'),attribute=xml.match(/ComponentManifest="([^"]+)"/);
  if (!attribute) throw new Error('Missing component manifest');
  const manifest=JSON.parse(attribute[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));
  const loader=manifest.loaderConfig;
  if (manifest.componentType !== 'WebPart' || loader.internalModuleBaseUrls.length !== 1 || loader.internalModuleBaseUrls[0] !== 'HTTPS://SPCLIENTSIDEASSETLIBRARY/') throw new Error('Unsupported component or package asset base');
  const assets=new Map();
  for (const [id,resource] of Object.entries(loader.scriptResources)) {
    if (resource.type !== 'path') continue;
    if (!/^[\w.-]+\.js$/.test(resource.path)) throw new Error('Unsupported package script path');
    const name=`ClientSideAssets/${resource.path}`,file=zip.file(name);
    if (!file) throw new Error('Package script asset absent');
    assets.set(id,{name,url:`/assets/${resource.path}`,bytes:await file.async('nodebuffer')});
  }
  const entry=assets.get(loader.entryModuleId),strings=assets.get('PerformanceHubWebPartStrings'),moduleId=`${manifest.id}_${manifest.version}`;
  if (!entry || !strings || assets.size !== 2 || !entry.bytes.includes(Buffer.from(`define("${moduleId}"`))) throw new Error('PerformanceHub shipped AMD identity/assets mismatch');
  const images=[];
  for (const name of entries.filter(name => /^ClientSideAssets\/[\w.-]+\.(png|jpg|svg)$/.test(name))) {
    const filename=path.posix.basename(name);
    if (entry.bytes.includes(Buffer.from(filename))) images.push({name,url:`/assets/${filename}`,bytes:await zip.file(name).async('nodebuffer')});
  }
  const describe=asset => ({name:asset.name,url:asset.url,sha256:sha256(asset.bytes)});
  return {entry,strings,images,info:{packageSha256:actual,packageBytes:bytes.length,appVersion,componentId:manifest.id,componentVersion:manifest.version,
    moduleId,manifestPath:webparts[0],manifestSha256:sha256(Buffer.from(xml,'utf8')),entry:describe(entry),strings:describe(strings),images:images.map(describe)}};
}
export function staticServer(files,port) {
  const origin=`http://127.0.0.1:${port}`;
  return createServer((request,response) => {
    if (request.headers.host !== `127.0.0.1:${port}`) {response.writeHead(403);response.end('Loopback host required');return;}
    if (request.method !== 'GET') {response.writeHead(405,{Allow:'GET'});response.end('GET only');return;}
    let url;try {url=new URL(request.url,origin);}catch {response.writeHead(400);response.end();return;}
    if (url.origin !== origin || !files.has(url.pathname)) {response.writeHead(404);response.end('Static asset absent');return;}
    const [body,type]=files.get(url.pathname);
    response.writeHead(200,{'Content-Type':type,'Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    response.end(body);
  });
}
export async function start(options) {
  const {repoRoot,packagePath,packageSha256,sourceCommit,port}=options;
  if (!repoRoot || !packagePath || !packageSha256 || !/^[a-f0-9]{40}$/.test(sourceCommit || '') || !Number.isInteger(port) || port<1024 || port>65535)
    throw new Error('Explicit repoRoot, packagePath, uppercase packageSha256, sourceCommit and port (1024..65535) required');
  const require=createRequire(path.resolve(repoRoot,'package.json')),JSZip=require('jszip');
  const extracted=await extractPackage(fs.readFileSync(path.resolve(packagePath)),JSZip,packageSha256);
  const tooling=path.dirname(fileURLToPath(import.meta.url));
  const info={...extracted.info,sourceCommit,sourceIdentityStatus:'Operator supplied frozen source reference; package/source binary correspondence not independently proved',
    scope:'LOCAL / NOT INSTALLED',lifetime:'Fictional browser memory only, retained across app unmount; page reload resets memory'};
  const files=new Map();
  for (const [file,type] of [['index.html','text/html'],['host.css','text/css'],['host.mjs','application/javascript'],['fixture.mjs','application/javascript'],['fixture-seed.json','application/json']])
    files.set(file === 'index.html' ? '/package-host/' : `/package-host/${file}`,[fs.readFileSync(path.join(tooling,file)),`${type}; charset=utf-8`]);
  files.set('/package-host/config.json',[Buffer.from(JSON.stringify(info)),'application/json; charset=utf-8']);
  for (const asset of [extracted.entry,extracted.strings,...extracted.images]) files.set(asset.url,[asset.bytes,asset.name.endsWith('.png') ? 'image/png' : asset.name.endsWith('.jpg') ? 'image/jpeg' : asset.name.endsWith('.svg') ? 'image/svg+xml' : 'application/javascript; charset=utf-8']);
  for (const [url,file] of [['require.js','requirejs/require.js'],['react.js','react/umd/react.production.min.js'],['react-dom.js','react-dom/umd/react-dom.production.min.js']])
    files.set(`/vendor/${url}`,[fs.readFileSync(path.resolve(repoRoot,'node_modules',file)),'application/javascript; charset=utf-8']);
  const server=staticServer(files,port);
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,info,url:`http://127.0.0.1:${port}/package-host/`};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),allowed=['repoRoot','packagePath','packageSha256','sourceCommit','port'];
  const options={};
  for (let i=0;i<args.length;i+=2) {const key=args[i].replace(/^--/,'');if (!allowed.includes(key) || !args[i+1] || Object.hasOwn(options,key)) throw new Error('Unknown, repeated or incomplete CLI option');options[key]=args[i+1];}
  options.port=Number(options.port);
  const {server,info,url}=await start(options);console.log(JSON.stringify({url,...info}));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => process.exit(0)));
}
