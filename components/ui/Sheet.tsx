import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './Button';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** iOS only: fires once the dismiss animation finished. */
  onDismiss?: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Bottom sheet (DESIGN.md §7 Sheet): rounded top, grabber, safe-area aware.
 * Built on RN `Modal`, so Android back, VoiceOver focus trapping and web
 * all behave — unlike `Alert.alert`, which is a no-op on web.
 */
export function Sheet({ visible, onClose, onDismiss, title, description, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={onDismiss}>
      <Animated.View entering={FadeIn.duration(250)} className="flex-1 justify-end bg-black/40">
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityHint="Dismisses this panel"
        />
        <Animated.View
          entering={SlideInDown.duration(350)}
          accessibilityViewIsModal
          className="w-full max-w-xl self-center rounded-t-2xl bg-surface-elevated px-6 pt-2 shadow-lg"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
          <View className="mb-4 h-1 w-9 self-center rounded-full bg-border" />
          <Text accessibilityRole="header" className="text-title-3 font-semibold text-text">
            {title}
          </Text>
          {description ? (
            <Text className="mt-1 text-footnote text-text-muted">{description}</Text>
          ) : null}
          <View className="mt-5">{children}</View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

/** Explicit two-button confirmation; cancel is always the safe default. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title} description={message}>
      <View className="gap-3">
        <Button
          label={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          size="lg"
          onPress={onConfirm}
          testID="confirm-sheet-confirm"
        />
        <Button label="Cancel" variant="secondary" size="lg" onPress={onCancel} />
      </View>
    </Sheet>
  );
}
