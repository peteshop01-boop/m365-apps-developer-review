/** @jest-environment jsdom */
jest.mock('@microsoft/sp-webpart-base', () => ({ BaseClientSideWebPart: class {} }));
jest.mock('@microsoft/sp-core-library', () => ({ Version: { parse: (s: string): string => s } }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
jest.mock('@microsoft/sp-property-pane', () => ({ PropertyPaneTextField: (): object => ({}) }));
jest.mock('PerformanceHubWebPartStrings', () => ({}), { virtual: true });
jest.mock('./SharePointProductionDataService', () => ({ __esModule: true, default: class {} }));
jest.mock('./OptionEGuardedProductionDataService', () => {
  const parentAnnualSentinel = jest.fn();
  const peopleReadSentinel = jest.fn(async (): Promise<string> => 'person');
  const coreReadSentinel = jest.fn(async (): Promise<string> => 'core');
  const adminWriteSentinel = jest.fn(async (): Promise<string> => 'admin');
  const quarterWriteSentinel = jest.fn(async (): Promise<string> => 'quarter');
  return { __esModule: true, parentAnnualSentinel, peopleReadSentinel, coreReadSentinel, adminWriteSentinel, quarterWriteSentinel, default: class {
    public getPersonByEmail = peopleReadSentinel;
    public getCoreKpiCatalogue = coreReadSentinel;
    public saveBehaviourObjective = adminWriteSentinel;
    public saveQuarterReviewItem = quarterWriteSentinel;
    public submitWorkplan = jest.fn(async (): Promise<never> => {
      parentAnnualSentinel();
      throw new Error('PARENT_ANNUAL_CALLED');
    });
    public createEmployeeWorkplanDraftV2 = jest.fn(async (): Promise<never> => {
      parentAnnualSentinel();
      throw new Error('PARENT_ANNUAL_CALLED');
    });
  } };
});

import PerformanceHubWebPart from '../PerformanceHubWebPart';
import type { IProductionDataService } from './IProductionDataService';
import { createOptionEProductionDataServiceFacade } from './OptionEProductionDataServiceFacade';
import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder, TextEncoder } from 'node:util';
Object.assign(globalThis, { TextDecoder, TextEncoder });

const annual = 'getOrCreateDraftWorkplan saveWorkplanCategoryWeights saveCoreWorkplanItem removeCoreWorkplanItem savePersonalWorkplanItem removePersonalWorkplanItem saveBehaviourWorkplanItem removeBehaviourWorkplanItem submitWorkplan requestWorkplanChanges approveWorkplan approveAndLockWorkplan lockApprovedWorkplan reopenLockedWorkplan openApprovedWorkplanAmendment createEmployeeWorkplanDraftV2 saveEmployeeWorkplanDraftV2 upsertCoreContributionV2 upsertPersonalItemV2 upsertBehaviourCommitmentV2 setCoreWeightingV2 submitEmployeeWorkplanV2 requestEmployeeWorkplanChangesV2 createEmployeeWorkplanAmendmentV2 approveAndLockEmployeeWorkplanV2'.split(' ');

describe('Option E production handoff', () => {
  it('loads immutable captured history only through the explicit read port', async () => {
    const canonicalBody = fs.readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-manager-r3-receipt.json', 'utf8');
    const readCapture = jest.fn(async () => ({ encoding: 'captured-native-request/v1' as const, kind: 'receipt' as const, canonicalBody }));
    const hiddenAdapterHistory = jest.fn();
    const facade = createOptionEProductionDataServiceFacade({ getSubmittedWorkplanHistoryV5: hiddenAdapterHistory } as unknown as IProductionDataService,
      undefined, { readCapture });
    const coordinates = { workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 };
    const result = await facade.getSubmittedWorkplanHistoryV5!(coordinates);
    expect(readCapture).toHaveBeenCalledWith(coordinates); expect(hiddenAdapterHistory).not.toHaveBeenCalled();
    expect(result.status).toBe('DECODED_SOURCE_ONLY');
    if (result.status === 'DECODED_SOURCE_ONLY') expect(result.projection.history.capture.canonicalBody).toBe(canonicalBody);
    for (const name of annual) await expect((facade as unknown as Record<string, () => Promise<unknown>>)[name]()).rejects.toThrow('OPTION_E_TRUSTED_ROUTE_ABSENT');
    await expect(createOptionEProductionDataServiceFacade({} as IProductionDataService).getSubmittedWorkplanHistoryV5!(coordinates))
      .resolves.toEqual({ status: 'HOLD', reason: 'Unbound' });
  });
  it('covers the full current interface without inherited or hidden adapter access', () => {
    const interfaces = ['IProductionDataService.ts', 'IEmployeeWorkplanV2PersistenceService.ts'];
    const names = interfaces.flatMap(file => {
      const source = fs.readFileSync(path.resolve('src/webparts/performanceHub/services', file), 'utf8');
      return Array.from(source.matchAll(/^\s{2}([a-zA-Z]\w*)\??\(/gm), match => match[1]);
    });
    expect(names).toHaveLength(62);
    expect(annual).toHaveLength(25);
    const facade = createOptionEProductionDataServiceFacade({} as IProductionDataService);
    expect(Object.keys(facade).sort()).toEqual(names.sort());
    expect(Object.getPrototypeOf(facade)).toBeNull();
    expect(Object.isFrozen(facade)).toBe(true);
    expect(Reflect.ownKeys(facade)).toEqual(Object.keys(facade));
    expect((facade as unknown as Record<string, unknown>).adapter).toBeUndefined();
    expect((facade as unknown as Record<string, unknown>).constructor).toBeUndefined();
    expect((facade as unknown as Record<string, unknown>).unknownWrite).toBeUndefined();
    for (const name of Object.keys(facade)) {
      const descriptor = Object.getOwnPropertyDescriptor(facade, name);
      expect(descriptor?.get).toBeUndefined();
      expect(descriptor?.set).toBeUndefined();
      expect(typeof descriptor?.value).toBe('function');
    }
  });

  it('hands the guarded facade to the actual WebPart and denies all annual calls', async () => {
    const webPart = new PerformanceHubWebPart();
    Object.defineProperty(webPart, 'context', { value: {
      spHttpClient: {}, pageContext: { web: { absoluteUrl: 'https://example.invalid/site' },
        user: { email: 'employee@example.invalid', displayName: 'Employee' } }
    } });
    await (webPart as unknown as { onInit(): Promise<void> }).onInit();
    const facade = (webPart as unknown as { _dataService: IProductionDataService })._dataService;
    const createIntegration = (webPart as unknown as { _optionEDraftCreateIntegration: {
      admission: { admitted: boolean; code: string };
      create(input: unknown): Promise<unknown>;
    } })._optionEDraftCreateIntegration;
    expect(Object.getPrototypeOf(facade)).toBeNull();
    expect(createIntegration.admission).toEqual({ admitted: false, code: 'INPUTS_ABSENT' });
    await expect(createIntegration.create({})).rejects.toThrow('OPTION_E_DRAFT_CREATE_INPUTS_ABSENT');
    const parentAnnualSentinel = (jest.requireMock('./OptionEGuardedProductionDataService') as { parentAnnualSentinel: jest.Mock }).parentAnnualSentinel;
    for (const name of annual) {
      const method = (facade as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name];
      for (const call of [(): Promise<unknown> => method(),
        (): Promise<unknown> => method.bind(facade)(),
        (): Promise<unknown> => Reflect.apply(method, facade, [])]) {
        await expect(call()).rejects.toThrow('KCF_TEST_VIEW_ONLY');
      }
      expect(Object.getOwnPropertyDescriptor(facade, name)?.value).toBe(method);
    }
    await expect(facade.createEmployeeWorkplanDraftV2({} as never)).rejects.toThrow(
      'KCF_TEST_VIEW_ONLY'
    );
    await expect(facade.saveEmployeeWorkplanDraftV2({} as never, {} as never)).rejects.toThrow(
      'KCF_TEST_VIEW_ONLY'
    );
    await expect(facade.submitEmployeeWorkplanV2({} as never)).rejects.toThrow(
      'KCF_TEST_VIEW_ONLY'
    );
    const parent = Object.getPrototypeOf(facade);
    expect(parent?.submitWorkplan).toBeUndefined();
    expect(parentAnnualSentinel).not.toHaveBeenCalled();
    await expect(facade.getPersonByEmail('employee@example.invalid')).resolves.toBe('person');
    await expect(facade.getCoreKpiCatalogue(2026)).resolves.toBe('core');
    const sentinels = jest.requireMock('./OptionEGuardedProductionDataService') as {
      peopleReadSentinel: jest.Mock; coreReadSentinel: jest.Mock;
      adminWriteSentinel: jest.Mock; quarterWriteSentinel: jest.Mock;
    };
    expect(sentinels.peopleReadSentinel).toHaveBeenCalledWith('employee@example.invalid');
    expect(sentinels.coreReadSentinel).toHaveBeenCalledWith(2026);
    await expect(facade.saveBehaviourObjective({} as never, {} as never)).rejects.toThrow('KCF_TEST_VIEW_ONLY');
    await expect(facade.saveQuarterReviewItem({} as never, {} as never, {} as never, {} as never)).rejects.toThrow('KCF_TEST_VIEW_ONLY');
    expect(sentinels.adminWriteSentinel).not.toHaveBeenCalled();
    expect(sentinels.quarterWriteSentinel).not.toHaveBeenCalled();
  });

  it('does not claim to constrain an independently constructed direct adapter', () => {
    const DirectAdapter = (jest.requireActual('./SharePointProductionDataService') as {
      default: new (client: never, site: string, email: string) => IProductionDataService
    }).default;
    const alternate = new DirectAdapter({} as never, 'https://example.invalid/site', 'employee@example.invalid');
    const facade = createOptionEProductionDataServiceFacade(alternate);
    expect(typeof Object.getPrototypeOf(alternate).submitWorkplan).toBe('function');
    expect(Object.getPrototypeOf(facade)).toBeNull();
  });
});

import { isKcfAutomationTestWeb, createTestHeldDraftGateway, TestHeldWorkplanSubmitClient } from '../PerformanceHubWebPart';
import type { IOptionEDraftGateway } from './OptionEDraftSharePointGateway';
import type { IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
const testHeldMutations = 'getOrCreateDraftWorkplan saveWorkplanCategoryWeights saveCoreWorkplanItem removeCoreWorkplanItem savePersonalWorkplanItem removePersonalWorkplanItem saveBehaviourWorkplanItem removeBehaviourWorkplanItem submitWorkplan requestWorkplanChanges approveWorkplan approveAndLockWorkplan lockApprovedWorkplan reopenLockedWorkplan openApprovedWorkplanAmendment createEmployeeWorkplanDraftV2 saveEmployeeWorkplanDraftV2 upsertCoreContributionV2 upsertPersonalItemV2 upsertBehaviourCommitmentV2 setCoreWeightingV2 submitEmployeeWorkplanV2 requestEmployeeWorkplanChangesV2 createEmployeeWorkplanAmendmentV2 approveAndLockEmployeeWorkplanV2 saveBehaviourObjective setBehaviourObjectiveActive prepareQuarterReview saveQuarterReviewItem saveProgressEntry submitQuarterReview requestQuarterReviewChanges approveAndLockQuarterReview saveQuarterManagerOverride saveQuarterBehaviourAssessment saveEmployeeQuarterUpdateV2 registerEmployeeQuarterEvidenceV2 submitEmployeeQuarterV2'.split(' ');
describe('PM124 genuine TEST typed native hold', () => {
  it.each(testHeldMutations)('denies %s including detached, bound and reflected calls with no adapter effect', async name => {
    const mutation = jest.fn();
    const facade = createOptionEProductionDataServiceFacade({ [name]: mutation } as unknown as IProductionDataService, undefined, undefined, true);
    const call = (facade as unknown as Record<string, () => Promise<unknown>>)[name];
    for (const execute of [() => call(), () => call.bind(facade)(), () => Reflect.apply(call, facade, [])]) {
      await expect(execute()).rejects.toThrow('KCF_TEST_VIEW_ONLY');
    }
    expect(mutation).not.toHaveBeenCalled();
  });
  it('inventories every current service method as an explicit write hold or retained read', async () => {
    const names = ['IProductionDataService.ts','IEmployeeWorkplanV2PersistenceService.ts'].flatMap(file =>
      Array.from(fs.readFileSync(path.resolve('src/webparts/performanceHub/services', file),'utf8').matchAll(/^\s{2}([a-zA-Z]\w*)\??\(/gm), m => m[1]));
    const reads = names.filter(name => !testHeldMutations.includes(name));
    expect(testHeldMutations).toHaveLength(38); expect(reads).toHaveLength(24);
    expect(reads.every(name => name.startsWith('get'))).toBe(true);
    const adapter: Record<string, jest.Mock> = Object.fromEntries(reads.map(name => [name, jest.fn(async () => name)]));
    const facade = createOptionEProductionDataServiceFacade(adapter as unknown as IProductionDataService, undefined, undefined, true);
    expect(Object.keys(facade).sort()).toEqual(names.sort());
    for (const name of reads.filter(name => name !== 'getSubmittedWorkplanHistoryV5')) {
      await expect((facade as unknown as Record<string, () => Promise<unknown>>)[name]()).resolves.toBe(name);
      expect(adapter[name]).toHaveBeenCalledTimes(1);
    }
    await expect(facade.getSubmittedWorkplanHistoryV5!({ workplan:'fixture',person:'employee',year:2026 })).resolves.toEqual({ status:'HOLD',reason:'Unbound' });
    expect(adapter.getSubmittedWorkplanHistoryV5).not.toHaveBeenCalled();
  });
  it.each([
    ['https://example.invalid/sites/REVIEW-TEST-SITE',true],
    ['https://example.invalid/sites/REVIEW-TEST-SITE/',true],
    ['https://example.invalid/sites/REVIEW-TEST-SITE/subweb',true],
    ['https://example.invalid/sites/REVIEW-TEST-SITE-Production',false],
    ['https://example.invalid/sites/KCF-Production',false],
    ['http://example.invalid/sites/REVIEW-TEST-SITE',false],
    ['https://example.invalid.evil.invalid/sites/REVIEW-TEST-SITE',false],
    ['https://example.invalid/sites/REVIEW-TEST-SITE?hold=false',false],
    ['invalid',false]
  ])('uses trusted exact environment configuration %s', (url, expected) => expect(isKcfAutomationTestWeb(String(url))).toBe(expected));
  it('retains protected Draft reads/preparation but denies update before touching native ports', async () => {
    const gateway = { read:jest.fn(async ()=>'read'),prepare:jest.fn(async ()=>'prepared'),updateExact:jest.fn() };
    const held = createTestHeldDraftGateway(gateway as unknown as IOptionEDraftGateway);
    await expect(held.read({performanceYear:2026})).resolves.toBe('read');
    await expect(held.prepare({} as never)).resolves.toBe('prepared');
    await expect(held.updateExact({} as never)).rejects.toThrow('KCF_TEST_VIEW_ONLY');
    expect(gateway.updateExact).not.toHaveBeenCalled(); expect(Object.isFrozen(held)).toBe(true);
    expect(Object.keys(held).sort()).toEqual(['prepare','read','updateExact']);
  });
  it('keeps Submit explicitly unavailable through the exposed client', async () => {
    const held = new TestHeldWorkplanSubmitClient();
    expect(held.installedAvailable()).toBe(false);
    expect((await held.submit()).phase).toBe('HOLD');
    expect((await held.submit()).message).toContain('Submit is held');
  });
  it('binds the actual TEST WebPart facade, protected Draft and Submit to hold mode', async () => {
    const webPart = new PerformanceHubWebPart();
    const get=jest.fn(),post=jest.fn();
    Object.defineProperty(webPart,'context',{value:{spHttpClient:{get,post},pageContext:{web:{absoluteUrl:'https://example.invalid/sites/REVIEW-TEST-SITE'},user:{email:'employee@example.invalid',displayName:'Employee'}}}});
    await (webPart as unknown as {onInit():Promise<void>}).onInit();
    const held=webPart as unknown as {_nativeWritesHeld:boolean;_dataService:IProductionDataService;_optionEDraftGateway?:IOptionEDraftGateway;_optionEPrivateDraftV3Gateway:IOptionEDraftGateway<IOptionEWorkplanDraftV3Aggregate>;_optionEV4SubmitClient:TestHeldWorkplanSubmitClient};
    expect(held._nativeWritesHeld).toBe(true);
    await expect(held._dataService.saveQuarterReviewItem({} as never,{} as never,{} as never,{} as never)).rejects.toThrow('KCF_TEST_VIEW_ONLY');
    expect(held._optionEDraftGateway).toBeUndefined();
    expect(held._optionEPrivateDraftV3Gateway).toBeDefined();
    expect(typeof held._optionEPrivateDraftV3Gateway.read).toBe('function');
    expect(typeof held._optionEPrivateDraftV3Gateway.prepare).toBe('function');
    await expect(held._optionEPrivateDraftV3Gateway.updateExact({} as never)).rejects.toThrow('KCF_TEST_VIEW_ONLY');
    expect((await held._optionEV4SubmitClient.submit()).phase).toBe('HOLD');
    expect(get).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
  });
});
