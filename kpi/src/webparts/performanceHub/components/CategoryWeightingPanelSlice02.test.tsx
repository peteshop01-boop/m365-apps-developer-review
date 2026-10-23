/* eslint-disable @rushstack/pair-react-dom-render-unmount -- shared afterEach unmounts the mounted harness. */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import {
  ApprovedDeliveryWeightingPanel,
  CoreWeightingControls
} from './CategoryWeightingPanel';
import type {
  ICoreWeightingItem,
  IDeliveryCategoryWeights,
  IDeliveryWeightConfigurationSnapshot
} from '../services/CategoryWeightingPolicy';
import type { EmployeeCoreWeightingModeV2 } from '../models/EmployeeWorkplanV2PersistenceModels';

describe('BT-02 slice 02 rendered weighting controls', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    host.remove();
  });

  it('changes employee role without inferring contribution method and changes method without replacing role', () => {
    const Harness: React.FC = () => {
      const [items, setItems] = React.useState<ICoreWeightingItem[]>([
        { kpiId: 'CORE-001', weight: 100, employeeRole: 'Contributor', contributionMethod: 'SharedTarget' }
      ]);
      return <CoreWeightingControls items={items} mode="Custom" editable onItemsChange={setItems} />;
    };
    act(() => { ReactDOM.render(<Harness />, host); });
    const role = host.querySelector('[aria-label="CORE-001 employee role"]') as HTMLSelectElement;
    const method = host.querySelector('[aria-label="CORE-001 contribution method"]') as HTMLSelectElement;
    act(() => { role.value = 'EvidenceProvider'; Simulate.change(role); });
    expect((host.querySelector('[aria-label="CORE-001 employee role"]') as HTMLSelectElement).value).toBe('EvidenceProvider');
    expect((host.querySelector('[aria-label="CORE-001 contribution method"]') as HTMLSelectElement).value).toBe('SharedTarget');
    act(() => { method.value = 'CompletionOversight'; Simulate.change(method); });
    expect((host.querySelector('[aria-label="CORE-001 employee role"]') as HTMLSelectElement).value).toBe('EvidenceProvider');
    expect((host.querySelector('[aria-label="CORE-001 contribution method"]') as HTMLSelectElement).value).toBe('CompletionOversight');
  });

  it('applies deterministic Equal weights and permits deliberate Custom editing only in Custom mode', () => {
    const Harness: React.FC = () => {
      const [mode, setMode] = React.useState<EmployeeCoreWeightingModeV2>('Custom');
      const [items, setItems] = React.useState<ICoreWeightingItem[]>([
        { kpiId: 'CORE-001', weight: 60, employeeRole: 'Contributor', contributionMethod: 'AdditiveDirect' },
        { kpiId: 'CORE-002', weight: 40, employeeRole: 'Oversight', contributionMethod: 'CompletionOversight' }
      ]);
      return <CoreWeightingControls items={items} mode={mode} editable onModeChange={setMode} onItemsChange={setItems} />;
    };
    act(() => { ReactDOM.render(<Harness />, host); });
    const button = (label: string): HTMLButtonElement => Array.from(host.querySelectorAll('button'))
      .find(candidate => candidate.textContent === label) as HTMLButtonElement;
    act(() => { button('Equal').click(); });
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]')).map(input => input.value)).toEqual(['50', '50']);
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]')).every(input => input.disabled)).toBe(true);
    expect(host.textContent).toContain('Equal weights are complete at exactly 100%');
    act(() => { button('Custom').click(); });
    const weights = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    expect(weights.every(input => !input.disabled)).toBe(true);
    act(() => { weights[0].value = '55'; Simulate.change(weights[0]); });
    expect(host.textContent).toContain('Core KPI weights must total exactly 100%');
  });

  it('renders only Core and Impact arithmetic and requires reason plus Manager/Admin approval before override save', async () => {
    const save = jest.fn(async () => undefined);
    const Harness: React.FC = () => {
      const [weights, setWeights] = React.useState<IDeliveryCategoryWeights>({ core: 60, impact: 40 });
      const [reason, setReason] = React.useState('');
      return <ApprovedDeliveryWeightingPanel weights={weights} workplanState="Submitted" editable
        reason={reason} overrideApproved approvalRole="Manager" onChange={setWeights}
        onReasonChange={setReason} onSave={save} />;
    };
    act(() => { ReactDOM.render(<Harness />, host); });
    expect(host.textContent).toContain('Core + Impact');
    expect(host.textContent).toContain('Behaviours are assessed separately and are never included in this arithmetic');
    expect(host.textContent).not.toContain('Behaviour weight %');
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Save Delivery weighting') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    const reason = host.querySelector('textarea') as HTMLTextAreaElement;
    act(() => { reason.value = 'Approved role balance for the year.'; Simulate.change(reason); });
    expect(saveButton.disabled).toBe(false);
    await act(async () => { saveButton.click(); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('renders the governed configuration version and uses its data-bound default', () => {
    const configuration: IDeliveryWeightConfigurationSnapshot = {
      authority: {
        configurationId: 'DELIVERY-WEIGHTS-2027', version: 'PD01-V1', etag: '"weights-v1"',
        approvalReference: 'KCF-KPI-Sponsor-PD-01', contentSha256: 'A'.repeat(64),
        effectiveFrom: '2026-09-21', publishedAt: '2026-09-21T09:00:00.000Z',
        publishedBy: 'sponsor@example.invalid', changeReference: 'KCF-KPI-Sponsor-PD-01'
      },
      defaultWeights: { core: 70, impact: 30 },
      activeWeights: { core: 70, impact: 30 },
      behaviourIncluded: false
    };
    act(() => { ReactDOM.render(<ApprovedDeliveryWeightingPanel
      weights={configuration.activeWeights} configuration={configuration} workplanState="Draft" editable
    />, host); });
    expect(host.textContent).toContain('Configured default 70%');
    expect(host.textContent).toContain('Configured default 30%');
    expect(host.textContent).toContain('PD01-V1 · KCF-KPI-Sponsor-PD-01');
    expect(host.textContent).not.toContain('Behaviour weight %');
    act(() => { ReactDOM.render(<ApprovedDeliveryWeightingPanel
      weights={{ core: 60, impact: 40 }} configuration={configuration} workplanState="Draft" editable
      reason="Synthetic mismatch" overrideApproved approvalRole="Manager"
    />, host); });
    expect(host.textContent).toContain('do not match the loaded governed configuration version');
  });

  it.each([1366, 390])('keeps the governed journey reachable at a representative %ipx viewport', width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    act(() => { ReactDOM.render(<ApprovedDeliveryWeightingPanel weights={{ core: 70, impact: 30 }}
      workplanState="Draft" editable coreWeightingMode="Equal" coreItems={[
        { kpiId: 'CORE-001', weight: 100, employeeRole: 'Contributor', contributionMethod: 'AdditiveDirect' }
      ]} />, host); });
    expect(host.querySelector('[aria-label="Core Delivery weight"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Impact Delivery weight"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="CORE-001 employee role"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="CORE-001 contribution method"]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('button')).map(button => button.textContent)).toEqual(expect.arrayContaining(['Equal', 'Custom']));
  });

  it('renders approved and locked weighting as immutable history', () => {
    act(() => { ReactDOM.render(<ApprovedDeliveryWeightingPanel weights={{ core: 65, impact: 35 }}
      workplanState="Locked" editable reason="Approved configuration" overrideApproved approvalRole="SystemAdmin" />, host); });
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.textContent).toContain('Approved history keeps its captured Core/Impact snapshot');
  });
});
