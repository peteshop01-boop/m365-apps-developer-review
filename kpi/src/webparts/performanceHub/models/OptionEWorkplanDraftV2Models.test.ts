import { OptionEDraftValidationError, validateOptionEDraftAggregate, type IOptionEWorkplanDraftAggregate } from './OptionEWorkplanDraftModels';
import {
  OPTION_E_DRAFT_V2_SCHEMA_VERSION, OPTION_E_DRAFT_V2_WIRE_VERSION, OPTION_E_DRAFT_V2_MAX_UTF8_BYTES,
  validateOptionEDraftV2Aggregate, assertOptionEDraftV2Writable, type IOptionEWorkplanDraftV2Aggregate
} from './OptionEWorkplanDraftV2Models';

// Synthetic V1 fixture retained from the frozen V4 body regression.
const v1Fixture = (): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1',
  core: {
    weightingMode: 'Equal',
    entries: [{
      coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1',
      role: 'Owner', contributionMethod: 'AdditiveDirect', weightPercent: 100,
      annual: { value: 10, success: 'Annual' }, q1: { value: 1 }, q2: { value: 2 },
      q3: { value: 3 }, q4: { value: 4 }
    }]
  },
  impact: [{
    impactId: 'IMPACT-1', wording: 'Improve service', measure: 'Cases', unit: 'count',
    annual: 10, q1: 1, q2: 2, q3: 3, q4: 4, success: 'Delivered'
  }],
  behaviours: {
    frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: Array.from({ length: 5 }, (_, index) => {
      const valueId = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
      return {
        valueId,
        descriptorKey: `KCCC-BEHAVIOUR|v02|IC_OFFICER|${valueId}`,
        guidancePromptKeys: Array.from({ length: 5 }, (__, promptIndex) => `${valueId}|L1|${promptIndex + 1}`),
        selectedPromptKeys: [`${valueId}|L1|1`], commitment: `Commitment ${index + 1}`,
        periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' }
      };
    }),
    governedExtension: {
      schemaVersion: 'kcf.option-e.behaviours/v02',
      authority: { catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS',
        catalogueVersion: 'KCF-BHV-PD03-2026.09-v2', catalogueRevision: 7,
        catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
        approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' },
      roleLevelCode: 'L1',
      headlines: Array.from({ length: 5 }, (_, index) => {
        const behaviourKey = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
        return { behaviourKey, headlineTitle: `Headline ${index + 1}`, selections: [{
          selectionKey: index === 0 ? `${behaviourKey}-L1-01` : `${behaviourKey}-OWN-ABCDEF`,
          source: index === 0 ? 'Catalogue' as const : 'Own' as const, behaviourKey,
          headlineTitle: `Headline ${index + 1}`, focusKey: `${behaviourKey}-FOCUS-01`, focusTitle: `Focus ${index + 1}`,
          roleLevelCode: 'L1' as const,
          ...(index === 0 ? { targetKey: `${behaviourKey}-L1-01` } : {}),
          selectedWording: index === 0 ? 'Approved target 1' : `Commitment ${index + 1}`,
          catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'KCF-BHV-PD03-2026.09-v2',
          catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
          myCommitment: `Commitment ${index + 1}`, howWillWeKnow: `Evidence ${index + 1}`
        }] };
      }),
      immutableSelectionSnapshots: true, legacyTargetRatingWeightFieldsWritten: false,
      deliveryArithmeticAffected: false
    }
  }
});

const fixture = (): IOptionEWorkplanDraftV2Aggregate => {
  const legacy = v1Fixture();
  return { ...legacy, schemaVersion: OPTION_E_DRAFT_V2_SCHEMA_VERSION,
    impact: legacy.impact.map(entry => ({ ...entry, classificationSelection: {
      businessContributionAreaKey: 'BCA-01',
      taxonomyPin: { taxonomyId: 'KCF-IMPACT-TAXONOMY', version: 'PD02-V1', etag: '"taxonomy-v1"', contentSha256: 'b'.repeat(64) }
    } })) };
};

