import type { IPersonalWorkplanItem } from '../models/ProductionModels';
import {
  prepareImpactSectionSave,
  selectGovernedImpactClassification,
  validateImpactSection,
  type IImpactClassificationConfiguration
} from './PersonalWorkplanPolicy';

const personal = (patch: Partial<IPersonalWorkplanItem> = {}): IPersonalWorkplanItem => ({
  id: -1,
  etag: 'LOCAL',
  workplanItemKey: 'impact-1',
  naturalKey: 'workplan|LocalPersonal|impact-1',
  workplanKey: 'workplan',
  personKey: 'person-001',
  performanceYear: 2026,
  wording: 'Deliver a controlled Impact objective',
  description: 'Synthetic intended outcome',
  measure: 'Completed deliverables',
  measureType: 'Count',
  scoringDirection: 'HigherIsBetter',
  yearEndTargetValue: 8,
  q1TargetValue: 2,
  q2TargetValue: 4,
  q3TargetValue: 6,
  q4TargetValue: 8,
  unitLabel: 'deliverables',
  personalItemWeight: 100,
  displayOrder: 1,
  activeInWorkplan: true,
  ...patch
});

const fiveImpact = (): IPersonalWorkplanItem[] => Array.from({ length: 5 }, (_unused, index) => personal({
  id: index + 1,
  workplanItemKey: `impact-${index + 1}`,
  naturalKey: `workplan|LocalPersonal|impact-${index + 1}`,
  personalItemWeight: 20,
  displayOrder: index + 1
}));

describe('SEC-R034-F03/F04 Impact boundary repair', () => {
  it('rejects the sixth-active Proxy before validation/save and never executes its get trap', () => {
    let activeReads = 0;
    const sixthTarget = personal({
      id: 6,
      workplanItemKey: 'impact-6',
      naturalKey: 'workplan|LocalPersonal|impact-6',
      personalItemWeight: 0,
      displayOrder: 6
    });
    const sixthProxy = new Proxy(sixthTarget, {
      get: (target, property, receiver): unknown => {
        if (property === 'activeInWorkplan') {
          activeReads += 1;
          return activeReads === 1 ? false : true;
        }
        return Reflect.get(target, property, receiver) as unknown;
      }
    });
    expect(() => prepareImpactSectionSave(fiveImpact().concat([sixthProxy]))).toThrow(/maximum of 5/);
    expect(activeReads).toBe(0);
  });

  it('builds the save result only from the one immutable item/classification snapshot', () => {
    const configuration: IImpactClassificationConfiguration = {
      strategicPillars: [{ key: 'pillar-1', label: 'Pillar one', source: 'GOVERNED', sourceReference: 'pillar-v1' }],
      businessContributionAreas: [{ key: 'area-1', label: 'Area one', source: 'GOVERNED', sourceReference: 'area-v1' }]
    };
    const item = personal({
      impactClassification: {
        strategicPillar: configuration.strategicPillars[0],
        businessContributionArea: configuration.businessContributionAreas[0]
      }
    });
    const saved = prepareImpactSectionSave([item], configuration);
    item.personalItemWeight = 1;
    item.activeInWorkplan = false;
    (item.impactClassification as { businessContributionArea?: { label: string } })
      .businessContributionArea = { label: 'Forged after validation' };
    expect(saved[0]).toEqual(expect.objectContaining({ personalItemWeight: 100, activeInWorkplan: true }));
    expect(saved[0].impactClassification?.businessContributionArea).toEqual(configuration.businessContributionAreas[0]);
    expect(Object.isFrozen(saved[0])).toBe(true);
    expect(Object.isFrozen(saved[0].impactClassification)).toBe(true);
    expect(Object.isFrozen(saved[0].impactClassification?.businessContributionArea)).toBe(true);
  });

  it('returns an immutable outer save payload that cannot be added to, removed from, reordered or replaced', () => {
    const saved = prepareImpactSectionSave(fiveImpact());
    const before = JSON.stringify(saved);
    const replacement = personal({
      id: 99,
      workplanItemKey: 'impact-replacement',
      naturalKey: 'workplan|LocalPersonal|impact-replacement',
      personalItemWeight: 0,
      displayOrder: 99
    });

    expect(Object.isFrozen(saved)).toBe(true);
    expect(Reflect.set(saved, saved.length, replacement)).toBe(false);
    expect(Reflect.deleteProperty(saved, '4')).toBe(false);
    expect(() => saved.reverse()).toThrow(TypeError);
    expect(Reflect.set(saved, 0, replacement)).toBe(false);
    expect(Reflect.set(saved, 'length', 0)).toBe(false);
    expect(Reflect.defineProperty(saved, '0', { value: replacement })).toBe(false);
    expect(JSON.stringify(saved)).toBe(before);
    expect(saved.map(item => item.workplanItemKey)).toEqual([
      'impact-1', 'impact-2', 'impact-3', 'impact-4', 'impact-5'
    ]);
  });

  it('rejects a governed classification-key accessor without executing its getter', () => {
    let keyReads = 0;
    const option = {
      label: 'Forged area',
      source: 'ATTACKER',
      sourceReference: 'forged-source'
    } as { key?: string; label: string; source: string; sourceReference: string };
    Object.defineProperty(option, 'key', {
      enumerable: true,
      configurable: true,
      get: () => { keyReads += 1; return keyReads === 1 ? 'area-governed' : 'area-invented'; }
    });
    expect(() => selectGovernedImpactClassification(undefined, 'businessContributionArea', 'area-governed', {
      strategicPillars: [],
      businessContributionAreas: [option as { key: string; label: string; source: string; sourceReference: string }]
    })).toThrow(/accessor/);
    expect(keyReads).toBe(0);
  });

  it('rejects forged classification provenance and hostile nested descriptors', () => {
    const configuration: IImpactClassificationConfiguration = {
      strategicPillars: [],
      businessContributionAreas: [{
        key: 'area-governed', label: 'Governed area', source: 'GOVERNED', sourceReference: 'area-v1'
      }]
    };
    expect(validateImpactSection([personal({ impactClassification: {
      businessContributionArea: {
        key: 'area-governed', label: 'Forged area', source: 'ATTACKER', sourceReference: 'forged-source'
      }
    } })], configuration).valid).toBe(false);

    let sourceReads = 0;
    const classification = ({
      key: 'area-governed', label: 'Governed area', sourceReference: 'area-v1'
    } as { key: string; label: string; source?: string; sourceReference: string });
    Object.defineProperty(classification, 'source', {
      enumerable: true,
      get: () => { sourceReads += 1; return 'GOVERNED'; }
    });
    expect(() => prepareImpactSectionSave([personal({ impactClassification: {
      businessContributionArea: classification as { key: string; label: string; source: string; sourceReference: string }
    } })], configuration)).toThrow(/accessor/);
    expect(sourceReads).toBe(0);
  });
});
