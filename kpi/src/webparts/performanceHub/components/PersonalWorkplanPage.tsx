import { ImpactClassificationFields, impactClassificationText } from './ImpactClassificationFields';
import * as React from 'react';
import { Guid } from '@microsoft/sp-core-library';
import type {
  IAnnualWorkplan,
  IPersonalWorkplanItem,
  PersonalMeasureType,
  PersonalScoringDirection
} from '../models/ProductionModels';
import type { QuarterKey } from '../models/QuarterlyModels';
import {
  calculatePersonalQuarterResult,
  cloneImpactItems,
  type IImpactClassificationConfiguration,
  MAX_ACTIVE_IMPACT_KPIS,
  nextPersonalDraftId,
  patchPersonalDraftItem,
  personalNaturalKey,
  prepareImpactSectionSave,
  validateImpactSection,
  validatePersonalKpiDefinition
} from '../services/PersonalWorkplanPolicy';
import { isEmployeeWorkplanEditable } from '../services/EmployeeWorkplanStatus';
import styles from './PerformanceHub.module.scss';
import ContextualHelp from './ContextualHelp';
import { ImpactFieldHelp } from './ImpactFieldHelp';
import { IMPACT_HELP } from '../services/ImpactFieldHelpContent';
import { PerformanceConceptGuide } from './PerformancePresentation';

