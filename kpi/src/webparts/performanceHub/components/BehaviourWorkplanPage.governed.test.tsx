/* eslint-disable @rushstack/pair-react-dom-render-unmount -- shared afterEach unmounts the mounted harness. */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import {
  BEHAVIOUR_KEYS,
  GOVERNED_BEHAVIOUR_RATINGS,
  GOVERNED_BEHAVIOUR_ROLE_LEVELS,
  type IGovernedBehaviourCatalogueContract,
  type IGovernedBehaviourCommitmentCommand,
  type IGovernedBehaviourCommitmentDraft
} from '../models/BehaviourWorkplanModels';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import { buildGovernedBehaviourCommitmentCommand } from '../services/BehaviourWorkplanPolicy';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';

const asOf = new Date('2026-09-22T12:00:00.000Z');

const sourceCatalogue = (): IGovernedBehaviourCatalogueContract => ({
  schema: 'KCF.GovernedBehaviourCatalogue', immutable: true, published: true, productionSafe: true,
  authority: {
    catalogueId: 'KCF-BEHAVIOUR-CATALOGUE', version: 'BEH-V1', etag: '"catalogue-v1"',
    approvalReference: 'KCF-KPI-Sponsor-BEH-V1-001', contentSha256: 'A'.repeat(64),
    effectiveFrom: '2026-09-21', publishedAt: '2026-09-21T09:00:00Z',
    publishedBy: 'sponsor@example.invalid', changeReference: 'KCF-KPI-Sponsor-BEH-V1-001'
  },
  headlines: BEHAVIOUR_KEYS.map((behaviourKey, behaviourIndex) => ({
    behaviourKey, title: `Synthetic approved headline ${behaviourIndex + 1}`,
    sortOrder: (behaviourIndex + 1) as 1 | 2 | 3 | 4 | 5, active: true, approved: true,
    focuses: [1, 2, 3, 4, 5].map(focusOrder => ({
      focusKey: `${behaviourKey}-FOCUS-${focusOrder}`, behaviourKey,
      title: `Synthetic focus ${behaviourIndex + 1}.${focusOrder}`,
      sortOrder: focusOrder as 1 | 2 | 3 | 4 | 5,
      targets: GOVERNED_BEHAVIOUR_ROLE_LEVELS.map((roleLevel, roleIndex) => ({
        targetKey: `${behaviourKey}-F${focusOrder}-R${roleIndex + 1}`, behaviourKey,
        focusKey: `${behaviourKey}-FOCUS-${focusOrder}`, roleLevel,
        wording: `Synthetic measurable target ${behaviourIndex + 1}.${focusOrder}.${roleIndex + 1}`,
        sortOrder: focusOrder as 1 | 2 | 3 | 4 | 5,
        active: true, approved: true, effectiveFrom: '2026-09-21'
      }))
    }))
  })),
  ratingOptions: GOVERNED_BEHAVIOUR_RATINGS
});

const workplan = (state: IAnnualWorkplan['state'] = 'Draft'): IAnnualWorkplan => ({
  id: 1, etag: '"workplan-v1"', workplanKey: 'employee|2027', personKey: 'employee',
  employeeDisplayName: 'Synthetic Employee', employeeEmail: 'employee@example.invalid', performanceYear: 2027,
  managerPersonKey: 'manager', managerDisplayName: 'Synthetic Manager', managerEmail: 'manager@example.invalid',
  state, accessState: state === 'Draft' || state === 'ChangesRequested' ? 'EmployeeEdit' : 'ReadOnly',
  transitionStatus: 'Ready', coreCategoryWeight: 70, personalCategoryWeight: 30,
  behaviourCategoryWeight: 0, rowVersionToken: 1
});

