import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
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

import { BackButton } from '@/components/ui/BackButton';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';

const BRAND = '#5B47FB';
const BRAND_TINT = '#EDE9FE';
const MIN_PASSWORD_LENGTH = 6;

type Status = 'init' | 'ready' | 'invalid' | 'success';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const { startRecoveryFromUrl, updatePassword, completeRecovery } = useAuth();

  const [status, setStatus] = useState<Status>('init');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!url || status !== 'init') return;
    let cancelled = false;
    (async () => {
      const { error: recoveryError, isRecoveryUrl } =
        await startRecoveryFromUrl(url);
      if (cancelled) return;
      if (!isRecoveryUrl) {
        setStatus('invalid');
        return;
      }
      if (recoveryError) {
        setError(recoveryError.message);
        setStatus('invalid');
        return;
      }
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [url, status, startRecoveryFromUrl]);

  const canSubmit =
    status === 'ready' &&
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length > 0 &&
    !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus('success');
  }

  function onContinue() {
    completeRecovery();
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-8"
          keyboardShouldPersistTaps="handled">
          {status === 'success' ? (
            <SuccessView onContinue={onContinue} />
          ) : (
            <>
              <BackButton />

              <View className="mt-6 gap-8">
                <View>
                  <Text className="text-title-1 font-bold text-text">
                    Reset your password
                  </Text>
                  <Text className="mt-2 text-callout text-text-muted">
                    Enter your new password below.
                  </Text>
                </View>

                {status === 'invalid' ? (
                  <View className="gap-4">
                    <Text className="text-footnote text-danger">
                      {error ??
                        'This reset link is invalid or has expired. Request a new one.'}
                    </Text>
                    <Pressable
                      onPress={() => router.replace('/forgot-password')}
                      accessibilityRole="button"
                      accessibilityLabel="Request a new reset link"
                      className="h-16 items-center justify-center rounded-full bg-primary active:opacity-80">
                      <Text className="text-headline font-semibold text-white">
                        Request a new link
                      </Text>
                    </Pressable>
                  </View>
                ) : status === 'init' ? (
                  <View className="items-center py-8">
                    <ActivityIndicator />
                  </View>
                ) : (
                  <>
                    <View className="gap-5">
                      <LabeledPasswordInput
                        label="New password"
                        placeholder="Enter new password"
                        value={password}
                        onChangeText={setPassword}
                        focused={passwordFocused}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        visible={showPassword}
                        onToggleVisible={() => setShowPassword((v) => !v)}
                      />

                      <LabeledPasswordInput
                        label="Confirm password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        focused={confirmFocused}
                        onFocus={() => setConfirmFocused(true)}
                        onBlur={() => setConfirmFocused(false)}
                        visible={showConfirm}
                        onToggleVisible={() => setShowConfirm((v) => !v)}
                      />

                      {error ? (
                        <Text className="text-footnote text-danger">
                          {error}
                        </Text>
                      ) : null}
                    </View>

                    <Pressable
                      onPress={onSubmit}
                      disabled={!canSubmit}
                      accessibilityRole="button"
                      accessibilityLabel="Update password"
                      accessibilityState={{
                        disabled: !canSubmit,
                        busy: submitting,
                      }}
                      className={`h-16 items-center justify-center rounded-full bg-primary active:opacity-80 ${
                        !canSubmit ? 'opacity-60' : ''
                      }`}>
                      {submitting ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-headline font-semibold text-white">
                          Update password
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LabeledPasswordInput({
  label,
  placeholder,
  value,
  onChangeText,
  focused,
  onFocus,
  onBlur,
  visible,
  onToggleVisible,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? '#6B7280' : '#9CA3AF';

  return (
    <View className="gap-2">
      <Text className="text-subhead font-semibold text-text">{label}</Text>
      <View
        className={`h-14 flex-row items-center rounded-lg border bg-surface px-4 ${
          focused ? 'border-primary' : 'border-border'
        }`}>
        <MaterialCommunityIcons
          name="lock-outline"
          color={iconColor}
          size={20}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={iconColor}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          textContentType="newPassword"
          className="ml-3 flex-1 text-body text-text"
        />
        <Pressable
          onPress={onToggleVisible}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}>
          <MaterialCommunityIcons
            name={visible ? 'eye-outline' : 'eye-off-outline'}
            color={iconColor}
            size={20}
          />
        </Pressable>
      </View>
    </View>
  );
}

function SuccessView({ onContinue }: { onContinue: () => void }) {
  return (
    <View className="flex-1 items-center justify-between pt-16 pb-4">
      <View className="items-center">
        <CheckBurst />
        <Text className="mt-10 text-title-1 font-bold text-text">
          Password updated!
        </Text>
        <Text className="mt-2 px-8 text-center text-callout text-text-muted">
          Your password has been successfully changed.
        </Text>
      </View>

      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        className="h-16 w-full items-center justify-center rounded-full bg-primary active:opacity-80">
        <Text className="text-headline font-semibold text-white">Continue</Text>
      </Pressable>
    </View>
  );
}

function CheckBurst() {
  return (
    <View
      className="items-center justify-center"
      style={{ width: 220, height: 220 }}>
      <View
        style={{
          position: 'absolute',
          top: 24,
          left: 36,
          width: 14,
          height: 4,
          backgroundColor: '#22C58B',
          borderRadius: 2,
          transform: [{ rotate: '-20deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 20,
          right: 46,
          width: 10,
          height: 10,
          backgroundColor: '#5DE4C7',
          borderRadius: 5,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 60,
          right: 10,
          width: 18,
          height: 4,
          backgroundColor: '#FF9A3C',
          borderRadius: 2,
          transform: [{ rotate: '35deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 10,
          top: 100,
          width: 18,
          height: 4,
          backgroundColor: '#E85D9E',
          borderRadius: 2,
          transform: [{ rotate: '20deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 40,
          right: 36,
          width: 10,
          height: 10,
          backgroundColor: '#E85D9E',
          borderRadius: 5,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 24,
          left: 60,
          width: 6,
          height: 6,
          backgroundColor: '#22C58B',
          borderRadius: 3,
        }}
      />

      <View
        className="items-center justify-center rounded-full"
        style={{
          width: 160,
          height: 160,
          backgroundColor: BRAND_TINT,
        }}>
        <View
          className="items-center justify-center rounded-full"
          style={{ width: 108, height: 108, backgroundColor: BRAND }}>
          <MaterialCommunityIcons name="check" color="white" size={64} />
        </View>
      </View>
    </View>
  );
}
