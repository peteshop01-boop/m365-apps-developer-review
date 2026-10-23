import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';
import { SPHttpClient } from '@microsoft/sp-http';

import * as strings from 'PerformanceHubWebPartStrings';
import OptionEGuardedProductionDataService from './services/OptionEGuardedProductionDataService';
import { createOptionEProductionDataServiceFacade } from './services/OptionEProductionDataServiceFacade';
import {
  createOptionEDraftCreateIntegration,
  type IOptionEDraftCreateIntegration
} from './services/OptionEDraftCreateIntegration';
import type { IProductionDataService } from './services/IProductionDataService';
import SharePointAdminReportingControlDataService from './services/SharePointAdminReportingControlDataService';
import type { IAdminReportingControlDataService } from './services/AdminReportingControlDataService';
import IntegratedPerformanceHub, { IIntegratedPerformanceHubProps, LocalPrivateDraftV3Gateway, isLocalPrivateDraftFixtureRoute } from './components/IntegratedPerformanceHub';
import { OPTION_E_DRAFT_V3_SCHEMA_VERSION, type IOptionEWorkplanDraftV3Aggregate } from './models/OptionEWorkplanDraftV3Models';
import type { OptionEPrivateDraftAggregate } from './services/OptionEDraftSharePointGateway';
import type { IReportingViewsDataset } from './models/ReportingModels';
import OptionEDraftSharePointGateway from './services/OptionEDraftSharePointGateway';
import OptionEProtectedDraftGateway from './services/OptionEProtectedDraftGateway';
import type { IOptionEDraftGateway } from './services/OptionEDraftSharePointGateway';
import { OptionEWorkplanSubmitExactBodyV4Client } from './services/OptionEWorkplanSubmitExactBodyV4Client';
import { GovernedNotificationSourceController } from './services/notifications/GovernedNotificationSourceController';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './services/OptionEWorkplanListBindings';
import {
  createDisabledOptionEBehaviourManagerGateway,
  type IOptionEBehaviourManagerGateway
} from './services/BehaviourOptionEBinding';

import { createDisabledBehaviourCatalogueAdministrationGateway,
  type IBehaviourCatalogueAdministrationGateway } from './services/BehaviourCatalogueAdministration';

export interface IPerformanceHubWebPartProps {
  description: string;
}

/** Governed environment configuration; page/query/property input cannot turn this hold off. */
export function isKcfAutomationTestWeb(webAbsoluteUrl: string): boolean {
  try {
    const url = new URL(webAbsoluteUrl);
    const path = url.pathname.toLowerCase().replace(/\/$/, '');
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'example.invalid'
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && (path === '/sites/REVIEW-TEST-SITE' || path.startsWith('/sites/REVIEW-TEST-SITE/'));
  } catch { return false; }
}

export function createTestHeldDraftGateway<T extends OptionEPrivateDraftAggregate>(gateway: IOptionEDraftGateway<T>): IOptionEDraftGateway<T> {
  return Object.freeze({
    prepare: (aggregate) => gateway.prepare(aggregate),
    read: (context, expected) => gateway.read(context, expected),
    updateExact: () => Promise.reject(new Error('KCF_TEST_VIEW_ONLY: Draft Save is held.'))
  } as IOptionEDraftGateway<T>);
}

/** Independent transport barrier: even a mistaken UI flag cannot dispatch a native POST. */
export function createNativeReadOnlyHttpClient(client: SPHttpClient): SPHttpClient {
  return { get: (...args: Parameters<SPHttpClient['get']>) => client.get(...args),
    post: () => Promise.reject(new Error('NATIVE_WRITES_HELD: local activation does not authorise SharePoint writes.')) } as unknown as SPHttpClient;
}

export class TestHeldWorkplanSubmitClient extends OptionEWorkplanSubmitExactBodyV4Client {
  public installedAvailable(): boolean { return false; }
  public submit(): ReturnType<OptionEWorkplanSubmitExactBodyV4Client['submit']> {
    return Promise.resolve({ phase: 'HOLD', message: 'KCF TEST view-only: Submit is held. The Draft remains private.' });
  }
}

interface IPackageHostLabInput {
  syntheticReadOnly: true;
  dataService: IProductionDataService;
  adminReportingDataService: IAdminReportingControlDataService;
  reportingDataset?: IReportingViewsDataset;
  /** Existing declared fixture transport; only the exact loopback host may consume it. */
  privateDraftTransport?: SPHttpClient;
}

export function isPackageHostLabRoute(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.pathname === '/package-host/';
  } catch { return false; }
}

export function packageHostLabInput(): IPackageHostLabInput | undefined {
  if (typeof window === 'undefined' || !isPackageHostLabRoute(window.location.href)) return undefined;
  const input = (window as unknown as { __KCF_PACKAGE_HOST_LAB__?: IPackageHostLabInput }).__KCF_PACKAGE_HOST_LAB__;
  if (!input || input.syntheticReadOnly !== true || !input.dataService || !input.adminReportingDataService) return undefined;
  return input;
}

