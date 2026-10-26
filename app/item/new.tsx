import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ItemForm } from '@/components/closet/ItemForm';
import { StatusNote } from '@/components/closet/StatusNote';
import { TagEditor } from '@/components/closet/TagEditor';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/Sheet';
import {
  discardDraftPhoto,
  useAddClosetItem,
  useSuggestTags,
  useUploadClosetPhoto,
} from '@/hooks/useCloset';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import {
  cropFaceFromPhoto,
  replaceClosetPhoto,
  type LocalPhoto,
} from '@/services/closet';
import type { TagSuggestion } from '@/supabase/functions/_shared/wardrobeTags';
import { EMPTY_TAGS, tagsEqual, type EditableTags } from '@/utils/closet';
import { friendlyError } from '@/utils/errors';

type Field = keyof EditableTags;

/**
 * Add flow: the photo uploads the moment this screen opens, then `tag-item`
 * suggests tags (issue #9). Suggestions only fill fields the user hasn't
 * touched yet, and everything stays editable before saving.
 */
export default function NewItemScreen() {
  const { uri, width, height } = useLocalSearchParams<{
    uri?: string;
    width?: string;
    height?: string;
  }>();
  const photo = useMemo<LocalPhoto | null>(
    () => (uri ? { uri, width: Number(width) || 0, height: Number(height) || 0 } : null),
    [uri, width, height],
  );

  const upload = useUploadClosetPhoto();
  const tagger = useSuggestTags();
  const add = useAddClosetItem();

  const [tags, setTags] = useState<EditableTags>(EMPTY_TAGS);
  const [suggestion, setSuggestion] = useState<TagSuggestion | null>(null);
  /** Face-cropped copy of `photo`, once the privacy crop has replaced it. */
  const [cropped, setCropped] = useState<LocalPhoto | null>(null);
  const [cropping, setCropping] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const touched = useRef(new Set<Field>());
  const imagePath = useRef<string | null>(null);
  const saved = useRef(false);
  const mounted = useRef(true);

  const guard = useDiscardGuard(!tagsEqual(tags, EMPTY_TAGS));

  // `mutate*` functions are stable; the result objects are not.
  const { mutateAsync: uploadPhoto } = upload;
  const { mutate: requestTags } = tagger;

  // Privacy (issue #35): a face the tagger found near the top is cropped
  // out and the stored draft is swapped for the cropped file before Save
  // is offered, so no face reaches the closet. Failures keep the original —
  // cropping must never block saving.
  const cropFace = useCallback(
    async (path: string, face: NonNullable<TagSuggestion['face']>) => {
      if (!photo) return;
      setCropping(true);
      try {
        const next = await cropFaceFromPhoto(photo.uri, face);
        if (!next) return;
        const newPath = await replaceClosetPhoto(path, next.uri);
        // Left mid-crop: the unmount cleanup only knew the old path.
        if (!mounted.current) return void discardDraftPhoto(newPath);
        imagePath.current = newPath;
        setCropped(next);
      } catch {
        // Keep the original photo.
      } finally {
        if (mounted.current) setCropping(false);
      }
    },
    [photo],
  );

  const runTagger = useCallback(
    (path: string) => {
      requestTags(path, {
        onSuccess: (s) => {
          if (!mounted.current) return;
          setSuggestion(s);
          // Fill only the fields the user hasn't touched yet.
          setTags((current) => {
            const next = { ...current };
            for (const field of Object.keys(next) as Field[]) {
              if (!touched.current.has(field)) Object.assign(next, { [field]: s[field] });
            }
            return next;
          });
          if (s.face) void cropFace(path, s.face);
        },
      });
    },
    [requestTags, cropFace],
  );

  const startUpload = useCallback(() => {
    if (!photo) return;
    // mutateAsync (not mutate callbacks) so we still hear back after an
    // unmount — a user who leaves mid-upload mustn't leave an orphan behind.
    uploadPhoto(photo)
      .then((path) => {
        if (!mounted.current) return void discardDraftPhoto(path);
        imagePath.current = path;
        runTagger(path);
      })
      .catch(() => {
        // Surfaced via `upload.isError` with a Retry action.
      });
  }, [photo, uploadPhoto, runTagger]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!saved.current && imagePath.current) void discardDraftPhoto(imagePath.current);
    };
  }, []);

  // One upload per screen, even under StrictMode's double effects.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startUpload();
  }, [startUpload]);

  const onChange = (next: EditableTags) => {
    (Object.keys(next) as Field[]).forEach((field) => {
      if (next[field] !== tags[field]) touched.current.add(field);
    });
    setTags(next);
  };

  const onSave = () => {
    setTriedSave(true);
    if (!photo || cropping || !imagePath.current || !tags.category) return;
    saved.current = true;
    add.mutate({
      // The cropped file doubles as the grid preview, which is cached on
      // disk by storage path — the original must never land in that cache.
      photo: cropped ?? photo,
      imagePath: imagePath.current,
      tags: { ...tags, category: tags.category },
    });
    guard.leave();
  };

  if (!photo) {
    return (
      <ItemForm
        imageUri={null}
        imageLabel="No photo selected"
        status={<StatusNote tone="error" message="No photo was selected. Go back and pick one." />}
        footer={<Button label="Back to closet" className="flex-1" onPress={guard.leave} />}>
        {null}
      </ItemForm>
    );
  }

  const uploading = upload.isPending;
  const faceNote = cropped ? ' We cropped out a face to keep your closet private.' : '';

  return (
    <>
      <Stack.Screen options={{ title: 'New item' }} />
      <ItemForm
        imageUri={cropped?.uri ?? photo.uri}
        imageLabel="Photo of the new item"
        status={
          upload.isError ? (
            <StatusNote
              tone="error"
              testID="new-item-upload-error"
              message={friendlyError(upload.error, "Couldn't upload your photo.")}
              action={{ label: 'Retry', onPress: startUpload, hint: 'Uploads the photo again' }}
            />
          ) : uploading ? (
            <StatusNote tone="busy" message="Uploading your photo…" />
          ) : tagger.isPending ? (
            <StatusNote tone="busy" message="Suggesting tags… you can start picking them yourself." />
          ) : cropping ? (
            <StatusNote
              tone="busy"
              testID="new-item-cropping"
              message="Cropping a face out of your photo for privacy…"
            />
          ) : tagger.isError ? (
            <StatusNote
              tone="error"
              testID="new-item-tag-error"
              message={`${friendlyError(tagger.error, "Couldn't suggest tags.")} Pick them below.`}
              action={
                upload.data
                  ? {
                      label: 'Retry',
                      onPress: () => runTagger(upload.data),
                      hint: 'Asks for tag suggestions again',
                    }
                  : undefined
              }
            />
          ) : suggestion ? (
            <StatusNote
              tone="ai"
              testID="new-item-suggested"
              message={`Tags suggested from your photo — review and adjust anything.${faceNote}`}
            />
          ) : null
        }
        footer={
          <Button
            testID="new-item-save"
            label={uploading ? 'Uploading photo…' : cropping ? 'Preparing photo…' : 'Save to closet'}
            loading={uploading || cropping}
            // Stays tappable without a category so the tap explains what's missing.
            disabled={!upload.isSuccess || cropping}
            size="lg"
            className="flex-1"
            onPress={onSave}
            accessibilityHint={
              !upload.isSuccess
                ? 'Available once the photo has uploaded'
                : cropping
                  ? 'Available once the face is cropped out of your photo'
                  : !tags.category
                  ? 'Pick a category first'
                  : 'Adds this item to your closet'
            }
          />
        }>
        <TagEditor
          value={tags}
          onChange={onChange}
          suggestion={suggestion}
          showCategoryError={triedSave && !tags.category}
        />
      </ItemForm>
      <ConfirmSheet
        visible={guard.confirmVisible}
        title="Discard this item?"
        message="Your photo and tags won't be saved."
        confirmLabel="Discard"
        destructive
        onConfirm={guard.confirmDiscard}
        onCancel={guard.keepEditing}
      />
    </>
  );
}
