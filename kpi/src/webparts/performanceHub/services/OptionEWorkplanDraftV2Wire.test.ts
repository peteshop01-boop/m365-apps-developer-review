import { TextDecoder, TextEncoder } from 'node:util';
import { createHash } from 'node:crypto';
import { canonicaliseOptionEDraft, parseCanonicalOptionEDraft, OptionEDraftValidationError, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import { OPTION_E_DRAFT_V2_SCHEMA_VERSION, type IOptionEWorkplanDraftV2Aggregate } from '../models/OptionEWorkplanDraftV2Models';
import { EXACT_BODY_V4 } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { V4_DRAFT_SCHEMA, V4_WIRE_SCHEMA, v4Canonical, parseV4Draft, parseV4Request, BufferByteLength } from './OptionEWorkplanSubmitExactBodyV4Wire';
import {
  DRAFT_V2_SCHEMA, canonicaliseOptionEDraftV2, parseCanonicalOptionEDraftV2, decodeOptionEDraftV2Utf8,
  canonicaliseOptionEPartialDraftV2, parseCanonicalOptionEPartialDraftV2, decodeOptionEPartialDraftV2Utf8
} from './OptionEWorkplanDraftV2Wire';
import { OptionEWorkplanSubmitExactBodyV4, type V4JournalStore } from './OptionEWorkplanSubmitExactBodyV4';
Object.assign(globalThis, { TextDecoder, TextEncoder });

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
      businessContributionAreaKey: 'BCA-01', strategicPillarKey: 'pillar-synthetic',
      taxonomyPin: { taxonomyId: 'KCF-IMPACT-TAXONOMY', version: 'PD02-V1', etag: '"taxonomy-v1"', contentSha256: 'B'.repeat(64) }
    } })) };
};
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('DraftV2 exact canonical wire', () => {
  test('saves unfinished classified Impact without changing Core, Behaviours or taxonomy identity', () => {
    const draft = fixture();
    draft.impact[0].wording = ''; draft.impact[0].measure = '';
    delete draft.impact[0].annual;
    const before = JSON.stringify(draft);
    const body = canonicaliseOptionEPartialDraftV2(draft);
    const reopened = parseCanonicalOptionEPartialDraftV2(body);
    expect(reopened).toEqual(draft);
    expect(reopened.core).toEqual(draft.core);
    expect(reopened.behaviours).toEqual(draft.behaviours);
    expect(reopened.impact[0].classificationSelection).toEqual(draft.impact[0].classificationSelection);
    expect(decodeOptionEPartialDraftV2Utf8(new TextEncoder().encode(body))).toBe(body);
    expect(JSON.stringify(draft)).toBe(before);
    expect(() => canonicaliseOptionEDraftV2(draft)).toThrow(OptionEDraftValidationError);
    expect(() => parseCanonicalOptionEDraftV2(body)).toThrow(OptionEDraftValidationError);
  });

  test('saves unfinished Core allocation and Behaviour focus while Submit stays strict', () => {
    const draft = fixture();
    draft.core.entries[0].role = '' as typeof draft.core.entries[0]['role'];
    draft.core.entries[0].contributionMethod = '' as typeof draft.core.entries[0]['contributionMethod'];
    draft.core.entries[0].weightPercent = 0;
    draft.core.entries[0].kpiVersionKey = '';
    draft.behaviours.entries[0].guidancePromptKeys = [];
    draft.behaviours.entries[0].selectedPromptKeys = [];
    draft.behaviours.governedExtension!.headlines[0].selections = [];
    expect(parseCanonicalOptionEPartialDraftV2(canonicaliseOptionEPartialDraftV2(draft))).toEqual(draft);
    expect(() => canonicaliseOptionEDraftV2(draft)).toThrow(OptionEDraftValidationError);
  });

  test('rejects invalid stable identity and crossed taxonomy pins on the partial Save path', () => {
    const invalidId = fixture(); invalidId.impact[0].impactId = '';
    expect(() => canonicaliseOptionEPartialDraftV2(invalidId)).toThrow(OptionEDraftValidationError);
    const crossed = fixture();
    crossed.impact.push({ ...crossed.impact[0], impactId: 'IMPACT-2', classificationSelection: {
      ...crossed.impact[0].classificationSelection, taxonomyPin: {
        ...crossed.impact[0].classificationSelection.taxonomyPin, etag: '"other"'
      }
    } });
    expect(() => canonicaliseOptionEPartialDraftV2(crossed)).toThrow(OptionEDraftValidationError);
  });

  test('partial Save rejects unknown fields, noncanonical bytes and V1 relabelling', () => {
    const draft = fixture();
    expect(() => canonicaliseOptionEPartialDraftV2({ ...draft, unexpected: true })).toThrow(OptionEDraftValidationError);
    const body = canonicaliseOptionEPartialDraftV2(draft);
    expect(() => parseCanonicalOptionEPartialDraftV2(body + ' ')).toThrow(OptionEDraftValidationError);
    expect(() => parseCanonicalOptionEPartialDraftV2(body.replace('kcf.workplan-draft/v2', 'kcf.workplan-draft/v1')))
      .toThrow(OptionEDraftValidationError);
    expect(() => canonicaliseOptionEPartialDraftV2(v1Fixture())).toThrow(OptionEDraftValidationError);
  });

  test('partial Save retains the existing UTF8 size and Unicode safety limits', () => {
    const draft = fixture(); draft.impact[0].success = '\ud800';
    expect(() => canonicaliseOptionEPartialDraftV2(draft)).toThrow(OptionEDraftValidationError);
    draft.impact[0].success = 'a'.repeat(56000);
    expect(() => canonicaliseOptionEPartialDraftV2(draft)).toThrow(OptionEDraftValidationError);
  });

  test('roundtrips all existing fields, number/string distinctions, and does not mutate inputs', () => {
    const draft = fixture();
    draft.core.entries[0].annual.value = '10'; draft.core.entries[0].q2.value = 2.5;
    draft.impact[0].annual = '10'; draft.impact[0].q1 = ''; draft.impact[0].q2 = 2.5;
    const before = JSON.stringify(draft), body = canonicaliseOptionEDraftV2(draft);
    expect(parseCanonicalOptionEDraftV2(body)).toEqual(draft);
    expect(decodeOptionEDraftV2Utf8(new TextEncoder().encode(body))).toBe(body);
    expect(JSON.stringify(draft)).toBe(before);
    expect(parseCanonicalOptionEDraftV2(body).schemaVersion).toBe(OPTION_E_DRAFT_V2_SCHEMA_VERSION);
  });
  test.each(Array.from({ length: 13 }, (_, i) => `BCA-${String(i + 1).padStart(2, '0')}`))('roundtrips approved example key %s without claiming approval', key => {
    const draft = fixture(); draft.impact[0].classificationSelection.businessContributionAreaKey = key;
    expect(parseCanonicalOptionEDraftV2(canonicaliseOptionEDraftV2(draft))).toEqual(draft);
  });
  test('retains unknown keys and supports omitted Pillar and annual/quarter values', () => {
    const draft = fixture(); draft.impact[0].classificationSelection.businessContributionAreaKey = ' UNKNOWN e\u0301 ';
    delete draft.impact[0].classificationSelection.strategicPillarKey;
    for (const key of ['annual', 'q1', 'q2', 'q3', 'q4'] as const) delete draft.impact[0][key];
    expect(parseCanonicalOptionEDraftV2(canonicaliseOptionEDraftV2(draft))).toEqual(draft);
  });
  test.each(['e\u0301', '\u00e9', '😀', '', 'Case', 'case', ' a ', '\n', '\u0000'])('preserves Unicode scalar %p', value => {
    const draft = fixture(); draft.impact[0].success = value;
    const body = canonicaliseOptionEDraftV2(draft);
    expect(decodeOptionEDraftV2Utf8(new TextEncoder().encode(body))).toBe(body);
    expect(parseCanonicalOptionEDraftV2(body).impact[0].success).toBe(value);
  });
  test.each([-0, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity])('rejects unsupported numeric value %p', value => {
    const draft = fixture(); draft.impact[0].annual = value;
    expect(() => canonicaliseOptionEDraftV2(draft)).toThrow(OptionEDraftValidationError);
  });
  test.each(['\ud800', '\udfff'])('rejects malformed Unicode %p', value => {
    const draft = fixture(); draft.impact[0].success = value;
    expect(() => canonicaliseOptionEDraftV2(draft)).toThrow(OptionEDraftValidationError);
    expect(() => parseCanonicalOptionEDraftV2(JSON.stringify(draft))).toThrow(OptionEDraftValidationError);
  });
  test('rejects explicit undefined rather than dropping optional content', () => {
    const draft = fixture(); draft.impact[0].q1 = undefined;
    expect(() => canonicaliseOptionEDraftV2(draft)).toThrow(OptionEDraftValidationError);
    delete draft.impact[0].q1; draft.core.entries[0].q1.success = undefined;
    expect(() => canonicaliseOptionEDraftV2(draft)).toThrow(OptionEDraftValidationError);
  });
  test('rejects duplicates at root, nested entry, selection and pin depths', () => {
    const body = canonicaliseOptionEDraftV2(fixture());
    for (const [key, value] of [['schemaVersion', '"kcf.workplan-draft/v2"'], ['impactId', '"IMPACT-1"'],
      ['businessContributionAreaKey', '"BCA-01"'], ['version', '"PD02-V1"']]) {
      const token = `"${key}":${value}`;
      const duplicate = body.replace(token, `${token},${token}`);
      expect(duplicate).not.toBe(body);
      expect(() => parseCanonicalOptionEDraftV2(duplicate)).toThrow(OptionEDraftValidationError);
    }
  });
  test('rejects noncanonical, malformed, and alternate numeric representations', () => {
    const body = canonicaliseOptionEDraftV2(fixture());
    const alternatives = ['\ufeff' + body, ' ' + body, body + '\n', JSON.stringify(fixture()), body.slice(0, -1),
      body.replace('"annual":10', '"annual":-0'), body.replace('"annual":10', '"annual":1e1'),
      body.replace('"annual":10', '"annual":10.0'), body.replace('"annual":10', '"annual":1e400'),
      body.replace('"annual":10', '"annual":9007199254740992'), body.replace('BCA-01', '\\u0042CA-01')];
    for (const text of alternatives) {
      expect(text).not.toBe(body);
      expect(() => parseCanonicalOptionEDraftV2(text)).toThrow(OptionEDraftValidationError);
    }
  });
  test.each([[0xef, 0xbb, 0xbf, 0x7b, 0x7d], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0xff]].map(bytes => [bytes]))('rejects malformed UTF8 %p', bytes => {
    expect(() => decodeOptionEDraftV2Utf8(Uint8Array.from(bytes))).toThrow(OptionEDraftValidationError);
  });
  test('rejects over-depth JSON before schema validation', () => {
    const text = '['.repeat(66) + '0' + ']'.repeat(66);
    expect(() => parseCanonicalOptionEDraftV2(text)).toThrow(OptionEDraftValidationError);
  });
  test('applies the exact 56000 UTF8 byte limit consistently', () => {
    const draft = fixture(); draft.impact[0].success = '😀é';
    const available = 56000 - BufferByteLength(canonicaliseOptionEDraftV2(draft));
    draft.impact[0].success += 'x'.repeat(available);
    const body = canonicaliseOptionEDraftV2(draft);
    expect(BufferByteLength(body)).toBe(56000);
    expect(parseCanonicalOptionEDraftV2(body)).toEqual(draft);
    expect(decodeOptionEDraftV2Utf8(new TextEncoder().encode(body))).toBe(body);
    draft.impact[0].success += 'x';
    const over = v4Canonical(draft);
    for (const operation of [() => canonicaliseOptionEDraftV2(draft), () => parseCanonicalOptionEDraftV2(over),
      () => decodeOptionEDraftV2Utf8(new TextEncoder().encode(over))]) {
      expect(operation).toThrow(expect.objectContaining({ code: 'DraftPayloadTooLarge' }));
    }
  });
  test('keeps legacy schemas and canonical fixture bytes sealed', () => {
    expect(sha256(canonicaliseOptionEDraft(v1Fixture()))).toBe('664017c244d0270b39c30f719b62e6dd6166c03155793b8b3e1d9bbb204812a3');
    expect(sha256(v4Canonical(V4_DRAFT_SCHEMA))).toBe('9f854a7d2f8ba56c05fe7858f7c44050b61580475421b726840712ed52f19b51');
    expect(sha256(v4Canonical(V4_WIRE_SCHEMA))).toBe('a6710629c9a20e17691651463570aec1d82d742e92ac5e5dc44aa77b1da42a93');
    const original = JSON.parse(JSON.stringify(V4_DRAFT_SCHEMA)) as { properties: Record<string, unknown> };
    const current = DRAFT_V2_SCHEMA as { properties: Record<string, unknown> };
    expect(current.properties.core).toEqual(original.properties.core);
    expect(current.properties.behaviours).toEqual(original.properties.behaviours);
    expect(current.properties.core).not.toBe((V4_DRAFT_SCHEMA as typeof original).properties.core);
    expect(current.properties.behaviours).not.toBe((V4_DRAFT_SCHEMA as typeof original).properties.behaviours);
    expect(parseV4Draft(canonicaliseOptionEDraft(v1Fixture()))).toEqual(v1Fixture());
  });
  test('rejects cross-version bodies and extra classification fields at legacy parser and V4 receiver boundary', () => {
    const v2 = canonicaliseOptionEDraftV2(fixture());
    const relabelledV1 = v4Canonical({ ...fixture(), schemaVersion: 'kcf.workplan-draft/v1' });
    for (const body of [v2, relabelledV1]) {
      expect(() => parseCanonicalOptionEDraft(body)).toThrow();
      expect(() => parseV4Draft(body)).toThrow();
      for (const sourceSchema of ['kcf.workplan-draft/v1', 'kcf.workplan-draft/v2']) {
        const request = { capability: EXACT_BODY_V4, action: 'Submit', command: 'fb1f6035-236e-434c-ae05-a78003badd47',
          person: 'EMP-001', year: 2027, workplan: 'WP-001',
          source: { itemId: 1, etag: '"draft-1"', version: '1.0', schema: sourceSchema, body }, referenceBody: '{}' };
        expect(() => parseV4Request(v4Canonical(request))).toThrow();
      }
    }
    expect(() => parseCanonicalOptionEDraftV2(canonicaliseOptionEDraft(v1Fixture()))).toThrow(OptionEDraftValidationError);
  });
  test.each(['kcf.workplan-draft/v1', 'kcf.workplan-draft/v2'])('actual V4 receiver rejects new fields/version %s before any operation', async schemaVersion => {
    const body = v4Canonical({ ...fixture(), schemaVersion });
    const source = { itemId: 41, etag: '"d1"', version: '1', schema: schemaVersion, body };
    const query = { capability: EXACT_BODY_V4, action: 'Submit', command: 'fb1f6035-236e-434c-ae05-a78003badd47',
      person: 'EMP-001', year: 2027, workplan: 'EMP-001|2027', source, referenceBody: '{}' };
    const authority = {
      request: { itemId: 42, etag: '"r1"', version: '1', createdBy: 201, body: v4Canonical(query), query },
      draft: source, references: {},
      actor: { key: 'EMP-001', principal: 201, active: true, manager: 'MGR-001', version: '1' },
      manager: { key: 'MGR-001', principal: 202, active: true, version: '1' },
      control: { workplan: 'EMP-001|2027', person: 'EMP-001', year: 2027, draftId: 41, manager: 'MGR-001',
        hierarchyEpoch: 4, aclEpoch: 4, etag: '"c1"', state: 'Draft', transition: 'Ready' }
    };
    const readOperation = jest.fn(), createOperation = jest.fn();
    const store = {
      binding: { kind: 'domain-test', capability: EXACT_BODY_V4, protectedOrigin: true,
        principals: { content: 301, acl: 302, recovery: 303 } },
      readAuthority: jest.fn().mockResolvedValue(authority), readOperation, createOperation
    } as unknown as V4JournalStore;
    expect(await new OptionEWorkplanSubmitExactBodyV4(store).submit('EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47'))
      .toEqual({ outcome: 'Rejected', reason: 'ExactBodyWireInvalid' });
    expect(store.readAuthority).toHaveBeenCalledTimes(2);
    expect(readOperation).not.toHaveBeenCalled();
    expect(createOperation).not.toHaveBeenCalled();
  });
});
