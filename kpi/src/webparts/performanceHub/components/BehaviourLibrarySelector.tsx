import * as React from 'react';
import type { BehaviourKey, IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { getLocalBehaviourLibrarySuggestions } from '../services/EmployeeBehaviourSelection';
import { BEHAVIOUR_ROLE_LEVELS, behaviourCatalogueLabel, isRoleBehaviourObjectiveLibraryRecord } from '../services/BehaviourLibraryRoleMetadata';
import styles from './BehaviourLibrarySelector.module.scss';

export interface IBehaviourLibrarySelectorProps {
  behaviourKey: BehaviourKey;
  library: ReadonlyArray<IBehaviourObjectiveLibraryRecord>;
  selectedKeys: ReadonlyArray<string>;
  disabled?: boolean;
  asOf?: Date;
  copiedContent?: React.ReactNode;
  onToggle(key: string): void;
}

/** Shared by both employee hosts; data and optional synthetic date come from callers. */
const BehaviourLibrarySelector: React.FC<IBehaviourLibrarySelectorProps> = ({
  behaviourKey, library, selectedKeys, disabled, asOf, copiedContent, onToggle
}) => {
  const options = getLocalBehaviourLibrarySuggestions(library, behaviourKey, asOf);
  const roleOptions = options.filter(isRoleBehaviourObjectiveLibraryRecord);
  const legacyOptions = options.filter(item => !isRoleBehaviourObjectiveLibraryRecord(item));
  const unavailable = selectedKeys.filter(key => !options.some(item => item.behaviourObjectiveKey === key));
  const checkbox = (item: IBehaviourObjectiveLibraryRecord): React.ReactElement => <label className={styles.choice} key={item.behaviourObjectiveKey}>
    <input type="checkbox" disabled={disabled} data-behaviour-suggestion={item.behaviourObjectiveKey}
      checked={selectedKeys.indexOf(item.behaviourObjectiveKey) >= 0} onChange={() => onToggle(item.behaviourObjectiveKey)} />
    <span>{isRoleBehaviourObjectiveLibraryRecord(item) ? behaviourCatalogueLabel(item)
      : <><strong>{item.behaviourObjectiveKey.replace(`${behaviourKey}-`, '')}</strong>{item.objectiveTitle}</>}</span>
  </label>;
  return <section className={styles.selector} data-behaviour-library={behaviourKey} aria-label={`${behaviourKey} library choices`}>
    <fieldset><legend>Controlled suggestions — choose one or more</legend>
      {roleOptions.length > 0 && <p>{roleOptions.length} role-level choices</p>}
      {BEHAVIOUR_ROLE_LEVELS.map(role => {
        const choices = roleOptions.filter(item => item.roleLevelCode === role.code);
        return choices.length > 0 && <fieldset key={role.code} data-role-level={role.code}><legend>{role.code} {role.label}</legend>{choices.map(checkbox)}</fieldset>;
      })}
      {legacyOptions.length > 0 && <fieldset data-legacy-choices="true"><legend>Existing generic choices</legend>{legacyOptions.map(checkbox)}</fieldset>}
      {!options.length && <p>No eligible library choices are available for this date. You can retain your existing wording or enter a custom objective.</p>}
    </fieldset>
    {unavailable.length > 0 && <fieldset><legend>Retained selections</legend>{unavailable.map(key => <label className={styles.choice} key={key}>
      <input type="checkbox" disabled={disabled} checked data-behaviour-suggestion={key} onChange={() => onToggle(key)} /><span>{key} — retained from this Workplan</span>
    </label>)}</fieldset>}
    {selectedKeys.length > 0 && copiedContent && <div className={styles.guidance} data-copied-content="true"><strong>Copied Workplan wording</strong>{copiedContent}</div>}
    {roleOptions.filter(item => selectedKeys.indexOf(item.behaviourObjectiveKey) >= 0).map(item => <section
      className={styles.guidance} data-selected-guidance={item.behaviourObjectiveKey} key={item.behaviourObjectiveKey} aria-label={behaviourCatalogueLabel(item)}>
      <h4>{behaviourCatalogueLabel(item)}</h4><dl>
        <dt>Description</dt><dd data-detail="description">{item.objectiveDescription}</dd>
        <dt>Measure</dt><dd data-detail="measure">{item.suggestedMeasure}</dd>
        <dt>Unit</dt><dd data-detail="unit">{item.suggestedUnit}</dd>
        <dt>Evidence</dt><dd data-detail="evidence">{item.suggestedEvidence}</dd>
      </dl>
    </section>)}
  </section>;
};

export default BehaviourLibrarySelector;
