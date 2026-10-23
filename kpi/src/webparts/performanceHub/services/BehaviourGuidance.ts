export interface IBehaviourGuidance {
  corporateValue?: string;
  prompts: string[];
  ratingOptions?: string;
  complete: boolean;
}

export const parseBehaviourGuidance = (value: string | undefined): IBehaviourGuidance => {
  const lines = (value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const corporate = lines.find(line => /^Corporate Value:/i.test(line));
  const rating = lines.find(line => /^Rating options:/i.test(line));
  const prompts = lines
    .filter(line => /^\d+\.\s+/.test(line))
    .map(line => line.replace(/^\d+\.\s+/, '').trim());
  return {
    corporateValue: corporate?.replace(/^Corporate Value:\s*/i, '').trim() || undefined,
    prompts,
    ratingOptions: rating?.replace(/^Rating options:\s*/i, '').trim() || undefined,
    complete: prompts.length === 5
  };
};
