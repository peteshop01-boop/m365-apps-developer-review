import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { EXACT_BODY_V4 } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { v4Fixture, validateV4Fixture, v4InstalledReadiness, V4_DECLARATION } from './OptionEWorkplanSubmitExactBodyV4PackageContract';
const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v)) as T;
test.each(Object.keys(V4_DECLARATION.guards))('omitted %s guard rejects fixture', guard => {
  const f = clone(v4Fixture()); delete f.actions[guard]; expect(() => validateV4Fixture(f)).toThrow();
});
test.each(Object.keys(V4_DECLARATION.guards))('changed %s expression rejects fixture', guard => {
  const f = clone(v4Fixture()); f.actions[guard].inputs = '@true'; expect(() => validateV4Fixture(f)).toThrow();
});
test('disabled generated fixture matches source contract and sealed output inventory', () => {
  const root = join(process.cwd(),'power-platform/KCFKPIOptionESubmitExactBodyV4');
  validateV4Fixture(JSON.parse(readFileSync(join(root,'exact-body-v4.disabled.fixture.json'),'utf8')));
  const manifest = JSON.parse(readFileSync(join(root,'exact-body-v4.manifest.json'),'utf8')) as {files:{path:string;sha256:string}[];sourceInventory:{path:string;sha256:string}[];installedReady:string};
  const sha = (p:string):string => createHash('sha256').update(readFileSync(p)).digest('hex').toUpperCase();
  manifest.files.forEach(f => expect(sha(join(root,f.path))).toBe(f.sha256));
  manifest.sourceInventory.forEach(f => expect(sha(join(process.cwd(),f.path))).toBe(f.sha256));
  expect(manifest.installedReady).toBe('NOT_ADMITTED');
});
test.each([undefined,{}, {capability:EXACT_BODY_V4,protectedOrigin:true}, {capability:{...EXACT_BODY_V4,storage:'v3'},protectedOrigin:true,storageEvidence:'x',hostParityEvidence:'x'}, {capability:EXACT_BODY_V4,protectedOrigin:false,storageEvidence:'x',hostParityEvidence:'x'}])('refuses unsupported installed binding %p', b => expect(v4InstalledReadiness(b)).toBe('NOT_ADMITTED'));
test('fixture admits supported expressions only and remains unresolved declaration', () => {
  validateV4Fixture(v4Fixture()); const text=JSON.stringify(v4Fixture()); expect(text).not.toMatch(/sha256\(|match\(|Excel|Premium|Preview/);
  expect(v4Fixture().state).toBe('Disabled'); expect(v4Fixture().binding).toBe('Unbound');
  const functions=Array.from(text.matchAll(/([A-Za-z][A-Za-z0-9]*)\(/g)).map(m=>m[1]);
  expect(functions.every(n => ['and','contains','outputs','equals','length','base64ToString','base64','lessOrEquals'].includes(n))).toBe(true);
});
import { validateV4SourceDomainBinding } from './OptionEWorkplanSubmitExactBodyV4PackageContract';
test.each([42,[],{},true,false,null,undefined,'','x'])('installed reference %p remains NOT_ADMITTED and native binding rejects', evidence=>{
  const binding={kind:'native',capability:EXACT_BODY_V4,protectedOrigin:true,principals:{content:301,acl:302,recovery:303},storageEvidence:evidence,hostParityEvidence:evidence};
  expect(v4InstalledReadiness(binding)).toBe('NOT_ADMITTED');expect(()=>validateV4SourceDomainBinding(binding)).toThrow();
});
test('positive strict SourceDomain binding is local only',()=>{const b={kind:'domain-test',capability:EXACT_BODY_V4,protectedOrigin:true,principals:{content:301,acl:302,recovery:303}};expect(()=>validateV4SourceDomainBinding(b)).not.toThrow();expect(v4InstalledReadiness(b)).toBe('NOT_ADMITTED');});
