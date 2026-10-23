import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const findings = [];
const safeDomain = d => /(^|\.)(invalid|example|test)$/.test(d) || /^example\.(com|org|net)$/.test(d) || d === 'users.noreply.github.com';
const forbiddenPath = /(?:^|\/)(?:original-history\.bundle|private-anonymisation-map\.json|\.env(?:\..*)?|.*\.local\.json|KCFKPI_PEOPLE_AUTHORISED.*|.*\.xlsx|.*\.sppkg|.*\.zip)$/i;
const secret = /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g;
for (const file of [...new Set(files)]) {
  if (!fs.existsSync(file)) continue;
  if (forbiddenPath.test(file) && !file.endsWith('.example')) findings.push({ file, kind: 'excluded-private-file' });
  const bytes = fs.readFileSync(file);
  if (/\.(png|jpg|jpeg|gif|woff|ttf|eot)$/i.test(file)) {
    if (!file.startsWith('src/webparts/performanceHub/assets/')) findings.push({ file, kind: 'unreviewed-binary' });
    continue;
  }
  if (bytes.includes(0)) { findings.push({ file, kind: 'unreviewed-binary' }); continue; }
  const text = bytes.toString('utf8');
  for (const match of text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/ig)) {
    if (!safeDomain(match[1].toLowerCase())) findings.push({ file, kind: 'non-synthetic-email', line: text.slice(0, match.index).split('\n').length });
  }
  if (secret.test(text)) findings.push({ file, kind: 'credential-pattern' });
  secret.lastIndex = 0;
  if (/C:[\\/]+Users[\\/]+(?!Developer\b)[^\\/\s"'<>]+/i.test(text)) findings.push({ file, kind: 'personal-machine-path' });
  if (/C:[\\/]KCF[\\/]KPI[\\/]_CONTROL/.test(text) && /\.test\.tsx?$/.test(file)) findings.push({ file, kind: 'non-portable-test-dependency' });
}
if (findings.length) { console.error(JSON.stringify({ status: 'FAIL', files: files.length, findings }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ status: 'PASS', files: files.length, scope: 'Source, synthetic fixtures and repository documents. Pattern and known-identifier scan; developer review, not independent security certification.' }, null, 2));