function readOnlyLabService<T extends object>(service: T): T {
  return new Proxy(service, { get(target, key: string | symbol) {
    if (typeof key !== 'string') return Reflect.get(target, key);
    if (/^(getOrCreate|create|save|set|upsert|remove|submit|approve|request|register|lock|reopen|openApproved|delete|update|patch|post|put)/i.test(key)) {
      return async (): Promise<never> => { throw new Error('SYNTHETIC PACKAGE HOST: writes are blocked'); };
    }
    return Reflect.get(target, key);
  } });
}

export default class PerformanceHubWebPart extends BaseClientSideWebPart<IPerformanceHubWebPartProps> {

  private _dataService!: IProductionDataService;
  private _adminReportingDataService!: IAdminReportingControlDataService;
  private _optionEDraftGateway?: IOptionEDraftGateway;
  private _optionEPrivateDraftV3Gateway?: IOptionEDraftGateway<IOptionEWorkplanDraftV3Aggregate>;
  private _optionEV4SubmitClient = new OptionEWorkplanSubmitExactBodyV4Client();
  private _nativeWritesHeld = true;
  private readonly _notificationSource = new GovernedNotificationSourceController();
  private readonly _optionEDraftCreateIntegration: IOptionEDraftCreateIntegration =
    createOptionEDraftCreateIntegration();
  private _managerBehaviourGateway!: IOptionEBehaviourManagerGateway;
  private readonly _behaviourCatalogueAdministration: IBehaviourCatalogueAdministrationGateway =
    createDisabledBehaviourCatalogueAdministrationGateway();
  private _packageHostLab?: IPackageHostLabInput;

  public render(): void {
    const element = React.createElement<IIntegratedPerformanceHubProps>(IntegratedPerformanceHub, {
      dataService: this._dataService,
      nativeWritesHeld: true,
      adminReportingDataService: this._adminReportingDataService,
      currentUserEmail: this.context.pageContext.user.email,
      userDisplayName: this.context.pageContext.user.displayName,
      optionEDraftGateway: this._optionEDraftGateway,
      optionEPrivateDraftV3Gateway: this._optionEPrivateDraftV3Gateway,
      optionEDraftCreateIntegration: this._optionEDraftCreateIntegration,
      optionEV4SubmitClient: this._optionEV4SubmitClient,
      notificationSource: this._notificationSource,
      managerBehaviourGateway: this._managerBehaviourGateway,
      behaviourCatalogueAdministration: this._behaviourCatalogueAdministration,
      localSyntheticReportingDataset: this._packageHostLab?.reportingDataset
    });
    ReactDom.render(element, this.domElement);
  }

  protected onInit(): Promise<void> {
    this._nativeWritesHeld = true;
    this._optionEV4SubmitClient = new TestHeldWorkplanSubmitClient();
    this._optionEDraftGateway = undefined; this._optionEPrivateDraftV3Gateway = undefined;
    this._packageHostLab = isLocalPrivateDraftFixtureRoute()
      && this.context.pageContext.web.absoluteUrl === window.location.origin ? packageHostLabInput() : undefined;
    if (this._packageHostLab) {
      this._dataService = readOnlyLabService(this._packageHostLab.dataService);
      this._adminReportingDataService = readOnlyLabService(this._packageHostLab.adminReportingDataService);
      this._managerBehaviourGateway = createDisabledOptionEBehaviourManagerGateway();
      if (this._packageHostLab.privateDraftTransport) this._optionEPrivateDraftV3Gateway = new LocalPrivateDraftV3Gateway(
        this._packageHostLab.privateDraftTransport, this.context.pageContext.user.email, SPHttpClient.configurations.v1);
      return Promise.resolve();
    }
    const nativeClient = createNativeReadOnlyHttpClient(this.context.spHttpClient);
    const productionAdapter = new OptionEGuardedProductionDataService(
      nativeClient,
      this.context.pageContext.web.absoluteUrl,
      this.context.pageContext.user.email
    );
    this._dataService = createOptionEProductionDataServiceFacade(
      productionAdapter,
      this._optionEDraftCreateIntegration,
      undefined,
      this._nativeWritesHeld
    );
    this._adminReportingDataService = new SharePointAdminReportingControlDataService(
      nativeClient,
      this.context.pageContext.web.absoluteUrl,
      this.context.pageContext.user.email,
      this.isAdminReportingUatMode() || this.isStrategicCoreCoverageBusinessUatMode()
    );
    const draftStore = new OptionEDraftSharePointGateway<IOptionEWorkplanDraftV3Aggregate>(
      nativeClient,
      this.context.pageContext.web.absoluteUrl,
      OPTION_E_WORKPLAN_LIST_BINDINGS,
      SPHttpClient.configurations.v1, undefined, OPTION_E_DRAFT_V3_SCHEMA_VERSION
    );
    const privateGateway = new OptionEProtectedDraftGateway<IOptionEWorkplanDraftV3Aggregate>(
      nativeClient,
      this.context.pageContext.web.absoluteUrl,
      this.context.pageContext.user.email,
      OPTION_E_WORKPLAN_LIST_BINDINGS,
      SPHttpClient.configurations.v1,
      draftStore, OPTION_E_DRAFT_V3_SCHEMA_VERSION
    );
    this._optionEPrivateDraftV3Gateway = createTestHeldDraftGateway(privateGateway);
    this._managerBehaviourGateway = createDisabledOptionEBehaviourManagerGateway();
    return Promise.resolve();
  }

