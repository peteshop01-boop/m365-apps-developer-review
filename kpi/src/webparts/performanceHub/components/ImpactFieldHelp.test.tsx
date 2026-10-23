/* eslint-disable @rushstack/pair-react-dom-render-unmount -- hosts unmounted in afterEach */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ImpactFieldHelp } from './ImpactFieldHelp';
import { IMPACT_HELP, IMPACT_TEMPLATES } from '../services/ImpactFieldHelpContent';

describe('IMPACT inline help', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  test('persists through focus/blur, closes on Escape in the field and restores focus', () => {
    act(() => { ReactDOM.render(<div><input aria-label="Statement" /><ImpactFieldHelp id="statement-help" label="Statement" content={IMPACT_HELP.statement} /></div>, host); });
    const trigger = host.querySelector('button') as HTMLButtonElement; const input = host.querySelector('input') as HTMLInputElement;
    act(() => { trigger.click(); }); expect(trigger.getAttribute('aria-expanded')).toBe('true');
    IMPACT_TEMPLATES.forEach(t => expect(host.textContent).toContain(t));
    input.focus(); input.blur(); expect(host.querySelector('[role="region"]')).not.toBeNull();
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(host.querySelector('[role="region"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  test('Close restores initiating control and multiple regions have distinct IDs', () => {
    act(() => { ReactDOM.render(<div><ImpactFieldHelp id="a" label="A" content={IMPACT_HELP.unit} /><ImpactFieldHelp id="b" label="B" content={IMPACT_HELP.quarter} /></div>, host); });
    const a = host.querySelector('[aria-controls="a"]') as HTMLButtonElement; const b = host.querySelector('[aria-controls="b"]') as HTMLButtonElement;
    act(() => { a.click(); b.click(); }); expect(host.querySelectorAll('[role="region"]')).toHaveLength(2);
    act(() => { (host.querySelector('[aria-label="Close help: A"]') as HTMLButtonElement).click(); });
    expect(document.activeElement).toBe(a); expect(host.querySelector('#b')).not.toBeNull();
  });
});
