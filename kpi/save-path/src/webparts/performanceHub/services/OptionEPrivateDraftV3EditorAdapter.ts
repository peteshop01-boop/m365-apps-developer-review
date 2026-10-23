import type { ICoreChoice, IPersonalChoice, IBehaviourChoice } from '../components/IntegratedPerformanceHub';
import type { ICoreKpiCatalogueItem, IImpactClassification } from '../models/ProductionModels';
import type { IEmployeeWorkplanReadbackV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IOptionEWorkplanDraftV3Aggregate, IOptionEDraftV3TargetSlot, IOptionEDraftV3Targets,
  IOptionEDraftV3ClassificationClaim } from '../models/OptionEWorkplanDraftV3Models';
import type { IOptionEDraftCanonicalRecord } from './OptionEDraftSharePointGateway';
import { canonicaliseOptionEPartialDraftV3 } from './OptionEWorkplanDraftV3Wire';

export interface IPrivateDraftV3EditorView {
  core: ICoreChoice[]; personal: IPersonalChoice[]; behaviours: IBehaviourChoice[]; weightingMode: 'Equal' | 'Custom';
}
export interface IPrivateDraftV3ReadContext {
  canonical: IOptionEDraftCanonicalRecord<IOptionEWorkplanDraftV3Aggregate>;
  readback: IEmployeeWorkplanReadbackV2;
  catalogue: readonly ICoreKpiCatalogueItem[];
  loadKey: object;
}
type Group = 'core' | 'impact' | 'behaviour';
type Period = 'annual' | 'q1' | 'q2' | 'q3' | 'q4';
const periods: readonly Period[] = ['annual', 'q1', 'q2', 'q3', 'q4'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const slotText = (slot: IOptionEDraftV3TargetSlot): string => {
  if (slot.editorText !== undefined) return slot.editorText;
  const value = slot.kind === 'Scalar' ? slot.value : slot.numericValue !== undefined ? slot.numericValue : slot.textValue;
  return value === undefined ? '' : String(value);
};
const emptyTargets = (): IOptionEDraftV3Targets => ({ annual: { kind: 'Scalar' }, q1: { kind: 'Scalar' },
  q2: { kind: 'Scalar' }, q3: { kind: 'Scalar' }, q4: { kind: 'Scalar' } });
const classificationView = (claim: IOptionEDraftV3ClassificationClaim): IImpactClassification | undefined => {
  if (claim.state === 'Unselected') return undefined;
  const complete = (selection: typeof claim.strategicPillar): boolean => Boolean(selection?.key && selection.label !== undefined && selection.source !== undefined);
  // Missing display evidence is not replaced with a current label. The full claim stays in the baseline.
  if ((claim.strategicPillar && !complete(claim.strategicPillar))
    || (claim.businessContributionArea && !complete(claim.businessContributionArea))) return undefined;
  return clone({ strategicPillar: claim.strategicPillar, businessContributionArea: claim.businessContributionArea }) as IImpactClassification;
};
const classificationClaim = (value?: Readonly<IImpactClassification>): IOptionEDraftV3ClassificationClaim => {
  if (!value?.strategicPillar && !value?.businessContributionArea) return { state: 'Unselected' };
  // An editor selection is an incomplete claim, never an invented verified publication pin.
  return { state: 'Incomplete', ...clone(value) };
};
/** Editable content alone proves no saved definition. Callers must supply the separate actual canonical source. */
export const readPrivateDraftV3Editor = (body: IOptionEWorkplanDraftV3Aggregate,
  savedSource?: { readonly canonical: IOptionEWorkplanDraftV3Aggregate }): IPrivateDraftV3EditorView => {
  canonicaliseOptionEPartialDraftV3(body);
  if (savedSource) canonicaliseOptionEPartialDraftV3(savedSource.canonical);
  const activeCore = body.core.entries.filter(entry => entry.activeInWorkplan !== false);
  if (new Set(activeCore.map(entry => entry.kpiId)).size !== activeCore.length) throw new Error('Multiple saved Core entries cannot be represented safely by this editor.');
  return { weightingMode: body.core.weightingMode,
    core: activeCore.map(entry => ({ kpiId: entry.kpiId, role: entry.role || undefined,
      weight: entry.weightPercent ?? 0, contributionMethod: entry.contributionMethod || undefined,
      optionEDraftCoreId: entry.coreId, optionEDraftKpiVersionKey: entry.kpiVersionKey, optionEDraftTargetVersionKey: entry.targetVersionKey,
      annualContribution: slotText(entry.targets.annual), q1: slotText(entry.targets.q1), q2: slotText(entry.targets.q2),
      q3: slotText(entry.targets.q3), q4: slotText(entry.targets.q4), annualSuccess: entry.targets.annual.success,
      q1Success: entry.targets.q1.success, q2Success: entry.targets.q2.success, q3Success: entry.targets.q3.success, q4Success: entry.targets.q4.success,
      sharedTargetRule: entry.sharedTargetRule, sharedApportionmentPercent: entry.sharedApportionmentPercent,
      governanceReference: entry.governanceReference, denominatorNumerator: entry.denominatorNumerator, denominatorValue: entry.denominatorValue,
      denominatorUnit: entry.denominatorUnit, denominatorRuleReference: entry.denominatorRuleReference, denominatorSourceReference: entry.denominatorSourceReference })),
    personal: body.impact.filter(entry => entry.activeInWorkplan !== false).map(entry => {
      const saved = savedSource?.canonical.impact.find(candidate => candidate.impactId === entry.impactId);
      return { key: entry.impactId,
        wording: entry.wording, measure: entry.editorDefinition.measure as IPersonalChoice['measure'], unit: entry.unitLabel,
        annual: slotText(entry.targets.annual), q1: slotText(entry.targets.q1), q2: slotText(entry.targets.q2), q3: slotText(entry.targets.q3), q4: slotText(entry.targets.q4),
        success: entry.editorDefinition.success, intendedOutcome: entry.editorDefinition.intendedOutcome,
        successCriterion: entry.editorDefinition.successCriterion, classification: classificationView(entry.classification), weight: entry.personalItemWeight ?? 0,
        ...(saved ? { savedDefinition: { measure: saved.measure,
          ...(saved.description === undefined ? {} : { description: saved.description }),
          ...(saved.scoringDirection === undefined ? {} : { scoringDirection: saved.scoringDirection }) } } : {}) };
    }),
    behaviours: body.behaviours.entries.filter(entry => entry.activeInWorkplan !== false).map(entry => {
      const selections = body.behaviours.governedExtension?.headlines.find(h => h.behaviourKey === entry.valueId)?.selections;
      return { behaviourId: entry.valueId, selectedSuggestionKeys: selections?.filter(s => s.source === 'Catalogue').map(s => s.selectionKey) || [...entry.selectedPromptKeys],
        commitment: entry.commitment, q1: entry.periodCommitments.Q1, q2: entry.periodCommitments.Q2,
        q3: entry.periodCommitments.Q3, q4: entry.periodCommitments.Q4, h1: entry.periodCommitments.H1 ?? '', h2: entry.periodCommitments.H2 ?? '',
        frameworkVersion: body.behaviours.frameworkVersion, roleTier: body.behaviours.roleTier, cadence: entry.cadenceClaim,
        planningLevels: entry.planningLevels, optionEDraftDescriptorKey: entry.descriptorKey, optionEDraftGuidancePromptKeys: [...entry.guidancePromptKeys],
        optionEDraftLegacySelectedPromptKeys: [...entry.selectedPromptKeys],
        selections: selections?.map(s => ({ source: s.source, selectionKey: s.selectionKey, commitment: s.myCommitment, howWillWeKnow: s.howWillWeKnow,
          focusKey: s.focusKey, focusTitle: s.focusTitle })), optionEGovernedSnapshots: selections ? clone(selections) : undefined };
    }) };
};

/** Immutable source baseline plus explicit UI-event presence; it stores no authority in employee JSON. */
export class PrivateDraftV3EditorSession {
  public readonly context: Readonly<IPrivateDraftV3ReadContext>;
  private readonly baseline: IOptionEWorkplanDraftV3Aggregate;
  private previous: IPrivateDraftV3EditorView;
  private readonly dirty = new Map<string, Set<string>>();
  private readonly removed = new Set<string>();
  private readonly newCoreIds = new Map<string, string>();
  private readonly coreViews = new Map<string, ICoreChoice>();
  private coreEventProblem?: string;
  public constructor(context: IPrivateDraftV3ReadContext, retainedBuffer?: IOptionEWorkplanDraftV3Aggregate) {
    const b = context.canonical.binding, h = context.readback.workplan;
    if (b.draftSchemaVersion !== 'demo.workplan-draft/v3' || context.canonical.aggregate.schemaVersion !== b.draftSchemaVersion
      || b.workplanItemId !== h.id || b.workplanKey !== h.workplanKey || b.personKey !== h.personKey
      || b.performanceYear !== h.performanceYear || b.workplanEtag !== h.etag || b.rowVersionToken !== h.rowVersionToken
      || b.email !== h.employeeEmail.trim().toLowerCase() || b.state !== h.state || h.transitionStatus !== 'Ready') {
      throw new Error('The full private Draft does not match its actual readonly Workplan context.');
    }
    this.context = { canonical: clone(context.canonical), readback: clone(context.readback), catalogue: clone(context.catalogue), loadKey: context.loadKey };
    this.baseline = clone(retainedBuffer || context.canonical.aggregate);
    this.previous = readPrivateDraftV3Editor(this.baseline, { canonical: this.context.canonical.aggregate });
    for (const row of this.previous.core) this.coreViews.set(row.optionEDraftCoreId!, clone(row));
  }
  public get view(): IPrivateDraftV3EditorView { return clone(this.previous); }
  public markField(group: Group, id: string, field: string): void {
    if (group === 'core' && id !== '$mode' && !this.previous.core.some(row => row.optionEDraftCoreId === id)) {
      this.coreEventProblem = 'That Core change could not be matched to the loaded Workplan. Reload before saving.'; return;
    }
    this.recordField(group, id, field);
  }
  public markCoreField(coreId: string, kpiId: string, field: string): void {
    if (!this.previous.core.some(row => row.optionEDraftCoreId === coreId && row.kpiId === kpiId)) {
      this.coreEventProblem = 'That Core change could not be matched to the loaded Workplan. Reload before saving.'; return;
    }
    this.recordField('core', coreId, field);
  }
  private recordField(group: Group, id: string, field: string): void {
    const key = group + ':' + id, set = this.dirty.get(key) || new Set<string>(); set.add(field); this.dirty.set(key, set);
  }
  private resolveCoreId(choice: ICoreChoice): string {
    if (choice.optionEDraftCoreId) return choice.optionEDraftCoreId;
    const current = this.previous.core.filter(row => row.kpiId === choice.kpiId);
    const removed = this.baseline.core.entries.filter(row => row.kpiId === choice.kpiId && this.removed.has('core:' + row.coreId));
    if (current.length > 1 || removed.length > 1) throw new Error('The selected Core identity is ambiguous. Changes remain unsaved.');
    const known = current[0]?.optionEDraftCoreId || removed[0]?.coreId || this.newCoreIds.get(choice.kpiId);
    if (known) return known;
    // Retained inactive versions are not new employee selections and must never be reused.
    const used = new Set([...this.baseline.core.entries.map(row => row.coreId), ...Array.from(this.newCoreIds.values())]);
    let id = choice.kpiId, suffix = 1;
    while (used.has(id)) id = `${choice.kpiId}|draft-${suffix++}`;
    this.newCoreIds.set(choice.kpiId, id); return id;
  }
  /** Resolve identity before the Core editor can emit field events. No native authority is added. */
  public createCoreChoice(kpiId: string): ICoreChoice {
    const coreId = this.resolveCoreId({ kpiId, weight: 0 });
    const known = this.coreViews.get(coreId) || this.previous.core.find(row => row.optionEDraftCoreId === coreId)
      || readPrivateDraftV3Editor(this.baseline).core.find(row => row.optionEDraftCoreId === coreId);
    return known ? clone(known) : { kpiId, weight: 0, optionEDraftCoreId: coreId };
  }
  public update(next: IPrivateDraftV3EditorView, employeeNotes?: { categoryWeightReason: string; zeroPersonalReason: string }): IOptionEWorkplanDraftV3Aggregate {
    if (this.coreEventProblem) throw new Error(this.coreEventProblem);
    next = { ...clone(next), core: next.core.map(choice => {
      const coreId = this.resolveCoreId(choice);
      return { ...this.coreViews.get(coreId), ...choice, optionEDraftCoreId: coreId };
    }) };
    const recordChanges = <T extends object>(group: Group, oldRows: T[], newRows: T[], id: (row: T) => string): void => {
      for (const row of newRows) {
        this.removed.delete(group + ':' + id(row));
        const prior = oldRows.find(old => id(old) === id(row)) || (group === 'core' ? this.coreViews.get(id(row)) : undefined);
        for (const field of Array.from(new Set([...Object.keys(row), ...Object.keys(prior || {})]))) if (!prior || !same((prior as Record<string, unknown>)[field], (row as Record<string, unknown>)[field])) this.recordField(group, id(row), field);
      }
      for (const row of oldRows) if (!newRows.some(item => id(item) === id(row))) this.removed.add(group + ':' + id(row));
    };
    recordChanges('core', this.previous.core, next.core, row => row.optionEDraftCoreId || row.kpiId);
    recordChanges('impact', this.previous.personal, next.personal, row => row.key);
    recordChanges('behaviour', this.previous.behaviours, next.behaviours, row => row.behaviourId);
    const result = clone(this.baseline), touched = (group: Group, id: string, field: string): boolean => this.dirty.get(group + ':' + id)?.has(field) || false;
    if (next.weightingMode !== this.previous.weightingMode) this.recordField('core', '$mode', 'mode');
    if (touched('core', '$mode', 'mode')) result.core.weightingMode = next.weightingMode;
    for (const choice of next.core) {
      const id = choice.optionEDraftCoreId || choice.kpiId;
      let entry = result.core.entries.find(e => e.coreId === id);
      if (entry?.activeInWorkplan === false) throw new Error('An inactive historical Core identity cannot be reused as a new selection. Changes remain unsaved.');
      if (!entry) {
        const ref = this.context.catalogue.find(item => item.kpiId === choice.kpiId);
        if (!ref?.kpiVersionKey || !ref.targetVersionKey) throw new Error('The selected Core reference cannot be independently matched. Changes remain unsaved.');
        entry = { coreId: id, kpiId: choice.kpiId, kpiVersionKey: ref.kpiVersionKey, targetVersionKey: ref.targetVersionKey,
          role: '', contributionMethod: '', targets: emptyTargets() }; result.core.entries.push(entry);
      }
      if (touched('core', id, 'role')) {
        entry.role = choice.role || '';
        const families = { AccountableOwner: 'Owner', DeliveryLead: 'Delivery', Contributor: 'Delivery', Oversight: 'Support', EvidenceProvider: 'Support' };
        if (!entry.nativeRole || families[entry.nativeRole] !== entry.role) {
          entry.nativeRole = entry.role === 'Owner' ? 'AccountableOwner' : entry.role === 'Delivery' ? 'DeliveryLead' : entry.role === 'Support' ? 'Oversight' : undefined;
        }
      }
      if (touched('core', id, 'contributionMethod')) entry.contributionMethod = choice.contributionMethod || '';
      if (touched('core', id, 'weight')) entry.weightPercent = choice.weight;
      for (const field of ['sharedTargetRule', 'sharedApportionmentPercent', 'governanceReference', 'denominatorNumerator', 'denominatorValue', 'denominatorUnit', 'denominatorRuleReference', 'denominatorSourceReference'] as const) {
        if (touched('core', id, field)) { const value = choice[field]; if (value === undefined) delete entry[field]; else Object.assign(entry, { [field]: value }); }
      }
      for (const period of periods) {
        const field = period === 'annual' ? 'annualContribution' : period;
        if (touched('core', id, field)) entry.targets[period].editorText = choice[field] ?? '';
        const success = period === 'annual' ? 'annualSuccess' : `${period}Success` as 'q1Success' | 'q2Success' | 'q3Success' | 'q4Success';
        if (touched('core', id, success)) entry.targets[period].success = choice[success] ?? '';
      }
    }
    for (const choice of next.personal) {
      let entry = result.impact.find(e => e.impactId === choice.key);
      if (!entry) { entry = { impactId: choice.key, wording: choice.wording, measure: choice.successCriterion ?? choice.measure,
        unitLabel: choice.unit, targets: emptyTargets(), editorDefinition: { measure: choice.measure, success: choice.success },
        classification: classificationClaim(choice.classification) }; result.impact.push(entry); }
      if (touched('impact', choice.key, 'wording')) entry.wording = choice.wording;
      if (touched('impact', choice.key, 'unit')) entry.unitLabel = choice.unit;
      if (touched('impact', choice.key, 'weight')) entry.personalItemWeight = choice.weight;
      if (touched('impact', choice.key, 'measure')) entry.editorDefinition.measure = choice.measure;
      if (touched('impact', choice.key, 'success')) entry.editorDefinition.success = choice.success;
      for (const field of ['intendedOutcome', 'successCriterion'] as const) if (touched('impact', choice.key, field)) {
        if (choice[field] === undefined) delete entry.editorDefinition[field]; else entry.editorDefinition[field] = choice[field];
      }
      if (touched('impact', choice.key, 'classification')) entry.classification = classificationClaim(choice.classification);
      for (const period of periods) if (touched('impact', choice.key, period)) entry.targets[period].editorText = choice[period];
    }
    for (const choice of next.behaviours) {
      const entry = result.behaviours.entries.find(e => e.valueId === choice.behaviourId);
      if (!entry) throw new Error('A new Behaviour binding requires its actual approved source snapshot. Existing changes remain retained.');
      if (touched('behaviour', choice.behaviourId, 'commitment')) entry.commitment = choice.commitment;
      for (const period of ['q1', 'q2', 'q3', 'q4', 'h1', 'h2'] as const) if (touched('behaviour', choice.behaviourId, period)) entry.periodCommitments[period.toUpperCase() as keyof typeof entry.periodCommitments] = choice[period];
      if (touched('behaviour', choice.behaviourId, 'planningLevels')) entry.planningLevels = choice.planningLevels ? clone(choice.planningLevels) : undefined;
      if (touched('behaviour', choice.behaviourId, 'selections') || touched('behaviour', choice.behaviourId, 'selectedSuggestionKeys')) {
        const headline = result.behaviours.governedExtension?.headlines.find(h => h.behaviourKey === choice.behaviourId);
        if (!headline || !choice.selections || choice.selections.some(s => !headline.selections.some(old => old.selectionKey === s.selectionKey))) {
          throw new Error('Changed Behaviour selections need their exact approved snapshots. Changes remain retained.');
        }
        headline.selections = headline.selections.filter(s => choice.selections!.some(nextSelection => nextSelection.selectionKey === s.selectionKey));
        for (const snapshot of headline.selections) { const edit = choice.selections.find(s => s.selectionKey === snapshot.selectionKey)!;
          snapshot.myCommitment = edit.commitment; snapshot.howWillWeKnow = edit.howWillWeKnow; }
      }
    }
    for (const entry of result.core.entries) if (this.removed.has('core:' + entry.coreId)) entry.activeInWorkplan = false;
    for (const entry of result.impact) if (this.removed.has('impact:' + entry.impactId)) entry.activeInWorkplan = false;
    for (const entry of result.behaviours.entries) if (this.removed.has('behaviour:' + entry.valueId)) entry.activeInWorkplan = false;
    if (employeeNotes) {
      const old = this.baseline.employeeNotes;
      for (const field of ['categoryWeightReason', 'zeroPersonalReason'] as const) if (employeeNotes[field] !== (old?.[field] ?? '')) {
        result.employeeNotes = { ...result.employeeNotes, [field]: employeeNotes[field] };
      }
    }
    canonicaliseOptionEPartialDraftV3(result); this.previous = clone(next);
    for (const row of this.previous.core) this.coreViews.set(row.optionEDraftCoreId!, clone(row));
    return result;
  }
}
