import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center gap-8 bg-bg px-6">
        <Text className="text-title-3 font-semibold text-text">
          This screen doesn&apos;t exist.
        </Text>
        <Link href="/" className="text-headline font-semibold text-primary">
          Go to home screen
        </Link>
      </View>
    </>
  );
}
