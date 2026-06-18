-- Pantry items: household staples with status tracking
create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  status text not null default 'good' check (status in ('good', 'low', 'out')),
  created_at timestamptz not null default now(),
  unique (household_id, lower(name))
);

create index pantry_items_household_idx on pantry_items (household_id);

alter table pantry_items enable row level security;

create policy "pantry_items read" on pantry_items for select
  using (household_id = current_household_id());
create policy "pantry_items insert" on pantry_items for insert
  with check (household_id = current_household_id());
create policy "pantry_items update" on pantry_items for update
  using (household_id = current_household_id());
create policy "pantry_items delete" on pantry_items for delete
  using (household_id = current_household_id());

-- Shopping checks: persisted check-offs per item per week
create table shopping_checks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item text not null,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (household_id, item, week_start)
);

create index shopping_checks_household_week_idx on shopping_checks (household_id, week_start);

alter table shopping_checks enable row level security;

create policy "shopping_checks read" on shopping_checks for select
  using (household_id = current_household_id());
create policy "shopping_checks insert" on shopping_checks for insert
  with check (household_id = current_household_id());
create policy "shopping_checks delete" on shopping_checks for delete
  using (household_id = current_household_id());
