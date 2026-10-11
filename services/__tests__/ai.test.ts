import { toSentence } from '@/services/ai';

jest.mock('@/services/supabase', () => ({ getSupabase: jest.fn() }));

describe('toSentence', () => {
  it.each([
    ['tagging unclear, fill in manually', 'Tagging unclear.'],
    ['tagging took too long, fill in manually', 'Tagging took too long.'],
    ['tagging is busy, try again in a minute', 'Tagging is busy, try again in a minute.'],
    ['photo too large (4MB max)', 'Photo too large (4MB max).'],
    ['Already a sentence.', 'Already a sentence.'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(toSentence(input)).toBe(expected);
  });

  it('falls back when nothing is left', () => {
    expect(toSentence('fill in manually')).toBe("Couldn't auto-tag this photo.");
  });
});
