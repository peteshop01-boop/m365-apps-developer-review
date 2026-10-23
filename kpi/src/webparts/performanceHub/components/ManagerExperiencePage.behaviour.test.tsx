import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import type { IManagerExperience } from '../models/ManagerExperienceModels';
import type { IProductionPerson } from '../models/ProductionModels';
import type { IOptionEBehaviourManagerReadModel } from '../services/BehaviourOptionEBinding';
import ManagerExperiencePage from './ManagerExperiencePage';

const employee: IProductionPerson = {
  id: 2, personKey: 'PERSON-EMPLOYEE', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  managerPersonKey: 'PERSON-MANAGER', managerEmail: 'manager@example.invalid', appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: 1, personKey: 'PERSON-MANAGER', displayName: 'Synthetic Manager', email: 'manager@example.invalid',
  appRoles: ['Employee', 'Manager'], active: true
};
const experience: IManagerExperience = {
  state: 'Ready', manager, directReports: [employee], reviewQueue: [],
  teamRows: [{ personKey: employee.personKey, displayName: employee.displayName, email: employee.email,
    workplanStatus: 'Submitted', currentQuarterStatus: 'NotStarted', amberRedInterventionCount: 0,
    outstandingEmployeeAction: false, outstandingManagerAction: true, attentionFlags: [],
    sortRank: 1, pendingReviewCount: 1 }]
};
const available: Extract<IOptionEBehaviourManagerReadModel, { state: 'Available' }> = {
  state: 'Available', employeePersonKey: employee.personKey, workplanKey: 'PERSON-EMPLOYEE|2027',
  performanceYear: 2027, submittedSnapshotKey: 'SUBMIT-001', rowVersion: 8, hierarchyVersion: 4,
  snapshots: [{ selectionKey: 'BHV-01-L2-01', source: 'Catalogue', behaviourKey: 'BHV-01',
    headlineTitle: 'We work together', focusKey: 'BHV-01-FOCUS-01', focusTitle: 'Collaboration',
    roleLevelCode: 'L2', targetKey: 'BHV-01-L2-01', selectedWording: 'Stored earlier approved wording',
    catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'KCF-BHV-PD03-2026.09-v1',
    catalogueRevision: 6, catalogueEtag: '"catalogue-6"', catalogueContentSha256: 'A'.repeat(64),
    myCommitment: 'Hold a monthly cross-team session', howWillWeKnow: 'Attendance and agreed actions' }],
  events: [{ auditKey: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', sequence: 1,
    workplanKey: 'PERSON-EMPLOYEE|2027', performanceYear: 2027, submittedSnapshotKey: 'SUBMIT-001',
    selectionKey: 'BHV-01-L2-01', disposition: 'AGREED', managerPersonKey: manager.personKey,
    managerPrincipalId: 'PRINCIPAL-MANAGER', managerEmail: manager.email, hierarchyVersion: 4,
    workplanRowVersion: 8, occurredAt: '2026-09-23T21:30:00.000Z', changeReference: 'CHANGE-001' }]
};

describe('rendered per-commitment manager Behaviour binding', () => {
  let host: HTMLDivElement;
  const noop = async (): Promise<void> => undefined;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });

  const mount = (readModel: IOptionEBehaviourManagerReadModel, onDisposition = jest.fn(noop)): jest.Mock => {
    act(() => { ReactDOM.render(<ManagerExperiencePage experience={experience} annualContexts={[]}
      quarterContexts={[]} saving={false} behaviourReadModels={{ [employee.personKey]: readModel }}
      onBehaviourDisposition={onDisposition} onRequestChanges={noop} onApproveAndLock={noop}
      onRequestQuarterChanges={noop} onApproveAndLockQuarter={noop} onOverrideQuarterRag={noop}
      onAssessQuarterBehaviour={noop} />, host); });
    const open = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'View employee');
    if (!open) throw new Error('Manager employee action was not rendered.');
    act(() => open.click());
    return onDisposition;
  };

  it('shows an unavailable state without leaking canonical content', () => {
    mount({ state: 'Unavailable', reason: 'Governed Behaviour review is unavailable. Reload or contact KPI support.' });
    expect(host.textContent).toContain('Governed Behaviour review is unavailable');
    expect(host.textContent).not.toContain('Stored earlier approved wording');
  });

  it('renders immutable earlier wording/history and sends separate AGREED and commented CHANGES REQUESTED intents', () => {
    const onDisposition = mount(available);
    expect(host.textContent).toContain('Stored earlier approved wording');
    expect(host.textContent).toContain('KCF-BHV-PD03-2026.09-v1');
    expect(host.textContent).toContain('1. AGREED');
    const buttons = Array.from(host.querySelectorAll('button'));
    const agree = buttons.find(button => button.textContent?.trim() === 'Agree commitment');
    const request = buttons.find(button => button.textContent?.trim() === 'Request changes') as HTMLButtonElement;
    expect(request.disabled).toBe(true);
    if (!agree) throw new Error('Agree action was not rendered.');
    act(() => agree.click());
    expect(onDisposition).toHaveBeenCalledWith(available, 'BHV-01-L2-01', 'AGREED');
    const commentary = host.querySelector('textarea');
    if (!commentary) throw new Error('Changes Requested commentary was not rendered.');
    act(() => { commentary.value = 'Make the evidence measurable.'; Simulate.change(commentary); });
    expect(request.disabled).toBe(false);
    act(() => request.click());
    expect(onDisposition).toHaveBeenCalledWith(available, 'BHV-01-L2-01',
      'CHANGES REQUESTED', 'Make the evidence measurable.');
  });
});

it('PM124 holds Behaviour dispositions and keeps employee read drilldown/back navigation',()=> {
 const host=document.createElement('div'), mutation=jest.fn(async()=>undefined);
 act(()=>{ReactDOM.render(<ManagerExperiencePage nativeWritesHeld experience={experience} annualContexts={[]} quarterContexts={[]} saving={false} behaviourReadModels={{[employee.personKey]:available}} onBehaviourDisposition={mutation} onRequestChanges={mutation} onApproveAndLock={mutation} onRequestQuarterChanges={mutation} onApproveAndLockQuarter={mutation} onOverrideQuarterRag={mutation} onAssessQuarterBehaviour={mutation}/>,host);});
 const open=Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='View employee')!;expect(open.disabled).toBe(false);act(()=>open.click());
 expect(host.textContent).toContain('Stored earlier approved wording');expect(host.textContent).toContain('view-only');
 const buttons=Array.from(host.querySelectorAll('button'));const back=buttons.find(button=>button.textContent?.startsWith('Back to'))!;expect(back.disabled).toBe(false);
 const agree=buttons.find(button=>button.textContent?.trim()==='Agree commitment')!;expect(agree.disabled).toBe(true);act(()=>agree.click());expect(mutation).not.toHaveBeenCalled();
 act(()=>back.click());expect(host.textContent).toContain('My Team');act(()=>{ ReactDOM.unmountComponentAtNode(host); });
});
