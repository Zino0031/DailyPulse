import { Text, View } from 'react-native';

// TODO (Epic 2 — Avatar): selfie capture + avatar asset pipeline.
export default function AvatarCaptureScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-xl font-bold text-slate-900">Your avatar</Text>
      <Text className="mt-2 text-base text-slate-500">
        Avatar capture placeholder — coming in Epic 2.
      </Text>
    </View>
  );
}
