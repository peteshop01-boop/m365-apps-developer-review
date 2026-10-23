import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = '.test-fixtures/hash';
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
fs.mkdirSync(root + '/vectors', { recursive: true });
const sizes = JSON.parse(fs.readFileSync('tests/fixtures/hash-vector-sizes.json', 'utf8'));
const rows = sizes.map(({ name, bytes }, index) => {
  const input = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) input[i] = (i * 37 + index * 11) & 255;
  const file = root + '/vectors/' + index + '.bin';
  fs.writeFileSync(file, input);
  return { name, bytes, path: file, sha256: sha(input) };
});
fs.writeFileSync(root + '/full-byte-hash-results.json', JSON.stringify({ rows }));
const history = root + '/history';
fs.mkdirSync(history, { recursive: true });
const whole = createHash('sha256');
const put = (u, input) => {
  fs.writeFileSync(path.join(history, u + '.bin'), input);
  return { u, n: input.length, h: sha(input) };
};
const leaves = Array.from({ length: 66 }, (_, i) => {
  const bytes = Buffer.alloc(i === 65 ? 1 : 1000000);
  for (let j = 0; j < bytes.length; j++) bytes[j] = (i * 17 + j) & 255;
  whole.update(bytes);
  return put('leaf-' + i, bytes);
});
const p = 'SYNTHETIC:portable-history';
const pages = [leaves.slice(0, 64), leaves.slice(64)].map((e, i) =>
  put('page-' + i, Buffer.from(JSON.stringify({ l: 0, p, e }))));
const r = put('root', Buffer.from(JSON.stringify({ l: 1, p, e: pages })));
fs.writeFileSync(history + '/descriptor.json', JSON.stringify({ r, z: 2, h: whole.digest('hex').toUpperCase(), n: 65000001, p }));
console.log('Prepared 48 synthetic full-byte vectors and 65,000,001-byte synthetic history (66 leaves, 3 manifest files).');
