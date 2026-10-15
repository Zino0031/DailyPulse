import {
  GENDERS,
  NAME_MAX_LENGTH,
  STYLE_PREFS,
  type Gender,
  type StylePref,
} from '@/constants/profile';

export interface ProfileLocation {
  latitude: number;
  longitude: number;
  /** "City, Country" — null when reverse-geocoding found nothing. */
  label: string | null;
}

export interface ProfileDraft {
  fullName: string;
  gender: Gender;
  location: ProfileLocation | null;
  styles: StylePref[];
}

export type ProfileErrors = Partial<Record<'fullName' | 'gender' | 'location' | 'styles', string>>;

export const EMPTY_DRAFT: ProfileDraft = {
  fullName: '',
  gender: 'prefer_not_to_say',
  location: null,
  styles: [],
};

const STYLE_IDS: readonly string[] = STYLE_PREFS.map((s) => s.id);

/** Field-level validation for the onboarding / edit profile form. */
export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = draft.fullName.trim();
  if (!name) errors.fullName = 'Add your name so we know what to call you.';
  else if (name.length > NAME_MAX_LENGTH) {
    errors.fullName = `Keep it under ${NAME_MAX_LENGTH} characters.`;
  }

  if (!(GENDERS as readonly string[]).includes(draft.gender)) {
    errors.gender = 'Pick one of the options.';
  }

  const loc = draft.location;
  if (!loc) errors.location = 'Set a location so we can check your weather.';
  else if (
    !Number.isFinite(loc.latitude) ||
    !Number.isFinite(loc.longitude) ||
    Math.abs(loc.latitude) > 90 ||
    Math.abs(loc.longitude) > 180
  ) {
    errors.location = "That location doesn't look right — try another.";
  }

  if (draft.styles.length === 0) errors.styles = 'Pick at least one style you like.';
  else if (draft.styles.some((s) => !STYLE_IDS.includes(s))) {
    errors.styles = 'Pick from the styles shown.';
  }
  return errors;
}

export function hasErrors(errors: ProfileErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Toggle a style in/out, keeping catalogue order stable. */
export function toggleStyle(styles: StylePref[], id: StylePref): StylePref[] {
  const next = styles.includes(id) ? styles.filter((s) => s !== id) : [...styles, id];
  return STYLE_PREFS.map((s) => s.id).filter((s) => next.includes(s));
}

/** Short "City, Country" or rounded coordinates for display. */
export function formatLocation(loc: Pick<ProfileLocation, 'latitude' | 'longitude' | 'label'>): string {
  return loc.label ?? `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`;
}
