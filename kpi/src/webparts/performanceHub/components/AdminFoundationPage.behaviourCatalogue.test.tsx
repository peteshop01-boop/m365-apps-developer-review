/* eslint-disable @rushstack/pair-react-dom-render-unmount -- every mounted host is unmounted in afterEach */
import { createHash } from 'node:crypto';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { APPROVED_BEHAVIOUR_V1_SOURCE_ROWS } from '../testing/BehaviourFrameworkV1ApprovedData';
import { createBehaviourFrameworkV2Catalogue } from '../services/BehaviourFrameworkV2';
import {
  createBehaviourCatalogueAdministrationBaseline,
  type IBehaviourCatalogueAdministrationGateway,
  type IBehaviourCatalogueAdminCommand,
  type IBehaviourCatalogueAdminReadModel
} from '../services/BehaviourCatalogueAdministration';
import AdminFoundationBehaviourCatalogue from './AdminFoundationPage.behaviourCatalogue';

const sha = async (value: string): Promise<string> =>
  createHash('sha256').update(value).digest('hex').toUpperCase();

describe('ADM-005 Admin Foundation catalogue surface', () => {
  let host: HTMLDivElement;
  let available: Extract<IBehaviourCatalogueAdminReadModel, { state: 'Available' }>;
  beforeAll(async () => {
    const catalogue = createBehaviourFrameworkV2Catalogue(APPROVED_BEHAVIOUR_V1_SOURCE_ROWS,
      { catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', revision: 1,
        status: 'Published', effectiveFrom: '2026-11-01' });
    const state = await createBehaviourCatalogueAdministrationBaseline({
      approvalReference: 'KCF-KPI-Sponsor-BEH-V1-001', approvedV1Catalogue: catalogue,
      approvedV1ContentSha256: await sha(JSON.stringify(catalogue))
    }, { personKey: 'PERSON-SPONSOR', email: 'sponsor@example.invalid' },
    '2026-09-23T12:00:00.000Z', 'KCF-KPI-Sponsor-BEH-V1-001',
    'de8fc527-fa58-4b8a-ae63-818822015746', sha);
    available = { state: 'Available', rowVersion: state.rowVersion, etag: state.etag,
      currentVersionKey: state.currentVersionKey, currentCatalogue: catalogue,
      versions: state.versions, events: state.events };
  });
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });

  const flush = async (): Promise<void> => {
    for (let index = 0; index < 4; index += 1) await act(async () => { await Promise.resolve(); });
  };

  it('shows an intelligible unavailable state when the physical adapter is disabled', async () => {
    act(() => { ReactDOM.render(<AdminFoundationBehaviourCatalogue />, host); });
    await flush();
    expect(host.querySelector('[data-behaviour-catalogue-admin-state="Unavailable"]')?.getAttribute('role')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('unavailable');
    expect(host.textContent).not.toContain('WE TAKE RESPONSIBILITY');
  });

  it('shows denied without leaking catalogue content', async () => {
    const gateway: IBehaviourCatalogueAdministrationGateway = {
      read: async () => ({ state: 'Denied', reason: 'You are not authorised to administer the Behaviour catalogue.' }),
      publish: async () => ({ outcome: 'Denied', message: 'Denied.' })
    };
    act(() => { ReactDOM.render(<AdminFoundationBehaviourCatalogue gateway={gateway} />, host); });
    await flush();
    expect(host.querySelector('[data-behaviour-catalogue-admin-state="Denied"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('not authorised');
    expect(host.textContent).not.toContain('Deliver what I agree');
  });

  it('renders exact canonical identity/history and prepares a reasoned successor without a headline rename control', async () => {
    let published: IBehaviourCatalogueAdminCommand | undefined;
    const gateway: IBehaviourCatalogueAdministrationGateway = {
      read: jest.fn(async () => available),
      publish: jest.fn(async command => {
        published = command;
        return { outcome: 'Confirmed' as const, message: 'The successor catalogue was confirmed.' };
      })
    };
    act(() => { ReactDOM.render(<AdminFoundationBehaviourCatalogue gateway={gateway}
      makeIdempotencyKey={() => 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1'} />, host); });
    await flush();
    expect(host.querySelector('[data-canonical-catalogue-version="KCF-BHV-PD03-2026.09-v1"]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('[data-headline-key]')).map(node => node.textContent)).toEqual([
      'WE TAKE RESPONSIBILITY', 'WE UNITE AS ONE CLUB', 'WE BUILD THE NEXT CHAPTER',
      'WE RESPECT THE GAME & EACH OTHER', 'WE WORK & PLAY WITH ENERGY'
    ]);
    expect(host.querySelector('[data-rating-domain="Developing|Effective|Exceptional"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-catalogue-history-version]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-catalogue-audit-key]')).toHaveLength(1);
    expect(host.querySelector('[aria-label="Headline title"]')).toBeNull();

    const version = host.querySelector('[aria-label="Successor version"]') as HTMLInputElement;
    const reason = host.querySelector('[aria-label="Mandatory reason"]') as HTMLTextAreaElement;
    const wording = host.querySelector('[aria-label="Approved example wording"]') as HTMLTextAreaElement;
    act(() => { version.value = 'KCF-BHV-PD03-2026.10-v2'; Simulate.change(version); });
    act(() => { reason.value = 'Approved successor wording correction.'; Simulate.change(reason); });
    act(() => { wording.value = 'Successor approved wording.'; Simulate.change(wording); });
    const button = Array.from(host.querySelectorAll('button')).find(item =>
      item.textContent?.trim() === 'Publish governed successor') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(published).toMatchObject({ expectedEtag: available.etag,
      expectedRowVersion: 1, expectedCurrentVersionKey: available.currentVersionKey,
      reason: 'Approved successor wording correction.', candidate: {
        catalogueVersion: 'KCF-BHV-PD03-2026.10-v2', revision: 2
      } });
    expect(published?.candidate.rows[0].suggestedTarget).toBe('Successor approved wording.');
    expect(published?.candidate.headlineBehaviours).toEqual(available.currentCatalogue.headlineBehaviours);
    expect(JSON.stringify(published?.candidate)).not.toMatch(/targetRating|weightPercent|behaviourWeight/);
  });
});
