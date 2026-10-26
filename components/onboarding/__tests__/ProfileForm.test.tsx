import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProfileFormScreen } from '@/components/onboarding/ProfileForm';
import { useAuthStore } from '@/store/useAuthStore';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: unknown }) => {
      mockScreenOptions = options;
      return null;
    },
  },
}));

jest.mock('@/components/onboarding/LocationPicker', () => ({
  LocationPicker: () => null,
}));
jest.mock('@/components/avatar/AvatarCaptureSheet', () => ({
  AvatarCaptureSheet: () => null,
}));
jest.mock('@/components/avatar/AvatarPreview', () => ({
  AvatarPreview: () => null,
}));

let mockHydrated = true;
let mockDraft: unknown = undefined;
jest.mock('@/store/useOnboardingDraftStore', () => ({
  useDraftHydrated: () => mockHydrated,
  useDraftFor: () => mockDraft,
  useOnboardingDraftStore: (selector: (s: unknown) => unknown) =>
    selector({ saveDraft: jest.fn(), clearDraft: jest.fn() }),
}));

type ProfileState = {
  data: Record<string, unknown> | undefined;
  isLoading: boolean;
  refetch: jest.Mock;
};
let mockProfile: ProfileState;
let mockSave: {
  mutate: jest.Mock;
  isPending: boolean;
  error: Error | null;
  isError: boolean;
};
let mockSkip: { mutate: jest.Mock; isPending: boolean; error: Error | null };

jest.mock('@/hooks/useProfile', () => ({
  ...jest.requireActual('@/hooks/useProfile'),
  useProfileDetails: () => mockProfile,
  useSaveProfile: () => mockSave,
  useSkipOnboarding: () => mockSkip,
}));
jest.mock('@/hooks/useAvatar', () => ({
  useActiveAvatar: () => ({ data: null }),
  useSaveAvatar: () => ({ mutate: jest.fn(), isPending: false, reset: jest.fn() }),
}));

// Captures the options passed to the native header during edit mode.
let mockScreenOptions: any;

const profile = {
  tier: 'free',
  full_name: 'Ada',
  gender: 'female',
  location_lat: 51.5,
  location_lon: -0.1,
  location_name: 'London',
  style_prefs: ['minimal'],
  onboarded_at: '2026-01-01T00:00:00.000Z',
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 568 },
        insets: { top: 20, left: 0, right: 0, bottom: 0 },
      }}>
      {children}
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHydrated = true;
  mockDraft = undefined;
  mockProfile = { data: profile, isLoading: false, refetch: jest.fn() };
  mockSave = { mutate: jest.fn(), isPending: false, error: null, isError: false };
  mockSkip = { mutate: jest.fn(), isPending: false, error: null };
  useAuthStore.setState({ user: { id: 'user-1' } as never, isLoading: false });
});

it('edit mode starts from the saved profile and ignores the onboarding draft', async () => {
  mockHydrated = false; // the draft store must not block editing
  mockDraft = { fullName: 'Draft name', gender: 'man', location: null, styles: [] };

  await render(<ProfileFormScreen editing />, { wrapper: Wrapper });

  expect(screen.getByTestId('profile-form-name').props.value).toBe('Ada');
  expect(screen.getByTestId('profile-form-submit')).toBeTruthy();
  expect(screen.getByText('Save changes')).toBeTruthy();
});

it('Cancel closes without saving', async () => {
  await render(<ProfileFormScreen editing />, { wrapper: Wrapper });

  const cancel = await render(mockScreenOptions.headerLeft(), { wrapper: Wrapper });
  await fireEvent.press(cancel.getByTestId('profile-form-cancel'));

  expect(router.back).toHaveBeenCalled();
  expect(mockSave.mutate).not.toHaveBeenCalled();
});

it('Save changes submits the edits and closes the modal', async () => {
  mockSave.mutate = jest.fn(
    (_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
  );

  await render(<ProfileFormScreen editing />, { wrapper: Wrapper });
  await fireEvent.press(screen.getByTestId('profile-form-submit'));

  expect(mockSave.mutate).toHaveBeenCalledWith(
    {
      draft: {
        fullName: 'Ada',
        gender: 'female',
        location: { latitude: 51.5, longitude: -0.1, label: 'London' },
        styles: ['minimal'],
      },
      completeOnboarding: false,
    },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
  expect(router.back).toHaveBeenCalled();
});

it('shows an error and retry when the profile cannot be loaded in edit mode', async () => {
  const refetch = jest.fn();
  mockProfile = { data: undefined, isLoading: false, refetch };

  await render(<ProfileFormScreen editing />, { wrapper: Wrapper });

  expect(screen.getByTestId('profile-form-load-error')).toBeTruthy();
  expect(screen.queryByTestId('profile-form-name')).toBeNull();
  await fireEvent.press(screen.getByTestId('profile-form-load-retry'));
  expect(refetch).toHaveBeenCalled();
});
