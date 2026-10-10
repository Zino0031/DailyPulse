/** True for fetch-level failures (airplane mode, captive portal, DNS). */
export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /network request failed|failed to fetch|network ?error|load failed|timed? ?out/i.test(
    message,
  );
}

/**
 * Turns any thrown value into one calm sentence for the UI. Raw backend
 * messages (SQL, RLS, stack traces) are never shown — only our own copy or
 * messages already written for humans (e.g. from services/ai.ts).
 */
export function friendlyError(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return "You're offline — check your connection and try again.";
  if (error instanceof Error && error.name === 'Error' && /^[A-Z]/.test(error.message)) {
    const looksTechnical = /violates|constraint|policy|jwt|sql|relation|undefined|null/i.test(
      error.message,
    );
    if (!looksTechnical && error.message.length <= 120) return error.message;
  }
  return fallback;
}
