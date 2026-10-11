import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NewItemScreen from '@/app/item/new';
import { closetKeys } from '@/hooks/useCloset';
import * as ai from '@/services/ai';
import * as closet from '@/services/closet';
import type { ClosetItem, LocalPhoto } from '@/services/closet';
import { useAuthStore } from '@/store/useAuthStore';
import type { TagSuggestion } from '@/supabase/functions/_shared/wardrobeTags';

const mockNavigation = {
  setOptions: jest.fn(),
  addListener: jest.fn(() => () => {}),
  canGoBack: () => true,
  goBack: jest.fn(),
  dispatch: jest.fn(),
};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ uri: 'file://picked.jpg', width: '3024', height: '4032' }),
  useNavigation: () => mockNavigation,
  router: { replace: jest.fn() },
}));
jest.mock('@/services/closet', () => ({
  uploadClosetPhoto: jest.fn(),
  cropFaceFromPhoto: jest.fn(),
  replaceClosetPhoto: jest.fn(),
  removeClosetPhoto: jest.fn(),
  insertClosetItem: jest.fn(),
  fetchClosetItems: jest.fn(),
}));
jest.mock('@/services/ai', () => ({ suggestItemTags: jest.fn() }));

const api = closet as jest.Mocked<typeof closet>;
const tagger = ai as jest.Mocked<typeof ai>;
const USER = 'user-1';
const ORIGINAL = `${USER}/original.jpg`;
const CROPPED_PATH = `${USER}/cropped.jpg`;
const CROPPED: LocalPhoto = { uri: 'file://cropped.jpg', width: 1080, height: 979 };

const suggestion = (face: TagSuggestion['face']): TagSuggestion => ({
  category: 'top',
  colors: ['navy'],
  formality: 'casual',
  season: [],
  fabric: '',
  pattern: '',
  face,
});
const FACE = { x: 300, y: 50, w: 400, h: 250 };

/** A promise the test resolves by hand, to hold the crop mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

let client: QueryClient;
function renderScreen() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<NewItemScreen />, { wrapper: Wrapper });
}

const saveButton = () => screen.getByTestId('new-item-save');
const cachedItems = () => client.getQueryData<ClosetItem[]>(closetKeys.items(USER)) ?? [];

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAuthStore.setState({ user: { id: USER } as never, isLoading: false });
  api.uploadClosetPhoto.mockResolvedValue(ORIGINAL);
  api.insertClosetItem.mockImplementation(async (_user, imagePath, tags) => ({
    id: 'new-1',
    user_id: USER,
    image_url: imagePath,
    created_at: '2026-10-11T00:00:00.000Z',
    ...tags,
  }));
  api.fetchClosetItems.mockReturnValue(new Promise(() => {}));
});
afterEach(() => client.clear());

it('holds Save while a detected face is cropped out, explains why, then saves the cropped photo', async () => {
  tagger.suggestItemTags.mockResolvedValue(suggestion(FACE));
  const crop = deferred<LocalPhoto | null>();
  api.cropFaceFromPhoto.mockReturnValue(crop.promise);
  api.replaceClosetPhoto.mockResolvedValue(CROPPED_PATH);
  await renderScreen();

  expect(await screen.findByTestId('new-item-cropping')).toBeTruthy();
  expect(screen.getByText('Cropping a face out of your photo for privacy…')).toBeTruthy();
  expect(saveButton()).toBeDisabled();
  expect(screen.getByText('Preparing photo…')).toBeTruthy();
  expect(api.cropFaceFromPhoto).toHaveBeenCalledWith('file://picked.jpg', FACE);

  await act(async () => crop.resolve(CROPPED));

  expect(api.replaceClosetPhoto).toHaveBeenCalledWith(ORIGINAL, CROPPED.uri);
  expect(await screen.findByText(/We cropped out a face to keep your closet private\./)).toBeTruthy();
  expect(saveButton()).toBeEnabled();

  await fireEvent.press(saveButton());
  await waitFor(() => expect(api.insertClosetItem).toHaveBeenCalled());
  expect(api.insertClosetItem.mock.calls[0][1]).toBe(CROPPED_PATH);
  // The grid caches previews by storage path: it must get the cropped file.
  expect(cachedItems()[0]).toMatchObject({ image_url: CROPPED_PATH, imageUri: CROPPED.uri });
  expect(api.removeClosetPhoto).not.toHaveBeenCalled();
});

it('leaves photos without a face alone', async () => {
  tagger.suggestItemTags.mockResolvedValue(suggestion(null));
  await renderScreen();

  expect(await screen.findByTestId('new-item-suggested')).toBeTruthy();
  expect(screen.queryByText(/cropped out a face/)).toBeNull();
  expect(api.cropFaceFromPhoto).not.toHaveBeenCalled();

  await fireEvent.press(saveButton());
  await waitFor(() => expect(api.insertClosetItem).toHaveBeenCalled());
  expect(api.insertClosetItem.mock.calls[0][1]).toBe(ORIGINAL);
  expect(cachedItems()[0]).toMatchObject({ imageUri: 'file://picked.jpg' });
});

it('keeps the original and still lets the user save when the crop upload fails', async () => {
  tagger.suggestItemTags.mockResolvedValue(suggestion(FACE));
  api.cropFaceFromPhoto.mockResolvedValue(CROPPED);
  api.replaceClosetPhoto.mockRejectedValue(new Error('offline'));
  await renderScreen();

  expect(await screen.findByTestId('new-item-suggested')).toBeTruthy();
  await waitFor(() => expect(saveButton()).toBeEnabled());
  expect(screen.queryByText(/cropped out a face/)).toBeNull();

  await fireEvent.press(saveButton());
  await waitFor(() => expect(api.insertClosetItem).toHaveBeenCalled());
  expect(api.insertClosetItem.mock.calls[0][1]).toBe(ORIGINAL);
});

it('removes the cropped upload when the user leaves mid-crop', async () => {
  tagger.suggestItemTags.mockResolvedValue(suggestion(FACE));
  const crop = deferred<LocalPhoto | null>();
  api.cropFaceFromPhoto.mockReturnValue(crop.promise);
  api.replaceClosetPhoto.mockResolvedValue(CROPPED_PATH);
  const view = await renderScreen();
  await screen.findByTestId('new-item-cropping');

  await view.unmount();
  // Unmount cleanup discards the draft it knows about…
  expect(api.removeClosetPhoto).toHaveBeenCalledWith(ORIGINAL);
  await act(async () => crop.resolve(CROPPED));
  // …and the crop, finishing late, doesn't leave its new file behind.
  await waitFor(() => expect(api.removeClosetPhoto).toHaveBeenCalledWith(CROPPED_PATH));
});
