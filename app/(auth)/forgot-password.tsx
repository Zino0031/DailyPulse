import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackButton } from "@/components/ui/BackButton";
import { useThemeTokens } from "@/hooks/useThemeTokens";
import { useAuth } from "@/hooks/useAuth";

const BRAND = "#5B47FB";

export default function ForgotPasswordScreen() {
  const { textSubtle: iconColor } = useThemeTokens();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    const { error: authError } = await resetPassword(email.trim());
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setInfo(
      "If an account exists for that email, we've sent a reset link. Tap it from your phone to set a new password.",
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          <BackButton />

          <View className="mt-6 items-center">
            <MaterialCommunityIcons name="send" color={BRAND} size={80} />
          </View>

          <View className="mt-8 gap-8">
            <View>
              <Text className="text-title-1 font-bold text-text">
                Forgot password
              </Text>
              <Text className="mt-2 text-callout text-text-muted">
                Enter your email address and we&apos;ll send you a link to reset
                your password.
              </Text>
            </View>

            <View className="gap-4">
              <View
                className={`h-14 flex-row items-center rounded-full border bg-surface px-5 ${
                  emailFocused ? "border-primary" : "border-border"
                }`}
              >
                <MaterialCommunityIcons
                  name="email-outline"
                  color={iconColor}
                  size={20}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="Email address"
                  placeholderTextColor={iconColor}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  className="ml-3 flex-1 text-body text-text"
                />
              </View>

              {error ? (
                <Text className="text-footnote text-danger">{error}</Text>
              ) : null}
              {info ? (
                <Text className="text-footnote text-success">{info}</Text>
              ) : null}
            </View>

            <View className="gap-4">
              <Pressable
                onPress={onSubmit}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Send reset link"
                accessibilityState={{ disabled: !canSubmit, busy: submitting }}
                className={`h-[52px] items-center justify-center rounded-full bg-primary active:bg-primary-pressed ${
                  !canSubmit ? "opacity-60" : ""
                }`}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-headline font-semibold text-white">
                    Send reset link
                  </Text>
                )}
              </Pressable>

              <View className="flex-row items-center justify-center gap-1">
                <Text className="text-footnote text-text-muted">
                  Remember your password?
                </Text>
                <Link href="/sign-in">
                  <Text className="text-footnote font-semibold text-primary">
                    Sign in
                  </Text>
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
