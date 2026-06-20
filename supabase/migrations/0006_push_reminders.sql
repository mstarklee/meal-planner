-- Per-device web-push subscriptions
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index push_subscriptions_household_idx on push_subscriptions (household_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions read" on push_subscriptions for select
  using (household_id = current_household_id());
create policy "push_subscriptions insert" on push_subscriptions for insert
  with check (household_id = current_household_id());
create policy "push_subscriptions update" on push_subscriptions for update
  using (household_id = current_household_id());
create policy "push_subscriptions delete" on push_subscriptions for delete
  using (household_id = current_household_id());

-- Idempotency log so each reminder fires at most once per household/slot/day
create table reminder_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  slot text not null check (slot in ('evening', 'morning')),
  sent_on date not null,
  created_at timestamptz not null default now(),
  unique (household_id, slot, sent_on)
);

create index reminder_log_household_idx on reminder_log (household_id, sent_on);

alter table reminder_log enable row level security;

create policy "reminder_log read" on reminder_log for select
  using (household_id = current_household_id());
-- Inserts/cleanup happen via the service-role key from the cron route (bypasses RLS).

-- Household timezone (IANA name) drives local reminder times
alter table household_settings add column timezone text not null default 'UTC';
