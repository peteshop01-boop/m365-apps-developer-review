/* eslint-disable @rushstack/pair-react-dom-render-unmount -- every mounted host is unmounted by afterEach. */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ImpactClassificationFields } from './ImpactClassificationFields';
import { CapturedDeliveryWeightingPanel } from './CategoryWeightingPanel';
import { PersonalBuilder, ReviewWeights } from './IntegratedPerformanceHub';
import { readImpactDraft } from '../services/IntegratedImpactDraftMapping';
import { resolveGovernedImpactTaxonomy, type IGovernedImpactTaxonomyContract } from '../services/PersonalWorkplanPolicy';
import type { IAnnualWorkplan, IImpactClassification, IPersonalWorkplanItem } from '../models/ProductionModels';

const taxonomy = (): IGovernedImpactTaxonomyContract => ({
  schema: 'KCF.ImpactTaxonomy', immutable: true, published: true,
  authority: { taxonomyId: 'SYNTH-TAXONOMY', version: 'v1', etag: '"1"', approvalReference: 'KCF-KPI-Sponsor-PD-02',
    contentSha256: 'A'.repeat(64), effectiveFrom: '2026-01-01', publishedAt: '2026-01-01T00:00:00.000Z',
    publishedBy: 'fixture@example.invalid', changeReference: 'SYNTHETIC-ONLY' },
  strategicPillars: [{ key: 'pillar-1', label: 'Configured pillar', source: 'SYNTH', active: true, approved: true, effectiveFrom: '2026-01-01' }],
  businessContributionAreas: Array.from({ length: 13 }, (_, index) => ({ key: `area-${index}`, label: `Configurable area ${index}`,
    source: 'SYNTH', active: true, approved: true, effectiveFrom: '2026-01-01' }))
});
const workplan: IAnnualWorkplan = { id: 1, etag: '"1"', workplanKey: 'fixture|2026', personKey: 'fixture',
  employeeDisplayName: 'Fixture', employeeEmail: 'fixture@example.invalid', performanceYear: 2026, state: 'Draft',
  accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1,
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
  overallDeliveryWeightConfiguration: { configurationKey: 'SYNTH-CONFIG', configurationVersion: 'v7', coreWeight: 60, impactWeight: 40,
    sourceReference: 'KCF-KPI-Sponsor-PD-01' } };

describe('PM82 Core Impact composed source controls', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.restoreAllMocks(); });
  it('uses the 13 configurable labels and snapshots selection provenance without making the optional pillar mandatory', () => {
    const contract = taxonomy(); contract.businessContributionAreas = contract.businessContributionAreas.map((option, index) => index === 0
      ? { ...option, label: 'Renamed configured area' } : option);
    const configuration = resolveGovernedImpactTaxonomy(contract, contract.authority, new Date('2026-10-03T00:00:00.000Z'));
    let selection: IImpactClassification | undefined;
    const Harness: React.FC = () => {
      const [value, setValue] = React.useState<IImpactClassification>();
      return <ImpactClassificationFields id="fixture" classification={value} configuration={configuration}
        onChange={next => { selection = next; setValue(next); }} />;
    };
    act(() => { ReactDOM.render(<Harness />, host); });
    const area = host.querySelector<HTMLSelectElement>('#fixture-businessContributionArea')!;
    expect(area.options).toHaveLength(14); expect(area.textContent).toContain('Renamed configured area');
    act(() => { area.value = 'area-0'; Simulate.change(area); });
    expect(selection?.strategicPillar).toBeUndefined();
    expect(selection?.businessContributionArea).toMatchObject({ label: 'Renamed configured area', taxonomyId: 'SYNTH-TAXONOMY', taxonomyVersion: 'v1', taxonomyEtag: '"1"' });
  });
  it('retains the original saved label/version when current configuration changes', () => {
    const contract = taxonomy(); const configuration = resolveGovernedImpactTaxonomy(contract, contract.authority, new Date('2026-10-03T00:00:00.000Z'));
    const classification = { businessContributionArea: { ...configuration.businessContributionAreas[0], label: 'Original label', taxonomyVersion: 'old-version' } };
    const changed = jest.fn();
    act(() => { ReactDOM.render(<ImpactClassificationFields id="historic" classification={classification} configuration={configuration} onChange={changed} />, host); });
    const field = host.querySelector<HTMLSelectElement>('#historic-businessContributionArea')!;
    expect(field.selectedOptions[0].textContent).toContain('Original label'); expect(host.textContent).toContain('old-version');
    expect(changed).not.toHaveBeenCalled(); expect(classification.businessContributionArea.taxonomyVersion).toBe('old-version');
  });
  it('shows retained classification in the ordinary integrated builder and keeps unsupported native edits disabled', () => {
    const item: IPersonalWorkplanItem = { id: 1, etag: '"1"', workplanItemKey: 'impact', naturalKey: 'fixture|impact',
      workplanKey: workplan.workplanKey, personKey: 'fixture', performanceYear: 2026, wording: 'Synthetic annual commitment',
      measure: 'Cases delivered', measureType: 'Count', scoringDirection: 'HigherIsBetter', unitLabel: 'cases',
      yearEndTargetValue: 40, q1TargetValue: 10, q2TargetValue: 10, q3TargetValue: 10, q4TargetValue: 10,
      displayOrder: 1, activeInWorkplan: true, impactClassification: { businessContributionArea: {
        key: 'area', label: 'Retained area', source: 'SYNTH', taxonomyVersion: 'saved-v1' } } };
    const change = jest.fn(); const transport = jest.spyOn(XMLHttpRequest.prototype, 'open');
    act(() => { ReactDOM.render(<PersonalBuilder items={[readImpactDraft(item)]} onChange={change} />, host); });
    expect(host.textContent).toContain('Retained area'); expect(host.textContent).toContain('saved-v1');
    host.querySelectorAll('select').forEach(field => expect(field.disabled).toBe(true));
    expect(host.textContent).toContain('governed taxonomy and save route'); expect(change).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
  it('shows captured 60/40 weights in the actual employee review composition with Behaviours separate', () => {
    act(() => { ReactDOM.render(<ReviewWeights core={[]} personal={[]} behaviours={[]} workplan={workplan}
      saving={false} message="" onCore={() => undefined} onPersonal={() => undefined} onBehaviours={() => undefined}
      onSave={async () => undefined} onSubmit={async () => undefined} />, host); });
    const panel = host.querySelector('[data-policy="PD-01"]')!;
    expect(panel.textContent).toContain('60%'); expect(panel.textContent).toContain('40%');
    expect(panel.textContent).toContain('never included'); expect(host.textContent).toContain('SYNTH-CONFIG · v7');
    expect(panel.querySelector('input')).toBeNull();
  });
  it('does not invent active 70/30 values when captured configuration is absent or invalid', () => {
    act(() => { ReactDOM.render(<CapturedDeliveryWeightingPanel workplanState="Approved" />, host); });
    expect(host.textContent).toContain('unavailable'); expect(host.textContent).not.toContain('70%');
    act(() => { ReactDOM.render(<CapturedDeliveryWeightingPanel workplanState="Approved" configuration={{ ...workplan.overallDeliveryWeightConfiguration!, impactWeight: 20 }} />, host); });
    expect(host.textContent).toContain('invalid'); expect(host.querySelector('[data-policy="PD-01"]')).toBeNull();
  });
});
