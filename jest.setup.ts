// Reanimated 4 + Worklets ship JS mocks for Jest (no native UI runtime).
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
