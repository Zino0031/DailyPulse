import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColorScheme } from "@/components/useColorScheme";

const BRAND = "#5B47FB";

export default function WelcomeScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const background =
    scheme === "dark"
      ? require("@/assets/images/welcome-night.png")
      : require("@/assets/images/welcome.png");

  return (
    <View className="flex-1 bg-bg">
      <Image
        source={background}
        style={{ position: "absolute", inset: 0 }}
        contentFit="cover"
      />

      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="flex-1 px-6">
          <View className="pt-6">
            <MaterialCommunityIcons
              name="hanger"
              color={scheme === "dark" ? "white" : BRAND}
              size={64}
            />

            <Text className="mt-2 font-light text-6xl text-text">
              We&apos;ll help you{"\n"}choose what{"\n"}to wear, {"\n"}every
              day.
            </Text>
          </View>

          <View className="flex-1" />

          <View className="pb-2">
            {/* <View className="mb-6 flex-row justify-center gap-2">
              <View className="h-2 w-2 rounded-full bg-primary" />
              <View className="h-2 w-2 rounded-full bg-border" />
              <View className="h-2 w-2 rounded-full bg-border" />
            </View> */}

            <Pressable
              onPress={() => router.push("/sign-up")}
              accessibilityRole="button"
              accessibilityLabel="Get started"
              className="h-16 flex-row items-center justify-center px-6 rounded-full bg-primary active:opacity-80 relative"
            >
              <Text className="text-headline font-semibold text-white flex-1 text-center">
                Get started
              </Text>
              <MaterialCommunityIcons
                style={{ position: "absolute", right: 22 }}
                name="arrow-right"
                color="white"
                size={22}
              />
            </Pressable>

            <Pressable
              onPress={() => router.push("/sign-in")}
              accessibilityRole="button"
              accessibilityLabel="I already have an account"
              className="mt-4 items-center py-2"
            >
              <Text className="text-footnote font-semibold text-primary dark:text-white">
                I already have an account
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
