import { parseBehaviourGuidance } from './BehaviourGuidance';

const guidance = (value: string): string => `Corporate Value: ${value}\n\nObservable prompts:\n1. Prompt one.\n2. Prompt two.\n3. Prompt three.\n4. Prompt four.\n5. Prompt five.\n\nRating options: Exceeds expectations; Meets expectations; Developing; Not demonstrated / insufficient evidence.`;

describe('signed Behaviour guidance', () => {
  it('extracts one corporate value and exactly five observable prompts for every signed heading', () => {
    const values = ['We unite as one Club', 'We build the next chapter', 'We respect the game and each other', 'We work & play with energy', 'We take responsibility'];
    values.forEach(value => {
      const parsed = parseBehaviourGuidance(guidance(value));
      expect(parsed.corporateValue).toBe(value);
      expect(parsed.prompts).toHaveLength(5);
      expect(parsed.complete).toBe(true);
      expect(parsed.ratingOptions).toContain('Meets expectations');
    });
  });

  it('fails closed when the published model does not contain five prompts', () => {
    expect(parseBehaviourGuidance('Corporate Value: Example\n1. Only one prompt.')).toEqual(expect.objectContaining({ complete: false, prompts: ['Only one prompt.'] }));
  });
});
