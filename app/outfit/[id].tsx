import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

// TODO (Epic 5 — AI Composer): outfit detail + regenerate view.
export default function OutfitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-xl font-bold text-slate-900">Outfit {id}</Text>
      <Text className="mt-2 text-base text-slate-500">
        Outfit detail placeholder — coming in Epic 5.
      </Text>
    </View>
  );
}
