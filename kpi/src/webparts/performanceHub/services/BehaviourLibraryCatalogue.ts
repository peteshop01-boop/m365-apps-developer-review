import type { BehaviourKey, BehaviourRoleLevelCode, IRoleBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { validateBehaviourObjectiveLibraryRecord } from './BehaviourWorkplanPolicy';
import { behaviourCatalogueLabel, isRoleBehaviourObjectiveLibraryRecord } from './BehaviourLibraryRoleMetadata';

/** All sixteen workbook columns, including source-only descriptive metadata and blank end date. */
export interface IBehaviourCatalogueSourceRow {
  BehaviourObjectiveKey: string; BehaviourKey: BehaviourKey; BehaviourTitle: string; CorporateValue: string;
  RoleLevelCode: BehaviourRoleLevelCode; RoleLevelName: string; DropdownLabel: string;
  ObjectiveTitle: string; ObjectiveDescription: string; SuggestedMeasure: string; SuggestedUnit: string;
  // eslint-disable-next-line @rushstack/no-new-null -- null preserves the workbook's blank cell exactly.
  SuggestedEvidence: string; Active: boolean; SortOrder: number; EffectiveFrom: string; EffectiveTo: string | null;
}

/** Caller supplies the catalogue. This module never imports or activates a fixture. */
export const mapBehaviourCatalogueRow = (row: IBehaviourCatalogueSourceRow): IRoleBehaviourObjectiveLibraryRecord => {
  const record: IRoleBehaviourObjectiveLibraryRecord = {
    behaviourObjectiveKey: row.BehaviourObjectiveKey, behaviourKey: row.BehaviourKey,
    roleLevelCode: row.RoleLevelCode, objectiveTitle: row.ObjectiveTitle, objectiveDescription: row.ObjectiveDescription,
    suggestedMeasure: row.SuggestedMeasure, suggestedUnit: row.SuggestedUnit, suggestedEvidence: row.SuggestedEvidence,
    active: row.Active, sortOrder: row.SortOrder, effectiveFrom: row.EffectiveFrom, effectiveTo: row.EffectiveTo || undefined
  };
  if (!isRoleBehaviourObjectiveLibraryRecord(record) || validateBehaviourObjectiveLibraryRecord(record).length
    || behaviourCatalogueLabel(record) !== row.DropdownLabel) throw new Error('Invalid local Behaviour catalogue row.');
  return record;
};
