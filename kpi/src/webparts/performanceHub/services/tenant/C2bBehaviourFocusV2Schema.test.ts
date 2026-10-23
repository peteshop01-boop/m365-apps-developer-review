import { hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import * as fs from 'fs';
import * as path from 'path';
import { C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS } from './C2bPhysicalConvergenceContract';
import { C2B_BEHAVIOUR_FOCUS_V2_SCHEMA, assertC2bBehaviourFocusProvisioningReceiptV2,
  hashC2bProjectedFocusRows,
  type IC2bBehaviourFocusProvisioningReceiptV2 } from './C2bBehaviourFocusV2Schema';
import { deserialiseBehaviourFocusV2ProvisioningReceiptRow,
  serialiseBehaviourFocusV2ProvisioningReceiptRow } from './SharePointC2bReceiptStores';

const identity = {
  canonical: 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C',
  projected: '3420F5D1FDF3E427F65E2F54FB86545DFC94699992F818921AE7783D790F15E4',
  file: '851BA6C4C315986ADB17F3FC0ADCFDAFBA59B225BD97201918462CC85AD338A4'
};
const seal = (value: Omit<IC2bBehaviourFocusProvisioningReceiptV2, 'receiptSha256'>):
IC2bBehaviourFocusProvisioningReceiptV2 => ({ ...value, receiptSha256: hashC2bCanonical(value) });
const receipt = (): IC2bBehaviourFocusProvisioningReceiptV2 => seal({
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v2',
  schemaRevision: 'kcf-wib12-provisioning-receipt-v2',
  receiptKey: `tenant-provision|${'A'.repeat(64)}`, revision: 2, status: 'Completed',
  planSha256: 'B'.repeat(64), previousReceiptSha256: 'C'.repeat(64),
  bindingAuthoritySha256: 'D'.repeat(64),
  candidate: { commit: 'a'.repeat(40), tree: 'b'.repeat(40),
    tenantPacketManifestSha256: 'E'.repeat(64), companionPackageSha256: 'F'.repeat(64) },
  siteUrl: 'https://example.invalid/sites/test',
  workflowId: '3db97504-0731-4134-af1a-27e467d23b28', connectionReferenceId: 'TEST-ONLY',
  cataloguePin: { catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS',
    catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', revision: 1,
    contentSha256: identity.canonical, contentCanonicalUtf8ByteLength: 35668,
    sourceSha256: identity.file, sourceRowsCanonicalSha256: identity.canonical,
    generatedRowsJsonSha256: identity.projected, rowCount: 75 },
  lists: C2B_BEHAVIOUR_FOCUS_V2_SCHEMA.lists.map((list, index) => ({
    purpose: list.purpose, listId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title: list.title, schemaRevision: list.schemaRevision, majorVersioningEnabled: true,
    observedFieldsSha256: hashC2bCanonical(list.fields), aclEvidenceSha256: 'A'.repeat(64)
  })),
  workplanItems: { listId: '6906d187-3451-467a-a362-10ddc87449f7',
    schemaRevision: 'c2b-annual-v3', majorVersioningEnabled: true,
    additiveFieldsSha256: hashC2bCanonical(C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS) },
  principalsSha256: 'B'.repeat(64), negativeAccessEvidenceSha256: 'C'.repeat(64)
});

describe('C2b Behaviour focus v2 physical receipt trust', () => {
  it('rebuilds all 75 exact approved projected rows from physical fields in source order', () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(process.cwd(),
      'data/test-pilot/behaviour-catalogue.v2.json'), 'utf8')) as { rows: Array<Record<string, unknown>> };
    const physical = fixture.rows.map(row => ({
      TargetKey: row.targetKey, BehaviourKey: row.behaviourKey, RoleLevelCode: row.roleLevelCode,
      FocusKey: row.focusKey, FocusArea: row.focusArea, SuggestedTarget: row.suggestedTarget,
      SuggestedMeasure: row.suggestedMeasure, SuggestedUnit: row.suggestedUnit,
      SuggestedEvidence: row.suggestedEvidence, EffectiveStatus: row.status,
      SortOrder: row.sortOrder, EffectiveFrom: row.effectiveFrom, EffectiveTo: row.effectiveTo
    }));
    expect(hashC2bProjectedFocusRows([...physical].reverse())).toBe(identity.projected);
    expect(identity.projected).not.toBe(identity.canonical);
    expect(identity.projected).not.toBe(identity.file);
    expect(hashC2bProjectedFocusRows([{ ...physical[0], SuggestedTarget: 'Altered wording' },
      ...physical.slice(1)])).not.toBe(identity.projected);
    expect(hashC2bProjectedFocusRows([...physical, { ...physical[0],
      TargetKey: 'BHV-01-L1-06', SortOrder: 1160 }])).not.toBe(identity.projected);
  });
  it('round-trips one chained exact v2 receipt without altering the v1 storage path', () => {
    const value = receipt();
    expect(assertC2bBehaviourFocusProvisioningReceiptV2(value)).toBe(value);
    expect(deserialiseBehaviourFocusV2ProvisioningReceiptRow(
      serialiseBehaviourFocusV2ProvisioningReceiptRow(value))).toEqual(value);
  });
  it.each([
    ['source file as canonical source rows', 'sourceRowsCanonicalSha256', identity.file],
    ['projected rows as canonical source rows', 'sourceRowsCanonicalSha256', identity.projected],
    ['source file as content', 'contentSha256', identity.file],
    ['projected rows as content', 'contentSha256', identity.projected],
    ['canonical rows as projected JSON', 'generatedRowsJsonSha256', identity.canonical],
    ['projected rows as source file', 'sourceSha256', identity.projected]
  ])('rejects %s even after resealing the receipt', (_label, field, hash) => {
    const value = receipt();
    const cataloguePin = { ...value.cataloguePin, [field]: hash };
    const { receiptSha256, ...unsigned } = value;
    expect(receiptSha256).toMatch(/^[A-F0-9]{64}$/);
    const swapped = seal({ ...unsigned, cataloguePin });
    expect(() => assertC2bBehaviourFocusProvisioningReceiptV2(swapped)).toThrow(/pin substituted/);
  });
  it('rejects a missing prior receipt, foreign list schema and altered field inventory', () => {
    const value = receipt();
    const { receiptSha256, ...unsigned } = value;
    expect(receiptSha256).toMatch(/^[A-F0-9]{64}$/);
    expect(() => assertC2bBehaviourFocusProvisioningReceiptV2(seal({ ...unsigned,
      previousReceiptSha256: '' }))).toThrow();
    expect(() => assertC2bBehaviourFocusProvisioningReceiptV2(seal({ ...unsigned,
      lists: [{ ...value.lists[0], observedFieldsSha256: 'E'.repeat(64) }, value.lists[1]] }))).toThrow();
    expect(() => assertC2bBehaviourFocusProvisioningReceiptV2(seal({ ...unsigned,
      workplanItems: { ...value.workplanItems, additiveFieldsSha256: 'E'.repeat(64) } }))).toThrow();
  });
});
