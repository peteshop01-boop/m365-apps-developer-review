import { createOptionEWorkplanRequestChangesV1Client } from './OptionEWorkplanRequestChangesV1Client';
import type { IOptionEReviewIntent } from './OptionEWorkplanReviewContract';
const intent: IOptionEReviewIntent = { commandKey:'fb1f6035-236e-434c-ae05-a78003badd47',command:'RequestChanges',actorPersonKey:'manager',
  expectedWorkplanKey:'employee|2026',expectedControlEtag:'"7"',expectedControlVersion:7,expectedSubmittedSnapshotKey:'submitted',reason:' Exact reason ' };
test('an unbound client holds without inventing an available native route',async()=>{
  const client=createOptionEWorkplanRequestChangesV1Client(intent);
  expect(await client.submit()).toEqual({outcome:'RecoveryHold',reason:'ClientUnbound'});
  expect(await client.refresh()).toEqual({outcome:'RecoveryHold',reason:'ClientUnbound'});
});
test('caller and returned intent mutations cannot change the retained logical command',()=>{
  const input={...intent},client=createOptionEWorkplanRequestChangesV1Client(input);
  input.reason='Replacement';client.getIntent().reason='Changed view';
  expect(client.getIntent()).toEqual(intent);
});
