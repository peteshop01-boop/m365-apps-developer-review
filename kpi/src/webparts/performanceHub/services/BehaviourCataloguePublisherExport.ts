import type { IBehaviourCatalogueAdminAuthority } from './BehaviourCatalogueAdministration';
import type { IBehaviourSharePointCoordinates } from './SharePointBehaviourCatalogueAdministrationStore';

/** Exact closed CatalogueExactBodyReaderV4 publisher body. Native producers are not supplied here. */
export interface IBehaviourCataloguePublisherReadbackV4 {
  contract: 'kcf.option-e.catalogue-publisher-readback/v4';
  native: Readonly<IBehaviourSharePointCoordinates & { version: string; etag: string }>;
  fields: Readonly<Record<string, unknown>>;
  authority: Readonly<IBehaviourCatalogueAdminAuthority>;
  counts: Readonly<{ versions: number; events: number; targets: number }>;
  publisherPrincipal: number;
}

/** Deliberately incomplete: cannot be submitted to the closed receiver as a publisher receipt. */
export interface IBehaviourCataloguePublisherExportHold {
  status: 'HOLD';
  missingInputs: readonly string[];
  candidate?: Readonly<Omit<IBehaviourCataloguePublisherReadbackV4, 'publisherPrincipal'>>;
  canonicalBody?: string;
}
