import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
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
import { useAuth } from "@/hooks/useAuth";
import { useThemeTokens } from "@/hooks/useThemeTokens";

export default function SignInScreen() {
  const router = useRouter();
  const { textSubtle: iconColor, text: foregroundColor } = useThemeTokens();
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !submitting;
  const busy = submitting || googleSubmitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: authError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.replace("/(tabs)");
  }

  async function onGoogleSubmit() {
    if (busy) return;
    setGoogleSubmitting(true);
    setError(null);
    const { error: authError } = await signInWithGoogle();
    setGoogleSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.replace("/(tabs)");
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

          <View className="mt-2 gap-8">
            <View>
              <Text className="text-title-1 font-bold text-text">Sign in</Text>
              <Text className="mt-2 text-callout text-text-muted">
                Welcome back! Please enter your details to continue.
              </Text>
            </View>

            <View className="gap-4">
              <Pressable
                onPress={onGoogleSubmit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                accessibilityState={{
                  disabled: busy,
                  busy: googleSubmitting,
                }}
                className={`h-[52px] flex-row items-center justify-center gap-3 rounded-full border border-border bg-surface active:bg-primary-tint ${
                  busy ? "opacity-60" : ""
                }`}
              >
                {googleSubmitting ? (
                  <ActivityIndicator color={foregroundColor} />
                ) : (
                  <>
                    <GoogleGlyph />
                    <Text className="text-headline font-semibold text-text">
                      Continue with Google
                    </Text>
                  </>
                )}
              </Pressable>

              <View className="flex-row items-center gap-3">
                <View className="h-px flex-1 bg-border" />
                <Text className="text-caption text-text-subtle">
                  Or continue with email
                </Text>
                <View className="h-px flex-1 bg-border" />
              </View>

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

              <View
                className={`h-14 flex-row items-center rounded-full border bg-surface px-5 ${
                  passwordFocused ? "border-primary" : "border-border"
                }`}
              >
                <MaterialCommunityIcons
                  name="lock-outline"
                  color={iconColor}
                  size={20}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="Password"
                  placeholderTextColor={iconColor}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  autoCorrect={false}
                  textContentType="password"
                  className="ml-3 flex-1 text-body text-text"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                  hitSlop={12}
                  className="h-11 w-11 items-center justify-center"
                >
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    color={iconColor}
                    size={20}
                  />
                </Pressable>
              </View>

              <View className="flex-row justify-end">
                <Link href="/forgot-password" asChild>
                  <Pressable hitSlop={8} className="min-h-11 justify-center">
                    <Text className="text-footnote font-semibold text-primary">
                      Forgot password?
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {error ? (
                <Text className="text-footnote text-danger">{error}</Text>
              ) : null}
            </View>

            <View className="gap-4">
              <Pressable
                onPress={onSubmit}
                disabled={!canSubmit || busy}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                accessibilityState={{
                  disabled: !canSubmit || busy,
                  busy: submitting,
                }}
                className={`h-[52px] items-center justify-center rounded-full bg-primary active:bg-primary-pressed ${
                  !canSubmit || busy ? "opacity-60" : ""
                }`}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-headline font-semibold text-white">
                    Sign in
                  </Text>
                )}
              </Pressable>

              <View className="flex-row items-center justify-center gap-1">
                <Text className="text-footnote text-text-muted">
                  Don&apos;t have an account?
                </Text>
                <Link href="/sign-up" asChild>
                  <Pressable hitSlop={8} className="min-h-11 justify-center">
                    <Text className="text-footnote font-semibold text-primary">
                      Sign up
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Monochrome Google-G from AntDesign in Google's brand blue. Swap for an
// `<Image source={require('@/assets/images/google-g.png')} />` if a proper
// multi-color asset is dropped into assets/images/.
function GoogleGlyph() {
  return <AntDesign name="google" color="#4285F4" size={20} />;
}
