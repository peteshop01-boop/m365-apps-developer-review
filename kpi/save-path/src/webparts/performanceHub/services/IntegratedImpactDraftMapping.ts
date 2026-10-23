import type { IImpactClassification, IPersonalWorkplanItem } from '../models/ProductionModels';
import type { IEmployeePersonalItemInputV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import { cloneImpactClassification } from './PersonalWorkplanPolicy';

export type ImpactEditorMeasure = 'Number / Quantity' | 'Percentage' | 'Milestone / Completion';
/** Stored definition evidence for display only; contains no native item identity or write authority. */
export interface IIntegratedImpactDefinitionView {
  readonly description?: string;
  readonly measure: string;
  readonly scoringDirection?: IPersonalWorkplanItem['scoringDirection'];
}
export interface IIntegratedImpactDraft {
  key: string; wording: string; measure: ImpactEditorMeasure; unit: string; annual: string;
  q1: string; q2: string; q3: string; q4: string; success: string; weight: number;
  /** Explicit slice-03 annual-definition fields; optional for the historic integrated editor. */
  intendedOutcome?: string;
  successCriterion?: string;
  /** Local/domain provenance boundary. It is not added to the tenant command payload. */
  classification?: Readonly<IImpactClassification>;
  /** Local provenance only. Never included in the command payload. */
  original?: Readonly<IPersonalWorkplanItem>;
  /** Readonly private Draft presentation. Never projected into either persistence payload. */
  readonly savedDefinition?: Readonly<IIntegratedImpactDefinitionView>;
}
const target = (value?: number, text?: string): string => value !== undefined ? String(value) : text ?? '';
export const readImpactDraft = (item: IPersonalWorkplanItem): IIntegratedImpactDraft => ({
  key: item.workplanItemKey, wording: item.wording,
  measure: item.measureType === 'Percentage' ? 'Percentage' : item.measureType === 'Milestone' ? 'Milestone / Completion' : 'Number / Quantity',
  unit: item.unitLabel, annual: target(item.yearEndTargetValue, item.yearEndTargetText),
  q1: target(item.q1TargetValue, item.q1TargetText), q2: target(item.q2TargetValue, item.q2TargetText),
  q3: target(item.q3TargetValue, item.q3TargetText), q4: target(item.q4TargetValue, item.q4TargetText),
  success: item.description ?? '', intendedOutcome: item.description ?? '', successCriterion: item.measure,
  classification: cloneImpactClassification(item.impactClassification), weight: item.personalItemWeight ?? 0,
  original: { ...item, impactClassification: cloneImpactClassification(item.impactClassification) }
});

/** Explicit existing command keys only; identity stays in the service context. */
export const retainImpactInput = (item: Readonly<IPersonalWorkplanItem>, active = item.activeInWorkplan): IEmployeePersonalItemInputV2 => ({
  wording: item.wording, description: item.description, measure: item.measure, measureType: item.measureType,
  scoringDirection: item.scoringDirection, baselineValue: item.baselineValue, percentageSourceScale: item.percentageSourceScale,
  unitLabel: item.unitLabel, yearEndTargetValue: item.yearEndTargetValue, yearEndTargetText: item.yearEndTargetText,
  q1TargetValue: item.q1TargetValue, q1TargetText: item.q1TargetText, q2TargetValue: item.q2TargetValue, q2TargetText: item.q2TargetText,
  q3TargetValue: item.q3TargetValue, q3TargetText: item.q3TargetText, q4TargetValue: item.q4TargetValue, q4TargetText: item.q4TargetText,
  personalItemWeight: item.personalItemWeight, displayOrder: item.displayOrder, activeInWorkplan: active
});
export const impactTargetEditReason = (draft: IIntegratedImpactDraft): string | undefined => {
  const item = draft.original;
  if (!item) return undefined;
  if (!item.measureType || ['Other', 'TextStatus'].indexOf(item.measureType) >= 0) {
    return 'These saved targets use a measure definition this editor cannot safely convert. Targets are retained; wording, description and weight can still be edited.';
  }
  if ([[item.yearEndTargetValue, item.yearEndTargetText], [item.q1TargetValue, item.q1TargetText],
    [item.q2TargetValue, item.q2TargetText], [item.q3TargetValue, item.q3TargetText], [item.q4TargetValue, item.q4TargetText]]
    .some(pair => item.measureType === 'Milestone' ? pair[0] !== undefined : pair[1] !== undefined)) {
    return 'The saved definition includes a different or additional target representation. Both representations are retained; changing targets needs the complete definition editor.';
  }
  return undefined;
};
const numberTarget = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Enter a finite numeric IMPACT target. The draft has not been saved.');
  return result;
};
export const projectImpactDraft = (
  draft: IIntegratedImpactDraft, existing: IPersonalWorkplanItem | undefined, displayOrder: number
): IEmployeePersonalItemInputV2 => {
  const original = draft.original;
  if (original && (!existing || existing.workplanItemKey !== draft.key || original.workplanItemKey !== draft.key
    || existing.id !== original.id || existing.etag !== original.etag || existing.naturalKey !== original.naturalKey
    || existing.workplanKey !== original.workplanKey || existing.personKey !== original.personKey)) {
    throw new Error('The saved IMPACT identity changed. Reload before applying this edit.');
  }
  if (!original && existing) throw new Error('This IMPACT key already belongs to a saved item. Reload before saving.');
  const before = original ? readImpactDraft(original) : undefined;
  if (before && before.measure !== draft.measure) throw new Error('Changing a saved IMPACT measure type requires the complete definition editor. Its existing targets and scoring have been retained.');
  const milestone = draft.measure === 'Milestone / Completion';
  const percentage = draft.measure === 'Percentage';
  const input: IEmployeePersonalItemInputV2 = existing ? retainImpactInput(existing) : {
    wording: draft.wording, description: draft.intendedOutcome ?? (draft.success || draft.wording),
    measure: draft.successCriterion ?? draft.measure,
    measureType: milestone ? 'Milestone' : percentage ? 'Percentage' : 'Number',
    scoringDirection: milestone ? 'Milestone' : 'HigherIsBetter', percentageSourceScale: percentage ? 'Whole' : undefined,
    unitLabel: milestone ? 'Completion' : percentage ? '%' : draft.unit, displayOrder, activeInWorkplan: true
  };
  if (!before || draft.wording !== before.wording) input.wording = draft.wording;
  if (before && draft.intendedOutcome !== undefined && draft.intendedOutcome !== before.intendedOutcome) input.description = draft.intendedOutcome;
  else if (before && draft.success !== before.success) input.description = draft.success;
  if (before && draft.successCriterion !== undefined && draft.successCriterion !== before.successCriterion) input.measure = draft.successCriterion;
  if (!before || draft.weight !== before.weight) input.personalItemWeight = draft.weight;
  if (before && draft.unit !== before.unit) input.unitLabel = draft.unit;
  const slots = [
    ['annual', 'yearEndTargetValue', 'yearEndTargetText'], ['q1', 'q1TargetValue', 'q1TargetText'],
    ['q2', 'q2TargetValue', 'q2TargetText'], ['q3', 'q3TargetValue', 'q3TargetText'], ['q4', 'q4TargetValue', 'q4TargetText']
  ] as const;
  slots.forEach(([editor, numeric, text]) => {
    if (before && draft[editor] === before[editor]) return;
    const reason = impactTargetEditReason(draft);
    if (reason) throw new Error(reason);
    if (milestone) { input[text] = draft[editor]; input[numeric] = undefined; }
    else { input[numeric] = numberTarget(draft[editor]); input[text] = undefined; }
  });
  return input;
};