  private isLocalUatMode(): boolean {
    const parameters = new URLSearchParams(window.location.search);
    const manifest = (parameters.get('debugManifestsFile') || '').toLowerCase();
    return (parameters.get('kcfKpi018Uat') === 'true' || parameters.get('kcfKpi017Uat') === 'true')
      && parameters.get('debug') === 'true'
      && manifest === 'https://localhost:4321/temp/build/manifests.js'
      && this.context.pageContext.web.absoluteUrl.toLowerCase() === 'https://example.invalid/sites/REVIEW-TEST-SITE'
      && this.context.pageContext.user.email.trim().toLowerCase() === 'person003@example.invalid';
  }

  private isAdminUatMode(): boolean {
    const parameters = new URLSearchParams(window.location.search);
    const manifest = (parameters.get('debugManifestsFile') || '').toLowerCase();
    return parameters.get('kcfKpi020AdminUat') === 'true'
      && parameters.get('debug') === 'true'
      && (manifest === 'https://localhost:4321/temp/build/manifests.js'
        || manifest === 'https://localhost:4323/temp/build/manifests.js')
      && this.context.pageContext.web.absoluteUrl.toLowerCase() === 'https://example.invalid/sites/REVIEW-TEST-SITE'
      && this.context.pageContext.user.email.trim().toLowerCase() === 'person003@example.invalid';
  }

  private isAdminReportingUatMode(): boolean {
    const parameters = new URLSearchParams(window.location.search);
    const manifest = (parameters.get('debugManifestsFile') || '').toLowerCase();
    return parameters.get('kcfKpi020bAdminUat') === 'true'
      && parameters.get('debug') === 'true'
      && (manifest === 'https://localhost:4321/temp/build/manifests.js'
        || manifest === 'https://localhost:4326/temp/build/manifests.js')
      && this.context.pageContext.web.absoluteUrl.toLowerCase() === 'https://example.invalid/sites/REVIEW-TEST-SITE'
      && this.context.pageContext.user.email.trim().toLowerCase() === 'person003@example.invalid';
  }

  private isStrategicCoreCoverageUatMode(): boolean {
    const parameters = new URLSearchParams(window.location.search);
    const manifest = (parameters.get('debugManifestsFile') || '').toLowerCase();
    const r1Manifest = manifest === 'https://localhost:4329/temp/build/manifests.js'
      && parameters.get('kcfKpi025R1') === 'KCF-KPI-025-R1-BOUNDED-QA-4329';
    return parameters.get('kcfKpi025CoverageUat') === 'true'
      && parameters.get('debug') === 'true'
      && (manifest === 'https://localhost:4321/temp/build/manifests.js?kcf-kpi-025=1'
        || r1Manifest)
      && this.context.pageContext.web.absoluteUrl.toLowerCase() === 'https://example.invalid/sites/REVIEW-TEST-SITE'
      && this.context.pageContext.user.email.trim().toLowerCase() === 'person003@example.invalid';
  }

  private isStrategicCoreCoverageBusinessUatMode(): boolean {
    const parameters = new URLSearchParams(window.location.search);
    const manifest = (parameters.get('debugManifestsFile') || '').toLowerCase();
    return parameters.get('kcfKpi025BusinessUat') === 'true'
      && parameters.get('kcfKpi025R2') === 'KCF-KPI-025-R2-Sponsor-BUSINESS-UAT-4329'
      && parameters.get('debug') === 'true'
      && manifest === 'https://localhost:4329/temp/build/manifests.js'
      && this.context.pageContext.web.absoluteUrl.toLowerCase() === 'https://example.invalid/sites/REVIEW-TEST-SITE'
      && this.context.pageContext.user.email.trim().toLowerCase() === 'person003@example.invalid';
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) {
      return;
    }

    const {
      semanticColors
    } = currentTheme;

    if (semanticColors) {
      this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
      this.domElement.style.setProperty('--link', semanticColors.link || null);
      this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
    }

  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription
          },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('description', {
                  label: strings.DescriptionFieldLabel
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
