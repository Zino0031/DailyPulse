import { CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { BRAND } from '@/hooks/useThemeTokens';

type Tone = 'busy' | 'ai' | 'error' | 'offline' | 'info' | 'success' | 'warning';

interface StatusNoteProps {
  tone: Tone;
  message: string;
  action?: { label: string; onPress: () => void; hint?: string };
  onDismiss?: () => void;
  testID?: string;
}

const SURFACE: Record<Tone, string> = {
  busy: 'bg-surface border border-border',
  ai: 'bg-primary/10',
  error: 'bg-danger/10',
  offline: 'bg-warning/10',
  info: 'bg-surface border border-border',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
};

/**
 * Inline, announced status line (progress, AI result, failure, offline).
 * Used instead of toasts so messages stay until they're no longer true.
 */
export function StatusNote({ tone, message, action, onDismiss, testID }: StatusNoteProps) {
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      className={`flex-row items-center gap-3 rounded-lg px-4 py-3 ${SURFACE[tone]}`}>
      {tone === 'busy' && <ActivityIndicator size="small" color={BRAND.primary} />}
      {tone === 'ai' && <Sparkles size={18} strokeWidth={1.75} color={BRAND.primary} />}
      {tone === 'error' && <CircleAlert size={18} strokeWidth={1.75} color={BRAND.danger} />}
      {tone === 'offline' && <WifiOff size={18} strokeWidth={1.75} color={BRAND.warning} />}
      {tone === 'info' && <Info size={18} strokeWidth={1.75} color={BRAND.primary} />}
      {tone === 'success' && <CircleCheck size={18} strokeWidth={1.75} color={BRAND.success} />}
      {tone === 'warning' && <TriangleAlert size={18} strokeWidth={1.75} color={BRAND.warning} />}
      <Text className="flex-1 text-footnote text-text">
        {message}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.hint}>
          <Text className="text-footnote font-semibold text-primary">{action.label}</Text>
        </Pressable>
      )}
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message">
          <Text className="text-footnote font-medium text-text-muted">Dismiss</Text>
        </Pressable>
      )}
    </View>
  );
}
