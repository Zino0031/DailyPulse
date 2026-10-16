import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusNote } from '@/components/closet/StatusNote';
import { LocationPicker } from '@/components/onboarding/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import {
  GENDERS,
  GENDER_LABEL,
  NAME_MAX_LENGTH,
  STYLE_PREFS,
} from '@/constants/profile';
import {
  draftFromProfile,
  useProfileDetails,
  useSaveProfile,
  useSkipOnboarding,
} from '@/hooks/useProfile';
import { BRAND, useThemeTokens } from '@/hooks/useThemeTokens';
import { useAuthStore } from '@/store/useAuthStore';
import {
  useDraftFor,
  useDraftHydrated,
  useOnboardingDraftStore,
} from '@/store/useOnboardingDraftStore';
import { friendlyError } from '@/utils/errors';
import {
  hasErrors,
  toggleStyle,
  validateProfile,
  type ProfileDraft,
  type ProfileErrors,
} from '@/utils/profile';

/**
 * Profile form (issue #5): name, gender, location (lat/lon for Open-Meteo)
 * and style prefs → `users` upsert. Every change is kept as a local draft,
 * so closing the app mid-flow resumes here. `?mode=edit` reuses the form
 * from the Profile tab and returns there on save.
 */
export default function ProfileFormScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const editing = mode === 'edit';
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const hydrated = useDraftHydrated();
  const draft = useDraftFor(userId);
  const profile = useProfileDetails();

  // Wait for both sources so the form initialises once with the right values.
  if (!hydrated || (profile.isLoading && !draft)) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={BRAND.primary} />
      </View>
    );
  }

  return (
    <ProfileForm
      editing={editing}
      userId={userId}
      initial={draft ?? draftFromProfile(profile.data)}
      alreadyOnboarded={Boolean(profile.data?.onboarded_at)}
    />
  );
}

function ProfileForm({
  editing,
  userId,
  initial,
  alreadyOnboarded,
}: {
  editing: boolean;
  userId: string | null;
  initial: ProfileDraft;
  alreadyOnboarded: boolean;
}) {
  const tokens = useThemeTokens();
  const [values, setValues] = useState<ProfileDraft>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const saveDraft = useOnboardingDraftStore((s) => s.saveDraft);
  const clearDraft = useOnboardingDraftStore((s) => s.clearDraft);
  const save = useSaveProfile();
  const skip = useSkipOnboarding();

  // Errors appear after the first submit, then update live as fields change.
  const errors: ProfileErrors = submitted ? validateProfile(values) : {};
  const busy = save.isPending || skip.isPending;

  const update = (patch: Partial<ProfileDraft>) => {
    const next = { ...values, ...patch };
    setValues(next);
    if (userId) saveDraft(userId, next);
  };

  const onSubmit = () => {
    setSubmitted(true);
    if (busy || hasErrors(validateProfile(values))) return;
    save.mutate(
      { draft: values, completeOnboarding: !alreadyOnboarded },
      {
        onSuccess: () => {
          clearDraft();
          if (editing) router.back();
          else router.push('/onboarding/avatar-capture');
        },
      },
    );
  };

  // The draft stays on the device, so "Finish your profile" resumes it later.
  const onSkip = () => {
    skip.mutate(undefined, { onSuccess: () => router.replace('/(tabs)') });
  };

  const mutationError = save.error ?? skip.error;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: editing ? 'Edit profile' : 'Your profile',
          headerRight:
            editing || alreadyOnboarded
              ? undefined
              : () => (
                  <Pressable
                    testID="profile-form-skip"
                    onPress={onSkip}
                    disabled={busy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityHint="Saves your answers on this device so you can finish later">
                    <Text className="text-callout font-semibold text-primary">Skip</Text>
                  </Pressable>
                ),
        }}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="w-full max-w-[640px] self-center gap-8 px-6 pb-8 pt-6"
          keyboardShouldPersistTaps="handled">
          <View>
            <Text accessibilityRole="header" className="text-title-1 font-bold text-text">
              {editing ? 'Edit your profile' : 'Tell us about you'}
            </Text>
            <Text className="mt-1 text-callout text-text-muted">
              We use this to suggest outfits for your style and your weather.
            </Text>
          </View>

          <Field label="Name" error={errors.fullName}>
            <View
              className={`h-14 flex-row items-center rounded-full border bg-surface px-5 ${
                errors.fullName ? 'border-danger' : nameFocused ? 'border-primary' : 'border-border'
              }`}>
              <MaterialCommunityIcons name="account-outline" color={tokens.textMuted} size={20} />
              <TextInput
                testID="profile-form-name"
                value={values.fullName}
                onChangeText={(fullName) => update({ fullName })}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                placeholder="Your name"
                placeholderTextColor={tokens.textMuted}
                maxLength={NAME_MAX_LENGTH}
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="done"
                accessibilityLabel="Name"
                className="ml-3 flex-1 text-body text-text"
              />
            </View>
          </Field>

          <Field
            label="Gender"
            hint="Helps the stylist pick cuts and fits."
            error={errors.gender}>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {GENDERS.map((g) => (
                <Chip
                  key={g}
                  testID={`profile-form-gender-${g}`}
                  role="radio"
                  label={GENDER_LABEL[g]}
                  selected={values.gender === g}
                  onPress={() => update({ gender: g })}
                />
              ))}
            </View>
          </Field>

          <Field label="Location" hint="Used only for your local weather." error={undefined}>
            <LocationPicker
              value={values.location}
              onChange={(location) => update({ location })}
              error={errors.location}
            />
          </Field>

          <Field
            label="Style"
            hint="Pick as many as you like."
            error={errors.styles}>
            <View className="flex-row flex-wrap gap-2">
              {STYLE_PREFS.map((s) => (
                <Chip
                  key={s.id}
                  testID={`profile-form-style-${s.id}`}
                  label={s.label}
                  selected={values.styles.includes(s.id)}
                  onPress={() => update({ styles: toggleStyle(values.styles, s.id) })}
                />
              ))}
            </View>
          </Field>

          {mutationError && (
            <StatusNote
              tone="error"
              testID="profile-form-error"
              message={friendlyError(mutationError, "Couldn't save your profile — please try again.")}
              action={save.isError ? { label: 'Retry', onPress: onSubmit, hint: 'Saves again' } : undefined}
            />
          )}

          <Button
            testID="profile-form-submit"
            label={editing ? 'Save changes' : 'Continue'}
            size="lg"
            loading={save.isPending}
            disabled={skip.isPending}
            onPress={onSubmit}
            accessibilityHint={editing ? 'Saves your profile' : 'Saves your profile and moves on to your avatar'}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <View>
        <Text className="text-headline font-semibold text-text">{label}</Text>
        {hint ? <Text className="mt-0.5 text-footnote text-text-muted">{hint}</Text> : null}
      </View>
      {children}
      {error ? (
        <Text accessibilityRole="alert" className="text-footnote text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
