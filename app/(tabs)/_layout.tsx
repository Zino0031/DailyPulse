import { Bookmark, Shirt, Sun, UserRound } from 'lucide-react-native';
import { Tabs } from 'expo-router';

import { FabTabBar } from '@/components/navigation/FabTabBar';
import { TabSceneFade } from '@/components/navigation/TabSceneFade';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FabTabBar {...props} />}
      // Every tab draws its own safe-area header. The active icon is filled.
      screenOptions={{ headerShown: false }}
      // Our own fade, not `animation: 'fade'` (that one can strand a screen
      // invisible on quick tab switches).
      screenLayout={({ children }) => <TabSceneFade>{children}</TabSceneFade>}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size, focused }) => (
            <Sun size={size} strokeWidth={1.5} color={color} fill={focused ? color : 'none'} />
          ),
        }}
      />
      <Tabs.Screen
        name="closet"
        options={{
          title: 'Closet',
          tabBarAccessibilityLabel: 'Closet, your wardrobe items',
          tabBarIcon: ({ color, size, focused }) => (
            <Shirt size={size} strokeWidth={1.5} color={color} fill={focused ? color : 'none'} />
          ),
        }}
      />
      <Tabs.Screen
        name="lookbook"
        options={{
          title: 'Lookbook',
          tabBarAccessibilityLabel: 'Lookbook, your saved looks',
          tabBarIcon: ({ color, size, focused }) => (
            <Bookmark size={size} strokeWidth={1.5} color={color} fill={focused ? color : 'none'} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile, your account and sign out',
          tabBarIcon: ({ color, size, focused }) => (
            <UserRound size={size} strokeWidth={1.5} color={color} fill={focused ? color : 'none'} />
          ),
        }}
      />
    </Tabs>
  );
}
