import type {
  IEmployeeBehaviourCommitmentInputV2,
  IEmployeeCoreContributionInputV2,
  IEmployeeCoreWeightingInputV2,
  IEmployeeEvidenceRegistrationInputV2,
  IEmployeePersonalItemInputV2,
  IEmployeeQuarterReadbackV2,
  IEmployeeQuarterUpdateInputV2,
  IEmployeeV2ItemCommandContext,
  IEmployeeV2PersistenceResult,
  IEmployeeV2QuarterCommandContext,
  IEmployeeV2WorkplanCommandContext,
  IEmployeeWorkplanDraftInputV2,
  IEmployeeWorkplanReadbackV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IProductionPerson } from '../models/ProductionModels';

export interface IEmployeeV2CreateWorkplanCommandContext {
  commandKey: string;
  actor: IProductionPerson;
  manager: IProductionPerson;
  performanceYear: number;
}

export interface IEmployeeWorkplanV2PersistenceService {
  getEmployeeWorkplanV2(actor: IProductionPerson, performanceYear: number): Promise<IEmployeeWorkplanReadbackV2 | undefined>;
  createEmployeeWorkplanDraftV2(context: IEmployeeV2CreateWorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  saveEmployeeWorkplanDraftV2(context: IEmployeeV2WorkplanCommandContext, input: IEmployeeWorkplanDraftInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  upsertCoreContributionV2(context: IEmployeeV2ItemCommandContext, input: IEmployeeCoreContributionInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  upsertPersonalItemV2(context: IEmployeeV2ItemCommandContext, input: IEmployeePersonalItemInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  upsertBehaviourCommitmentV2(context: IEmployeeV2ItemCommandContext, input: IEmployeeBehaviourCommitmentInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  setCoreWeightingV2(context: IEmployeeV2WorkplanCommandContext, input: IEmployeeCoreWeightingInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  submitEmployeeWorkplanV2(context: IEmployeeV2WorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  requestEmployeeWorkplanChangesV2(context: IEmployeeV2WorkplanCommandContext, reason: string): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  createEmployeeWorkplanAmendmentV2(context: IEmployeeV2WorkplanCommandContext, reason: string, controlReference: string): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  approveAndLockEmployeeWorkplanV2(context: IEmployeeV2WorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>>;
  getEmployeeQuarterV2(context: IEmployeeV2QuarterCommandContext): Promise<IEmployeeQuarterReadbackV2 | undefined>;
  saveEmployeeQuarterUpdateV2(context: IEmployeeV2QuarterCommandContext, input: IEmployeeQuarterUpdateInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>>;
  registerEmployeeQuarterEvidenceV2(context: IEmployeeV2QuarterCommandContext, input: IEmployeeEvidenceRegistrationInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>>;
  submitEmployeeQuarterV2(context: IEmployeeV2QuarterCommandContext, comment?: string): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>>;
}
