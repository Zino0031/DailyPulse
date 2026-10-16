import { useMutationState, useQueryClient, type Mutation } from '@tanstack/react-query';

import { CATEGORY_LABEL } from '@/constants/wardrobe';
import {
  closetMutationKeys,
  discardDraftPhoto,
  useAddClosetItem,
  useDeleteClosetItem,
  useUpdateClosetItem,
  type AddItemVariables,
  type DeleteItemVariables,
  type UpdateItemVariables,
} from '@/hooks/useCloset';
import { showPaywall } from '@/store/usePaywallStore';
import { friendlyError } from '@/utils/errors';
import { isClosetFullError } from '@/utils/subscription';

import { StatusNote } from './StatusNote';

type AnyMutation = Mutation<unknown, Error, unknown, unknown>;

/**
 * Optimistic saves close their modal immediately, so a later failure is
 * reported here, on the Closet screen, with the change already rolled back
 * and a one-tap retry. Reads TanStack's mutation cache — no extra store.
 */
export function ClosetMutationNotice() {
  const queryClient = useQueryClient();
  const add = useAddClosetItem();
  const update = useUpdateClosetItem();
  const remove = useDeleteClosetItem();

  const failed = useMutationState({
    filters: { mutationKey: ['closet'], status: 'error' },
    select: (mutation) => mutation as AnyMutation,
  });
  const latest = failed[failed.length - 1];
  if (!latest) return null;

  const key = latest.options.mutationKey?.[1];
  const forget = () => queryClient.getMutationCache().remove(latest);
  const variables = latest.state.variables;
  const reason = friendlyError(latest.state.error, '');

  let message: string;
  let retry: () => void;
  let onDismiss = forget;

  // The database refused the insert because the plan's closet is full —
  // retrying can't help, upgrading can.
  if (key === closetMutationKeys.add[1] && isClosetFullError(latest.state.error)) {
    const vars = variables as AddItemVariables;
    const discard = () => {
      forget();
      void discardDraftPhoto(vars.imagePath);
    };
    return (
      <StatusNote
        testID="closet-mutation-notice"
        tone="warning"
        message={`Your closet is full, so we couldn't save your ${CATEGORY_LABEL[vars.tags.category].one.toLowerCase()}.`}
        action={{
          label: 'See plans',
          hint: 'Compares plans with more closet space',
          onPress: () => {
            discard();
            showPaywall('closet_full');
          },
        }}
        onDismiss={discard}
      />
    );
  }

  if (key === closetMutationKeys.add[1]) {
    const vars = variables as AddItemVariables;
    message = `Couldn't save your ${CATEGORY_LABEL[vars.tags.category].one.toLowerCase()}.`;
    retry = () => add.mutate(vars);
    onDismiss = () => {
      forget();
      void discardDraftPhoto(vars.imagePath);
    };
  } else if (key === closetMutationKeys.update[1]) {
    const vars = variables as UpdateItemVariables;
    message = `Couldn't update your ${CATEGORY_LABEL[vars.item.category].one.toLowerCase()} — your previous tags are back.`;
    retry = () => update.mutate(vars);
  } else {
    const vars = variables as DeleteItemVariables;
    message = `Couldn't delete your ${CATEGORY_LABEL[vars.item.category].one.toLowerCase()} — it's back in your closet.`;
    retry = () => remove.mutate(vars);
  }

  return (
    <StatusNote
      testID="closet-mutation-notice"
      tone="error"
      message={reason ? `${message} ${reason}` : message}
      action={{
        label: 'Retry',
        hint: 'Tries the same change again',
        onPress: () => {
          forget();
          retry();
        },
      }}
      onDismiss={onDismiss}
    />
  );
}
