import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { AdminView } from './IntegratedPerformanceHub';
import AdminPeopleManagementView from './AdminPeopleManagementView';
import { getAdminPeopleMutationAdmission } from '../services/AdminPeopleMutationAdmission';
import type { IProductionPerson } from '../models/ProductionModels';

describe('PM60 disabled integrated People', () => {
  let host: HTMLDivElement;
  const person: IProductionPerson = { id: -1, personKey: 'test-key', email: 'test@example.invalid', displayName: 'Test Person', active: true, appRoles: ['Employee'] };
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.restoreAllMocks(); });
  const render = (records: IProductionPerson[], readAvailable = true, actorRoles = ['SystemAdmin']): void => {
    act(() => { ReactDOM.render(<AdminPeopleManagementView records={records} readAvailable={readAvailable} actorRoles={actorRoles} />, host); });
  };
  it.each(['Employee', 'Manager', 'SystemAdministrator'])('denies People inspection to %s', role => {
    render([person], true, [role]); expect(host.textContent).not.toContain(person.email); expect(host.querySelector('button')).toBeNull();
  });
  it.each(['SystemAdmin', 'Senior Manager Admin'])('permits inspection but denies both writes for %s', role => {
    const records = [Object.freeze({ ...person, appRoles: Object.freeze(['Employee']) as unknown as string[] })];
    const transport = jest.spyOn(XMLHttpRequest.prototype, 'open');
    const storage = jest.spyOn(Storage.prototype, 'setItem');
    const before = JSON.stringify(records); render(records, true, [role]);
    const select = host.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    act(() => { select.click(); });
    expect(host.textContent).toContain(person.email); expect(document.activeElement?.textContent).toBe(person.displayName);
    const actions = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).filter(button => !button.hasAttribute('aria-pressed'));
    expect(actions).toHaveLength(2); actions.forEach(button => { expect(button.disabled).toBe(true); act(() => { button.click(); }); });
    expect(JSON.stringify(records)).toBe(before); expect(transport).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
    expect(getAdminPeopleMutationAdmission('Add').status).toBe('NotAdmitted');
    expect(getAdminPeopleMutationAdmission('Deactivate').enabled).toBe(false);
  });
  it('distinguishes empty and unavailable without inventing counts', () => {
    render([]); expect(host.textContent).toContain('No People records returned');
    render([], false); expect(host.textContent).toContain('People unavailable'); expect(host.textContent).not.toContain('No People records returned');
    render([person], false); expect(host.textContent).not.toContain(person.displayName);
  });
  it('inspects retained inactive records and rejects a missing selection without writes', () => {
    render([{ ...person, active: false }]); act(() => { host.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click(); });
    expect(host.textContent).toContain('Inactive'); expect(host.textContent).toContain('Records and history are retained');
    render([{ ...person, personKey: 'another-key', displayName: 'Another' }]);
    expect(host.textContent).toContain('The selected Person is no longer available'); expect(host.textContent).not.toContain(person.email);
  });
  it('integrates the view in Administration People and preserves its Guide', () => {
    const data = { people: [person], peopleReadAvailable: true, overview: { employee: { ...person, appRoles: ['SystemAdmin'] }, workplanStatus: 'NotStarted', readiness: { ready: false, blockers: [] }, loadMessages: [] }, kpis: [], teams: [], configs: [], objectives: [], directReports: [], annualReviews: [], quarterReviews: [], quarterLifecycles: [], warnings: [] };
    act(() => { ReactDOM.render(<AdminView tab="People" data={data as unknown as React.ComponentProps<typeof AdminView>['data']} />, host); });
    expect(host.textContent).toContain('Administration'); expect(host.textContent).toContain('How this works');
    expect(host.textContent).toContain('People changes are unavailable until the governed update route is verified.');
    expect(host.querySelector('button[aria-pressed]')).toBeTruthy();
  });
});