const draft = (index: number): IGovernedBehaviourCommitmentDraft => ({
  commitmentKey: `COMMIT-${index + 1}`, source: 'GovernedTarget', behaviourKey: BEHAVIOUR_KEYS[index],
  focusKey: `${BEHAVIOUR_KEYS[index]}-FOCUS-1`, roleLevel: 'Manager',
  targetKey: `${BEHAVIOUR_KEYS[index]}-F1-R2`, catalogueVersion: 'BEH-V1', catalogueEtag: '"catalogue-v1"',
  myCommitment: `I will deliver synthetic commitment ${index + 1}.`,
  howWillWeKnow: `Colleagues will observe synthetic evidence ${index + 1}.`
});

describe('governed Behaviour commitment page', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  const renderPage = (
    catalogue: IGovernedBehaviourCatalogueContract,
    state: IAnnualWorkplan['state'],
    initialCommitments: readonly IGovernedBehaviourCommitmentDraft[],
    onCommand: (command: Readonly<IGovernedBehaviourCommitmentCommand>) => Promise<void>,
    historicReadModel?: IGovernedBehaviourCommitmentCommand
  ): void => {
    act(() => {
      ReactDOM.render(<BehaviourWorkplanPage
        workplan={workplan(state)}
        behaviours={[]}
        library={[]}
        items={[]}
        saving={false}
        governedShell={{
          catalogue,
          expectedAuthority: catalogue.authority,
          roleLevel: 'Manager',
          workplanVersion: '"workplan-v1"',
          actorEmail: 'employee@example.invalid',
          changeReference: 'KCF-KPI-PM28-A007',
          asOf,
          initialCommitments,
          historicReadModel,
          managerHistory: [{
            auditKey: 'AUDIT-1', expectedWorkplanVersion: '"workplan-v1"',
            managerEmail: 'manager@example.invalid', occurredAt: '2026-09-22T14:00:00Z',
            changeReference: 'MGR-1', disposition: 'AGREED', sequence: 1
          }],
          headlineRatings: BEHAVIOUR_KEYS.map((behaviourKey, index) => ({
            behaviourKey, rating: GOVERNED_BEHAVIOUR_RATINGS[index % 3]
          }))
        }}
        onSave={async () => undefined}
        onGovernedCommand={onCommand}
      />, container);
    });
  };

  it('renders five supplied headlines, 25 Manager-filtered choices, guidance, history and exact headline ratings', () => {
    const onCommand = jest.fn(async () => undefined);
    renderPage(sourceCatalogue(), 'Draft', [draft(0), draft(1), draft(2)], onCommand);

    BEHAVIOUR_KEYS.forEach((_, index) => {
      expect(container.textContent).toContain(`Synthetic approved headline ${index + 1}`);
    });
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(25);
    expect(container.textContent).toContain('Synthetic measurable target 1.1.2');
    expect(container.textContent).not.toContain('Synthetic measurable target 1.1.1');
    expect(container.textContent).not.toContain('Synthetic measurable target 1.1.3');
    expect(container.textContent).toContain('Normally choose 3–5 total commitments');
    expect(container.textContent).toContain('Behaviours produce no numeric/per-target score, RAG or Delivery contribution');
    expect(container.textContent).not.toContain('Behaviour RAG');
    expect(container.textContent).not.toContain('Behaviour weight %');
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(container.textContent).toContain('1. AGREED · manager@example.invalid · MGR-1');
    expect(container.textContent).toContain('BHV-01: Developing');
    expect(Array.from(container.querySelectorAll('button')).filter(button =>
      button.textContent === '+ WRITE MY OWN BEHAVIOUR COMMITMENT')).toHaveLength(25);
  });

  it('enables own-target Save only after own target, MY COMMITMENT and HOW WILL WE KNOW? are complete', async () => {
    const commands: Readonly<IGovernedBehaviourCommitmentCommand>[] = [];
    renderPage(sourceCatalogue(), 'Draft', [], async command => { commands.push(command); });
    const ownButton = Array.from(container.querySelectorAll('button')).filter(button =>
      button.textContent === '+ WRITE MY OWN BEHAVIOUR COMMITMENT')[0];
    act(() => { ownButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const save = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Save Behaviour Draft')!;
    expect(save.disabled).toBe(true);
    const fields = Array.from(container.querySelectorAll('textarea'));
    expect(fields).toHaveLength(3);
    act(() => {
      fields[0].value = 'My own measurable synthetic target.';
      Simulate.change(fields[0]);
      fields[1].value = 'I will complete the agreed action.';
      Simulate.change(fields[1]);
      fields[2].value = 'Colleagues will observe the completed action.';
      Simulate.change(fields[2]);
    });
    const enabledSave = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Save Behaviour Draft')!;
    expect(enabledSave.disabled).toBe(false);
    await act(async () => { enabledSave.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(commands).toHaveLength(1);
    expect(commands[0].commitments[0]).toEqual(expect.objectContaining({
      source: 'OwnTarget',
      targetWording: 'My own measurable synthetic target.',
      myCommitment: 'I will complete the agreed action.',
      howWillWeKnow: 'Colleagues will observe the completed action.'
    }));
    expect(commands[0].tenantMutationExecuted).toBe(false);
  });

  it('issues a Submit command only when three complete commitments exist', async () => {
    const commands: Readonly<IGovernedBehaviourCommitmentCommand>[] = [];
    renderPage(sourceCatalogue(), 'Draft', [draft(0), draft(1), draft(2)], async command => { commands.push(command); });
    const submit = Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent === 'Submit Behaviour commitments')!;
    expect(submit.disabled).toBe(false);
    await act(async () => { submit.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(commands[0]).toEqual(expect.objectContaining({
      action: 'Submit', sourceState: 'Draft', behavioursExcludedFromDeliveryArithmetic: true
    }));
    expect(commands[0].commitments).toHaveLength(3);
  });

  it('renders Submitted history read-only from the stored immutable snapshot even when the current target is retired', () => {
    const original = sourceCatalogue();
    const command = buildGovernedBehaviourCommitmentCommand(original, original.authority, {
      action: 'Submit', workplanKey: 'employee|2027', expectedWorkplanVersion: '"workplan-v1"',
      currentWorkplanVersion: '"workplan-v1"',
      state: 'Draft', roleLevel: 'Manager', actorEmail: 'employee@example.invalid',
      occurredAt: '2026-09-22T12:30:00Z', changeReference: 'KCF-KPI-PM28-A007'
    }, [draft(0), draft(1), draft(2)], asOf);
    const retired = sourceCatalogue();
    retired.headlines[0].focuses[0].targets[1].active = false;
    renderPage(retired, 'Submitted', [], async () => undefined, command);
    expect(container.textContent).toContain('Historic wording and catalogue identity are preserved exactly as submitted');
    expect(container.textContent).toContain('Synthetic measurable target 1.1.2');
    expect(container.textContent).toContain('Read-only · catalogue BEH-V1');
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
    expect(container.textContent).not.toContain('Submit Behaviour commitments');
  });

  it('fails closed and withholds choices when catalogue provenance is stale', () => {
    const source = sourceCatalogue();
    const onCommand = jest.fn(async () => undefined);
    const stale = { ...source, authority: { ...source.authority, version: 'STALE' } };
    act(() => {
      ReactDOM.render(<BehaviourWorkplanPage
        workplan={workplan('Draft')} behaviours={[]} library={[]} items={[]} saving={false}
        governedShell={{
          catalogue: stale,
          expectedAuthority: source.authority,
          roleLevel: 'Manager', workplanVersion: '"workplan-v1"', actorEmail: 'employee@example.invalid',
          changeReference: 'KCF-KPI-PM28-A007', asOf, initialCommitments: []
        }}
        onSave={async () => undefined}
        onGovernedCommand={onCommand}
      />, container);
    });
    expect(container.textContent).toContain('authority, version, ETag or provenance changed after it was loaded');
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });
});
