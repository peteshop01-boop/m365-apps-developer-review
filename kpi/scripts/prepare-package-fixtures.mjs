import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
const crc32 = buffer => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
};

function deterministicZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of sorted) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8); localHeader.writeUInt16LE(0, 10); localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(crc, 14); localHeader.writeUInt32LE(data.length, 18); localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26); localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(20, 4); centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8); centralHeader.writeUInt16LE(0, 10); centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14); centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20); centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28); centralHeader.writeUInt16LE(0, 30); centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34); centralHeader.writeUInt16LE(0, 36); centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42); central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBytes = central.reduce((sum, value) => sum + value.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralBytes, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, ...central, end]);
}

const specs = [
 ['power-platform/KCFKPIEmployeeTESTProcessor/TenantLayer','Package/KCFKPIEmployeeC2bTenantLayerDisabled_1_0_1_0.zip','tenant-layer-manifest.json'],
 ['power-platform/KCFKPIOptionESubmitV1','Package/KCFKPIOptionESubmitV1_1_0_3_0.zip','option-e-submit-manifest.json']
];
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
for(const [root,output,manifestName] of specs) {
 const folder=path.join(root,'PackageSource');
 const entries=walk(folder).map(f=>({name:path.relative(folder,f).replaceAll('\\','/'),data:fs.readFileSync(f)}));
 for(const entry of entries.filter(e=>e.name.endsWith('.json'))){
  const value=JSON.parse(entry.data.toString('utf8'));
  const definition=value.properties?.definition;
  const triggerless = Object.keys(definition?.triggers || {}).length === 0;
  if(definition && ((triggerless ? value.properties.enabled === true || value.properties.activated === true : value.properties.enabled !== false || value.properties.activated !== false)
    || Object.values(value.properties.connectionReferences || {}).some(c => c.connectionId !== null)
    || Object.values(definition.parameters?.$connections?.defaultValue || {}).some(c => c !== null)
    || Object.entries(definition.parameters || {}).some(([key, parameter]) => key !== '$connections' && !(key === '$authentication' && parameter.defaultValue && Object.keys(parameter.defaultValue).length === 0) && parameter.defaultValue !== null)))
   throw Error('Test package is enabled or has native bindings');
 }
 const bytes=deterministicZip(entries);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,manifestName),'utf8'));
 const declared=(manifest.generatedFiles||manifest.files||[]).find(e=>e.file?.replaceAll('\\','/')===output);
 const hash=createHash('sha256').update(bytes).digest('hex').toUpperCase();
 if(declared && (declared.sha256!==hash || declared.bytes!==bytes.length))throw Error('Fixture package identity differs from original manifest: '+output);
 fs.mkdirSync(path.dirname(path.join(root,output)),{recursive:true});fs.writeFileSync(path.join(root,output),bytes);
 console.log('Recreated disabled/unbound test package from reviewed source:',root,hash);
}
