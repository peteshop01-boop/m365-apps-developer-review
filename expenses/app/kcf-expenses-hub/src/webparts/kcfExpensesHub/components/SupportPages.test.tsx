import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ProfileScreen } from './ProfileScreen';
import { AdminScreen } from './AdminScreen';
import { HelpScreen } from './HelpScreen';
import { nominalMaster } from '../../../data/nominals';

// Real component events in jsdom; CSS is mocked by Heft. Not viewport, role or TEST acceptance.
describe('Profile, Admin and Help local demo controls', () => {
  let host: HTMLDivElement;
  const navigate = jest.fn();
  function control<T extends Element>(selector: string): T {
    const item = host.querySelector<T>(selector);
    if (!item) throw new Error(`Missing support control ${selector}`);
    return item;
  }
  function click(label: string): void {
    const item = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === label);
    if (!item) throw new Error(`Missing support button ${label}`);
    act(() => { Simulate.click(item); });
  }
  function change(selector: string, value: string): void {
    const input = control<HTMLInputElement | HTMLSelectElement>(selector);
    act(() => { input.value = value; Simulate.change(input); });
  }
  function submit(): void { act(() => { Simulate.submit(control<HTMLFormElement>('form')); }); }
  function renderPage(page: React.ReactElement): void { act(() => { ReactDom.render(page, host); }); }
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); navigate.mockClear(); });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); });

  it('rejects an invalid fictional postcode without retaining a profile preference', () => {
    renderPage(<ProfileScreen idPrefix="support" />); change('#support-profile-postcode', 'invalid'); submit();
    expect(control('[role="alert"]').textContent).toContain('UK format');
    expect(control('input').getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('Not retained'); expect(host.textContent).toContain('NO SHAREPOINT SAVE');
  });
  it('retains, cancels and clears a fictional preference only in component memory', () => {
    renderPage(<ProfileScreen idPrefix="support" />); change('#support-profile-postcode', 'zz1 1zz'); submit();
    expect(host.textContent).toContain('ZZ1 1ZZ'); expect(host.textContent).toContain('Preferred · demo only');
    change('#support-profile-postcode', 'YY2 2YY'); click('Cancel edits');
    expect(control<HTMLInputElement>('#support-profile-postcode').value).toBe('ZZ1 1ZZ');
    click('Clear demo preference'); expect(control<HTMLInputElement>('#support-profile-postcode').value).toBe('');
    expect(host.textContent).toContain('Not set');
  });
  it('uses all 195 exact references, searches LT and never mutates the approved reference flags', () => {
    const before = JSON.stringify(nominalMaster);
    renderPage(<AdminScreen nominals={nominalMaster} idPrefix="support" navigate={navigate} />); click('Nominals');
    expect(host.querySelectorAll('button[aria-label^="Preview reference"]').length).toBe(195);
    change('#support-nominal-search', 'LT'); expect(host.textContent).toContain('40600');
    const button = control<HTMLButtonElement>('button[aria-label^="Preview reference"]'); act(() => { Simulate.click(button); });
    const reference = control<HTMLTextAreaElement>('#support-copy-reference'); expect(reference.readOnly).toBe(true);
    click('Select reference text'); expect(document.activeElement).toBe(reference); expect(reference.selectionEnd).toBe(reference.value.length);
    const active = control<HTMLInputElement>('input[type="checkbox"]'); act(() => { active.checked = !active.checked; Simulate.change(active); });
    submit(); expect(JSON.stringify(nominalMaster)).toBe(before);
    expect(host.textContent).toContain('approved reference unchanged'); expect(host.textContent).toContain('NO SHAREPOINT SAVE');
    click('Open nominal directory'); expect(navigate).toHaveBeenCalledWith('nominals');
  });
  it('retains a synthetic team preview but grants no permissions and cancels later draft edits', () => {
    renderPage(<AdminScreen nominals={nominalMaster} idPrefix="support" navigate={navigate} />);
    change('#support-team', 'Demo team B'); submit(); expect(host.textContent).toContain('Teams: Demo team B');
    change('#support-team', 'Demo team A'); click('Cancel edits'); expect(control<HTMLSelectElement>('#support-team').value).toBe('Demo team B');
    expect(host.textContent).toContain('no permissions changed');
  });
  it('rejects an inverted or impossible deputy date window before adding a change-trail entry', () => {
    renderPage(<AdminScreen nominals={nominalMaster} idPrefix="support" navigate={navigate} />); click('Deputies');
    change('#support-until', '12-10-2026'); submit(); expect(control('[role="alert"]').textContent).toContain('end on or after');
    expect(host.textContent).toContain('No preview retained yet.');
    change('#support-until', '31-02-2026'); submit(); expect(host.textContent).toContain('No preview retained yet.');
    change('#support-until', '20-10-2026'); submit(); expect(host.textContent).toContain('Deputies: Demo deputy B');
  });
  it('rejects negative rates and malformed deadlines without changing the retained configuration', () => {
    renderPage(<AdminScreen nominals={nominalMaster} idPrefix="support" navigate={navigate} />); click('Rates');
    change('#support-rate', '-1'); submit(); expect(control('[role="alert"]').textContent).toContain('positive');
    expect(host.textContent).toContain('45p from 01-11-2025'); click('Months');
    change('#support-deadline', '31-11-2026'); submit(); expect(control('[role="alert"]').textContent).toContain('real deadline');
    expect(host.textContent).toContain('No preview retained yet.');
  });
  it('routes from each role guide and describes role simulation without claiming authorisation', () => {
    renderPage(<HelpScreen idPrefix="support" navigate={navigate} />);
    expect(host.textContent).toContain('10-11-2026'); expect(host.textContent).toContain('November–October');
    click('Manager'); expect(host.textContent).toContain('written reason'); click('Explore My Team'); expect(navigate).toHaveBeenCalledWith('team');
    click('Finance'); expect(host.textContent).toContain('No actual payroll'); click('Explore Finance'); expect(navigate).toHaveBeenCalledWith('finance');
    click('Admin'); click('Explore Admin'); expect(navigate).toHaveBeenCalledWith('admin');
    click('Recovery'); click('Return Home'); expect(navigate).toHaveBeenCalledWith('home');
  });
  it('opens accessible recovery details and navigation while keeping the no-save notice visible', () => {
    renderPage(<HelpScreen idPrefix="support" navigate={navigate} />);
    expect(control<HTMLDivElement>('#support-support-details').hidden).toBe(true);
    click('What should I report?'); expect(control<HTMLDivElement>('#support-support-details').hidden).toBe(false);
    expect(control<HTMLButtonElement>('button[aria-controls="support-support-details"]').getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('this page sends nothing'); expect(host.textContent).toContain('NO SHAREPOINT SAVE');
    click('Try Mileage'); expect(navigate).toHaveBeenCalledWith('mileage'); click('Open Profile'); expect(navigate).toHaveBeenCalledWith('profile');
  });
});
