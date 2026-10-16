import { Link, router, useLocalSearchParams } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { OutfitCard } from '@/components/outfit/OutfitCard';
import { Button } from '@/components/ui/Button';
import {
  GENERATION_STAGES,
  useOutfit,
  useOutfitContext,
  useRemoveOutfit,
  useSavedOutfit,
} from '@/hooks/useOutfit';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { showPaywall } from '@/store/usePaywallStore';
import { generationsLine } from '@/utils/subscription';

// TODO (#14): route Generate CTA here with id=new once the edge function
// lands; the local composer below swaps out without touching this screen.
export default function OutfitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';

  if (!isNew) {
    return <SavedOutfitView id={id} />;
  }
  return <GenerateFlow />;
}

function SavedOutfitView({ id }: { id: string }) {
  const { board, isLoading, isError } = useSavedOutfit(id);
  // Context only — useOutfit() would start (and spend) a new generation.
  const ctx = useOutfitContext();
  const { remove, removing: saving } = useRemoveOutfit();

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-4 px-6 pb-8 pt-12">
      <Text className="text-title-1 font-bold text-text">Outfit</Text>
      {isLoading && <LoadingCard label="Opening your look" />}
      {!isLoading && (isError || !board) && (
        <ErrorCard
          title="Couldn't open this outfit"
          message="It may have been deleted."
        />
      )}
      {!isLoading && !isError && board && (
        <>
          <OutfitCard board={board} ctx={ctx} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove this outfit"
            disabled={saving}
            onPress={async () => {
              await remove(id);
              router.back();
            }}
            className="h-11 items-center justify-center rounded-full border border-border bg-surface px-6">
            <Text className="text-headline text-text">
              {saving ? 'Removing…' : 'Remove'}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function GenerateFlow() {
  const {
    boards,
    generating,
    stage,
    emptyCloset,
    wardrobeError,
    retryLoad,
    capped,
    usage,
    plan,
    regenerateLock,
    saved,
    saving,
    save,
    unsave,
    regenerate,
    ctx,
  } = useOutfit();
  const tokens = useThemeTokens();
  const [selected, setSelected] = useState(0);
  const hero = boards[Math.min(selected, boards.length - 1)];

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-4 px-6 pb-8 pt-12">
      <Text className="text-title-1 font-bold text-text">
        Today&apos;s outfits
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <View className="rounded-full bg-surface px-3 py-1.5 shadow-sm">
          <Text className="text-caption font-medium text-text-muted">
            {Math.round(ctx.tempC)}°
          </Text>
        </View>
        <View className="rounded-full bg-surface px-3 py-1.5 shadow-sm">
          <Text className="text-caption font-medium text-text-muted">
            {ctx.dress}
          </Text>
        </View>
        <View className="rounded-full bg-surface px-3 py-1.5 shadow-sm">
          <Text className="text-caption font-medium text-text-muted">
            {ctx.mood}
          </Text>
        </View>
      </View>

      {generating && <LoadingCard label={stage} />}

      {!generating && capped && (
        <View testID="outfit-capped" className="rounded-xl bg-surface p-5 shadow-md">
          <Text accessibilityRole="header" className="text-title-3 font-semibold text-text">
            {plan.dailyGenerations === 1
              ? "You've used today's AI outfit"
              : "You've used today's AI outfits"}
          </Text>
          <Text className="mb-4 mt-1 text-footnote text-text-muted">
            {generationsLine(plan, usage)} Saved looks stay in your history.
          </Text>
          <Button
            label="See plans"
            onPress={() => showPaywall('daily_limit')}
            accessibilityHint="Compares plans with more AI outfits a day"
          />
        </View>
      )}

      {!generating && !capped && emptyCloset && (
        <View className="rounded-xl bg-surface p-5 shadow-md">
          <Text className="text-title-3 font-semibold text-text">
            Your closet is empty
          </Text>
          <Text className="mt-1 text-footnote text-text-muted">
            Add clothes to your wardrobe first — the stylist needs something
            to work with.
          </Text>
        </View>
      )}

      {!generating && !capped && !emptyCloset && wardrobeError && (
        <ErrorCard
          title="Couldn't load your wardrobe"
          message="Check your connection and try again."
          onRetry={() => retryLoad()}
        />
      )}

      {!generating && !capped && !emptyCloset && !wardrobeError && boards.length === 0 && (
        <View className="rounded-xl bg-surface p-5 shadow-md">
          <Text className="text-title-3 font-semibold text-text">
            Not enough to go on
          </Text>
          <Text className="mt-1 text-footnote text-text-muted">
            Add at least a top, a bottom and shoes to get styled boards.
          </Text>
        </View>
      )}

      {!generating && hero && (
        <>
          <OutfitCard board={hero} ctx={ctx} />
          {boards.length > 1 && (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Preview options"
              className="flex-row gap-1 rounded-full bg-border p-1">
              {boards.map((board, i) => (
                <Pressable
                  key={board.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: i === selected }}
                  accessibilityLabel={`Preview option ${i + 1}`}
                  onPress={() => setSelected(i)}
                  className={`flex-1 items-center rounded-full px-3 py-2 ${
                    i === selected ? 'bg-surface shadow-sm' : ''
                  }`}>
                  <Text
                    className={`text-footnote font-medium ${
                      i === selected ? 'text-text' : 'text-text-muted'
                    }`}>
                    Option {i + 1}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View className="gap-2">
            {saved ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unsave this outfit"
                disabled={saving}
                onPress={() => unsave(saved.id)}
                className="h-12 items-center justify-center rounded-full border border-border bg-surface px-6">
                <Text className="text-headline text-text">
                  {saving ? 'Unsaving…' : 'Saved ✓ — tap to unsave'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save this outfit"
                disabled={saving}
                onPress={() => save(hero)}
                className="h-[52px] items-center justify-center rounded-full bg-primary px-6">
                <Text className="text-headline text-white">
                  {saving ? 'Saving…' : 'Save this look'}
                </Text>
              </Pressable>
            )}
            <Pressable
              testID="outfit-regenerate"
              accessibilityRole="button"
              accessibilityLabel="Regenerate outfits"
              accessibilityHint={
                regenerateLock === 'plan'
                  ? 'Regenerate needs Plus or Pro — shows the plans'
                  : regenerateLock === 'limit'
                    ? "No AI outfits left today — shows the plans"
                    : 'Styles a fresh set of options'
              }
              onPress={() => {
                if (!regenerateLock) setSelected(0);
                regenerate();
              }}
              className="h-11 flex-row items-center justify-center gap-2 rounded-full border border-border bg-surface px-6">
              {regenerateLock && (
                <Lock size={16} strokeWidth={1.75} color={tokens.textMuted} />
              )}
              <Text className="text-headline text-text">Regenerate</Text>
              {regenerateLock === 'plan' && (
                <View className="rounded-full bg-primary-tint px-2 py-0.5">
                  <Text className="text-caption font-semibold text-primary">Plus</Text>
                </View>
              )}
            </Pressable>
            <Text testID="outfit-usage" className="text-center text-caption text-text-muted">
              {generationsLine(plan, usage)}
            </Text>
          </View>
        </>
      )}

      {!generating && (
        <Link href="/(tabs)" asChild>
          <Text className="text-center text-footnote font-medium text-primary">
            Back to today
          </Text>
        </Link>
      )}
    </ScrollView>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <View className="rounded-xl bg-surface p-5 shadow-md">
      <View className="flex-row items-center gap-3">
        <ActivityIndicator size="small" color="#5B47FB" />
        <Text className="text-headline text-text">{label}…</Text>
      </View>
      <View className="mt-4 h-24 w-full rounded-lg bg-border" />
      <View className="mt-2 flex-row gap-2">
        <View className="h-16 w-16 rounded-lg bg-border" />
        <View className="h-16 w-16 rounded-lg bg-border" />
        <View className="h-16 w-16 rounded-lg bg-border" />
      </View>
      <Text className="mt-3 text-footnote text-text-subtle">
        {GENERATION_STAGES.join(' · ')}
      </Text>
    </View>
  );
}

function ErrorCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="rounded-xl bg-surface p-5 shadow-md">
      <Text className="text-title-3 font-semibold text-text">{title}</Text>
      <Text className="mb-4 mt-1 text-footnote text-text-muted">{message}</Text>
      {onRetry && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          className="self-start rounded-full px-3 py-1.5">
          <Text className="text-callout font-medium text-primary">
            Try again
          </Text>
        </Pressable>
      )}
    </View>
  );
}
