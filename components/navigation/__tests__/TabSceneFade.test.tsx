import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { TabSceneFade } from '@/components/navigation/TabSceneFade';

let mockFocused = true;
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
}));

it('renders its screen content', async () => {
  mockFocused = true;
  await render(
    <TabSceneFade>
      <Text>Today</Text>
    </TabSceneFade>,
  );
  expect(screen.getByText('Today')).toBeTruthy();
});

it('stays mounted and visible across a blur and refocus', async () => {
  mockFocused = true;
  const view = await render(
    <TabSceneFade>
      <Text>Closet</Text>
    </TabSceneFade>,
  );
  expect(screen.getByText('Closet')).toBeTruthy();

  mockFocused = false;
  await view.rerender(
    <TabSceneFade>
      <Text>Closet</Text>
    </TabSceneFade>,
  );
  expect(screen.getByText('Closet')).toBeTruthy();

  mockFocused = true;
  await view.rerender(
    <TabSceneFade>
      <Text>Closet</Text>
    </TabSceneFade>,
  );
  expect(screen.getByText('Closet')).toBeTruthy();
});
