import { Link } from 'expo-router';
import { Text, View } from 'react-native';

// TODO (Epic 1 — Auth): replace with the real sign-up form.
export default function SignUpScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-bold text-slate-900">Create account</Text>
      <Text className="mt-2 text-base text-slate-500">
        Sign-up placeholder — coming in Epic 1.
      </Text>
      <Link href="/sign-in" className="mt-4 text-base font-semibold text-sky-600">
        Back to sign in
      </Link>
    </View>
  );
}
