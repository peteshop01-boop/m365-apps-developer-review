import type { IAnnualWorkplan, IProductionPerson } from '../models/ProductionModels';

const sameEmail = (left: string | undefined, right: string | undefined): boolean =>
  Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());

export const canEmployeeReadWorkplan = (actor: IProductionPerson | undefined, workplan: IAnnualWorkplan | undefined): boolean =>
  Boolean(actor?.active && workplan && actor.personKey === workplan.personKey && sameEmail(actor.email, workplan.employeeEmail));

export const canEmployeeEditWorkplan = (actor: IProductionPerson | undefined, workplan: IAnnualWorkplan | undefined): boolean =>
  canEmployeeReadWorkplan(actor, workplan)
  && (workplan?.state === 'Draft' || workplan?.state === 'ChangesRequested')
  && workplan.accessState === 'EmployeeEdit'
  && workplan.transitionStatus === 'Ready';

export const canManagerReadWorkplan = (actor: IProductionPerson | undefined, workplan: IAnnualWorkplan | undefined): boolean =>
  Boolean(actor?.active
    && workplan
    && actor.personKey !== workplan.personKey
    && actor.personKey === workplan.managerPersonKey
    && sameEmail(actor.email, workplan.managerEmail));

export const canManagerDecideWorkplan = (actor: IProductionPerson | undefined, workplan: IAnnualWorkplan | undefined): boolean =>
  canManagerReadWorkplan(actor, workplan)
  && workplan?.state === 'Submitted'
  && workplan.accessState === 'ManagerDecision'
  && workplan.transitionStatus === 'Ready';
