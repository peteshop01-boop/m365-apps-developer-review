import * as React from 'react';
import type { ICurrentClaim, IExpenseLine, IExpensesService, INominal } from '../../../domain/contracts';
import { formatMoney, totalPence } from '../../../domain/expenseRules';
import { ExpensesScreen } from './ExpensesScreen';
import { NominalsScreen } from './NominalsScreen';
import { Icon } from './Icon';
import { routes } from './routes';
import type { HubRoute } from './routes';
import styles from './KcfExpensesHub.module.scss';
import { MileageScreen } from './MileageScreen';
import { HomeScreen } from './HomeScreen';
import { ReviewClaimScreen } from './ReviewClaimScreen';
import { MyTeamScreen } from './MyTeamScreen';
import { ManagerReviewScreen } from './ManagerReviewScreen';
import { FinanceScreen } from './FinanceScreen';
import { ProfileScreen } from './ProfileScreen';
import { AdminScreen } from './AdminScreen';
import { HelpScreen } from './HelpScreen';
import type { IMileageLine } from '../../../domain/mileage';
import { mileageTotal } from '../../../domain/mileage';
import type { IDemoHomePreference } from '../../../domain/homePreference';
import type { IDemoDecision } from '../../../domain/demoReview';
import { demoStaffClaims } from '../../../services/demoStaffClaims';
import type { IDemoStaffClaim } from './PageContracts';
import { createHeldExpenseEntry } from '../../../services/persistence/ExpenseEntryAdapter';
import type { ExpenseEntryAdapter } from '../../../services/persistence/ExpenseEntryAdapter';
import { D01ExpenseScreen } from './D01ExpenseScreen';
import { createHeldMileageEntry } from '../../../services/persistence/MileageEntryAdapter';
import { D02MileageScreen } from './D02MileageScreen';

export interface IKcfExpensesHubProps {
  readonly service: IExpensesService;
  readonly logoUrl?: string;
  readonly instanceId: string;
  readonly expenseEntry?: ExpenseEntryAdapter;
}

