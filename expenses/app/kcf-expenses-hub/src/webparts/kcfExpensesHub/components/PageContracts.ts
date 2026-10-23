/** Frozen page-factory contract 13 October. Integration PM alone changes this file. */
import type { ICurrentClaim, IExpenseLine, INominal } from '../../../domain/contracts';
import type { IMileageLine } from '../../../domain/mileage';
import type { IDemoHomePreference } from '../../../domain/homePreference';
import type { IDemoDecision, IDemoReviewLine } from '../../../domain/demoReview';
import type { HubRoute } from './routes';

export interface IHomePageProps { claim: ICurrentClaim; expenses: number; mileage: number; idPrefix: string; navigate: (route: HubRoute) => void; }
export interface IReviewClaimPageProps { expenses: ReadonlyArray<IExpenseLine>; journeys: ReadonlyArray<IMileageLine>; idPrefix: string; claimMonth?: string; }
export interface IDemoStaffClaim {
  readonly id: string; readonly employeeName: string; readonly managerName: string;
  readonly month: string; readonly status: 'Draft' | 'Submitted' | 'Approved' | 'Needs Changes';
  readonly lines: ReadonlyArray<IDemoReviewLine>;
  readonly selfApproval: boolean;
  readonly financeAcknowledged: boolean;
}
export interface IMyTeamPageProps { claims: ReadonlyArray<IDemoStaffClaim>; idPrefix: string; onOpen: (claimId: string) => void; }
export interface IManagerReviewPageProps {
  claim: IDemoStaffClaim; decisions: ReadonlyArray<IDemoDecision>; idPrefix: string;
  onDecision: (decision: IDemoDecision) => void;
  onSelfApproval: (enabled: boolean) => void;
}
export interface IFinancePageProps {
  claims: ReadonlyArray<IDemoStaffClaim>; decisions: ReadonlyArray<IDemoDecision>;
  nominals: ReadonlyArray<INominal>; idPrefix: string;
  onFinanceAcknowledgement: (claimId: string, accepted: boolean) => void;
}
export interface IProfilePageProps { idPrefix: string; onHomePreferenceChange?: (preference: IDemoHomePreference | undefined) => void; }
export interface IAdminPageProps { nominals: ReadonlyArray<INominal>; idPrefix: string; navigate: (route: HubRoute) => void; }
export interface IHelpPageProps { idPrefix: string; navigate: (route: HubRoute) => void; }
