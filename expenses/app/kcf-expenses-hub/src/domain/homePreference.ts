/** Synthetic session preference only; never an authenticated staff profile. */
export interface IDemoHomePreference {
  readonly postcode: string;
  readonly useHome: boolean;
}

/** Format only. This does not establish a real address or call a lookup service. */
export function normaliseDemoPostcode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const postcode = value.trim().toUpperCase().replace(/\s+/g, ' ');
  return /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(postcode) ? postcode : undefined;
}