describe('DraftV2 closed employee model', () => {
  test('exports separate constants and retains the exact four roots and unchanged V1 members', () => {
    expect(OPTION_E_DRAFT_V2_SCHEMA_VERSION).toBe('kcf.workplan-draft/v2');
    expect(OPTION_E_DRAFT_V2_WIRE_VERSION).toBe('canonical-draft/v2');
    expect(OPTION_E_DRAFT_V2_MAX_UTF8_BYTES).toBe(56000);
    const draft = fixture(), legacy = v1Fixture();
    validateOptionEDraftV2Aggregate(draft);
    expect(Object.keys(draft).sort()).toEqual(['behaviours', 'core', 'impact', 'schemaVersion']);
    expect(draft.core).toEqual(legacy.core);
    expect(draft.behaviours).toEqual(legacy.behaviours);
    const { classificationSelection, ...impact } = draft.impact[0];
    expect(classificationSelection.businessContributionAreaKey).toBe('BCA-01');
    expect(impact).toEqual(legacy.impact[0]);
    expect(() => validateOptionEDraftAggregate(draft)).toThrow(OptionEDraftValidationError);
    expect(() => validateOptionEDraftV2Aggregate(legacy)).toThrow(OptionEDraftValidationError);
  });
  test('accepts empty Impact and preserves governed Behaviour writability', () => {
    const draft = fixture(); draft.impact = [];
    expect(() => assertOptionEDraftV2Writable(draft)).not.toThrow();
    delete draft.behaviours.governedExtension;
    expect(() => validateOptionEDraftV2Aggregate(draft)).not.toThrow();
    expect(() => assertOptionEDraftV2Writable(draft)).toThrow(OptionEDraftValidationError);
  });
  test('retains keys verbatim including syntactically valid unknown selections', () => {
    const draft = fixture(), selection = draft.impact[0].classificationSelection;
    selection.businessContributionAreaKey = ' Unknown e\u0301 ';
    selection.strategicPillarKey = ' Future-PILLAR ';
    const before = JSON.stringify(draft);
    validateOptionEDraftV2Aggregate(draft);
    expect(JSON.stringify(draft)).toBe(before);
  });
  test.each(['schemaVersion', 'core', 'impact', 'behaviours'])('rejects missing root %s', key => {
    const draft = fixture() as unknown as Record<string, unknown>; delete draft[key];
    expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
  });
  test.each(['impactId', 'wording', 'measure', 'unit', 'success', 'classificationSelection'])('rejects missing Impact %s', key => {
    const draft = fixture(); delete (draft.impact[0] as unknown as Record<string, unknown>)[key];
    expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
  });
  test.each(['businessContributionAreaKey', 'taxonomyPin'])('rejects missing selection %s', key => {
    const draft = fixture(); delete (draft.impact[0].classificationSelection as unknown as Record<string, unknown>)[key];
    expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
  });
  test.each(['taxonomyId', 'version', 'etag', 'contentSha256'])('rejects missing or crossed pin %s', key => {
    const draft = fixture(), second = JSON.parse(JSON.stringify(draft.impact[0])) as typeof draft.impact[0];
    second.impactId = 'IMPACT-2'; draft.impact.push(second);
    const pin = second.classificationSelection.taxonomyPin as unknown as Record<string, unknown>;
    pin[key] = key === 'etag' ? '"other"' : key === 'contentSha256' ? 'C'.repeat(64) : 'other';
    expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
    delete pin[key];
    expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
  });
  test('accepts multiple entries only with the same complete pin', () => {
    const draft = fixture(); draft.impact.push({ ...draft.impact[0], impactId: 'IMPACT-2' });
    expect(() => validateOptionEDraftV2Aggregate(draft)).not.toThrow();
  });
  test.each(['', ' ', 0, null, undefined])('rejects invalid selected key %p', value => {
    for (const key of ['businessContributionAreaKey', 'strategicPillarKey']) {
      const draft = fixture(); (draft.impact[0].classificationSelection as unknown as Record<string, unknown>)[key] = value;
      expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
    }
    for (const key of ['taxonomyId', 'version']) {
      const draft = fixture(); (draft.impact[0].classificationSelection.taxonomyPin as unknown as Record<string, unknown>)[key] = value;
      expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
    }
  });
  test.each(['*', '"*"', 'W/"1"', '', '1', '"x\n"'])('rejects invalid strong ETag %p', etag => {
    const draft = fixture(); draft.impact[0].classificationSelection.taxonomyPin.etag = etag;
    expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
  });
  test.each(['a'.repeat(63), 'a'.repeat(65), 'z'.repeat(64), ' a'.repeat(32)])('rejects invalid hash %p', hash => {
    const draft = fixture(); draft.impact[0].classificationSelection.taxonomyPin.contentSha256 = hash;
    expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
  });
  test.each(['label', 'weightPercent', 'deliveryWeights', 'manager', 'managerApproved', 'approved', 'published', 'nativeListId', 'nativeItemId', 'source', 'approvalReference'])('rejects untrusted extra %s at each new boundary', key => {
    for (let boundary = 0; boundary < 4; boundary++) {
      const draft = fixture();
      const targets = [draft, draft.impact[0], draft.impact[0].classificationSelection, draft.impact[0].classificationSelection.taxonomyPin];
      (targets[boundary] as unknown as Record<string, unknown>)[key] = true;
      expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
    }
  });
  test('delegates unchanged Core, Impact and Behaviour semantic validation', () => {
    const core = fixture(); core.core.entries[0].weightPercent = 99;
    const impact = fixture(); impact.impact.push({ ...impact.impact[0] });
    const behaviour = fixture(); behaviour.behaviours.entries[0].selectedPromptKeys = ['unknown'];
    for (const draft of [core, impact, behaviour]) expect(() => validateOptionEDraftV2Aggregate(draft)).toThrow(OptionEDraftValidationError);
  });
});
