import { BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, decodeBehaviourSelectionSnapshotsV2,
  encodeBehaviourSelectionSnapshotsV2, type IBehaviourSelectionSnapshotEnvelopeV2 }
  from './BehaviourSelectionSnapshotsV2';

const snapshot = (): IBehaviourSelectionSnapshotEnvelopeV2 => ({
  schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA,
  frameworkVersion: 'KCCC-BEHAVIOUR|v02', valueId: 'BHV-01',
  selections: [
    { source: 'Catalogue', selectionKey: 'BHV-01-L1-01', catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS',
      catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', catalogueRevision: 1,
      targetKey: 'BHV-01-L1-01', focusKey: 'BHV-01-FOCUS-01', behaviourKey: 'BHV-01',
      roleLevelCode: 'L1', focusArea: 'Focus one', selectedExampleText: 'Approved exact example',
      commitment: 'I will do this', howWillWeKnow: 'The team will see this' },
    { source: 'Own', selectionKey: 'BHV-01-OWN-ABC123', behaviourKey: 'BHV-01',
      commitment: 'My own commitment', howWillWeKnow: 'Colleagues can observe it' }
  ]
});

describe('Behaviour v02 immutable selection snapshot storage', () => {
  it('round-trips canonical JSON, digest, byte count and catalogue-only keys', () => {
    const encoded = encodeBehaviourSelectionSnapshotsV2(snapshot());
    expect(encoded.catalogueKeys).toEqual(['BHV-01-L1-01']);
    expect(encoded.utf8ByteLength).toBe(Buffer.byteLength(encoded.json, 'utf8'));
    expect(decodeBehaviourSelectionSnapshotsV2(encoded.json, encoded.sha256, encoded.utf8ByteLength)).toEqual(snapshot());
    expect(() => decodeBehaviourSelectionSnapshotsV2(encoded.json, encoded.sha256, encoded.utf8ByteLength + 1))
      .toThrow(/digest or size/);
    expect(() => decodeBehaviourSelectionSnapshotsV2(encoded.json, 'A'.repeat(64), encoded.utf8ByteLength))
      .toThrow(/digest or size/);
  });
  it('rejects crossed Value, client wording injection and duplicate or unsorted keys', () => {
    const value = snapshot();
    expect(() => encodeBehaviourSelectionSnapshotsV2({ ...value, valueId: 'BHV-02' })).toThrow();
    expect(() => encodeBehaviourSelectionSnapshotsV2({ ...value,
      selections: [{ ...value.selections[0], selectedExampleText: 'Changed wording',
        clientFrameworkVersion: 'untrusted' } as never, value.selections[1]] })).toThrow();
    expect(() => encodeBehaviourSelectionSnapshotsV2({ ...value,
      selections: [value.selections[0], value.selections[0]] })).toThrow();
    expect(() => encodeBehaviourSelectionSnapshotsV2({ ...value,
      selections: [value.selections[1], value.selections[0]] })).toThrow();
  });
  it('rejects an encoded field over one million UTF-8 bytes', () => {
    const value = snapshot();
    const selections = Array.from({ length: 11 }, (_, index) => ({
      source: 'Own' as const, selectionKey: `BHV-01-OWN-KEY${String(index).padStart(3, '0')}`,
      behaviourKey: 'BHV-01' as const, commitment: 'x'.repeat(100000), howWillWeKnow: 'Visible'
    }));
    expect(() => encodeBehaviourSelectionSnapshotsV2({ ...value, selections }))
      .toThrow(/1,000,000-byte/);
  });
});
