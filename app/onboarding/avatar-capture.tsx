import { Stack, router } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { AvatarCaptureSheet } from '@/components/avatar/AvatarCaptureSheet';
import { AvatarPreview } from '@/components/avatar/AvatarPreview';
import { StatusNote } from '@/components/closet/StatusNote';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useActiveAvatar, useRemoveAvatar, useSaveAvatar } from '@/hooks/useAvatar';
import type { LocalPhoto } from '@/services/avatar';
import { friendlyError } from '@/utils/errors';

const PREVIEW_SIZE = 120;

/**
 * Onboarding avatar step (Epic 2, issue #6): selfie capture → upload to the
 * public `avatars` bucket → active `avatars` row. Free path only — the photo
 * itself is the avatar; AI stylization stays a stubbed edge-function concern
 * (services/avatar.ts `stylizeAvatar`).
 */
export default function AvatarCaptureScreen() {
  const active = useActiveAvatar();
  const save = useSaveAvatar();
  const remove = useRemoveAvatar();

  const [picked, setPicked] = useState<LocalPhoto | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const savedUrl = save.data?.image_url ?? null;
  const saving = save.isPending;
  const currentUrl = savedUrl ?? active.data?.image_url ?? null;

  const onPicked = (photo: LocalPhoto) => {
    setPicked(photo);
    setPickerError(null);
    save.reset();
  };

  const onSave = () => {
    if (!picked || saving) return;
    save.mutate(
      { photo: picked },
      { onSuccess: () => setPicked(null) },
    );
  };

  const leave = () => router.replace('/(tabs)');

  return (
    <>
      <Stack.Screen options={{ title: 'Your avatar' }} />
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerClassName="gap-8 px-6 pb-8 pt-12">
        <View>
          <Text className="text-title-1 font-bold text-text">Your avatar</Text>
          <Text className="mt-1 text-callout text-text-muted">
            A clear front-facing selfie works best — it&apos;s the face your outfit renders
            wear.
          </Text>
        </View>

        <View className="rounded-xl bg-surface p-5 shadow-md">
          <View className="items-center gap-4 py-2">
            {picked ? (
              <Image
                source={{ uri: picked.uri }}
                style={{
                  width: PREVIEW_SIZE,
                  height: PREVIEW_SIZE,
                  borderRadius: PREVIEW_SIZE / 2,
                }}
                contentFit="cover"
                accessibilityLabel="Selfie preview"
              />
            ) : (
              <AvatarPreview size={PREVIEW_SIZE} />
            )}
            <Text className="text-center text-footnote text-text-muted">
              {picked
                ? 'Preview — save it to make this your avatar.'
                : currentUrl
                  ? 'Your current avatar.'
                  : 'No avatar yet — your renders will use a placeholder face until you add one.'}
            </Text>
          </View>
        </View>

        {pickerError ? (
          <StatusNote tone="error" message={pickerError} />
        ) : save.isError ? (
          <StatusNote
            tone="error"
            testID="avatar-save-error"
            message={friendlyError(save.error, "Couldn't save your avatar.")}
            action={picked ? { label: 'Retry', onPress: onSave, hint: 'Uploads the selfie again' } : undefined}
          />
        ) : saving ? (
          <StatusNote tone="busy" message="Uploading your selfie…" />
        ) : save.isSuccess ? (
          <StatusNote tone="ai" message="Avatar saved — looking good." />
        ) : remove.isError ? (
          <StatusNote
            tone="error"
            message={friendlyError(remove.error, "Couldn't remove your avatar.")}
          />
        ) : null}

        <View className="gap-4">
          {picked ? (
            <>
              <Button
                testID="avatar-save"
                label={saving ? 'Saving…' : 'Save avatar'}
                loading={saving}
                disabled={saving}
                size="lg"
                onPress={onSave}
                accessibilityHint="Uploads this selfie and makes it your avatar"
              />
              <Button
                label="Retake"
                variant="secondary"
                icon={Camera}
                onPress={() => {
                  save.reset();
                  setSheetVisible(true);
                }}
                accessibilityHint="Picks a different selfie"
              />
            </>
          ) : save.isSuccess ? (
            <Button
              label="Continue"
              size="lg"
              onPress={leave}
              accessibilityHint="Goes to your daily home"
            />
          ) : (
            <>
              <Button
                testID="avatar-choose"
                label={currentUrl ? 'Change selfie' : 'Add a selfie'}
                icon={Camera}
                size="lg"
                onPress={() => setSheetVisible(true)}
                accessibilityHint="Opens the camera or photo library"
              />
              {currentUrl && active.data ? (
                <Button
                  label="Remove avatar"
                  variant="danger"
                  onPress={() => setConfirmRemove(true)}
                  accessibilityHint="Deletes your current avatar"
                />
              ) : null}
              <Button
                label="Skip for now"
                variant="ghost"
                onPress={leave}
                accessibilityHint="Continues without setting an avatar"
              />
            </>
          )}
          <Text className="text-center text-caption text-text-subtle">
            AI-styled avatars arrive in a later update — your photo works everywhere today.
          </Text>
        </View>
      </ScrollView>

      <AvatarCaptureSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onPicked={onPicked}
        onError={setPickerError}
      />
      <ConfirmSheet
        visible={confirmRemove}
        title="Remove your avatar?"
        message="Outfit renders will use a placeholder face until you add a new one."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          if (active.data) remove.mutate(active.data);
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}
