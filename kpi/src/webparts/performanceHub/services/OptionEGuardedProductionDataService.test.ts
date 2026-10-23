jest.mock('./SharePointProductionDataService', () => ({ __esModule: true, default: class {} }));

// Load the real guarded class against a parent sentinel. Importing the real
// SPFx parent in Jest requires host-only Microsoft internals.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const OptionEGuardedProductionDataService = require('./OptionEGuardedProductionDataService')
  .default as typeof import('./OptionEGuardedProductionDataService').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SharePointProductionDataService = require('./SharePointProductionDataService')
  .default as typeof import('./SharePointProductionDataService').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
import type { IProductionDataService } from './IProductionDataService';

const annualWriteNames = [
  'createEmployeeWorkplanDraftV2', 'saveEmployeeWorkplanDraftV2',
  'upsertCoreContributionV2', 'upsertPersonalItemV2', 'upsertBehaviourCommitmentV2',
  'setCoreWeightingV2', 'submitEmployeeWorkplanV2',
  'requestEmployeeWorkplanChangesV2', 'createEmployeeWorkplanAmendmentV2',
  'approveAndLockEmployeeWorkplanV2',
  'getOrCreateDraftWorkplan', 'saveWorkplanCategoryWeights',
  'saveCoreWorkplanItem', 'removeCoreWorkplanItem',
  'savePersonalWorkplanItem', 'removePersonalWorkplanItem',
  'saveBehaviourWorkplanItem', 'removeBehaviourWorkplanItem',
  'submitWorkplan', 'requestWorkplanChanges', 'approveWorkplan',
  'approveAndLockWorkplan', 'lockApprovedWorkplan',
  'reopenLockedWorkplan', 'openApprovedWorkplanAmendment'
] as const satisfies readonly (keyof IProductionDataService)[];

const preservedNames = ['getPersonByEmail', 'getCoreKpiCatalogue', 'getAdminPeople',
  'saveQuarterReviewItem', 'submitQuarterReview'] as const;
for (const name of [...annualWriteNames, ...preservedNames]) {
  Object.defineProperty(SharePointProductionDataService.prototype, name, {
    configurable: true,
    value: jest.fn(() => { throw new Error('PARENT_PATH_REACHED'); })
  });
}

describe('Option E package annual write guard', () => {
  it('covers the complete inherited public annual mutation surface', () => {
    const source = fs.readFileSync('src/webparts/performanceHub/services/SharePointProductionDataService.ts', 'utf8');
    const parentNames = Array.from(source.matchAll(/^ {2}public (?:async )?([A-Za-z][A-Za-z0-9_]*)\(/gm), match => match[1]);
    const discovered = parentNames.filter(name =>
      /^(?:createEmployeeWorkplanDraftV2|saveEmployeeWorkplanDraftV2|upsertCoreContributionV2|upsertPersonalItemV2|upsertBehaviourCommitmentV2|setCoreWeightingV2|submitEmployeeWorkplanV2|requestEmployeeWorkplanChangesV2|createEmployeeWorkplanAmendmentV2|approveAndLockEmployeeWorkplanV2|getOrCreateDraftWorkplan|saveWorkplanCategoryWeights|(?:save|remove)(?:Core|Personal|Behaviour)WorkplanItem|submitWorkplan|requestWorkplanChanges|approve(?:AndLock)?Workplan|lockApprovedWorkplan|reopenLockedWorkplan|openApprovedWorkplanAmendment)$/.test(name));
    expect(discovered.sort()).toEqual([...annualWriteNames].sort());
    for (const name of annualWriteNames) {
      expect(Object.prototype.hasOwnProperty.call(OptionEGuardedProductionDataService.prototype, name)).toBe(true);
    }
  });

  it('rejects every annual command before any inherited parent path can run', async () => {
    const service = Object.create(OptionEGuardedProductionDataService.prototype) as
      InstanceType<typeof OptionEGuardedProductionDataService>;
    for (const name of annualWriteNames) {
      const parent = jest.spyOn(SharePointProductionDataService.prototype, name);
      try {
        const call = (service as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name];
        await expect(call.call(service)).rejects.toThrow('OPTION_E_TRUSTED_ROUTE_ABSENT');
        expect(parent).not.toHaveBeenCalled();
      } finally {
        parent.mockRestore();
      }
    }
  });

  it('preserves unrelated read-only, Admin reference-data and Quarterly methods', () => {
    const parent = SharePointProductionDataService.prototype;
    const guarded = OptionEGuardedProductionDataService.prototype;
    expect(guarded.getPersonByEmail).toBe(parent.getPersonByEmail);
    expect(guarded.getCoreKpiCatalogue).toBe(parent.getCoreKpiCatalogue);
    expect(guarded.getAdminPeople).toBe(parent.getAdminPeople);
    expect(guarded.saveQuarterReviewItem).toBe(parent.saveQuarterReviewItem);
    expect(guarded.submitQuarterReview).toBe(parent.submitQuarterReview);
  });
});
