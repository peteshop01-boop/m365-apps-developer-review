import { createOptionEWorkplanRequestChangesV2Processor } from './OptionEWorkplanRequestChangesV2Processor';
import type { Native } from '../models/OptionEWorkplanReviewV1Models';

test('unbound RequestChanges processor holds before source access', async () => {
  const source: Native = { siteId: 'fictional-site', webId: 'fictional-web', listId: 'fictional-command-list',
    itemId: 1, version: 'opaque-version', etag: '"command-1"' };
  expect(await createOptionEWorkplanRequestChangesV2Processor().process(source))
    .toEqual({ outcome: 'RecoveryHold', reason: 'ProcessorUnbound' });
});
