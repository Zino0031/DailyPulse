import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  deleteAvatar,
  fetchActiveAvatar,
  setActiveAvatar,
  uploadAvatarPhoto,
  type LocalPhoto,
} from '@/services/avatar';
import { useAuthStore } from '@/store/useAuthStore';
import type { AvatarRow } from '@/types/database';

/**
 * Query keys are scoped by user so a persisted cache can never show one
 * account's face to another on a shared device.
 */
export const avatarKeys = {
  all: ['avatar'] as const,
  active: (userId: string | null) => ['avatar', userId, 'active'] as const,
};

function useUserId(): string | null {
  return useAuthStore((s) => s.user?.id ?? null);
}

/** The signed-in user's active avatar row, or null. Cached 10 minutes. */
export function useActiveAvatar() {
  const userId = useUserId();
  return useQuery({
    queryKey: avatarKeys.active(userId),
    queryFn: () => fetchActiveAvatar(userId as string),
    enabled: userId !== null,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

async function settle(queryClient: QueryClient, userId: string | null) {
  await queryClient.invalidateQueries({ queryKey: avatarKeys.active(userId) });
}

export interface SaveAvatarVariables {
  photo: LocalPhoto;
}

/**
 * Full save pipeline: downscale + upload the selfie, then flip the active
 * row. The local file doubles as the preview until the refetch lands.
 */
export function useSaveAvatar() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const key = avatarKeys.active(userId);

  return useMutation({
    mutationKey: ['avatar', 'save'],
    mutationFn: async ({ photo }: SaveAvatarVariables): Promise<AvatarRow> => {
      if (!userId) throw new Error('Sign in to save your avatar.');
      const imageUrl = await uploadAvatarPhoto(userId, photo);
      return setActiveAvatar(userId, imageUrl);
    },
    onSuccess: (row) => {
      queryClient.setQueryData<AvatarRow | null>(key, row);
    },
    onSettled: () => settle(queryClient, userId),
  });
}

/** Removes the active avatar (row + file) with an optimistic clear. */
export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const key = avatarKeys.active(userId);

  return useMutation({
    mutationKey: ['avatar', 'remove'],
    mutationFn: (avatar: AvatarRow) => deleteAvatar(avatar),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AvatarRow | null>(key);
      queryClient.setQueryData<AvatarRow | null>(key, null);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData<AvatarRow | null>(key, context.previous ?? null);
    },
    onSettled: () => settle(queryClient, userId),
  });
}
