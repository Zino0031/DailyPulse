export const GENDERS = [
  'female',
  'male',
  'nonbinary',
  'prefer_not_to_say',
] as const;

export type Gender = (typeof GENDERS)[number];

export const GENDER_LABEL: Record<Gender, string> = {
  female: 'Female',
  male: 'Male',
  nonbinary: 'Nonbinary',
  prefer_not_to_say: 'Prefer not to say',
};

/**
 * Style preference catalogue (PRD §3.1). Ids are stored in
 * `users.style_prefs`, so only ever append — never rename an id.
 */
export const STYLE_PREFS = [
  { id: 'casual', label: 'Casual' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'classic', label: 'Classic' },
  { id: 'streetwear', label: 'Streetwear' },
  { id: 'sporty', label: 'Sporty' },
  { id: 'business', label: 'Business' },
  { id: 'bohemian', label: 'Bohemian' },
  { id: 'edgy', label: 'Edgy' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'vintage', label: 'Vintage' },
] as const;

export type StylePref = (typeof STYLE_PREFS)[number]['id'];

export const STYLE_LABEL: Record<string, string> = Object.fromEntries(
  STYLE_PREFS.map((s) => [s.id, s.label]),
);

export const NAME_MAX_LENGTH = 80;
