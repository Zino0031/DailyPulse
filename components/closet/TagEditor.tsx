import { Sparkles } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  COLOR_LABEL,
  COLORS,
  FABRIC_LABEL,
  FABRICS,
  FORMALITIES,
  FORMALITY_HINT,
  FORMALITY_LABEL,
  PATTERN_LABEL,
  PATTERNS,
  SEASON_LABEL,
  SEASONS,
} from '@/constants/wardrobe';
import { BRAND } from '@/hooks/useThemeTokens';
import { MAX_COLORS, type TagSuggestion } from '@/supabase/functions/_shared/wardrobeTags';
import { toggleIn, type EditableTags } from '@/utils/closet';

import { ColorSwatch } from './ColorSwatch';

interface TagEditorProps {
  value: EditableTags;
  onChange: (next: EditableTags) => void;
  /** AI suggestion, if any — sections still matching it get a ✨ marker. */
  suggestion?: TagSuggestion | null;
  /** Highlights the category section when the user tried to save without it. */
  showCategoryError?: boolean;
}

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((v) => b.includes(v));
}

/** Controlled tag form shared by the add and edit screens. */
export function TagEditor({ value, onChange, suggestion, showCategoryError }: TagEditorProps) {
  const set = (patch: Partial<EditableTags>) => onChange({ ...value, ...patch });
  const colorsFull = value.colors.length >= MAX_COLORS;
  const allYear = value.season.length === SEASONS.length;

  return (
    <View className="gap-6">
      <Section
        title="Category"
        required
        hint={showCategoryError ? 'Pick a category to save this item.' : 'What kind of item is it?'}
        error={showCategoryError}
        suggested={suggestion != null && suggestion.category === value.category}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Category" className="flex-row flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              testID={`tag-category-${c}`}
              role="radio"
              label={CATEGORY_LABEL[c].one}
              selected={value.category === c}
              onPress={() => set({ category: c })}
            />
          ))}
        </View>
      </Section>

      <Section
        title="Colors"
        hint={
          colorsFull
            ? `Up to ${MAX_COLORS} colors — tap one to remove it.`
            : `Pick up to ${MAX_COLORS}, main color first.`
        }
        suggested={suggestion != null && suggestion.colors.length > 0 && sameSet(suggestion.colors, value.colors)}>
        <View className="flex-row flex-wrap gap-2">
          {COLORS.map((c) => {
            const selected = value.colors.includes(c);
            const locked = colorsFull && !selected;
            return (
              <View key={c} className={locked ? 'opacity-40' : ''}>
                <Chip
                  testID={`tag-color-${c}`}
                  label={COLOR_LABEL[c]}
                  selected={selected}
                  leading={<ColorSwatch color={c} size={12} />}
                  accessibilityHint={locked ? `Limit reached — remove a color first` : undefined}
                  onPress={() => {
                    if (!locked) set({ colors: toggleIn(value.colors, c) });
                  }}
                />
              </View>
            );
          })}
        </View>
      </Section>

      <Section
        title="Formality"
        hint={FORMALITY_HINT[value.formality]}
        suggested={suggestion != null && suggestion.formality === value.formality}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Formality" className="flex-row flex-wrap gap-2">
          {FORMALITIES.map((f) => (
            <Chip
              key={f}
              testID={`tag-formality-${f}`}
              role="radio"
              label={FORMALITY_LABEL[f]}
              selected={value.formality === f}
              accessibilityHint={FORMALITY_HINT[f]}
              onPress={() => set({ formality: f })}
            />
          ))}
        </View>
      </Section>

      <Section
        title="Seasons"
        hint={value.season.length === 0 ? 'When is it comfortable to wear?' : allYear ? 'Worn all year round.' : 'Tap to toggle seasons.'}
        suggested={suggestion != null && suggestion.season.length > 0 && sameSet(suggestion.season, value.season)}
        action={
          <Pressable
            onPress={() => set({ season: allYear ? [] : [...SEASONS] })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={allYear ? 'Clear seasons' : 'Select all seasons'}>
            <Text className="text-footnote font-medium text-primary">
              {allYear ? 'Clear' : 'All year'}
            </Text>
          </Pressable>
        }>
        <View className="flex-row flex-wrap gap-2">
          {SEASONS.map((s) => (
            <Chip
              key={s}
              testID={`tag-season-${s}`}
              label={SEASON_LABEL[s]}
              selected={value.season.includes(s)}
              onPress={() => set({ season: toggleIn(value.season, s, SEASONS) })}
            />
          ))}
        </View>
      </Section>

      <OptionalPick
        title="Fabric"
        unsetHint="Optional — what it's made of."
        options={FABRICS}
        labels={FABRIC_LABEL}
        value={value.fabric}
        onChange={(fabric) => set({ fabric })}
        suggested={suggestion != null && suggestion.fabric !== '' && suggestion.fabric === value.fabric}
        testPrefix="tag-fabric"
      />

      <OptionalPick
        title="Pattern"
        unsetHint="Optional — the main print or texture."
        options={PATTERNS}
        labels={PATTERN_LABEL}
        value={value.pattern}
        onChange={(pattern) => set({ pattern })}
        suggested={suggestion != null && suggestion.pattern !== '' && suggestion.pattern === value.pattern}
        testPrefix="tag-pattern"
      />
    </View>
  );
}

/** Optional single choice; tapping the selected chip again clears it. */
function OptionalPick<T extends string>({
  title,
  unsetHint,
  options,
  labels,
  value,
  onChange,
  suggested,
  testPrefix,
}: {
  title: string;
  unsetHint: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | '';
  onChange: (next: T | '') => void;
  suggested: boolean;
  testPrefix: string;
}) {
  return (
    <Section
      title={title}
      hint={value === '' ? unsetHint : `${labels[value]} — tap it again to clear.`}
      suggested={suggested}>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option}
            testID={`${testPrefix}-${option}`}
            role="radio"
            label={labels[option]}
            selected={value === option}
            accessibilityHint={value === option ? 'Tap to clear' : undefined}
            onPress={() => onChange(value === option ? '' : option)}
          />
        ))}
      </View>
    </Section>
  );
}

function Section({
  title,
  hint,
  required,
  error,
  suggested,
  action,
  children,
}: {
  title: string;
  hint: string;
  required?: boolean;
  error?: boolean;
  suggested?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View>
      <View className="mb-1 flex-row items-center gap-2">
        <Text accessibilityRole="header" className="text-headline text-text">
          {title}
          {required ? <Text className="text-danger"> *</Text> : null}
        </Text>
        {suggested && (
          <View
            accessibilityLabel="Suggested by AI"
            className="flex-row items-center gap-1 rounded-full bg-primary-tint px-2 py-0.5">
            <Sparkles size={12} strokeWidth={1.75} color={BRAND.primary} />
            <Text className="text-caption font-medium text-primary">AI suggested</Text>
          </View>
        )}
        <View className="flex-1" />
        {action}
      </View>
      <Text
        accessibilityLiveRegion={error ? 'polite' : 'none'}
        className={`mb-3 text-footnote ${error ? 'text-danger' : 'text-text-muted'}`}>
        {hint}
      </Text>
      {children}
    </View>
  );
}
