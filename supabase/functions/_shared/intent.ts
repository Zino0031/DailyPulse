// Generation-intent arbitration (issue #44).
//
// A refresh mid-flight, a StrictMode double-effect or a client retry reaches
// generate-outfit again with the same `requestId`. This module decides whether
// that call should replay a recorded result, wait for the owning invocation,
// take over a dead one, or own the generation itself.
//
// Dependency-free (no Supabase/Deno imports) so it runs inside the edge
// function and under Jest — see __tests__/intent.test.ts. The edge function
// casts its service client to `IntentStore`.

export interface IntentRow {
  response: unknown | null;
  spent: boolean;
  created_at: string;
}

export interface IntentResult {
  data: unknown;
  error: unknown;
}

/** The slice of a Supabase service client these helpers use (stubbable). */
export interface IntentQuery extends PromiseLike<IntentResult> {
  select(columns?: string): IntentQuery;
  insert(values: Record<string, unknown>): IntentQuery;
  delete(): IntentQuery;
  eq(column: string, value: unknown): IntentQuery;
  lt(column: string, value: unknown): IntentQuery;
  maybeSingle(): PromiseLike<IntentResult>;
}

export interface IntentStore {
  from(table: string): IntentQuery;
  rpc(name: string, params: Record<string, unknown>): PromiseLike<IntentResult>;
}

export const INTENT_POLL_MS = 400;
/** ≈10s, comfortably inside the client's 25s timeout. */
export const INTENT_POLL_TRIES = 25;
/** An owner that hasn't recorded within this window is presumed dead. */
export const INTENT_STALE_MS = 90_000;
/** Retention: matches the pg_cron job in the migration. */
export const INTENT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export interface IntentDeps {
  /** Injectable so tests don't actually wait ~10s. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wait for the invocation that owns this intent to record its result, so a
 * duplicate that arrived mid-generation returns the same look for free.
 */
export async function waitForRecorded(
  store: IntentStore,
  userId: string,
  requestId: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<unknown | null> {
  for (let i = 0; i < INTENT_POLL_TRIES; i++) {
    await sleep(INTENT_POLL_MS);
    const { data } = await store
      .from('generation_requests')
      .select('response')
      .eq('user_id', userId)
      .eq('request_id', requestId)
      .maybeSingle();
    const row = data as IntentRow | null;
    if (row?.response) return row.response;
    if (!row) return null; // the owner gave up and cleaned up
  }
  return null;
}

/**
 * Claim a generation intent (issue #44).
 *
 * - completed → return its recorded response, spending nothing;
 * - in flight → wait for the owner's result (or report "still cooking");
 * - stale → the owner died; refund what it spent and take the intent over;
 * - absent → reserve it and report that this invocation owns the generation;
 * - unavailable → the table isn't deployed yet, so skip dedup entirely.
 */
export async function claimRequest(
  store: IntentStore,
  userId: string,
  requestId: string,
  deps: IntentDeps = {},
): Promise<{ recorded: unknown | null; claimed: boolean; unavailable: boolean }> {
  const sleep = deps.sleep ?? defaultSleep;

  // Opportunistic retention: drop this user's settled rows older than the
  // window. Non-fatal if the table/migration is missing.
  const { error: sweepError } = await store
    .from('generation_requests')
    .delete()
    .eq('user_id', userId)
    .lt('created_at', new Date(Date.now() - INTENT_RETENTION_MS).toISOString());
  if (sweepError) console.warn('[generate-outfit] retention sweep', sweepError);

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error: readError } = await store
      .from('generation_requests')
      .select('response, spent, created_at')
      .eq('user_id', userId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (readError) {
      console.error('[generate-outfit] intent read', readError);
      return { recorded: null, claimed: false, unavailable: true };
    }
    const row = data as IntentRow | null;

    if (row?.response) return { recorded: row.response, claimed: false, unavailable: false };

    if (!row) {
      const { error: insertError } = await store
        .from('generation_requests')
        .insert({ user_id: userId, request_id: requestId, response: null, spent: false });
      const code = (insertError as { code?: string } | null)?.code;
      if (!insertError) return { recorded: null, claimed: true, unavailable: false };
      // 23505 = lost the insert race → re-read and replay/wait. Anything else
      // (e.g. the migration isn't applied) → generate without dedup.
      if (code !== '23505') {
        console.error('[generate-outfit] intent reserve', insertError);
        return { recorded: null, claimed: false, unavailable: true };
      }
      continue;
    }

    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > INTENT_STALE_MS) {
      // Take the stale reservation over by deleting the exact row we read. Two
      // duplicates racing here would otherwise both refund (a free generation);
      // conditioning the delete on `created_at` means only the winner removes a
      // row, and a duplicate that already took over keeps its fresh row (#44).
      const { data: removedData, error: takeError } = await store
        .from('generation_requests')
        .delete()
        .eq('user_id', userId)
        .eq('request_id', requestId)
        .eq('created_at', row.created_at)
        .select('request_id');
      if (takeError) {
        console.error('[generate-outfit] intent takeover', takeError);
        return { recorded: null, claimed: false, unavailable: true };
      }
      if (((removedData as unknown[] | null)?.length ?? 0) > 0) {
        // Only hand back a generation if it was spent today — refund_generation
        // credits the current UTC day, and an older row's budget is long gone
        // (usage is reset per day).
        const today = new Date().toISOString().slice(0, 10);
        if (row.spent && String(row.created_at).slice(0, 10) === today) {
          await store.rpc('refund_generation', { p_user: userId });
        }
      }
      continue;
    }

    const recorded = await waitForRecorded(store, userId, requestId, sleep);
    return { recorded, claimed: false, unavailable: false };
  }
  return { recorded: null, claimed: false, unavailable: false };
}
