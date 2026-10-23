import { BEHAVIOUR_ITEM_SELECT, BEHAVIOUR_V2_ITEM_SELECT } from './ProductionQueryFieldContracts';

describe('Behaviour v02 saved Workplan item query', () => {
  it('selects the exact saved annual snapshot, planning and focus provenance without changing the v01 query', () => {
    const legacy = new Set(BEHAVIOUR_ITEM_SELECT.split(','));
    const v02 = new Set(BEHAVIOUR_V2_ITEM_SELECT.split(','));
    expect(Array.from(legacy).every(field => v02.has(field))).toBe(true);
    [
      'BehaviourFrameworkVersion', 'BehaviourValueTitleSnapshot', 'BehaviourCorporateValueSnapshot',
      'BehaviourRoleTierSnapshot', 'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
      'BehaviourPeriodKeysSnapshotJSON', 'BehaviourRatingLabelsSnapshotJSON',
      'BehaviourCommitmentV2', 'BehaviourPeriodCommitmentsV2JSON',
      'BehaviourPlanningContractVersion', 'BehaviourCurrentLevelV2', 'BehaviourTargetLevelV2',
      'BehaviourTargetLevelReasonV2', 'BehaviourV2SelectedSuggestionKeysJSON',
      'BehaviourV2SelectionSnapshotsJSON', 'BehaviourV2SelectionSnapshotsSHA256',
      'BehaviourV2SelectionSnapshotsUtf8ByteLength'
    ].forEach(field => { expect(v02.has(field)).toBe(true); expect(legacy.has(field)).toBe(false); });
    expect(v02.has('Q1BehaviourTargetRating')).toBe(true);
  });
});
