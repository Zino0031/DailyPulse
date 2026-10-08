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
import { useColorScheme } from "@/components/useColorScheme";
import { useAuth } from "@/hooks/useAuth";

const MIN_PASSWORD_LENGTH = 6;

export default function SignUpScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const iconColor = scheme === "dark" ? "#6B7280" : "#9CA3AF";
  const foregroundColor = scheme === "dark" ? "#F5F7FA" : "#0A0C0F";
  const { signUp, signInWithGoogle } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    agreed &&
    !submitting;
  const busy = submitting || googleSubmitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { error: authError } = await signUp(email.trim(), password, {
      full_name: fullName.trim(),
    });
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    // If email confirmation is on, no session comes back — the auth gate stays
    // here and we surface a hint.
    setInfo("Check your email to confirm your account. You can then sign in.");
  }

  async function onGoogleSubmit() {
    if (busy) return;
    setGoogleSubmitting(true);
    setError(null);
    setInfo(null);
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
              <Text className="text-title-1 font-bold text-text">Sign up</Text>
              <Text className="mt-2 text-callout text-text-muted">
                Create your account and start building your perfect wardrobe.
              </Text>
            </View>

            <View className="gap-4">
              <Pressable
                onPress={onGoogleSubmit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Sign up with Google"
                accessibilityState={{
                  disabled: busy,
                  busy: googleSubmitting,
                }}
                className={`h-16 flex-row items-center justify-center gap-3 rounded-full border border-border bg-surface ${
                  busy ? "opacity-60" : ""
                }`}
              >
                {googleSubmitting ? (
                  <ActivityIndicator color={foregroundColor} />
                ) : (
                  <>
                    <GoogleGlyph />
                    <Text className="text-headline font-semibold text-text">
                      Sign up with Google
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
                  nameFocused ? "border-primary" : "border-border"
                }`}
              >
                <MaterialCommunityIcons
                  name="account-outline"
                  color={iconColor}
                  size={20}
                />
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  placeholder="Full name"
                  placeholderTextColor={iconColor}
                  autoCapitalize="words"
                  autoComplete="name"
                  autoCorrect={false}
                  textContentType="name"
                  className="ml-3 flex-1 text-body text-text"
                />
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
                  autoComplete="new-password"
                  autoCorrect={false}
                  textContentType="newPassword"
                  className="ml-3 flex-1 text-body text-text"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                  hitSlop={8}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    color={iconColor}
                    size={20}
                  />
                </Pressable>
              </View>

              <Pressable
                onPress={() => setAgreed((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityLabel="I agree with the Terms of Service and Privacy policy"
                accessibilityState={{ checked: agreed }}
                className="flex-row items-start gap-3 py-1"
              >
                <View
                  className={`mt-0.5 h-5 w-5 items-center justify-center rounded-sm border ${
                    agreed
                      ? "border-primary bg-primary"
                      : "border-border bg-surface"
                  }`}
                >
                  {agreed ? (
                    <MaterialCommunityIcons
                      name="check"
                      color="white"
                      size={14}
                    />
                  ) : null}
                </View>
                <Text className="flex-1 text-footnote text-text-muted">
                  I agree with the{" "}
                  <Text className="font-semibold text-primary">
                    Terms of Service
                  </Text>{" "}
                  and{" "}
                  <Text className="font-semibold text-primary">
                    Privacy policy
                  </Text>
                </Text>
              </Pressable>

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
                disabled={!canSubmit || busy}
                accessibilityRole="button"
                accessibilityLabel="Create account"
                accessibilityState={{
                  disabled: !canSubmit || busy,
                  busy: submitting,
                }}
                className={`h-16 items-center justify-center rounded-full bg-primary active:opacity-80 ${
                  !canSubmit || busy ? "opacity-60" : ""
                }`}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-headline font-semibold text-white">
                    Create account
                  </Text>
                )}
              </Pressable>

              <View className="flex-row items-center justify-center gap-1">
                <Text className="text-footnote text-text-muted">
                  Already have an account?
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

// Monochrome Google-G from AntDesign in Google's brand blue. Swap for an
// `<Image source={require('@/assets/images/google-g.png')} />` if a proper
// multi-color asset is dropped into assets/images/.
function GoogleGlyph() {
  return <AntDesign name="google" color="#4285F4" size={20} />;
}
