/** Accept only a confirmed modern page in the existing Automation TEST area. */
export function confirmedTestPage(value?: string): string | undefined {
  if (!value || value.trim() !== value || value.includes('\\') || Array.from(value).some(character => character.charCodeAt(0) <= 32)) return undefined;
  try {
    const page = new URL(value);
    if (page.protocol !== 'https:' || page.hostname !== 'example.invalid' ||
      page.port || page.username || page.password || page.search || page.hash ||
      !/^\/sites\/REVIEW-TEST-SITE\/SitePages\/[A-Za-z0-9_-]+\.aspx$/.test(page.pathname)) return undefined;
    // Reject normalised traversal and encoded path separators rather than silently rewriting input.
    if (page.href !== value) return undefined;
    return page.href;
  } catch { return undefined; }
}
