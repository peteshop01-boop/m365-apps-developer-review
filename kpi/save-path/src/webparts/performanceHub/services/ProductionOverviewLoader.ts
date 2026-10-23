import type { IProductionOverview, IReadinessContext } from '../models/ProductionModels';
import type { IProductionDataService } from './IProductionDataService';
import { evaluateReadiness } from './ReadinessService';

export const loadProductionOverview = async (
  dataService: IProductionDataService,
  currentUserEmail: string
): Promise<IProductionOverview> => {
  const messages: string[] = [];
  const readinessContext: IReadinessContext = {};
  let workplanStatus = 'Not started';

  try {
    readinessContext.employee = await dataService.getPersonByEmail(currentUserEmail);
  } catch {
    readinessContext.employeeLookupFailed = true;
    messages.push('Your production People profile could not be loaded. Please try again or contact the KPI system owner.');
  }

  if (readinessContext.employee?.managerEmail) {
    try {
      readinessContext.manager = await dataService.getPersonByEmail(readinessContext.employee.managerEmail);
    } catch {
      readinessContext.managerLookupFailed = true;
      messages.push('The manager People record could not be checked. Please try again or contact the KPI system owner.');
    }
  }

  try {
    readinessContext.config = await dataService.getProductionConfig();
  } catch {
    readinessContext.configLookupFailed = true;
    messages.push('Production configuration could not be loaded or is invalid. Workplan creation remains unavailable.');
  }

  if (readinessContext.config) {
    try {
      readinessContext.counts = await dataService.getReferenceCounts(readinessContext.config.performanceYearNumber);
    } catch {
      readinessContext.referenceLookupFailed = true;
      messages.push('Production KPI, target or Behaviour readiness could not be checked. Workplan creation remains unavailable.');
    }
  }

  if (readinessContext.employee && readinessContext.config) {
    try {
      workplanStatus = await dataService.getWorkplanStatus(
        readinessContext.employee.personKey,
        readinessContext.config.performanceYearNumber
      );
    } catch {
      messages.push('The current Workplan status could not be loaded. No Workplan action is available.');
      workplanStatus = 'Unavailable';
    }
  }

  return {
    employee: readinessContext.employee,
    manager: readinessContext.manager,
    config: readinessContext.config,
    counts: readinessContext.counts,
    workplanStatus,
    readiness: evaluateReadiness(readinessContext),
    loadMessages: messages
  };
};
