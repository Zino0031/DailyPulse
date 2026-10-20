import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { LookbookTile } from '@/components/outfit/LookbookTile';
import type { LookbookEntry } from '@/hooks/useLookbook';

const entry: LookbookEntry = {
  id: 'o1',
  createdAt: '2026-10-18T10:00:00.000Z',
  mood: 'relaxed',
  dressCode: 'casual',
  thumbnailUrl: 'https://signed/render.png',
  thumbnailKey: 'renders/user-1/look.png',
  itemCount: 3,
};

it('keeps delete out of the open button so web does not nest <button>', async () => {
  await render(<LookbookTile entry={entry} onOpen={jest.fn()} onDelete={jest.fn()} />);

  const open = screen.getByLabelText(/^Open saved look/);
  // react-native-web renders role="button" as a real <button>; the delete
  // action must be a sibling, never a descendant.
  expect(within(open).queryByLabelText('Delete this saved look')).toBeNull();
  expect(screen.getByLabelText('Delete this saved look')).toBeTruthy();
});

it('opens and deletes the right entry', async () => {
  const onOpen = jest.fn();
  const onDelete = jest.fn();
  await render(<LookbookTile entry={entry} onOpen={onOpen} onDelete={onDelete} />);

  await fireEvent.press(screen.getByLabelText(/^Open saved look/));
  expect(onOpen).toHaveBeenCalledWith(entry);

  await fireEvent.press(screen.getByLabelText('Delete this saved look'));
  expect(onDelete).toHaveBeenCalledWith('o1');
});
