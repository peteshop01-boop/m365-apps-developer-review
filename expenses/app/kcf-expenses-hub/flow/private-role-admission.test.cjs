'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createPlan, keys } = require('./private-fixture.cjs');
const { SITE } = require('./build-flow.cjs');
const approved = require('../../../design/data/nominals_approved_195.json').nominals;
// Fictional role IDs exercise source admission. They are not tenant bindings.
function input() {
  return { runId: '22abcdef0001', month: '2026-10', claimantId: 11, processorId: 99, unrelatedId: 22, provisionerId: 12,
    roles: {
      claimant: { '1': {id:101,high:'0',low:'196609'}, '3': {id:103,high:'0',low:'196611'} },
      processor: Object.fromEntries([1,3,5,7].map(n => [n,{id:200+n,high:'1073741824',low:String(201523296+n)}]))
    }, eligibleCodes: approved.map(n => n.code) };
}
const plan = s => createPlan(JSON.stringify(s), JSON.stringify({site:SITE,lists:{value:[]}}));
test('all nine ACL manifests bind distinct claimant and processor profiles without changing nominal pairs or enabling writes', () => {
  const s=input(), p=plan(s);
  assert.equal(p.tenantWriteAllowed,false);
  assert.deepEqual(p.requests.map(r=>r.key),keys);
  for(const r of p.requests) {
    const [claimant,processor]=r.afterCreate.acl;
    assert.equal(claimant.principalId,11); assert.equal(processor.principalId,99);
    assert.equal(claimant.high,'0'); assert.equal(processor.high,'1073741824');
    assert.equal(claimant.roleId,r.key==='requests'?103:101);
    const itemMask=['expenses','operations'].includes(r.key)?7:r.key==='claims'?5:['results','audit'].includes(r.key)?3:1;
    assert.equal(processor.roleId,200+itemMask);
    assert.notEqual(claimant.roleId,processor.roleId);
    assert.equal(BigInt(processor.low)&7n,BigInt(itemMask));
  }
  assert.equal(p.fieldContract.expenses.some(f=>f.name==='ExpenseCategory'),false);
});
test('legacy shared profiles are rejected even with processor enumeration dependencies', () => {
  const s=input(); s.roles=s.roles.processor;
  assert.throws(()=>plan(s),/FIXTURE_KEYS/);
});
for(const fault of ['shared id','within actor alias','extra claimant edit','missing processor edit','missing actor','numeric high','negative low','leading zero','overflow','unknown role field']) test('closed role shape rejects '+fault,()=>{
  const s=input();
  if(fault==='shared id') s.roles.processor['1'].id=s.roles.claimant['1'].id;
  if(fault==='within actor alias') s.roles.claimant['3'].id=s.roles.claimant['1'].id;
  if(fault==='extra claimant edit') s.roles.claimant['5']={id:105,high:'0',low:'196613'};
  if(fault==='missing processor edit') delete s.roles.processor['5'];
  if(fault==='missing actor') delete s.roles.claimant;
  if(fault==='numeric high') s.roles.processor['1'].high=1073741824;
  if(fault==='negative low') s.roles.claimant['1'].low='-1';
  if(fault==='leading zero') s.roles.claimant['1'].low='0196609';
  if(fault==='overflow') s.roles.processor['1'].high='4294967296';
  if(fault==='unknown role field') s.roles.claimant['1'].approved=true;
  assert.throws(()=>plan(s),/^Error: FIXTURE_/);
});
for(const actor of ['claimant','processor']) {
  for(const bit of [8n,16n,128n,256n,512n,2048n,262144n,524288n,1048576n,2097152n,4194304n,8388608n,16777216n,33554432n,268435456n,536870912n,1073741824n,2147483648n]) {
    test(actor+' rejects unapproved Low bit '+bit,()=>{
      const s=input(), r=s.roles[actor]['1']; r.low=String(BigInt(r.low)|bit);
      assert.throws(()=>plan(s),/FIXTURE_ROLE_RIGHTS/);
    });
  }
  for(const bit of [1n,16n,32n,64n,128n,256n,2147483648n]) {
    test(actor+' rejects unapproved High bit '+bit,()=>{
      const s=input(), r=s.roles[actor]['1']; r.high=String(BigInt(r.high)|bit);
      assert.throws(()=>plan(s),/FIXTURE_ROLE_RIGHTS/);
    });
  }
}
test('claimant cannot enumerate permissions or inherit processor support rights',()=>{
  for(const [word,bit] of [['high',1073741824n],['low',64n],['low',67108864n],['low',134217728n]]) {
    const s=input(), r=s.roles.claimant['1']; r[word]=String(BigInt(r[word])|bit);
    assert.throws(()=>plan(s),/FIXTURE_ROLE_RIGHTS/);
  }
});
test('processor cannot omit enumeration or any of its documented read dependencies',()=>{
  for(const [word,bit] of [['high',1073741824n],...([1n,32n,64n,65536n,131072n,67108864n,134217728n].map(n=>['low',n]))]) {
    const s=input(), r=s.roles.processor['1']; r[word]=String(BigInt(r[word])&~bit);
    assert.throws(()=>plan(s),/FIXTURE_ROLE_RIGHTS/);
  }
});
test('bare item masks and escalation of any profile stay held',()=>{
  for(const actor of ['claimant','processor']) for(const mask of Object.keys(input().roles[actor])) {
    const s=input(); s.roles[actor][mask].low=mask;
    assert.throws(()=>plan(s),/FIXTURE_ROLE_RIGHTS/);
    const altered=input(); altered.roles[actor][mask].low=String(BigInt(altered.roles[actor][mask].low)|8n);
    assert.throws(()=>plan(altered),/FIXTURE_ROLE_RIGHTS/);
  }
});
test('only named optional claimant document/form read bits are admitted; no native grant is made',()=>{
  for(const bits of [32n,4096n,4128n]) {
    const s=input(); s.roles.claimant['1'].low=String(BigInt(s.roles.claimant['1'].low)|bits);
    assert.equal(plan(s).tenantWriteAllowed,false);
  }
  const s=input(); s.roles.processor['1'].low=String(BigInt(s.roles.processor['1'].low)|4096n);
  assert.throws(()=>plan(s),/FIXTURE_ROLE_RIGHTS/);
});
