import { DigestCache } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { IRequestTransportBinding } from './BrowserRequestTransport';
import { SharePointRequestChannel, composeBrowserRequestChannel, createStaffExpenseEntry } from './SharePointRequestChannel';
import type { ExpenseEntryAdapter } from '../services/persistence/ExpenseEntryAdapter';
import type { IStandardStoreSchema } from './SharePointStandardStore';

/** Supported SPFx public APIs only. Not invoked by the current web part, which
 * remains createHeldExpenseEntry. No Boolean, button or web-part property can
 * call/enable this source composition. A reviewed deployment change is required. */
export function createSpfxRequestChannel(context: Pick<WebPartContext, 'pageContext' | 'serviceScope'>,
  binding: IRequestTransportBinding, schema: IStandardStoreSchema): SharePointRequestChannel {
  return composeBrowserRequestChannel({ currentUrl: () => globalThis.location.href,
    webAbsoluteUrl: () => context.pageContext.web.absoluteUrl,
    fetch: (url, options) => globalThis.fetch(url, options),
    fetchDigest: webUrl => context.serviceScope.consume(DigestCache.serviceKey).fetchDigest(webUrl)
  }, binding, schema);
}

/** Signed-in staff plus authoritative roster/Draft discovery. No deployment
 * claimant/parent, no UI/property/query activation route. This does not qualify
 * the imported single-claimant flow or create/grant any employee resources. */
export function createSpfxExpenseEntry(context: Pick<WebPartContext, 'pageContext' | 'serviceScope'>,
  binding: IRequestTransportBinding, schema: IStandardStoreSchema, month: () => string): ExpenseEntryAdapter {
  return createStaffExpenseEntry(createSpfxRequestChannel(context, binding, schema), month);
}
