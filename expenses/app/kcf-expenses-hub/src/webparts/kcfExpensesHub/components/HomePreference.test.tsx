import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { KcfExpensesHub } from './KcfExpensesHub';
import { MileageScreen } from './MileageScreen';
import { MockExpensesService, DEMO_CLAIM } from '../../../services/MockExpensesService';
import { nominalMaster } from '../../../data/nominals';

// Actual React controls and mock services only; not staff profile or tenant QA.
describe('Optional fictional Profile to Mileage preference', () => {
  let host: HTMLDivElement;
  let service: MockExpensesService;
  function control<T extends Element>(selector: string): T {
    const item = host.querySelector<T>(selector);
    if (!item) throw new Error(`Missing preference control ${selector}`);
    return item;
  }
  function button(label: string, scope: ParentNode = host): HTMLButtonElement {
    const item = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === label);
    if (!item) throw new Error(`Missing preference action ${label}`);
    return item;
  }
  function click(label: string, scope: ParentNode = host): void { act(() => { Simulate.click(button(label, scope)); }); }
  function route(label: string): void { click(label, control('nav[aria-label="Expenses Hub navigation"]')); }
  function change(selector: string, value: string): void {
    const input = control<HTMLInputElement>(selector);
    act(() => { input.value = value; Simulate.change(input); });
  }
  function keep(): void { act(() => { Simulate.submit(control<HTMLFormElement>('[data-route="profile"] form')); }); }
  beforeEach(async () => {
    host = document.createElement('div'); document.body.appendChild(host);
    service = new MockExpensesService(nominalMaster, DEMO_CLAIM, false);
    await act(async () => { ReactDom.render(<KcfExpensesHub service={service} instanceId="home-test" />, host); });
  });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); jest.restoreAllMocks(); });

  it('copies only an explicitly retained preference, preserving other draft fields and creating nothing', async () => {
    route('Mileage');
    expect(button('Use home · DEMO').disabled).toBe(true);
    change('[data-mileage="from"]', 'Synthetic manual start');
    change('[data-mileage="to"]', 'Synthetic destination');
    change('[data-mileage="outwardMiles"]', '10.2');
    change('[data-mileage="purpose"]', 'Synthetic preference check');
    click('Open Profile');
    change('#kcf-home-test-profile-postcode', ' zz1  1zz '); keep();
    route('Mileage');
    expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('Synthetic manual start');
    const save = jest.spyOn(service.mileage, 'save');
    click('Use home · DEMO');
    expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('ZZ1 1ZZ');
    expect(document.activeElement).toBe(control('[data-mileage="from"]'));
    expect(control<HTMLInputElement>('[data-mileage="to"]').value).toBe('Synthetic destination');
    expect(control<HTMLInputElement>('[data-mileage="outwardMiles"]').value).toBe('10.2');
    expect(control<HTMLInputElement>('[data-mileage="purpose"]').value).toBe('Synthetic preference check');
    expect(save).not.toHaveBeenCalled();
    expect(await service.mileage.list(DEMO_CLAIM.id)).toHaveLength(0);
  });

  it('invalid, unretained and cancelled Profile edits cannot change the retained copy source', () => {
    route('Profile'); change('#kcf-home-test-profile-postcode', 'invalid'); keep();
    route('Mileage'); expect(button('Use home · DEMO').disabled).toBe(true);
    route('Profile'); change('#kcf-home-test-profile-postcode', 'ZZ1 1ZZ'); keep();
    change('#kcf-home-test-profile-postcode', 'YY2 2YY'); click('Cancel edits');
    route('Mileage'); click('Use home · DEMO');
    expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('ZZ1 1ZZ');
  });

  it('disabling and clearing preference leave a current journey draft unchanged', () => {
    route('Profile'); change('#kcf-home-test-profile-postcode', 'ZZ1 1ZZ'); keep();
    route('Mileage'); click('Use home · DEMO');
    route('Profile');
    const enable = control<HTMLInputElement>('[data-route="profile"] input[type="checkbox"]');
    act(() => { enable.checked = false; Simulate.change(enable); }); keep();
    route('Mileage'); expect(button('Use home · DEMO').disabled).toBe(true);
    expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('ZZ1 1ZZ');
    route('Profile'); click('Clear demo preference');
    route('Mileage'); expect(button('Use home · DEMO').disabled).toBe(true);
    expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('ZZ1 1ZZ');
  });

  it('a later preference change does not mutate a saved line or automatically replace an Edit draft', async () => {
    route('Profile'); change('#kcf-home-test-profile-postcode', 'ZZ1 1ZZ'); keep();
    route('Mileage'); click('Use home · DEMO');
    change('[data-mileage="to"]', 'Synthetic destination'); change('[data-mileage="outwardMiles"]', '10');
    change('[data-mileage="purpose"]', 'Synthetic edit preference');
    await act(async () => { Simulate.submit(control<HTMLFormElement>('[data-route="mileage"] form')); });
    const before = await service.mileage.list(DEMO_CLAIM.id);
    act(() => { Simulate.click(control<HTMLButtonElement>('button[aria-label^="Edit journey"]')); });
    route('Profile'); change('#kcf-home-test-profile-postcode', 'YY2 2YY'); keep();
    route('Mileage'); expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('ZZ1 1ZZ');
    expect(await service.mileage.list(DEMO_CLAIM.id)).toEqual(before);
    click('Use home · DEMO'); click('Cancel journey');
    expect(await service.mileage.list(DEMO_CLAIM.id)).toEqual(before);
  });

  it('closed claims and malformed preferences cannot copy a home start even via a synthetic click', () => {
    act(() => { ReactDom.unmountComponentAtNode(host); });
    const render = (closed: boolean, postcode: string): void => {
      act(() => { ReactDom.render(<MileageScreen api={service.mileage} claim={{ ...DEMO_CLAIM, status: closed ? 'Submitted' : 'Draft' }}
        nominals={nominalMaster} lines={[]} idPrefix="closed-home" onSaved={async () => undefined}
        homePreference={{ postcode, useHome: true }} />, host); });
    };
    render(true, 'ZZ1 1ZZ');
    expect(control<HTMLFieldSetElement>('fieldset').disabled).toBe(true);
    click('Use home · DEMO'); expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('');
    render(false, 'not a postcode'); expect(button('Use home · DEMO').disabled).toBe(true);
    click('Use home · DEMO'); expect(control<HTMLInputElement>('[data-mileage="from"]').value).toBe('');
  });
});
