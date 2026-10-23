import * as React from 'react';
import { confirmedTestPage } from './linkPolicy';
import styles from './landing.module.scss';

export interface IKcfAppsLandingProps {
  readonly kpiUrl?: string;
  readonly expensesUrl?: string;
  /** Integrator supplies the approved derived white portrait asset bundled with this folder. */
  readonly logoUrl: string;
}

function Header({ logoUrl }: { readonly logoUrl: string }): React.ReactElement {
  return <header className={[styles.kcfAppsHeader].join(' ')}>
    <img className={[styles.kcfAppsLogo].join(' ')} src={logoUrl} alt="Kent Cricket Foundation" width="66" height="86" />
    <div><p className={[styles.kcfAppsEyebrow].join(' ')}>KENT CRICKET FOUNDATION</p><p className={[styles.kcfAppsBrand].join(' ')}>Our digital workspace</p></div>
    <span className={[styles.kcfAppsTest].join(' ')}>TEST</span>
  </header>;
}

function AppLink({ url, title }: { readonly url?: string; readonly title: string }): React.ReactElement {
  const confirmed = confirmedTestPage(url);
  return confirmed ? <a className={[styles.kcfAppsLink].join(' ')} href={confirmed}>{title}<span aria-hidden="true"> →</span></a> :
    <p className={[styles.kcfAppsUnavailable].join(' ')}>Link unavailable — awaiting verified TEST page</p>;
}

export function KcfAppsLanding({ kpiUrl, expensesUrl, logoUrl }: IKcfAppsLandingProps): React.ReactElement {
  return <section className={[styles.kcfAppsLanding].join(' ')} aria-label="KCF Apps TEST workspace">
    <Header logoUrl={logoUrl} />
    <div className={[styles.kcfAppsBody].join(' ')}>
      <div className={[styles.kcfAppsIntro].join(' ')}><p className={[styles.kcfAppsEyebrow].join(' ')}>KCF AUTOMATION · TEST WORKSPACE</p>
        <h1>KCF Apps — TEST</h1><p>One place to open our Foundation tools. Choose an app below.</p></div>
      <p className={[styles.kcfAppsNotice].join(' ')}><strong>TEST AREA.</strong> Expenses uses synthetic demonstration data. Demo actions are unsaved; nothing is sent to payroll.</p>
      <div className={[styles.kcfAppsGrid].join(' ')}>
        <article className={[styles.kcfAppsCard, styles.kcfAppsKpi].join(' ')}><div className={[styles.kcfAppsCardTop].join(' ')}><span className={[styles.kcfAppsIcon].join(' ')} aria-hidden="true">▥</span><span className={[styles.kcfAppsPill].join(' ')}>EXISTING TEST HOST</span></div>
          <h2>KCF KPI</h2><p>Open the existing KPI TEST host and installation-status page. The KPI app is not yet installed.</p>
          <p className={[styles.kcfAppsHostNote].join(' ')}>Existing KPI design and navigation remain unchanged.</p>
          <AppLink url={kpiUrl} title="Open KPI TEST host" /></article>
        <article className={[styles.kcfAppsCard, styles.kcfAppsExpenses].join(' ')}><div className={[styles.kcfAppsCardTop].join(' ')}><span className={[styles.kcfAppsIcon].join(' ')} aria-hidden="true">£</span><span className={[styles.kcfAppsDemo].join(' ')}>SYNTHETIC DEMO</span></div>
          <h2>KCF Expenses</h2><p>Explore expenses, mileage, claim review and Finance screens in a safe demonstration.</p>
          <p className={[styles.kcfAppsWarning].join(' ')}>DEMO / UNSAVED · Not payroll</p><AppLink url={expensesUrl} title="Open Expenses DEMO" /></article>
      </div>
      <div className={[styles.kcfAppsFuture].join(' ')} aria-label="Future applications">
        <article><h2>Media</h2><p>Coming soon</p></article><article><h2>SEND / Schools Planner</h2><p>Coming soon</p></article><article><h2>Tasks</h2><p>Coming soon</p></article>
      </div>
      <footer className={[styles.kcfAppsFooter].join(' ')}>KCF Automation TEST · Links appear only after their TEST pages are verified.</footer>
    </div>
  </section>;
}

/** Dedicated Expenses entry; does not change site navigation or the existing homepage. */
export function KcfExpensesEntry({ expensesUrl, logoUrl }: IKcfAppsLandingProps): React.ReactElement {
  return <section className={[styles.kcfAppsLanding].join(' ')} aria-label="KCF Expenses TEST entry"><Header logoUrl={logoUrl} />
    <div className={[styles.kcfAppsBody].join(' ')}><div className={[styles.kcfAppsIntro].join(' ')}><p className={[styles.kcfAppsEyebrow].join(' ')}>KCF AUTOMATION · TEST</p><h1>KCF Expenses</h1>
      <p>Expenses, mileage and claim review, together.</p></div>
      <div className={[styles.kcfAppsEntry, styles.kcfAppsCard].join(' ')}><span className={[styles.kcfAppsDemo].join(' ')}>SYNTHETIC DEMO / NOT PAYROLL</span>
        <h2>Explore the Expenses demonstration</h2><p>Open all eleven app pages and try the clearly marked demo actions. Changes stay in this session and are not saved to SharePoint.</p>
        <p className={[styles.kcfAppsWarning].join(' ')}>DEMO / UNSAVED · No real claim submissions, approvals or payroll</p>
        <AppLink url={expensesUrl} title="Open Expenses DEMO" /></div>
      <footer className={[styles.kcfAppsFooter].join(' ')}>KCF Automation TEST · No staff invitations or notifications.</footer>
    </div></section>;
}
