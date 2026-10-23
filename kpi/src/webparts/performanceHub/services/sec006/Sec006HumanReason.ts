// Boundary-only removal preserves meaningful internal text. Interior default-
// ignorable, control, format and surrogate characters fail closed.
const reasonBoundaryIgnorable = new RegExp(
  '[\\p{White_Space}\\p{Default_Ignorable_Code_Point}\\p{Cc}\\p{Cf}]', 'u'
);
const reasonInteriorForbidden = new RegExp(
  '[\\p{Default_Ignorable_Code_Point}\\p{Cc}\\p{Cf}\\p{Cs}]', 'u'
);
const reasonWhitespace = new RegExp('^\\p{White_Space}$', 'u');
const reasonMark = new RegExp('^\\p{M}$', 'u');

export const normaliseSec006HumanReason = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const characters = Array.from(value.normalize('NFC'));
  let first = 0;
  let last = characters.length;
  while (first < last && reasonBoundaryIgnorable.test(characters[first])) first += 1;
  while (last > first && reasonBoundaryIgnorable.test(characters[last - 1])) last -= 1;
  const boundedCharacters = characters.slice(first, last);
  if (!boundedCharacters.length || boundedCharacters.some(character => reasonInteriorForbidden.test(character))) {
    return undefined;
  }
  const hasVisibleBase = boundedCharacters.some(character =>
    !reasonWhitespace.test(character) && !reasonMark.test(character));
  return hasVisibleBase ? boundedCharacters.join('') : undefined;
};
