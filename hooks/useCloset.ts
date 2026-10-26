import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { suggestItemTags } from '@/services/ai';
import {
  deleteClosetItem,
  fetchClosetItems,
  insertClosetItem,
  removeClosetPhoto,
  updateClosetItem,
  uploadClosetPhoto,
  type ClosetItem,
  type ItemTags,
  type LocalPhoto,
} from '@/services/closet';
import { useAuthStore } from '@/store/useAuthStore';
import {
  patchItem,
  prependItem,
  removeItem,
  replaceItem,
} from '@/utils/closet';

/**
 * Query keys are scoped by user so a persisted cache can never show one
 * account's closet to another on a shared device.
 */
export const closetKeys = {
  all: ['closet'] as const,
  items: (userId: string | null) => ['closet', userId, 'items'] as const,
};

/** Mutation keys — the Closet screen watches these to surface failures. */
export const closetMutationKeys = {
  add: ['closet', 'add'] as const,
  update: ['closet', 'update'] as const,
  remove: ['closet', 'remove'] as const,
};

export interface AddItemVariables {
  photo: LocalPhoto;
  imagePath: string;
  tags: ItemTags;
}
export interface UpdateItemVariables {
  item: ClosetItem;
  tags: ItemTags;
}
export interface DeleteItemVariables {
  item: ClosetItem;
}

function useUserId(): string | null {
  return useAuthStore((s) => s.user?.id ?? null);
}

function byNewest(a: ClosetItem, b: ClosetItem): number {
  return b.created_at.localeCompare(a.created_at);
}

/**
 * Every wardrobe item for the signed-in user, newest first. Persisted to
 * AsyncStorage (app/_layout.tsx), so the closet is readable offline and
 * renders instantly on cold start while a background refetch runs.
 */
export function useClosetItems() {
  const userId = useUserId();
  return useQuery({
    queryKey: closetKeys.items(userId),
    queryFn: () => fetchClosetItems(userId as string),
    enabled: userId !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

/** One item, read straight from the list cache (works offline). */
export function useClosetItem(id: string | undefined) {
  const query = useClosetItems();
  return {
    ...query,
    item: id ? query.data?.find((i) => i.id === id) : undefined,
  };
}

async function settle(queryClient: QueryClient, userId: string | null) {
  await queryClient.invalidateQueries({ queryKey: closetKeys.items(userId) });
}

export function useAddClosetItem() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const key = closetKeys.items(userId);

  return useMutation({
    mutationKey: closetMutationKeys.add,
    mutationFn: ({ imagePath, tags }: AddItemVariables) => {
      if (!userId) throw new Error('Sign in to save items.');
      return insertClosetItem(userId, imagePath, tags);
    },
    onMutate: async ({ photo, imagePath, tags }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const tempId = `temp-${Date.now()}`;
      queryClient.setQueryData<ClosetItem[]>(key, (list) =>
        prependItem(list, {
          id: tempId,
          user_id: userId ?? '',
          image_url: imagePath,
          created_at: new Date().toISOString(),
          ...tags,
          imageUri: photo.uri,
          pending: true,
        }),
      );
      return { tempId };
    },
    onSuccess: (row, { photo }, context) => {
      // Keep the local file as the preview until the refetch brings a signed
      // URL — the card caches by storage path, so nothing re-downloads.
      queryClient.setQueryData<ClosetItem[]>(key, (list) =>
        replaceItem(list, context.tempId, { ...row, imageUri: photo.uri }),
      );
    },
    onError: (_error, _vars, context) => {
      if (context) {
        queryClient.setQueryData<ClosetItem[]>(key, (list) => removeItem(list, context.tempId));
      }
    },
    onSettled: () => settle(queryClient, userId),
  });
}

export function useUpdateClosetItem() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const key = closetKeys.items(userId);

  return useMutation({
    mutationKey: closetMutationKeys.update,
    mutationFn: ({ item, tags }: UpdateItemVariables) => updateClosetItem(item.id, tags),
    onMutate: async ({ item, tags }) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<ClosetItem[]>(key, (list) =>
        patchItem(list, item.id, { ...tags, pending: true }),
      );
    },
    onSuccess: (row, { item }) => {
      queryClient.setQueryData<ClosetItem[]>(key, (list) =>
        replaceItem(list, item.id, { ...row, imageUri: item.imageUri }),
      );
    },
    // Targeted rollback (not a whole-list snapshot) so a concurrent add or
    // delete isn't undone by this failure.
    onError: (_error, { item }) => {
      queryClient.setQueryData<ClosetItem[]>(key, (list) =>
        replaceItem(list, item.id, { ...item, pending: false }),
      );
    },
    onSettled: () => settle(queryClient, userId),
  });
}

export function useDeleteClosetItem() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const key = closetKeys.items(userId);

  return useMutation({
    mutationKey: closetMutationKeys.remove,
    mutationFn: ({ item }: DeleteItemVariables) => deleteClosetItem(item),
    onMutate: async ({ item }) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<ClosetItem[]>(key, (list) => removeItem(list, item.id));
    },
    onError: (_error, { item }) => {
      queryClient.setQueryData<ClosetItem[]>(key, (list) =>
        prependItem(list, { ...item, pending: false }).sort(byNewest),
      );
    },
    onSettled: () => settle(queryClient, userId),
  });
}

/** Draft step 1: resize + upload the picked photo. Resolves to its path. */
export function useUploadClosetPhoto() {
  const userId = useUserId();
  return useMutation({
    mutationFn: (photo: LocalPhoto) => {
      if (!userId) throw new Error('Sign in to add items.');
      return uploadClosetPhoto(userId, photo);
    },
  });
}

/** Draft step 2: AI tag suggestions for an uploaded photo (issue #9). */
export function useSuggestTags() {
  return useMutation({ mutationFn: suggestItemTags, retry: 0 });
}

/** Cleanup for drafts the user abandons after the photo was uploaded. */
export const discardDraftPhoto = removeClosetPhoto;
