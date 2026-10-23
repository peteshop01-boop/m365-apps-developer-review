import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { KcfExpensesHub } from './components/KcfExpensesHub';
import { MockExpensesService } from '../../services/MockExpensesService';
import { nominalMaster } from '../../data/nominals';
import { foundationLogo } from '../../assets/foundationLogo';
import type { IExpensesService } from '../../domain/contracts';
import { isDemoTestSite } from '../../domain/demoHost';
import { PropertyPaneDropdown, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import type { IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
import { KcfAppsLanding, KcfExpensesEntry } from './components/landing/KcfAppsLanding';
import { createHeldExpenseEntry } from '../../services/persistence/ExpenseEntryAdapter';
import type { ExpenseEntryAdapter } from '../../services/persistence/ExpenseEntryAdapter';

interface IDemoPageProperties { view?: 'expenses' | 'apps' | 'entry'; expensesUrl?: string; }

export default class KcfExpensesHubWebPart extends BaseClientSideWebPart<IDemoPageProperties> {
  private service: IExpensesService | undefined;
  private expenseEntry: ExpenseEntryAdapter | undefined;

  public render(): void {
    const element = isDemoTestSite(this.context.pageContext.web.absoluteUrl) ? this.createDemoElement()
      : React.createElement('p', { role: 'alert' }, 'KCF Expenses DEMO 0.0.5 is restricted to KCF Automation TEST. No data operation has run.');
    ReactDom.render(element, this.domElement);
  }

  private createDemoElement(): React.ReactElement {
    if (this.properties.view === 'apps' || this.properties.view === 'entry') {
      return React.createElement(this.properties.view === 'apps' ? KcfAppsLanding : KcfExpensesEntry, {
        logoUrl: foundationLogo,
        kpiUrl: 'https://example.invalid/sites/REVIEW-TEST-SITE/SitePages/KPI-Performance-Hub-Test.aspx',
        expensesUrl: this.properties.expensesUrl
      });
    }
    if (this.properties.view && this.properties.view !== 'expenses') {
      return React.createElement('p', { role: 'alert' }, 'Unknown TEST page mode. No demo or data operation has run.');
    }
    // One adapter per web-part instance; navigation never resets the in-memory claim.
    // A future authenticated adapter belongs here, after D00/S00-B verification.
    if (!this.service) this.service = new MockExpensesService(nominalMaster);
    if (!this.expenseEntry) this.expenseEntry = createHeldExpenseEntry();
    return React.createElement(KcfExpensesHub, {
      service: this.service, expenseEntry: this.expenseEntry, logoUrl: foundationLogo, instanceId: this.instanceId
    });
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
    this.service = undefined;
    this.expenseEntry = undefined;
  }

  protected get dataVersion(): Version { return Version.parse('1.0'); }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return { pages: [{ header: { description: 'Page-local TEST demo. No tenant data access or role permissions.' }, groups: [{ groupName: 'TEST presentation', groupFields: [
      PropertyPaneDropdown('view', { label: 'Page view', selectedKey: this.properties.view || 'expenses', options: [
        { key: 'expenses', text: 'Expenses demo application' }, { key: 'apps', text: 'KCF Apps TEST landing' }, { key: 'entry', text: 'Dedicated Expenses TEST entry' }
      ] }),
      PropertyPaneTextField('expensesUrl', { label: 'Verified Expenses TEST page URL', description: 'Leave empty until the page is observed installed and working. Only exact KCF Automation HTTPS page links are accepted.' })
    ] }] }] };
  }
}
