// Reanimated 4 + Worklets ship JS mocks for Jest (no native UI runtime).
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  // Reanimated 4's Jest mock omits this hook; screens rely on it for a11y.
  mock.useReducedMotion = () => false;
  return mock;
});
// Official in-memory AsyncStorage (Supabase session + query persistence).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// RevenueCat ships a native module; tests talk to this stub (override per test).
jest.mock('react-native-purchases', () => {
  const Purchases = {
    configure: jest.fn(),
    logIn: jest.fn(async () => ({ customerInfo: {}, created: false })),
    logOut: jest.fn(async () => ({})),
    getOfferings: jest.fn(async () => ({ current: null, all: {} })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(async () => ({ entitlements: { active: {} } })),
    getCustomerInfo: jest.fn(async () => ({ managementURL: null, entitlements: { active: {} } })),
  };
  const PACKAGE_TYPE = {
    UNKNOWN: 'UNKNOWN',
    CUSTOM: 'CUSTOM',
    LIFETIME: 'LIFETIME',
    ANNUAL: 'ANNUAL',
    SIX_MONTH: 'SIX_MONTH',
    THREE_MONTH: 'THREE_MONTH',
    TWO_MONTH: 'TWO_MONTH',
    MONTHLY: 'MONTHLY',
    WEEKLY: 'WEEKLY',
  };
  const { PURCHASES_ERROR_CODE } = jest.requireActual(
    '@revenuecat/purchases-typescript-internal',
  );
  return { __esModule: true, default: Purchases, PACKAGE_TYPE, PURCHASES_ERROR_CODE };
});
