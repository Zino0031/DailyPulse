import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, Settings } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import type { LocalPhoto } from '@/services/avatar';

type Source = 'camera' | 'library';

interface AvatarCaptureSheetProps {
  visible: boolean;
  onClose: () => void;
  onPicked: (photo: LocalPhoto) => void;
  onError: (message: string) => void;
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  allowsEditing: true,
  // Square crop — selfies render as circles everywhere (DESIGN.md §5).
  aspect: [1, 1],
  quality: 0.9, // final compression happens after resize (services/avatar.ts)
};

/**
 * "Set avatar" source picker. Camera permission is asked in context, and a
 * denial is explained in place with a Settings shortcut — never a dead tap.
 */
export function AvatarCaptureSheet({
  visible,
  onClose,
  onPicked,
  onError,
}: AvatarCaptureSheetProps) {
  const [cameraBlocked, setCameraBlocked] = useState(false);
  // iOS can't present the picker while our Modal is still animating out.
  const queued = useRef<Source | null>(null);

  async function launch(source: Source) {
    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      const asset = result.canceled ? null : result.assets?.[0];
      if (asset) onPicked({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch {
      onError(
        source === 'camera'
          ? "Couldn't open the camera. Try choosing from your library instead."
          : "Couldn't open your photo library.",
      );
    }
  }

  async function choose(source: Source) {
    if (source === 'camera' && Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCameraBlocked(true);
        return;
      }
    }
    setCameraBlocked(false);
    if (Platform.OS === 'ios') {
      queued.current = source;
      onClose();
    } else {
      // Web needs the picker opened inside the tap handler (user activation).
      onClose();
      void launch(source);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setCameraBlocked(false);
        onClose();
      }}
      onDismiss={() => {
        const source = queued.current;
        queued.current = null;
        if (source) void launch(source);
      }}
      title="Set your avatar"
      description="A clear front-facing selfie works best — it's the face your outfit renders wear.">
      <View className="gap-3">
        <SourceOption
          icon={Camera}
          title="Take a selfie"
          subtitle="Use your camera now"
          onPress={() => choose('camera')}
          testID="avatar-capture-camera"
        />
        <SourceOption
          icon={Images}
          title="Choose from library"
          subtitle="Pick a photo you already have"
          onPress={() => choose('library')}
          testID="avatar-capture-library"
        />
        {cameraBlocked && (
          <View accessibilityLiveRegion="polite" className="gap-3 rounded-lg bg-warning/10 p-4">
            <Text className="text-footnote text-text">
              Camera access is turned off for this app. Turn it on in Settings, or choose a
              photo from your library.
            </Text>
            <Button
              label="Open Settings"
              icon={Settings}
              variant="secondary"
              size="sm"
              className="self-start"
              onPress={() => Linking.openSettings()}
              accessibilityHint="Opens this app's system settings"
            />
          </View>
        )}
      </View>
    </Sheet>
  );
}

function SourceOption({
  icon: Icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}) {
  const tokens = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      className="min-h-[60px] flex-row items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 active:bg-primary-tint">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-tint">
        <Icon size={20} strokeWidth={1.75} color={tokens.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-headline text-text">{title}</Text>
        <Text className="text-footnote text-text-muted">{subtitle}</Text>
      </View>
    </Pressable>
  );
}
