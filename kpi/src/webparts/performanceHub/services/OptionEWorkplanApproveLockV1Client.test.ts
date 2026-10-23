import { createOptionEWorkplanApproveLockV1Client } from './OptionEWorkplanApproveLockV1Client';
import type { IOptionEReviewIntent } from './OptionEWorkplanReviewContract';
const intent: IOptionEReviewIntent = { commandKey: 'fb1f6035-236e-434c-ae05-a78003badd47', command: 'ApproveLock', actorPersonKey: 'manager',
  expectedWorkplanKey: 'employee|2026', expectedControlEtag: '"7"', expectedControlVersion: 7, expectedSubmittedSnapshotKey: 'submitted' };
test('unbound Approve client holds without supplying native admission', async () => {
  const client = createOptionEWorkplanApproveLockV1Client(intent);
  expect(await client.submit()).toEqual({ outcome: 'RecoveryHold', reason: 'ClientUnbound' });
  expect(await client.refresh()).toEqual({ outcome: 'RecoveryHold', reason: 'ClientUnbound' });
});
test('Approve intent is detached from caller and returned mutations', () => {
  const input = { ...intent }, client = createOptionEWorkplanApproveLockV1Client(input);
  input.expectedControlVersion = 99; client.getIntent().expectedSubmittedSnapshotKey = 'replacement';
  expect(client.getIntent()).toEqual(intent); expect(client.getIntent()).not.toHaveProperty('reason');
});
