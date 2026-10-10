import { Stack, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { ItemForm } from '@/components/closet/ItemForm';
import { StatusNote } from '@/components/closet/StatusNote';
import { TagEditor } from '@/components/closet/TagEditor';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { CATEGORY_LABEL } from '@/constants/wardrobe';
import {
  useClosetItem,
  useDeleteClosetItem,
  useUpdateClosetItem,
} from '@/hooks/useCloset';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import type { ClosetItem } from '@/services/closet';
import { describeItem, tagsEqual, toEditableTags, type EditableTags } from '@/utils/closet';

/**
 * Edit tags / delete an item. Reads from the cached list, so it opens
 * instantly and offline. Saves and deletes are optimistic — the screen
 * closes right away and the Closet tab reports a failure if one happens.
 */
export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { item: cached, isLoading } = useClosetItem(id);
  // Frozen copy shown while the modal animates out after save/delete, so the
  // optimistic cache change never flashes "not found" on the way out.
  const [leavingWith, setLeavingWith] = useState<ClosetItem | null>(null);
  const item = leavingWith ?? cached;
  const update = useUpdateClosetItem();
  const remove = useDeleteClosetItem();

  // Untouched = mirrors the cached item (which may hydrate after first render).
  const [draft, setDraft] = useState<EditableTags | null>(null);
  const tags = draft ?? (item ? toEditableTags(item) : null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const original = item ? toEditableTags(item) : null;
  const dirty = tags !== null && original !== null && !tagsEqual(tags, original);
  const guard = useDiscardGuard(dirty);

  if (!item || !tags) {
    return (
      <ItemForm
        imageUri={null}
        imageLabel="Item not found"
        status={
          isLoading ? (
            <StatusNote tone="busy" message="Loading item…" />
          ) : (
            <StatusNote tone="error" message="This item isn't in your closet anymore." />
          )
        }
        footer={<Button label="Back to closet" className="flex-1" size="lg" onPress={guard.leave} />}>
        {null}
      </ItemForm>
    );
  }

  const onSave = () => {
    if (!tags.category) return;
    // Leave first so the closing modal never renders the optimistic change.
    setLeavingWith(item);
    guard.leave();
    update.mutate({ item, tags: { ...tags, category: tags.category } });
  };

  const onDelete = () => {
    setConfirmDelete(false);
    setLeavingWith(item);
    guard.leave();
    remove.mutate({ item });
  };

  const name = CATEGORY_LABEL[item.category].one.toLowerCase();

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${name}` }} />
      <ItemForm
        imageUri={item.imageUri}
        cacheKey={item.image_url}
        imageLabel={`Photo: ${describeItem(item)}`}
        footer={
          <>
            <Button
              testID="edit-item-delete"
              label="Delete"
              icon={Trash2}
              variant="danger"
              size="lg"
              onPress={() => setConfirmDelete(true)}
              accessibilityHint="Asks for confirmation before removing this item"
            />
            <Button
              testID="edit-item-save"
              label={dirty ? 'Save changes' : 'No changes'}
              size="lg"
              className="flex-1"
              disabled={!dirty}
              onPress={onSave}
              accessibilityHint={dirty ? 'Saves the new tags' : 'Change a tag to enable saving'}
            />
          </>
        }>
        <TagEditor value={tags} onChange={setDraft} />
      </ItemForm>
      <ConfirmSheet
        visible={confirmDelete}
        title={`Delete this ${name}?`}
        message="It will be removed from your closet and future outfit suggestions. This can't be undone."
        confirmLabel="Delete item"
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmSheet
        visible={guard.confirmVisible}
        title="Discard your changes?"
        message="The tags you changed won't be saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={guard.confirmDiscard}
        onCancel={guard.keepEditing}
      />
    </>
  );
}
