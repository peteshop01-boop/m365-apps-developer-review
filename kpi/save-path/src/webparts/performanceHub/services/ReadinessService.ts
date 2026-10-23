import type {
  IReadinessCheck,
  IReadinessContext,
  IReadinessResult
} from '../models/ProductionModels';
import { applicationEntryCapabilities, hasExactManagerIdentity } from './ControlledApplicationRoles';

const check = (key: IReadinessCheck['key'], label: string, passed: boolean, passMessage: string, failMessage: string): IReadinessCheck => ({
  key,
  label,
  status: passed ? 'pass' : 'fail',
  message: passed ? passMessage : failMessage
});

export const evaluateReadiness = (context: IReadinessContext): IReadinessResult => {
  const { employee, manager, config, counts } = context;
  const employeeEntry = applicationEntryCapabilities(employee);
  const managerMappingValid = Boolean(employee && manager && hasExactManagerIdentity(employee, manager));
  const weights = config?.weights;
  const validWeights = !!weights
    && [weights.core, weights.personal, weights.behaviours].every(value => Number.isFinite(value) && value >= 0)
    && weights.core + weights.personal + weights.behaviours === 100;

  const checks: IReadinessCheck[] = [
    check(
      'employee',
      'Employee',
      employeeEntry.employee && !context.employeeLookupFailed,
      `${employee?.displayName || 'Employee'} has an active production People record.`,
      context.employeeLookupFailed
        ? 'The employee People lookup could not be completed.'
        : employee ? 'The employee People record is inactive or does not carry the controlled Employee role.' : 'No production People record matches the signed-in user.'
    ),
    check(
      'managerEmail',
      'Manager email',
      !!employee?.managerPersonKey && !!employee?.managerEmail,
      `Manager identity is ${employee?.managerPersonKey || ''} / ${employee?.managerEmail || ''}.`,
      'The employee People record must contain both ManagerPersonKey and ManagerEmail.'
    ),
    check(
      'manager',
      'Manager People record',
      managerMappingValid && !context.managerLookupFailed,
      `${manager?.displayName || 'Manager'} has an active production People record.`,
      context.managerLookupFailed
        ? 'The manager People lookup could not be completed.'
        : employee?.managerEmail
          ? `No exact active Manager People record matches ${employee.managerPersonKey || 'the missing manager key'} and ${employee.managerEmail}.`
          : 'A manager cannot be resolved until both ManagerPersonKey and ManagerEmail are supplied.'
    ),
    check(
      'performanceYear',
      'Performance Year',
      !!config && !context.configLookupFailed,
      `${config?.performanceYear || ''} is configured.`,
      'The current Performance Year configuration is missing or invalid.'
    ),
    check(
      'kpiMaster',
      'KPI Master',
      !!counts && counts.activeKpis > 0 && !context.referenceLookupFailed,
      `${counts?.activeKpis || 0} active Core KPI definition(s) are available.`,
      counts ? `KPI Master contains ${counts.activeKpis} active Core KPI definitions.` : 'KPI Master readiness could not be assessed.'
    ),
    check(
      'annualTargets',
      'Annual Targets',
      !!counts && counts.approvedAnnualTargets > 0 && !context.referenceLookupFailed,
      `${counts?.approvedAnnualTargets || 0} approved current-year target record(s) are available.`,
      counts ? 'No approved Annual Targets are available for the configured Performance Year.' : 'Annual Target readiness could not be assessed.'
    ),
    check(
      'behaviours',
      'Behaviours',
      !!counts && counts.publishedBehaviours === 5 && !context.referenceLookupFailed,
      'Five published current Behaviour definitions are available.',
      counts ? `Behaviours contains ${counts.publishedBehaviours} published current definitions; exactly five are required.` : 'Behaviour readiness could not be assessed.'
    ),
    check(
      'weighting',
      'Weighting',
      validWeights && !context.configLookupFailed,
      `Category weighting is ${weights?.core}/${weights?.personal}/${weights?.behaviours}.`,
      'Core, Personal and Behaviour weights must be valid and total 100.'
    )
  ];

  const blockers = checks.filter(item => item.status === 'fail').map(item => item.message);
  const warnings = context.dataQualityWarnings || [];
  return {
    ready: blockers.length === 0,
    checks,
    blockers,
    warnings,
    nextAction: blockers.length === 0
      ? 'Complete the Draft Annual Workplan sections. Submit becomes available only when every section-level check passes.'
      : `Resolve ${blockers.length} readiness blocker${blockers.length === 1 ? '' : 's'} before a Workplan can be created.`
  };
};

export const isWorkplanCreationDisabled = (readiness: IReadinessResult): boolean => !readiness.ready;
