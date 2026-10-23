import type { IOptionEPeopleRow } from '../models/OptionEWorkplanSubmitModels';
import type { Native, ReviewAuthorityV1, ManagerCommandObservationV1, ReviewResultV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { IOptionEReviewIntent } from './OptionEWorkplanReviewContract';
import type { RequestChangesFinalReadPorts } from './OptionEWorkplanReviewSourceReadback';
import { createOptionEWorkplanReviewClientV1 } from './OptionEWorkplanReviewClientV1';

/** Local composition only. These ports do not attest native authentication, immutable
 * storage, processor admission or permission to write any protected Workplan. */
export interface RequestChangesClientPorts {
  readonly readCurrentActor: () => Promise<IOptionEPeopleRow>;
  readonly readCurrentAuthority: (workplan: string) => Promise<ReviewAuthorityV1>;
  readonly createImmutableManagerCommand: (exactBody: string) => Promise<void>;
  readonly readImmutableManagerCommand: (commandKey: string) => Promise<ManagerCommandObservationV1 | undefined>;
  readonly processRequestChanges: (source: Native) => Promise<ReviewResultV1>;
  readonly finalReadPorts: RequestChangesFinalReadPorts;
}
/** Closed RequestChanges wrapper; retains the strict RequestChanges final ACL profile. */
export function createOptionEWorkplanRequestChangesV1Client(input: IOptionEReviewIntent, supplied?: RequestChangesClientPorts): {
  submit(): Promise<ReviewResultV1>; refresh(): Promise<ReviewResultV1>; getIntent(): IOptionEReviewIntent;
} {
  return createOptionEWorkplanReviewClientV1(input, 'RequestChanges', supplied);
}
