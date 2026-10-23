import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildC2aDefinition, buildAdmissionProofDefinition } from './c2a-definition.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const ownedRoot = path.resolve('C:/KCF/KPI/kcf-performance-hub-integrated-advance002-m179-text-boundary');
const evidenceRoot = path.resolve('C:/KCF/KPI/_CONTROL/02_QA/KCF-KPI-DELIVERY-ADVANCE-002/M179/BUILD_TEXT_BOUNDARY');
const canonical = path.join(root, 'power-platform/KCFKPIEmployeeTESTProcessor/Definitions/C2a.disabled.definition.json');
const args = process.argv.slice(2);
const hash = data => crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
let target = canonical, fixtureSha256 = null;
let definition;
if (args[0] === '--proof' && args.length === 3) {
  const fixture = path.resolve(args[1]); target = path.resolve(args[2]);
  for (const name of [fixture,target]) {
    const relative = path.relative(evidenceRoot,name);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.extname(name) !== '.json') throw Error('Proof paths must be new JSON artifacts inside the authorised evidence folder.');
    // Refuse reparse/junction escapes as well as lexical traversal.
    if (fs.realpathSync(path.dirname(name)).toLowerCase() !== path.dirname(name).toLowerCase()) throw Error('Proof path resolves outside literal evidence location.');
  }
  const raw = fs.readFileSync(fixture); fixtureSha256 = hash(raw);
  definition = buildAdmissionProofDefinition(JSON.parse(raw));
} else {
  if (!((args.length === 1 && ['--check','--write'].includes(args[0])) || (args.length === 2 && args[0] === '--regenerate' && /^[A-Fa-f0-9]{64}$/.test(args[1])))) throw Error('Use --check, --write, --regenerate BEFORE_SHA256, or --proof FIXTURE_JSON NEW_PROOF_JSON.');
  definition = buildC2aDefinition();
}
const bytes = Buffer.from(JSON.stringify(definition,null,2)+'\n');
if (args[0] === '--check') {
  if (!fs.readFileSync(target).equals(bytes)) throw Error('Generated definition differs from source.');
} else if (args[0] === '--regenerate') {
  if (root.toLowerCase() !== ownedRoot.toLowerCase() || fs.realpathSync(root).toLowerCase() !== ownedRoot.toLowerCase()) throw Error('Replacement only in authorised M179 sibling.');
  const branch = execFileSync('git',['-C',root,'--no-optional-locks','branch','--show-current'],{encoding:'utf8'}).trim();
  if (branch !== 'codex/kcf-kpi-advance002-m179-text-boundary') throw Error('Wrong replacement branch.');
  if (hash(fs.readFileSync(target)) !== args[1].toUpperCase()) throw Error('Before hash differs; replacement refused.');
  fs.writeFileSync(target,bytes);
} else {
  fs.writeFileSync(target,bytes,{flag:'wx'});
}
console.log(JSON.stringify({mode:args[0],source:path.join(directory,'c2a-definition.mjs'),sourceSha256:hash(fs.readFileSync(path.join(directory,'c2a-definition.mjs'))),target,bytes:bytes.length,outputSha256:hash(bytes),fixtureSha256,disabled:true,cloudExecuted:false}));
