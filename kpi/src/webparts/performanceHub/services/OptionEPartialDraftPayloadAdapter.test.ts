import { createHash } from 'node:crypto';
import { OptionEDraftValidationError, canonicaliseOptionEDraft } from '../models/OptionEWorkplanDraftModels';
import type { IOptionEWorkplanDraftV2Aggregate } from '../models/OptionEWorkplanDraftV2Models';
import { canonicaliseOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { prepareClosedPartialDraft, reopenClosedPartialDraft, type ClosedPartialDraft } from './OptionEPartialDraftPayloadAdapter';

// GOLDENS: independently specified before implementing this adapter.
const goldens: { schemaVersion: ClosedPartialDraft['schemaVersion']; payloadJson: string; payloadSha256: string }[] = [
  {
    "schemaVersion": "kcf.workplan-draft/v1",
    "payloadJson": "{\"behaviours\":{\"entries\":[],\"frameworkVersion\":\"KCCC-BEHAVIOUR|v02\",\"roleTier\":\"IC_OFFICER\"},\"core\":{\"entries\":[{\"annual\":{\"success\":\"\",\"value\":0},\"contributionMethod\":\"\",\"coreId\":\"CORE-2\",\"kpiId\":\"KPI-2\",\"kpiVersionKey\":\"\",\"q1\":{\"success\":\"Quarter one\",\"value\":\"0\"},\"q2\":{},\"q3\":{\"value\":0.5},\"q4\":{\"value\":\"\"},\"role\":\"\",\"targetVersionKey\":\"TARGET-2|v1\",\"weightPercent\":12.5}],\"weightingMode\":\"Custom\"},\"impact\":[{\"annual\":0,\"impactId\":\"IMPACT-1\",\"measure\":\"\",\"q1\":\"0\",\"q2\":\"\",\"q3\":0.5,\"success\":\"\",\"unit\":\"\",\"wording\":\"\"}],\"schemaVersion\":\"kcf.workplan-draft/v1\"}",
    "payloadSha256": "6B44C33817A8A21BBF7ADDEE3A69E5DFEFDB4238067E5FB0104BD19CD2F59C56"
  },
  {
    "schemaVersion": "kcf.workplan-draft/v2",
    "payloadJson": "{\"behaviours\":{\"entries\":[],\"frameworkVersion\":\"KCCC-BEHAVIOUR|v02\",\"roleTier\":\"IC_OFFICER\"},\"core\":{\"entries\":[{\"annual\":{\"success\":\"\",\"value\":0},\"contributionMethod\":\"\",\"coreId\":\"CORE-2\",\"kpiId\":\"KPI-2\",\"kpiVersionKey\":\"\",\"q1\":{\"success\":\"Quarter one\",\"value\":\"0\"},\"q2\":{},\"q3\":{\"value\":0.5},\"q4\":{\"value\":\"\"},\"role\":\"\",\"targetVersionKey\":\"TARGET-2|v1\",\"weightPercent\":12.5}],\"weightingMode\":\"Custom\"},\"impact\":[{\"annual\":0,\"classificationSelection\":{\"businessContributionAreaKey\":\"BCA-01\",\"taxonomyPin\":{\"contentSha256\":\"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\",\"etag\":\"\\\"taxonomy-v1\\\"\",\"taxonomyId\":\"KCF-IMPACT-TAXONOMY\",\"version\":\"PD02-V1\"}},\"impactId\":\"IMPACT-1\",\"measure\":\"\",\"q1\":\"0\",\"q2\":\"\",\"q3\":0.5,\"success\":\"\",\"unit\":\"\",\"wording\":\"\"}],\"schemaVersion\":\"kcf.workplan-draft/v2\"}",
    "payloadSha256": "98BFD1500DC02AC7CE6CDF4D6C0E26BE95DD684EAFD408F24CB89E0DB669166E"
  }
];
const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
const hasher = { sha256Hex: async (value: string): Promise<string> => sha256(value).toLowerCase() };
const fixture = (version: ClosedPartialDraft['schemaVersion']): ClosedPartialDraft =>
  JSON.parse(goldens.find(golden => golden.schemaVersion === version)!.payloadJson) as ClosedPartialDraft;
const versions: ClosedPartialDraft['schemaVersion'][] = ['kcf.workplan-draft/v1', 'kcf.workplan-draft/v2'];

describe('version-paired partial Draft payload preparation and reopen', () => {
  test.each(goldens)('preserves exact $schemaVersion bytes, hash and admitted unfinished values', async golden => {
    const input = fixture(golden.schemaVersion);
    const before = JSON.stringify(input);
    const hashing = jest.fn(hasher.sha256Hex);
    const prepared = await prepareClosedPartialDraft(input, { sha256Hex: hashing });
    expect(prepared).toEqual({ ...golden, aggregate: input });
    expect(hashing).toHaveBeenCalledTimes(1);
    expect(hashing).toHaveBeenCalledWith(golden.payloadJson);
    expect(sha256(golden.payloadJson)).toBe(golden.payloadSha256);
    expect(JSON.stringify(input)).toBe(before);
    expect(prepared.aggregate).not.toBe(input);
    expect(prepared.aggregate.core.entries[0]).not.toBe(input.core.entries[0]);
    const reopened = await reopenClosedPartialDraft(golden.schemaVersion, golden.payloadJson, golden.payloadSha256, hasher);
    expect(reopened).toEqual(prepared);
    expect(reopened.aggregate).not.toBe(prepared.aggregate);
    expect(reopened.aggregate.core.entries[0].q2).toEqual({});
    expect(reopened.aggregate.core.entries[0].annual.value).toBe(0);
    expect(reopened.aggregate.core.entries[0].q1.value).toBe('0');
    expect(reopened.aggregate.impact[0].q2).toBe('');
    expect(reopened.aggregate.impact[0].q4).toBeUndefined();
    expect(() => golden.schemaVersion === 'kcf.workplan-draft/v1'
      ? canonicaliseOptionEDraft(input) : canonicaliseOptionEDraftV2(input)).toThrow(OptionEDraftValidationError);
  });

  test.each(versions)('retains %s stable order, weights and governed Behaviour snapshots', async version => {
    const input = fixture(version);
    input.core.entries.push({ ...input.core.entries[0], coreId: 'CORE-1', kpiId: 'KPI-1', weightPercent: 0 });
    input.behaviours.entries = [{ valueId: 'BHV-01', descriptorKey: 'historical-descriptor',
      guidancePromptKeys: ['BHV-01|L1|2', 'BHV-01|L1|1'], selectedPromptKeys: ['BHV-01|L1|1'],
      commitment: '', periodCommitments: { Q1: '', Q2: 'Continue', Q3: '', Q4: '' } }];
    input.behaviours.governedExtension = {
      schemaVersion: 'kcf.option-e.behaviours/v02', roleLevelCode: 'L1',
      authority: { catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'historic-v2',
        catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
        approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' },
      headlines: ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'].map((key, index) => {
        const behaviourKey = key as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
        return { behaviourKey, headlineTitle: `Headline ${index + 1}`, selections: index ? [] : [{
          selectionKey: 'BHV-01-L1-01', source: 'Catalogue' as const, behaviourKey,
          headlineTitle: 'Headline 1', focusKey: 'BHV-01-FOCUS-01', focusTitle: 'Historic focus',
          roleLevelCode: 'L1' as const, targetKey: 'BHV-01-L1-01', selectedWording: 'Historic target',
          catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'historic-v2', catalogueRevision: 7,
          catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64), myCommitment: '', howWillWeKnow: ''
        }] };
      }),
      immutableSelectionSnapshots: true, legacyTargetRatingWeightFieldsWritten: false, deliveryArithmeticAffected: false
    };
    const prepared = await prepareClosedPartialDraft(input, hasher);
    const reopened = await reopenClosedPartialDraft(version, prepared.payloadJson, prepared.payloadSha256, hasher);
    expect(reopened.aggregate).toEqual(input);
    expect(reopened.aggregate.core.entries.map(entry => entry.coreId)).toEqual(['CORE-2', 'CORE-1']);
    expect(reopened.aggregate.core.entries.map(entry => entry.weightPercent)).toEqual([12.5, 0]);
    expect(reopened.aggregate.behaviours.governedExtension).toEqual(input.behaviours.governedExtension);
  });

  test('preserves the optional V2 pillar and complete pinned taxonomy without a V1 projection', async () => {
    const input = fixture('kcf.workplan-draft/v2') as IOptionEWorkplanDraftV2Aggregate;
    input.impact[0].classificationSelection.strategicPillarKey = 'PILLAR-02';
    const prepared = await prepareClosedPartialDraft(input, hasher);
    expect(prepared.schemaVersion).toBe('kcf.workplan-draft/v2');
    if (prepared.schemaVersion !== 'kcf.workplan-draft/v2') throw new Error('Wrong branch');
    expect(prepared.aggregate.impact[0].classificationSelection).toEqual(input.impact[0].classificationSelection);
    expect(prepared.payloadJson).toContain('"strategicPillarKey":"PILLAR-02"');
    expect(prepared.payloadSha256).toBe(sha256(prepared.payloadJson));
  });

  test.each(versions)('captures %s bytes and version before asynchronous hashing', async version => {
    const input = fixture(version);
    let resolveHash!: (value: string) => void;
    const hashing = jest.fn(() => new Promise<string>(resolve => { resolveHash = resolve; }));
    const pending = prepareClosedPartialDraft(input, { sha256Hex: hashing });
    // Keep a failing preparation observable by Jest rather than an unhandled rejection.
    pending.catch(() => undefined);
    expect(hashing).toHaveBeenCalledTimes(1);
    input.core.entries[0].annual.value = 999;
    input.schemaVersion = version === 'kcf.workplan-draft/v1' ? 'kcf.workplan-draft/v2' : 'kcf.workplan-draft/v1';
    const golden = goldens.find(value => value.schemaVersion === version)!;
    resolveHash(golden.payloadSha256);
    const prepared = await pending;
    expect(prepared).toEqual({ ...golden, aggregate: fixture(version) });
    prepared.aggregate.core.entries[0].annual.value = 123;
    expect(input.core.entries[0].annual.value).toBe(999);
    expect(prepared.payloadJson).toBe(golden.payloadJson);
  });

  test.each(goldens)('rejects $schemaVersion hash mismatch without returning a receipt', async golden => {
    await expect(reopenClosedPartialDraft(golden.schemaVersion, golden.payloadJson, '0'.repeat(64), hasher))
      .rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
  });
  test.each(goldens)('rejects a $schemaVersion body under the other version before hashing', async golden => {
    const hashing = jest.fn(hasher.sha256Hex);
    const other = golden.schemaVersion === 'kcf.workplan-draft/v1' ? 'kcf.workplan-draft/v2' : 'kcf.workplan-draft/v1';
    await expect(reopenClosedPartialDraft(other, golden.payloadJson, golden.payloadSha256, { sha256Hex: hashing }))
      .rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
    expect(hashing).not.toHaveBeenCalled();
  });
  test('holds unknown versions on both entry points', async () => {
    const hashing = jest.fn(hasher.sha256Hex);
    await expect(prepareClosedPartialDraft({ ...fixture(versions[0]), schemaVersion: 'kcf.workplan-draft/v9' } as unknown as ClosedPartialDraft,
      { sha256Hex: hashing })).rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
    await expect(reopenClosedPartialDraft('kcf.workplan-draft/v9' as ClosedPartialDraft['schemaVersion'],
      goldens[0].payloadJson, goldens[0].payloadSha256, { sha256Hex: hashing })).rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
    expect(hashing).not.toHaveBeenCalled();
  });
  test.each(versions)('rejects undeclared %s employee fields before hashing', async version => {
    const hashing = jest.fn(hasher.sha256Hex);
    await expect(prepareClosedPartialDraft({ ...fixture(version), overallDeliveryWeight: 70 } as unknown as ClosedPartialDraft,
      { sha256Hex: hashing })).rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
    expect(hashing).not.toHaveBeenCalled();
  });
  test.each(versions)('keeps the %s UTF8 payload limit on prepare and reopen', async version => {
    const input = fixture(version);
    input.impact[0].success = '£'.repeat(28000);
    await expect(prepareClosedPartialDraft(input, hasher)).rejects.toMatchObject({ code: 'DraftPayloadTooLarge' });
    const tooLarge = goldens.find(value => value.schemaVersion === version)!.payloadJson.replace('"wording":""',
      '"wording":"' + '£'.repeat(28000) + '"');
    await expect(reopenClosedPartialDraft(version, tooLarge, sha256(tooLarge), hasher))
      .rejects.toMatchObject({ code: 'DraftPayloadTooLarge' });
  });
  test('rejects unclassified V2 Impact even on the partial path', async () => {
    const input = fixture(versions[1]) as IOptionEWorkplanDraftV2Aggregate;
    input.impact[0].classificationSelection.businessContributionAreaKey = '';
    await expect(prepareClosedPartialDraft(input, hasher)).rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
  });
  test('rejects noncanonical or malformed ordinary JSON before hashing', async () => {
    const hashing = jest.fn(hasher.sha256Hex);
    for (const body of [goldens[0].payloadJson + ' ', '{invalid']) {
      await expect(reopenClosedPartialDraft(versions[0], body, goldens[0].payloadSha256, { sha256Hex: hashing }))
        .rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
    }
    expect(hashing).not.toHaveBeenCalled();
  });
  test('rejects malformed supplied or computed hashes and propagates unavailable hashing', async () => {
    await expect(reopenClosedPartialDraft(versions[0], goldens[0].payloadJson, 'bad', hasher))
      .rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
    await expect(prepareClosedPartialDraft(fixture(versions[0]), { sha256Hex: async () => 'bad' }))
      .rejects.toMatchObject({ code: 'DraftPayloadInvalid' });
    const failure = new Error('Hash unavailable');
    await expect(prepareClosedPartialDraft(fixture(versions[0]), { sha256Hex: async () => { throw failure; } }))
      .rejects.toBe(failure);
  });
});
