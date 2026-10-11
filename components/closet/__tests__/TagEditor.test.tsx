import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { EMPTY_TAGS, type EditableTags } from '@/utils/closet';
import type { TagSuggestion } from '@/supabase/functions/_shared/wardrobeTags';

import { TagEditor } from '../TagEditor';

function Harness({
  initial = EMPTY_TAGS,
  suggestion = null,
  showCategoryError = false,
  onChange,
}: {
  initial?: EditableTags;
  suggestion?: TagSuggestion | null;
  showCategoryError?: boolean;
  onChange?: (t: EditableTags) => void;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <TagEditor
      value={tags}
      suggestion={suggestion}
      showCategoryError={showCategoryError}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
}

describe('TagEditor', () => {
  it('selects a single category and exposes it to screen readers', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);

    await fireEvent.press(screen.getByTestId('tag-category-shoes'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'shoes' }));
    expect(screen.getByTestId('tag-category-shoes')).toBeSelected();

    await fireEvent.press(screen.getByTestId('tag-category-top'));
    expect(screen.getByTestId('tag-category-shoes')).not.toBeSelected();
    expect(screen.getByTestId('tag-category-top')).toBeSelected();
  });

  it('caps colors at 3 and explains the limit instead of silently ignoring taps', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);

    for (const c of ['black', 'white', 'red']) {
      await fireEvent.press(screen.getByTestId(`tag-color-${c}`));
    }
    expect(screen.getByText(/Up to 3 colors — tap one to remove it/)).toBeTruthy();

    onChange.mockClear();
    await fireEvent.press(screen.getByTestId('tag-color-blue'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('tag-color-blue').props.accessibilityHint).toMatch(/remove a color first/i);

    // Removing one frees a slot again.
    await fireEvent.press(screen.getByTestId('tag-color-white'));
    await fireEvent.press(screen.getByTestId('tag-color-blue'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ colors: ['black', 'red', 'blue'] }));
  });

  it('"All year" selects every season, then clears them', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);

    await fireEvent.press(screen.getByLabelText('Select all seasons'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ season: ['spring', 'summer', 'autumn', 'winter'] }),
    );
    expect(screen.getByText('Worn all year round.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Clear seasons'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ season: [] }));
  });

  it('marks sections that still match the AI suggestion, and drops the mark once edited', async () => {
    const suggestion: TagSuggestion = {
      category: 'outerwear',
      colors: ['beige'],
      formality: 'business',
      season: ['autumn', 'winter'],
      fabric: 'wool',
      pattern: 'solid',
      face: null,
    };
    await render(<Harness initial={suggestion} suggestion={suggestion} />);
    expect(screen.getAllByLabelText('Suggested by AI')).toHaveLength(6);

    await fireEvent.press(screen.getByTestId('tag-formality-casual'));
    expect(screen.getAllByLabelText('Suggested by AI')).toHaveLength(5);
  });

  it('shows a clear category error when saving was attempted without one', async () => {
    await render(<Harness showCategoryError />);
    expect(screen.getByText('Pick a category to save this item.')).toBeTruthy();
  });

  it('explains the selected formality in plain words', async () => {
    await render(<Harness />);
    expect(screen.getByText('Everyday, relaxed wear')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tag-formality-formal'));
    expect(screen.getByText('Weddings, galas, black tie')).toBeTruthy();
  });

  it('fabric is optional: pick one, and tap it again to clear', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    expect(screen.getByText("Optional — what it's made of.")).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tag-fabric-denim'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fabric: 'denim' }));
    expect(screen.getByText('Denim — tap it again to clear.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tag-fabric-denim'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fabric: '' }));
    expect(screen.getByTestId('tag-fabric-denim')).not.toBeSelected();
  });

  it('pattern switches between options with a single selection', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('tag-pattern-striped'));
    await fireEvent.press(screen.getByTestId('tag-pattern-plaid'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pattern: 'plaid' }));
    expect(screen.getByTestId('tag-pattern-striped')).not.toBeSelected();
    expect(screen.getByText('Polka dot')).toBeTruthy();
  });
});
