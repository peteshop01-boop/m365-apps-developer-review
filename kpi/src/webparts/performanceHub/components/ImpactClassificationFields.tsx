import * as React from 'react';
import type { IImpactClassification } from '../models/ProductionModels';
import { selectGovernedImpactClassification, type IImpactClassificationConfiguration } from '../services/PersonalWorkplanPolicy';
import { ImpactFieldHelp } from './ImpactFieldHelp';
import { IMPACT_HELP } from '../services/ImpactFieldHelpContent';
export const impactClassificationText = (classification: Readonly<IImpactClassification> | undefined): string => {
  const pillar = classification?.strategicPillar?.label || 'No Strategic Pillar';
  const area = classification?.businessContributionArea?.label || 'Business Contribution Area not yet classified';
  return `${pillar} · ${area}`;
};

/** Shared source fields; values and historical labels come exclusively from governed data. */
export const ImpactClassificationFields: React.FC<{
  id: string;
  classification?: Readonly<IImpactClassification>;
  configuration?: IImpactClassificationConfiguration;
  disabled?: boolean;
  onChange?(classification: IImpactClassification): void;
}> = ({ id, classification, configuration, disabled = false, onChange }) => <>
  <p>{impactClassificationText(classification)}</p>
  {(['strategicPillar', 'businessContributionArea'] as const).map(field => {
    const label = field === 'strategicPillar' ? 'Strategic Pillar (optional)' : 'Business Contribution Area';
    const options = field === 'strategicPillar' ? configuration?.strategicPillars : configuration?.businessContributionAreas;
    const saved = classification?.[field];
    const current = saved && options?.some(option => option.key === saved.key && option.label === saved.label
      && option.taxonomyId === saved.taxonomyId && option.taxonomyVersion === saved.taxonomyVersion
      && option.taxonomyEtag === saved.taxonomyEtag);
    const retained = saved && !current;
    return <div key={field}><label htmlFor={`${id}-${field}`}><span>{label}</span></label><select id={`${id}-${field}`}
      disabled={disabled || !configuration || !onChange} value={retained ? '__retained__' : saved?.key || ''}
      onChange={event => { if (configuration) onChange?.(selectGovernedImpactClassification(classification, field, event.currentTarget.value, configuration)); }}>
      <option value="">{field === 'strategicPillar' ? 'No Strategic Pillar' : 'Choose governed value…'}</option>
      {retained && <option value="__retained__" disabled>{saved.label} · saved version</option>}
      {options?.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
    </select>
      {saved && <p>{saved.sourceReference || saved.source}{saved.taxonomyVersion ? ` · taxonomy ${saved.taxonomyVersion}` : ''}</p>}
      <ImpactFieldHelp id={`${id}-${field}-help`} label={label} content={field === 'strategicPillar' ? IMPACT_HELP.pillar : IMPACT_HELP.contributionArea} />
    </div>;
  })}
  {!configuration && <p role="status">Classification choices are unavailable until the governed taxonomy and save route are connected. Saved classifications are retained.</p>}
</>;
