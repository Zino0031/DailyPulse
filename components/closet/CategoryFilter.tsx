import { ScrollView } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { CATEGORIES, CATEGORY_LABEL } from '@/constants/wardrobe';
import type { CategoryFilter as Filter } from '@/utils/closet';

interface CategoryFilterProps {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (next: Filter) => void;
}

const OPTIONS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...CATEGORIES.map((id) => ({ id, label: CATEGORY_LABEL[id].many })),
];

/** Single-select category chips with live counts; scrolls on narrow screens. */
export function CategoryFilter({ value, counts, onChange }: CategoryFilterProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Filter by category"
      contentContainerClassName="gap-2 px-6 py-1">
      {OPTIONS.map((option) => (
        <Chip
          key={option.id}
          testID={`closet-filter-${option.id}`}
          role="radio"
          label={option.label}
          count={counts[option.id]}
          selected={value === option.id}
          onPress={() => onChange(option.id)}
          accessibilityHint={
            option.id === 'all' ? 'Shows every item' : `Shows only ${option.label.toLowerCase()}`
          }
        />
      ))}
    </ScrollView>
  );
}
