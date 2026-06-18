-- Weekly recipe pool: ~7 recipes per slot per week
create table week_pool (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  slot text not null check (slot in ('breakfast','lunch','dinner','kid')),
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (household_id, recipe_id, slot, week_start)
);

create index week_pool_household_week_idx on week_pool (household_id, week_start);

alter table week_pool enable row level security;

create policy "week_pool read" on week_pool for select
  using (household_id = current_household_id());
create policy "week_pool insert" on week_pool for insert
  with check (household_id = current_household_id());
create policy "week_pool delete" on week_pool for delete
  using (household_id = current_household_id());

-- Daily picks: one recipe per slot per day (the nightly "lock in tomorrow" result)
create table daily_picks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  slot text not null check (slot in ('breakfast','lunch','dinner','kid-lunch','kid-snack')),
  pick_date date not null,
  created_at timestamptz not null default now(),
  unique (household_id, slot, pick_date)
);

create index daily_picks_household_date_idx on daily_picks (household_id, pick_date);

alter table daily_picks enable row level security;

create policy "daily_picks read" on daily_picks for select
  using (household_id = current_household_id());
create policy "daily_picks insert" on daily_picks for insert
  with check (household_id = current_household_id());
create policy "daily_picks delete" on daily_picks for delete
  using (household_id = current_household_id());
