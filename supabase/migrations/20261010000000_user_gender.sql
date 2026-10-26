-- Epic 5 follow-up: stylist needs the wearer's gender for cuts/fits.
-- Safe additive migration (default covers pre-existing rows).

alter table public.users
  add column if not exists gender text not null default 'prefer_not_to_say'
    check (gender in ('female', 'male', 'nonbinary', 'prefer_not_to_say'));