export function KcfExpensesHub({ service, logoUrl, instanceId, expenseEntry }: IKcfExpensesHubProps): React.ReactElement {
  const [d01Adapter] = React.useState(() => expenseEntry || createHeldExpenseEntry());
  const [d01Open, setD01Open] = React.useState(false);
  const [d01Visited, setD01Visited] = React.useState(false);
  const [d02Adapter] = React.useState(() => createHeldMileageEntry());
  const [d02Open, setD02Open] = React.useState(false);
  const [d02Visited, setD02Visited] = React.useState(false);
  const [route, setRoute] = React.useState<HubRoute>('expenses');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [nominals, setNominals] = React.useState<ReadonlyArray<INominal>>([]);
  const [claim, setClaim] = React.useState<ICurrentClaim | undefined>(undefined);
  const [lines, setLines] = React.useState<ReadonlyArray<IExpenseLine>>([]);
  const [journeys, setJourneys] = React.useState<ReadonlyArray<IMileageLine>>([]);
  const [homePreference, setHomePreference] = React.useState<IDemoHomePreference | undefined>();
  const [staffClaims, setStaffClaims] = React.useState<ReadonlyArray<IDemoStaffClaim>>(demoStaffClaims);
  const [reviewingId, setReviewingId] = React.useState(demoStaffClaims[0].id);
  const [decisions, setDecisions] = React.useState<ReadonlyArray<IDemoDecision>>([]);
  const [loadError, setLoadError] = React.useState('');
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const shellRef = React.useRef<HTMLDivElement>(null);
  const moreRef = React.useRef<HTMLButtonElement>(null);
  const navigationRef = React.useRef<HTMLElement>(null);
  const routeDefinition = routes.find(item => item.id === route) || routes[1];
  const idPrefix = `kcf-${instanceId}`;

  React.useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    // Measure only our position. Never resize or restyle the SharePoint host.
    // Use document position so focusing/scrolling a control cannot grow the shell.
    const fit = (): void => {
      const top = shell.getBoundingClientRect().top + window.scrollY;
      const remaining = window.innerHeight - top - 8;
      shell.style.setProperty('--viewport-space', `${Math.max(560, remaining)}px`);
      // Below-fold hosts need document scrolling to a usable shell, with a
      // route fallback when fixed headings consume the remaining space.
      shell.classList.toggle(styles.shortSpace, remaining < 560);
    };
    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : undefined;
    observer?.observe(document.documentElement);
    if (shell.parentElement) observer?.observe(shell.parentElement);
    window.addEventListener('resize', fit);
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  React.useEffect(() => {
    let active = true;
    // Fail closed until the source factory deliberately wires an independently verified adapter.
    if (service.mode !== 'mock') { setLoadError('This foundation only supports the synthetic demo adapter.'); return () => { active = false; }; }
    async function load(): Promise<void> {
      try {
        const [master, current] = await Promise.all([service.nominals.getAll(), service.currentClaim.get()]);
        const expenses = await service.expenseLines.list(current.id);
        const travel = service.mileage ? await service.mileage.list(current.id) : [];
        if (active) { setNominals(master); setClaim(current); setLines(expenses); setJourneys(travel); }
      } catch (error) { if (active) setLoadError(error instanceof Error ? error.message : 'Demo data could not be loaded.'); }
    }
    load().catch(error => { if (active) setLoadError(String(error)); });
    return () => { active = false; };
  }, [service]);

  React.useEffect(() => { headingRef.current?.focus(); }, [route]);
  React.useEffect(() => { if (menuOpen) navigationRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [menuOpen]);

  async function refresh(): Promise<void> {
    if (claim) setLines(await service.expenseLines.list(claim.id));
  }
  async function refreshMileage(): Promise<void> {
    if (claim && service.mileage) setJourneys(await service.mileage.list(claim.id));
  }
  const reviewing = staffClaims.find(item => item.id === reviewingId) || staffClaims[0];
  function flagSelfApproval(enabled: boolean): void {
    setStaffClaims(previous => previous.map(item => item.id === reviewing.id ? { ...item, selfApproval: enabled, financeAcknowledged: false } : item));
  }
  function acknowledgeFinance(claimId: string, accepted: boolean): void {
    setStaffClaims(previous => previous.map(item => item.id === claimId ? { ...item, financeAcknowledged: item.selfApproval && accepted } : item));
  }

  function navigate(next: HubRoute): void { setRoute(next); setMenuOpen(false); headingRef.current?.focus(); }
  function closeMenu(): void { setMenuOpen(false); moreRef.current?.focus(); }
  function revealControl(event: React.FocusEvent<HTMLDivElement>): void {
    const control = event.target as HTMLElement;
    // Browser caret scrolling can expose only the first line of a textarea,
    // leaving the rest behind a fixed action bar. Reveal the whole control.
    if (control.matches('input, select, textarea, button') && typeof control.scrollIntoView === 'function') {
      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  function menuKey(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') { closeMenu(); return; }
    if (!menuOpen || event.key !== 'Tab') return;
    const buttons = navigationRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  const expenseTotal = totalPence(lines);
  const travelTotal = mileageTotal(journeys);
  // Render-time guard complements the loading effect. Adapter changes may retain
  // an old claim until that effect runs; never render its controls with a new,
  // unqualified transport during that interval.
  const adapterError = service.mode !== 'mock' ? 'This foundation only supports the synthetic demo adapter.' : loadError;

  function metrics(): React.ReactElement {
    return <div className={styles.metrics} aria-label="Demo claim totals">
      <div><span>Expenses</span><strong>{formatMoney(expenseTotal)}</strong></div>
      <div><span>Mileage</span><strong>{formatMoney(travelTotal)}</strong></div>
      <div className={styles.grandTotal}><span>Grand total</span><strong>{formatMoney(expenseTotal + travelTotal)}</strong></div>
    </div>;
  }

  return <div ref={shellRef} className={styles.hub} onFocusCapture={revealControl}>
    <a className={styles.skipLink} href={`#${idPrefix}-content`}>Skip to claim content</a>
    <header className={styles.header}>
      <div className={styles.brand}>
        {logoUrl ? <img className={styles.foundationLogo} src={logoUrl} alt="Kent Cricket Foundation" />
          : <div className={styles.brandText}><strong>KENT CRICKET</strong><span>FOUNDATION</span><small>Original logo pending</small></div>}
        <span className={styles.brandDivider} aria-hidden="true" />
        <div className={styles.appTitle}><strong>Expenses Hub</strong><span>Claim with confidence</span></div>
      </div>
      <div className={styles.headerIdentity}><span className={styles.demoBadge}>DEMO</span><span>D03 / S03-A · 0.0.5</span></div>
    </header>
    <div className={styles.demoNotice}><strong>Synthetic demo · UNSAVED</strong><span>In-memory examples only. Reload resets changes. No SharePoint Save, upload, approval, payroll or messages.</span></div>

    <div className={styles.body}>
      {menuOpen && <button type="button" className={styles.menuBackdrop} aria-label="Close navigation menu" onClick={closeMenu} />}
      <nav ref={navigationRef} className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`} aria-label="Expenses Hub navigation" id={`${idPrefix}-navigation`} onKeyDown={menuKey}>
        <div className={styles.sidebarTitle}><span>YOUR WORKSPACE</span><button className={styles.closeMenu} type="button" onClick={closeMenu} aria-label="Close navigation">×</button></div>
        <ul>{routes.map(item => <li key={item.id}><button type="button" onClick={() => navigate(item.id)} className={`${styles.navButton} ${route === item.id ? styles.navActive : ''}`} aria-current={route === item.id ? 'page' : undefined}>
          <Icon name={item.icon} /><span>{item.label}</span>{item.restricted && <small>DEMO</small>}
        </button></li>)}</ul>
        <div className={styles.sidebarFoot}><Icon name="help" /><span>Simple claims.<br />Clear records.</span><small>Role-restricted areas are preview routes. Real authorisation is not connected.</small></div>
      </nav>

      <main className={styles.content} id={`${idPrefix}-content`} tabIndex={-1}>
        <div className={styles.pageHeading}>
          <div><p className={styles.eyebrow}>OCTOBER 2026 <span>· DEMO CLAIM</span></p><h1 ref={headingRef} tabIndex={-1}>{routeDefinition.label}</h1><p className={styles.pageSubtitle}>{route === 'expenses' ? 'Every detail in one place.' : 'KCF Expenses foundation preview.'}</p></div>
          {['home', 'expenses', 'mileage'].includes(route) && metrics()}
        </div>
        {adapterError && <div className={styles.loadState} role="alert">{adapterError} Reload to restart the demo. No tenant operation has run.</div>}
        {!claim && !adapterError && <p className={styles.loadState} role="status">Loading synthetic examples…</p>}
        {claim && !adapterError && <>
          {/* Keep the editor mounted so navigation preserves an unsaved mock draft. */}
          <div className={styles.routeView} data-route='expenses' hidden={route !== 'expenses'} style={{ flexDirection: 'column', gap: 8 }}>
            <button type="button" className={styles.secondaryButton} style={{ alignSelf: 'flex-start' }} onClick={() => { setD01Visited(true); setD01Open(previous => !previous); }} aria-expanded={d01Open}>{d01Open ? 'Return to synthetic demo' : 'Open D01 TEST Save candidate (held)'}</button>
            <div className={styles.routeView} hidden={d01Open}><ExpensesScreen service={service} claim={claim} nominals={nominals} lines={lines} idPrefix={idPrefix} onSaved={refresh} active={route === 'expenses' && !d01Open} /></div>
            {d01Visited && <div className={styles.routeView} hidden={!d01Open}><D01ExpenseScreen adapter={d01Adapter} idPrefix={idPrefix} active={route === 'expenses' && d01Open} /></div>}
          </div>
          <div className={styles.routeView} data-route='mileage' hidden={route !== 'mileage'} style={{ flexDirection: 'column', gap: 8 }}>
            <button type="button" className={styles.secondaryButton} style={{ alignSelf: 'flex-start' }} onClick={() => { setD02Visited(true); setD02Open(previous => !previous); }} aria-expanded={d02Open}>{d02Open ? 'Return to synthetic Mileage' : 'Open D02 Mileage Save candidate (held)'}</button>
            <div className={styles.routeView} hidden={d02Open}>{service.mileage && <MileageScreen api={service.mileage} claim={claim} nominals={nominals} lines={journeys} idPrefix={idPrefix} onSaved={refreshMileage} homePreference={homePreference} onOpenProfile={() => navigate('profile')} />}</div>
            {d02Visited && <div className={styles.routeView} hidden={!d02Open}><D02MileageScreen adapter={d02Adapter} idPrefix={idPrefix} /></div>}
          </div>
          <div className={styles.routeView} data-route='home' hidden={route !== 'home'}><HomeScreen claim={claim} expenses={expenseTotal} mileage={travelTotal} idPrefix={idPrefix} navigate={navigate} /></div>
          <div className={styles.routeView} data-route='review' hidden={route !== 'review'}><ReviewClaimScreen expenses={lines} journeys={journeys} idPrefix={idPrefix} claimMonth={claim.month} /></div>
          <div className={styles.routeView} data-route='team' hidden={route !== 'team'}><MyTeamScreen claims={staffClaims.slice(0, 3)} idPrefix={idPrefix} onOpen={claimId => { setReviewingId(claimId); navigate('manager'); }} /></div>
          <div className={styles.routeView} data-route='manager' hidden={route !== 'manager'}><ManagerReviewScreen claim={reviewing} decisions={decisions} idPrefix={idPrefix} onDecision={decision => setDecisions(previous => [...previous, decision])} onSelfApproval={flagSelfApproval} /></div>
          <div className={styles.routeView} data-route='finance' hidden={route !== 'finance'}><FinanceScreen claims={staffClaims} decisions={decisions} nominals={nominals} idPrefix={idPrefix} onFinanceAcknowledgement={acknowledgeFinance} /></div>
          <div className={styles.routeView} data-route='nominals' hidden={route !== 'nominals'}><NominalsScreen nominals={nominals} idPrefix={idPrefix} /></div>
          <div className={styles.routeView} data-route='profile' hidden={route !== 'profile'}><ProfileScreen idPrefix={idPrefix} onHomePreferenceChange={setHomePreference} /></div>
          <div className={styles.routeView} data-route='admin' hidden={route !== 'admin'}><AdminScreen nominals={nominals} idPrefix={idPrefix} navigate={navigate} /></div>
          <div className={styles.routeView} data-route='help' hidden={route !== 'help'}><HelpScreen idPrefix={idPrefix} navigate={navigate} /></div>
        </>}
      </main>
    </div>
    <nav className={styles.phoneNav} aria-label="Quick navigation">
      {routes.slice(0, 3).map(item => <button key={item.id} type="button" onClick={() => navigate(item.id)} aria-current={route === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.shortLabel}</span></button>)}
      <button ref={moreRef} type="button" onClick={() => setMenuOpen(previous => !previous)} aria-expanded={menuOpen} aria-controls={`${idPrefix}-navigation`}><Icon name="menu" /><span>More</span></button>
    </nav>
  </div>;
}
