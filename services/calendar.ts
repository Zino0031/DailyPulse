// Dress-code tagging for calendar events (PRD §3.3).
// Pure keyword matcher — no device APIs, fully unit-testable. Epic 5 feeds
// the dominant tag into the outfit-picker prompt.

export type DressCode =
  | 'formal'
  | 'business'
  | 'casual'
  | 'athletic'
  | 'romantic';

export interface TaggedEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  allDay: boolean;
  dressCode: DressCode;
}

// Word boundaries avoid false hits (e.g. "candidate" is not a date).
const RULES: { code: DressCode; pattern: RegExp }[] = [
  {
    code: 'formal',
    pattern:
      /\b(wedding|gala|ceremony|formal|black tie|funeral|graduation|opera|theatre|theater)\b/,
  },
  {
    code: 'romantic',
    pattern: /\b(date|dinner date|anniversary|valentine|romantic)\b/,
  },
  {
    code: 'athletic',
    pattern:
      /\b(gym|workout|running|run|sport|football|soccer|basketball|tennis|yoga|swim|training|match|hike|cycling)\b/,
  },
  {
    code: 'business',
    pattern:
      /\b(meeting|interview|conference|presentation|pitch|office|work|client|board|standup|review|deadline)\b/,
  },
];

/** Derive a dress code from an event title + optional location. */
export function tagEvent(title: string, location?: string | null): DressCode {
  const haystack = `${title} ${location ?? ''}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) return rule.code;
  }
  return 'casual';
}

/** Formality order for picking the day's dominant tag (most formal wins). */
const RANK: Record<DressCode, number> = {
  formal: 4,
  business: 3,
  romantic: 2,
  athletic: 1,
  casual: 0,
};

/** Single tag summarizing a day — fed to the outfit prompt (Epic 5). */
export function dominantDressCode(events: Pick<TaggedEvent, 'dressCode'>[]): DressCode {
  let top: DressCode = 'casual';
  for (const event of events) {
    if (RANK[event.dressCode] > RANK[top]) top = event.dressCode;
  }
  return top;
}
