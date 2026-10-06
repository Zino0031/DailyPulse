import { Text, View } from 'react-native';

// TODO (Epic 1 — Onboarding): profile form + avatar capture flow.
export default function OnboardingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-bold text-slate-900">Welcome</Text>
      <Text className="mt-2 text-center text-base text-slate-500">
        Onboarding placeholder — coming in Epic 1.
      </Text>
    </View>
  );
}
