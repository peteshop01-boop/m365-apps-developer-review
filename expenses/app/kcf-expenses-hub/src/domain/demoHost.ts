/** Scope guard for this source-only demonstration; it is not an authorisation mechanism. */
export function isDemoTestSite(siteUrl: string): boolean {
  try {
    const site = new URL(siteUrl);
    return site.protocol === 'https:' && site.hostname.toLowerCase() === 'example.invalid'
      && site.pathname.replace(/\/$/, '').toLowerCase() === '/sites/REVIEW-TEST-SITE'
      && !site.username && !site.password && !site.port && !site.search && !site.hash;
  } catch { return false; }
}
