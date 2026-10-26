-- Issue #44: generation idempotency.
--
-- A refresh mid-flight, a StrictMode double-effect or a client retry used to
-- reach generate-outfit again and spend a second AI generation for what the
-- user experienced as one "Generate" tap. The client now mints one request id
-- per intent (Generate / Regenerate) and resends it across remounts.
--
-- The row doubles as the arbitration lock: `response is null` while the owning
-- invocation is still generating, so a duplicate arriving mid-flight waits for
-- the result instead of spending again. `spent` records whether the owner has
-- already consumed a generation, so a reservation left behind by a dead
-- invocation can be refunded before it is taken over.
--
-- Written by generate-outfit with the service role only — the app never reads
-- it directly, so RLS stays enabled with no policies.

create table if not exists public.generation_requests (
  user_id uuid not null references public.users (id) on delete cascade,
  request_id text not null check (char_length(request_id) between 8 and 128),
  response jsonb,
  spent boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index if not exists generation_requests_created_idx
  on public.generation_requests (created_at);

alter table public.generation_requests enable row level security;

-- Service role bypasses RLS; nobody else may touch the table.
revoke all on table public.generation_requests from anon, authenticated;
grant all on table public.generation_requests to service_role;
