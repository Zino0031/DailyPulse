import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera } from 'lucide-react-native';
import { Stack, router } from 'expo-router';
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
import { Image } from 'expo-image';

import { AvatarCaptureSheet } from '@/components/avatar/AvatarCaptureSheet';
import { AvatarPreview } from '@/components/avatar/AvatarPreview';
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
import { useActiveAvatar, useSaveAvatar } from '@/hooks/useAvatar';
import type { LocalPhoto } from '@/services/avatar';
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
 * so closing the app mid-flow resumes here. Rendered by the onboarding step
 * (`app/onboarding/profile-form.tsx`) and, with `editing`, by the Edit
 * profile modal (`app/edit-profile.tsx`), which closes on save.
 */
export function ProfileFormScreen({ editing }: { editing: boolean }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const hydrated = useDraftHydrated();
  const draft = useDraftFor(userId);
  const profile = useProfileDetails();

  // Editing always starts from the saved profile (drafts are an onboarding
  // thing), so cancelling or swiping the modal away leaves nothing behind.
  const resume = editing ? undefined : draft;

  // Wait for both sources so the form initialises once with the right values.
  // Drafts are irrelevant when editing, so a slow draft store must not block
  // the modal (issue #54 review).
  if ((!editing && !hydrated) || (profile.isLoading && !resume)) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={BRAND.primary} />
      </View>
    );
  }

  // A deep link can reach the modal before the profile resolves, or after the
  // query failed; an empty form would silently overwrite the saved profile.
  if (editing && !profile.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-bg px-6">
        <StatusNote
          tone="error"
          testID="profile-form-load-error"
          message="Couldn't load your profile."
        />
        <Button
          testID="profile-form-load-retry"
          label="Try again"
          variant="secondary"
          onPress={() => profile.refetch()}
        />
      </View>
    );
  }

  return (
    <ProfileForm
      editing={editing}
      userId={userId}
      initial={resume ?? draftFromProfile(profile.data)}
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
    if (userId && !editing) saveDraft(userId, next);
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

  // The draft stays on the device, so re-entering onboarding resumes it. (The
  // Edit profile modal starts from the saved profile instead.)
  const onSkip = () => {
    skip.mutate(undefined, { onSuccess: () => router.replace('/(tabs)') });
  };

  const mutationError = save.error ?? skip.error;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: editing ? 'Edit profile' : 'Your profile',
          ...(editing
            ? {
                headerLeft: () => (
                  <Pressable
                    testID="profile-form-cancel"
                    onPress={() => router.back()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityHint="Closes the form"
                    className="h-11 justify-center px-3">
                    <Text className="text-callout text-primary">Cancel</Text>
                  </Pressable>
                ),
              }
            : {}),
          ...(editing || alreadyOnboarded
            ? {}
            : {
                headerRight: () => (
                  <Pressable
                    testID="profile-form-skip"
                    onPress={onSkip}
                    disabled={busy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityHint="Saves your answers on this device so you can finish later"
                    className="h-11 justify-center px-3">
                    <Text className="text-callout font-semibold text-primary">Skip</Text>
                  </Pressable>
                ),
              }),
        }}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="w-full max-w-[640px] self-center gap-8 px-6 pb-8 pt-6"
          keyboardShouldPersistTaps="handled">
          <View>
            {/* The modal's native header already says "Edit profile". */}
            {!editing && (
              <Text accessibilityRole="header" className="mb-1 text-title-1 font-bold text-text">
                Tell us about you
              </Text>
            )}
            <Text className="text-callout text-text-muted">
              We use this to suggest outfits for your style and your weather.
            </Text>
          </View>

          {editing && <AvatarField />}

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

/**
 * Edit-mode avatar row. Add / Change opens the camera-or-library sheet in
 * place; the picked photo uploads straight away (no detour to another screen).
 */
function AvatarField() {
  const { data: avatar } = useActiveAvatar();
  const save = useSaveAvatar();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pending, setPending] = useState<LocalPhoto | null>(null);

  const onPicked = (photo: LocalPhoto) => {
    setPickError(null);
    setPending(photo);
    save.mutate({ photo }, { onSettled: () => setPending(null) });
  };

  return (
    <Field
      label="Photo"
      hint="Also the face your outfit previews wear. A new photo is saved as soon as you pick it."
      error={undefined}>
      <View className="flex-row items-center gap-4">
        {pending ? (
          // Local file as the preview while it uploads.
          <Image
            source={{ uri: pending.uri }}
            style={{ width: 64, height: 64, borderRadius: 32 }}
            contentFit="cover"
            accessibilityLabel="New photo, uploading"
          />
        ) : (
          <AvatarPreview size={64} />
        )}
        <Button
          testID="profile-form-avatar"
          label={save.isPending ? 'Uploading…' : avatar ? 'Change photo' : 'Add photo'}
          icon={Camera}
          variant="secondary"
          loading={save.isPending}
          onPress={() => {
            save.reset();
            setSheetVisible(true);
          }}
          accessibilityHint="Take a selfie or choose a photo from your library"
        />
      </View>
      {pickError ? (
        <StatusNote tone="error" message={pickError} />
      ) : save.isError ? (
        <StatusNote
          tone="error"
          message={friendlyError(save.error, "Couldn't save your photo.")}
        />
      ) : null}
      <AvatarCaptureSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onPicked={onPicked}
        onError={setPickError}
      />
    </Field>
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