const MEASURE_TYPES: ReadonlyArray<Readonly<{ value: PersonalMeasureType; label: string }>> = [
  { value: 'Count', label: 'Count' }, { value: 'Number', label: 'Number' },
  { value: 'Percentage', label: 'Percentage' }, { value: 'Currency', label: 'Currency' },
  { value: 'Rate', label: 'Rate' }, { value: 'Days', label: 'Days' },
  { value: 'Score', label: 'Rated score' }, { value: 'Milestone', label: 'Milestone / completion' },
  { value: 'TextStatus', label: 'Text / status' }, { value: 'Other', label: 'Other approved format' }
];
const SCORING_DIRECTIONS: ReadonlyArray<Readonly<{ value: PersonalScoringDirection; label: string }>> = [
  { value: 'HigherIsBetter', label: 'Higher is better' },
  { value: 'LowerIsBetter', label: 'Lower is better' },
  { value: 'TargetRange', label: 'Target range' },
  { value: 'Milestone', label: 'Milestone' },
  { value: 'TBC', label: 'Not yet rateable' }
];
const QUARTERS: readonly QuarterKey[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export interface IPersonalWorkplanPageProps {
  workplan: IAnnualWorkplan;
  items: IPersonalWorkplanItem[];
  saving: boolean;
  message?: string;
  localUat?: boolean;
  classificationConfiguration?: IImpactClassificationConfiguration;
  onSave(items: IPersonalWorkplanItem[]): Promise<void>;
  onSubmit?(): Promise<void>;
}

interface ILocalActual {
  value?: number;
  text?: string;
}

const numeric = (value: string): number | undefined => value === '' ? undefined : Number(value);

export const createPersonalDraftItem = (
  workplan: IAnnualWorkplan,
  id: number,
  displayOrder: number,
  workplanItemKey = Guid.newGuid().toString()
): IPersonalWorkplanItem => ({
  id,
  etag: 'LOCAL-DRAFT',
  workplanItemKey,
  naturalKey: personalNaturalKey(workplan.workplanKey, workplanItemKey),
  workplanKey: workplan.workplanKey,
  personKey: workplan.personKey,
  performanceYear: workplan.performanceYear,
  wording: '',
  description: '',
  measure: '',
  measureType: 'Number',
  scoringDirection: 'HigherIsBetter',
  unitLabel: '',
  personalItemWeight: displayOrder === 1 ? 100 : undefined,
  displayOrder,
  activeInWorkplan: true
});

const targetPatch = (quarter: QuarterKey, value: string, textTarget: boolean): Partial<IPersonalWorkplanItem> => {
  const parsed = textTarget ? value : numeric(value);
  if (quarter === 'Q1') return textTarget ? { q1TargetText: parsed as string } : { q1TargetValue: parsed as number | undefined };
  if (quarter === 'Q2') return textTarget ? { q2TargetText: parsed as string } : { q2TargetValue: parsed as number | undefined };
  if (quarter === 'Q3') return textTarget ? { q3TargetText: parsed as string } : { q3TargetValue: parsed as number | undefined };
  return textTarget ? { q4TargetText: parsed as string } : { q4TargetValue: parsed as number | undefined };
};

const targetValue = (item: IPersonalWorkplanItem, quarter: QuarterKey): number | undefined => {
  if (quarter === 'Q1') return item.q1TargetValue;
  if (quarter === 'Q2') return item.q2TargetValue;
  if (quarter === 'Q3') return item.q3TargetValue;
  return item.q4TargetValue;
};

const targetText = (item: IPersonalWorkplanItem, quarter: QuarterKey): string => {
  if (quarter === 'Q1') return item.q1TargetText || '';
  if (quarter === 'Q2') return item.q2TargetText || '';
  if (quarter === 'Q3') return item.q3TargetText || '';
  return item.q4TargetText || '';
};

const PersonalWorkplanPage: React.FC<IPersonalWorkplanPageProps> = ({
  workplan, items, saving, message, localUat, classificationConfiguration, onSave, onSubmit
}) => {
  const initialEditing = (source: ReadonlyArray<IPersonalWorkplanItem>): Set<string> => new Set(source
    .filter(item => localUat || item.id < 0).map(item => item.workplanItemKey));
  const [draftItems, setDraftItems] = React.useState<IPersonalWorkplanItem[]>(() => cloneImpactItems(items));
  const [editingKeys, setEditingKeys] = React.useState<Set<string>>(() => initialEditing(items));
  const [previewQuarter, setPreviewQuarter] = React.useState<QuarterKey>('Q1');
  const [localActuals, setLocalActuals] = React.useState<Record<string, ILocalActual>>({});

  React.useEffect(() => {
    setDraftItems(cloneImpactItems(items));
    setEditingKeys(initialEditing(items));
  }, [items, localUat]);

  const activeItems = draftItems.filter(item => item.activeInWorkplan);
  const validations = activeItems.map(item => validatePersonalKpiDefinition(item, classificationConfiguration));
  const sectionValidation = validateImpactSection(draftItems, classificationConfiguration);
  const weightTotal = sectionValidation.weightTotal;
  const valid = sectionValidation.valid;
  const editable = isEmployeeWorkplanEditable(workplan);

  const update = (workplanItemKey: string, patch: Partial<IPersonalWorkplanItem>): void => {
    setDraftItems(current => patchPersonalDraftItem(current, workplanItemKey, patch));
  };

  const add = (): void => {
    if (!editable) return;
    const activeCount = draftItems.filter(item => item.activeInWorkplan).length;
    if (activeCount >= MAX_ACTIVE_IMPACT_KPIS) return;
    const next = createPersonalDraftItem(workplan, nextPersonalDraftId(draftItems), activeCount + 1);
    setDraftItems(current => [...current, next]);
    setEditingKeys(current => new Set([...Array.from(current), next.workplanItemKey]));
  };

  const remove = (workplanItemKey: string): void => {
    if (!editable) return;
    update(workplanItemKey, { activeInWorkplan: false });
    setEditingKeys(current => new Set(Array.from(current).filter(key => key !== workplanItemKey)));
  };

  const save = async (): Promise<void> => {
    const payload = prepareImpactSectionSave(draftItems, classificationConfiguration);
    await onSave(payload);
    setEditingKeys(new Set());
  };

  const submit = async (): Promise<void> => {
    if (!editable || !valid || !onSubmit) return;
    await onSubmit();
  };

  return <section className={styles.personalPage} aria-labelledby="personal-workplan-heading">
    <div className={styles.coreHeader}>
      <div>
        <span className={styles.sectionLabel}>Annual Workplan · {workplan.state}</span>
        <h2 id="personal-workplan-heading">Impact KPIs</h2>
        <p>Create up to five role-specific Impact KPIs with separate annual and Q1–Q4 targets. Impact results never enter organisational GOLD output.</p>
        <p>Core remains the governed strategy section. Impact records measurable role contribution. Behaviours remain separately visible and outside Delivery arithmetic.</p>
      </div>
      {editable && <div className={styles.headerActions}>
        <button type="button" className={styles.secondaryButton} disabled={saving || activeItems.length >= MAX_ACTIVE_IMPACT_KPIS} onClick={add}>Add Impact KPI</button>
        <button type="button" className={styles.saveButton} disabled={saving || !valid} onClick={() => save().catch(() => undefined)}>{saving ? 'Saving…' : localUat ? 'Save locally' : 'Save Draft'}</button>
        {onSubmit && <button type="button" className={styles.saveButton} disabled={saving || !valid} onClick={() => submit().catch(() => undefined)}>Submit Workplan</button>}
      </div>}
    </div>

    <ContextualHelp
      purpose="Impact KPIs describe role-specific outcomes. They remain separate from Core strategy KPIs and Behaviour assessment."
      actions={["Add no more than five active Impact KPIs.", "Complete the title, intended outcome, success criterion, annual target, Q1–Q4 targets and item weight.", "Choose only classification values supplied by governed configuration."]}
      fields={["How success is measured explains the evidence; Measurement format controls the target input.", "An assessment where a falling result is better needs a starting point.", "Impact item planning weights total exactly 100% when the optional section is used."]}
      next="Save the editable Workplan. Your manager approves the complete Workplan, including targets and category balance."
      scoringNote="Impact planning weights are not delivery scores. Overall Delivery is calculated separately, and Behaviour ratings remain standalone assessments."
    />
    <PerformanceConceptGuide />

    {!editable && <div className={styles.readOnlyNotice}>This {workplan.state} Workplan is read-only. Changes require the controlled Request Changes and reapproval route.</div>}
    {message && <div className={styles.successMessage} role="status">{message}</div>}

    <div className={styles.sectionCounter} data-state={valid ? 'complete' : activeItems.length ? 'invalid' : 'empty'}>
      <strong>{activeItems.length} / {MAX_ACTIVE_IMPACT_KPIS}</strong><span>Active Impact KPIs</span>
      <strong>{weightTotal}%</strong><span>Impact item weight total</span>
    </div>
    {!valid && activeItems.length > 0 && <p className={styles.weightMessage} data-state="invalid">{sectionValidation.errors.join(' ')}</p>}

    {localUat && <div className={styles.uatControls}>
      <label><span>Local delivery preview quarter</span><select value={previewQuarter} onChange={event => setPreviewQuarter(event.target.value as QuarterKey)}>{QUARTERS.map(quarter => <option key={quarter}>{quarter}</option>)}</select></label>
      <span>Preview Actuals and RAG do not change live data.</span>
    </div>}

    <div className={styles.personalList}>{activeItems.map((item, index) => {
      const itemValidation = validations[index];
      const localActual = localActuals[item.workplanItemKey] || {};
      const scoring = localUat ? calculatePersonalQuarterResult(item, previewQuarter, localActual.value, localActual.text, { greenThreshold: 90, amberThreshold: 50 }) : undefined;
      const editing = editable && editingKeys.has(item.workplanItemKey);
      return <article className={styles.personalItem} key={item.workplanItemKey}>
        <div className={styles.personalItemHeader}><span>Impact KPI {index + 1}</span>{editable && <div><button type="button" className={styles.removeLink} disabled={saving} onClick={() => setEditingKeys(current => {
          const next = new Set(current); if (next.has(item.workplanItemKey)) next.delete(item.workplanItemKey); else next.add(item.workplanItemKey); return next;
        })}>{editing ? 'Show summary' : 'Re-edit'}</button> <button type="button" className={styles.removeLink} disabled={saving} onClick={() => remove(item.workplanItemKey)}>Remove</button></div>}</div>
        {!editing && <dl className={styles.currentKpiResult} aria-label={`Impact KPI ${index + 1} summary`}>
          <div><dt>Title</dt><dd>{item.wording}</dd></div>
          <div><dt>Intended outcome</dt><dd>{item.description}</dd></div>
          <div><dt>Measure / success criterion</dt><dd>{item.measure}</dd></div>
          <div><dt>Annual target</dt><dd>{item.yearEndTargetValue ?? item.yearEndTargetText}</dd></div>
          <div><dt>Q1–Q4 targets</dt><dd>{QUARTERS.map(quarter => targetValue(item, quarter) ?? targetText(item, quarter)).join(' · ')}</dd></div>
          <div><dt>Classification</dt><dd>{impactClassificationText(item.impactClassification)}</dd></div>
        </dl>}
        {editing && <div className={styles.personalForm}>
          <label><span>Impact KPI title</span><input type="text" disabled={saving} value={item.wording} onChange={event => update(item.workplanItemKey, { wording: event.target.value })} /></label>
          <label><span>Intended outcome (Description / objective)</span><textarea rows={3} disabled={saving} value={item.description || ''} onChange={event => update(item.workplanItemKey, { description: event.target.value })} /></label>
          <ImpactFieldHelp id={`impact-${item.workplanItemKey}-outcome-help`} label="Intended outcome" content={IMPACT_HELP.outcome} />
          <label><span>Measure / success criterion</span><textarea rows={3} disabled={saving} value={item.measure} onChange={event => update(item.workplanItemKey, { measure: event.target.value })} /></label>
          <ImpactFieldHelp id={`impact-${item.workplanItemKey}-measure-help`} label="Measure / success criterion" content={IMPACT_HELP.successCriterion} />
          <label><span>Measurement format</span><select disabled={!editable || saving} value={item.measureType || ''} onChange={event => update(item.workplanItemKey, { measureType: event.target.value as PersonalMeasureType })}><option value="">Choose…</option>{MEASURE_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Unit</span><input type="text" disabled={!editable || saving} value={item.unitLabel} onChange={event => update(item.workplanItemKey, { unitLabel: event.target.value })} /></label>
          <label><span>How progress improves</span><select disabled={!editable || saving} value={item.scoringDirection || ''} onChange={event => update(item.workplanItemKey, { scoringDirection: event.target.value as PersonalScoringDirection })}><option value="">Choose…</option>{SCORING_DIRECTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {item.measureType === 'Percentage' && <label><span>How percentage values are entered</span><select disabled={!editable || saving} value={item.percentageSourceScale || ''} onChange={event => update(item.workplanItemKey, { percentageSourceScale: event.target.value as 'Fraction' | 'Whole' })}><option value="">Choose…</option><option value="Fraction">Decimal, for example 0.75</option><option value="Whole">Whole percentage, for example 75</option></select></label>}
          {item.scoringDirection === 'LowerIsBetter' && <label><span>Starting point</span><input type="number" disabled={!editable || saving} value={item.baselineValue ?? ''} onChange={event => update(item.workplanItemKey, { baselineValue: numeric(event.target.value) })} /></label>}
          <label><span>Annual Target — number</span><input type="number" disabled={!editable || saving} value={item.yearEndTargetValue ?? ''} onChange={event => update(item.workplanItemKey, { yearEndTargetValue: numeric(event.target.value) })} /></label>
          <label><span>Annual Target — text / milestone</span><input type="text" disabled={!editable || saving} value={item.yearEndTargetText || ''} onChange={event => update(item.workplanItemKey, { yearEndTargetText: event.target.value })} /></label>
          {QUARTERS.map(quarter => <React.Fragment key={quarter}>
            <label><span>{quarter} Target — number</span><input type="number" disabled={!editable || saving} value={targetValue(item, quarter) ?? ''} onChange={event => update(item.workplanItemKey, targetPatch(quarter, event.target.value, false))} /></label>
            <label><span>{quarter} Target — text / milestone</span><input type="text" disabled={!editable || saving} value={targetText(item, quarter)} onChange={event => update(item.workplanItemKey, targetPatch(quarter, event.target.value, true))} /></label>
          </React.Fragment>)}
          <ImpactClassificationFields id={`impact-${item.workplanItemKey}`} classification={item.impactClassification}
            configuration={classificationConfiguration} disabled={!editable || saving}
            onChange={classification => update(item.workplanItemKey, { impactClassification: classification })} />
          <label><span>Impact KPI weight % (Personal KPI weight)</span><input type="number" min="0" max="100" disabled={!editable || saving} value={item.personalItemWeight ?? ''} onChange={event => update(item.workplanItemKey, { personalItemWeight: numeric(event.target.value) })} /></label>
          {localUat && <>
            <label><span>{previewQuarter} Actual — number</span><input type="number" value={localActual.value ?? ''} onChange={event => setLocalActuals(current => ({ ...current, [item.workplanItemKey]: { ...localActual, value: numeric(event.target.value) } }))} /></label>
            <label><span>{previewQuarter} Actual — text</span><input type="text" value={localActual.text || ''} onChange={event => setLocalActuals(current => ({ ...current, [item.workplanItemKey]: { ...localActual, text: event.target.value } }))} /></label>
          </>}
        </div>}
        {!itemValidation.valid && <p className={styles.weightMessage} data-state="invalid">{itemValidation.errors.join(' ')}</p>}
        {localUat && <dl className={styles.currentKpiResult}>
          <div><dt>Preview progress</dt><dd>{scoring?.rawProgressPct !== undefined ? `${scoring.rawProgressPct}%` : 'Not rated'}</dd></div>
          <div><dt>Preview RAG</dt><dd>{scoring?.calculatedRag || 'NotRated'}</dd></div>
          <div><dt>Assessment note</dt><dd>{scoring?.message || 'Complete the definition and Actual.'}</dd></div>
        </dl>}
      </article>;
    })}</div>
  </section>;
};

export default PersonalWorkplanPage;
