import { createOptionEWorkplanReviewClientV1 } from './OptionEWorkplanReviewClientV1';
import type { IOptionEPeopleRow } from '../models/OptionEWorkplanSubmitModels';
import type { Native, ReviewAuthorityV1, ManagerCommandObservationV1, ReviewResultV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { IOptionEReviewIntent } from './OptionEWorkplanReviewContract';
import type { ReadPorts } from './OptionEWorkplanReviewSourceReadback';

/** Local source composition; these ports do not grant native write authority. */
export interface ApproveLockClientPorts {
  readonly readCurrentActor: () => Promise<IOptionEPeopleRow>;
  readonly readCurrentAuthority: (workplan: string) => Promise<ReviewAuthorityV1>;
  readonly createImmutableManagerCommand: (exactBody: string) => Promise<void>;
  readonly readImmutableManagerCommand: (commandKey: string) => Promise<ManagerCommandObservationV1 | undefined>;
  readonly processApproveLock: (source: Native) => Promise<ReviewResultV1>;
  readonly finalReadPorts: ReadPorts;
}
/** Closed ApproveLock wrapper; no manager reason enters review-command/v1. */
export function createOptionEWorkplanApproveLockV1Client(input: IOptionEReviewIntent, supplied?: ApproveLockClientPorts): {
  submit(): Promise<ReviewResultV1>; refresh(): Promise<ReviewResultV1>; getIntent(): IOptionEReviewIntent;
} {
  return createOptionEWorkplanReviewClientV1(input, 'ApproveLock', supplied);
}
