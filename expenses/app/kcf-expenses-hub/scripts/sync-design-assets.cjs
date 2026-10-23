'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const derivedLogoSha256 = '410708bdc2bdb26b6a3e011a58b072d2376d595519c95b4b54691e82ed841fff';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function validateDerivedLogo(preview, suppliedBytes) {
  const embedded = /<img[^>]+src="data:image\/png;base64,([^"]+)"/.exec(preview);
  if (!embedded) throw new Error('Exact derived preview crest is missing. Do not substitute a logo.');
  const derived = Buffer.from(embedded[1], 'base64');
  if (sha256(derived) !== derivedLogoSha256) throw new Error('Approved derived crest provenance changed; explicit asset review required.');
  if (suppliedBytes && !Buffer.from(suppliedBytes).equals(derived)) throw new Error('Public crest differs from approved derived PNG. Do not substitute a logo.');
  return Buffer.from(derived);
}

function prepareAssets() {
  const root = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(root, '../..');
  const masterBytes = fs.readFileSync(path.join(repoRoot, 'design/data/nominals_approved_195.json'));
  const master = JSON.parse(masterBytes.toString('utf8'));
  if (master.count !== 195 || master.nominals.length !== 195 || new Set(master.nominals.map(n => n.code)).size !== 195)
    throw new Error('Approved master must retain all 195 unique codes.');
  for (const n of master.nominals) {
    if (!/^\d{5}$/.test(n.code) || !n.description || typeof n.active !== 'boolean' || typeof n.travel !== 'boolean'
      || typeof n.sortOrder !== 'number' || typeof n.searchText !== 'string') throw new Error('Invalid reference master entry.');
  }
  const preview = fs.readFileSync(path.join(repoRoot, 'design/preview/KCF_Expenses_Design_Review_v3.html'), 'utf8');
  const input = path.join(repoRoot, 'public/assets/foundation-logo.png');
  const logo = validateDerivedLogo(preview, fs.existsSync(input) ? fs.readFileSync(input) : undefined);
  // Validate every input before writing generated source. Later full-resolution
  // transfer needs a separately reviewed provenance change, never an auto bypass.
  const hash = sha256(masterBytes);
  fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/data/nominals.ts'),
    `// Generated from design/data/nominals_approved_195.json; reference only.\n// SHA-256 ${hash}\nimport type { INominal } from '../domain/contracts';\nexport const nominalMaster: ReadonlyArray<INominal> = ${JSON.stringify(master.nominals, null, 2)};\n`);
  const output = path.join(root, 'src/assets');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'foundation-logo.png'), logo);
  fs.writeFileSync(path.join(output, 'foundationLogo.ts'), "// Exact approved derived preview crest; bytes copied unchanged.\nimport logo from './foundation-logo.png';\nexport const foundationLogo: string = logo;\n");
  console.log(`Exact derived crest verified; SHA-256 ${derivedLogoSha256}. Full-resolution original not acquired.`);
  console.log(`195 nominal references retained; master SHA-256 ${hash}. No live data read.`);
}
module.exports = { validateDerivedLogo };
if (require.main === module) prepareAssets();
