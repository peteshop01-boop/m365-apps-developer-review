/** Approved optional companion schema, not the proposed required v2 schema. */
export const behaviourSnapshotsTargetV1 = Object.freeze({
  url: 'https://example.invalid/sites/REVIEW-TEST-SITE',
  siteId: 'f2d23af0-1770-4e9b-aca2-1462b43c8999',
  webId: '4ebc956f-bc50-42e0-ac05-59a032569075',
  listId: '98f2a280-46a7-40b5-a37d-db97b02fc826',
  title: 'KCFKPI_TEST_WorkplanItems'
});

export const behaviourSnapshotsDefinitionsV1 = Object.freeze([
  { name: 'BehaviourV2SelectionSnapshotsSHA256', type: 'Text', attributes: 'MaxLength="255"' },
  { name: 'BehaviourV2SelectionSnapshotsJSON', type: 'Note', attributes: 'RichText="FALSE" AppendOnly="FALSE" VersionHistory="FALSE"' },
  { name: 'BehaviourV2SelectionSnapshotsUtf8ByteLength', type: 'Number', attributes: 'Decimals="0" Min="1" Max="1000000"' }
].map(definition => Object.freeze(definition)));

export function behaviourSnapshotsFieldXmlV1(name: string): string {
  const definition = behaviourSnapshotsDefinitionsV1.find(field => field.name === name);
  if (!definition) throw new Error('Field is outside the approved three-field schema.');
  return `<Field Type="${definition.type}" Name="${definition.name}" StaticName="${definition.name}" DisplayName="${definition.name}" Required="FALSE" Indexed="FALSE" EnforceUniqueValues="FALSE" ${definition.attributes} />`;
}

export const behaviourSnapshotsCapacityHoldV1 = 'Note 63999-character storage does not prove the 1000000 UTF-8-byte input range; native capacity acceptance remains HOLD.';
