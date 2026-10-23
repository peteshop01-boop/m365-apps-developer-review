import { createOptionEWorkplanReviewV1Processor } from './OptionEWorkplanReviewV1Processor';
test('factory stays unbound without an explicit source store', async () => {
  expect(await createOptionEWorkplanReviewV1Processor().process({ siteId: 'site', webId: 'web', listId: 'commands', itemId: 5, version: '1.0', etag: '"1"' }))
    .toEqual({ outcome: 'RecoveryHold', reason: 'ProcessorUnbound' });
});
