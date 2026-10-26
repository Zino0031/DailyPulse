import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { FabTabBar } from '@/components/navigation/FabTabBar';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

const INSETS = { top: 0, left: 0, right: 0, bottom: 24 };

async function setup(overrides: { index?: number } = {}) {
  const routes = [
    { key: 'index-key', name: 'index' },
    { key: 'closet-key', name: 'closet' },
    { key: 'lookbook-key', name: 'lookbook' },
    { key: 'profile-key', name: 'profile' },
  ];
  const calls: string[] = [];
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(() => calls.push('navigate')),
    dispatch: jest.fn(),
    setParams: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    getId: jest.fn(),
    getParent: jest.fn(),
    getState: jest.fn(),
    canGoBack: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  };
  const descriptors = Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        key: route.key,
        options: {
          title: route.name === 'index' ? 'Today' : route.name,
          tabBarLabel: route.name === 'index' ? 'Home' : undefined,
          tabBarIcon: () => <View testID={`icon-${route.name}`} />,
          tabBarAccessibilityLabel: `Open ${route.name}`,
        },
      },
    ]),
  );
  const props = {
    state: {
      index: overrides.index ?? 0,
      routes,
      key: 'tabs',
      routeNames: routes.map((r) => r.name),
      type: 'tab' as const,
      stale: false as const,
      history: [],
    },
    descriptors,
    navigation,
    insets: INSETS,
  } as unknown as ComponentProps<typeof FabTabBar>;

  const utils = await render(
    // The prop types come from expo-router/react-navigation; this is the
    // same shape the navigator passes at runtime.
    <FabTabBar {...props} />,
  );
  return { ...utils, navigation, props };
}

beforeEach(() => jest.clearAllMocks());

it('renders every tab and the generate FAB', async () => {
  await setup();
  expect(screen.getByText('Home')).toBeTruthy(); // tabBarLabel wins
  expect(screen.getByText('closet')).toBeTruthy();
  expect(screen.getByText('lookbook')).toBeTruthy();
  expect(screen.getByText('profile')).toBeTruthy();
  expect(screen.getByRole('button', { name: "Generate today's outfit" })).toBeTruthy();
});

it('marks the active tab selected and leaves the others unselected', async () => {
  await setup({ index: 2 });
  expect(screen.getByLabelText('Open lookbook').props.accessibilityState).toEqual({
    selected: true,
  });
  expect(screen.getByLabelText('Open index').props.accessibilityState).toEqual({
    selected: false,
  });
});

it('navigates on press, but not for the already-focused tab', async () => {
  const { navigation } = await setup({ index: 1 });
  await fireEvent.press(screen.getByLabelText('Open closet'));
  expect(navigation.navigate).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByLabelText('Open profile'));
  expect(navigation.emit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: 'profile-key',
    canPreventDefault: true,
  });
  expect(navigation.navigate).toHaveBeenCalledWith('profile', undefined);
});

it('does not navigate when the tab press is prevented', async () => {
  const { navigation } = await setup();
  navigation.emit.mockReturnValueOnce({ defaultPrevented: true });
  await fireEvent.press(screen.getByLabelText('Open lookbook'));
  expect(navigation.navigate).not.toHaveBeenCalled();
});

it('opens the generation screen from the FAB', async () => {
  await setup();
  await fireEvent.press(screen.getByRole('button', { name: "Generate today's outfit" }));
  expect(mockPush).toHaveBeenCalledWith('/outfit/new');
});
