import type {
  IAnnualWorkplan,
  IBehaviourWorkplanItem,
  ICoreWorkplanItem,
  IPersonalWorkplanItem,
  IProductionPerson
} from '../models/ProductionModels';
import { getLegacySubmittedAnnualBehaviourCompatibility } from './LegacySubmittedBehaviourCompatibility';

export interface IEmployeeWorkplanStatus {
  status: IAnnualWorkplan['state'] | 'Unavailable';
  managerName: string;
  coreStatus: string;
  personalStatus: string;
  behaviourStatus: string;
  reviewState: string;
  nextAction: string;
  explanation: string;
  editable: boolean;
}

const total = (values: Array<number | undefined>): number => {
  let result = 0;
  values.forEach(value => { result += value || 0; });
  return result;
};

export const isEmployeeWorkplanEditable = (workplan: IAnnualWorkplan | undefined): boolean => Boolean(
  workplan
  && (workplan.state === 'Draft' || workplan.state === 'ChangesRequested')
  && workplan.accessState === 'EmployeeEdit'
  && workplan.transitionStatus === 'Ready'
);

const submittedDate = (value?: string): string => value
  ? new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  : 'an unavailable time';

export const buildEmployeeWorkplanStatus = (
  workplan: IAnnualWorkplan | undefined,
  manager: IProductionPerson | undefined,
  coreItems: ICoreWorkplanItem[],
  personalItems: IPersonalWorkplanItem[],
  behaviourItems: IBehaviourWorkplanItem[]
): IEmployeeWorkplanStatus => {
  const activeCore = coreItems.filter(item => item.activeInWorkplan);
  const activePersonal = personalItems.filter(item => item.activeInWorkplan);
  const activeBehaviours = behaviourItems.filter(item => item.activeInWorkplan);
  const legacyBehaviour = getLegacySubmittedAnnualBehaviourCompatibility(workplan, behaviourItems);
  const managerName = manager?.displayName || workplan?.managerDisplayName || workplan?.managerEmail || 'your manager';
  const common = {
    managerName,
    coreStatus: `${activeCore.length} selected · ${total(activeCore.map(item => item.coreWorkplanWeight))}% allocated`,
    personalStatus: activePersonal.length
      ? `${activePersonal.length} active · ${total(activePersonal.map(item => item.personalItemWeight))}% allocated`
      : 'No Personal KPIs · optional section unused',
    behaviourStatus: legacyBehaviour?.headingStatus
      || `${activeBehaviours.length} of 5 headings · ${total(activeBehaviours.map(item => item.behaviourItemWeight))}% allocated`
  };
  if (!workplan) return {
    ...common,
    status: 'Unavailable', editable: false,
    reviewState: 'Workplan data is unavailable',
    nextAction: 'Try again or contact the KPI system administrator.',
    explanation: 'Verified Workplan data is required before status or editing controls can be shown.'
  };
  switch (workplan.state) {
    case 'Draft':
      return {
        ...common, status: workplan.state, editable: isEmployeeWorkplanEditable(workplan),
        reviewState: 'Being prepared by you',
        nextAction: `Complete your Workplan and submit it to ${managerName}.`,
        explanation: 'You can edit Core, Personal and Behaviour content while the Workplan remains an editable Draft.'
      };
    case 'ChangesRequested':
      return {
        ...common, status: workplan.state, editable: isEmployeeWorkplanEditable(workplan),
        reviewState: `${managerName} requested changes`,
        nextAction: 'Update your Workplan and resubmit it to your manager.',
        explanation: workplan.managerDecisionComment
          ? `Manager comment: ${workplan.managerDecisionComment}`
          : 'The same Workplan is editable again. Its original submission history remains unchanged.'
      };
    case 'Submitted':
      return {
        ...common, status: workplan.state, editable: false,
        reviewState: `Awaiting review by ${managerName}`,
        nextAction: `Your Workplan has been submitted to ${managerName} and is awaiting manager review.`,
        explanation: `Submitted ${submittedDate(workplan.submittedAt)}. It is read-only while ${managerName} reviews it. If changes are needed, your manager must use Request Changes; editing will then become available for you to amend and resubmit.`
      };
    case 'Approved':
      return {
        ...common, status: workplan.state, editable: false,
        reviewState: `Approved by ${workplan.approvedByEmail || managerName}; final lock pending`,
        nextAction: 'No employee action is required while final lock processing completes.',
        explanation: 'The approved content is read-only. Any amendment must follow the controlled manager change route.'
      };
    case 'Locked':
      return {
        ...common, status: workplan.state, editable: false,
        reviewState: 'Manager approved and locked',
        nextAction: 'Your Workplan is approved and locked for this performance year.',
        explanation: `It was locked by ${workplan.lockedByEmail || workplan.approvedByEmail || managerName}. There is no employee Unlock action; a controlled manager/Admin reopen and audit would be required.`
      };
    default:
      return {
        ...common, status: workplan.state, editable: false,
        reviewState: 'Archived and read-only',
        nextAction: 'No employee action is required.',
        explanation: 'This historic Workplan is retained for reference and cannot be edited.'
      };
  }
};
