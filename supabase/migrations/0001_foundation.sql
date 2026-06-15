-- Households
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles: one row per auth user, linked to a household
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now()
);

-- Kids: dynamic number per household
create table kids (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Per-household settings: nutrition targets + reminder times
create table household_settings (
  household_id uuid primary key references households(id) on delete cascade,
  target_calories int not null default 2000,
  target_protein int not null default 90,
  target_fiber int not null default 30,
  evening_reminder_time time not null default '20:00',
  morning_reminder_time time not null default '07:00'
);

-- Helper: the caller's household id
create or replace function current_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from profiles where id = auth.uid()
$$;

-- Auto-create a profile row when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- RLS
alter table households enable row level security;
alter table profiles enable row level security;
alter table kids enable row level security;
alter table household_settings enable row level security;

-- profiles: a user can read/update their own row
create policy "own profile read" on profiles for select using (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid());

-- households: members can read; any authenticated user can create; members can update
create policy "household read" on households for select using (id = current_household_id());
create policy "household insert" on households for insert with check (auth.uid() is not null);
create policy "household update" on households for update using (id = current_household_id());

-- kids: scoped to caller's household
create policy "kids read" on kids for select using (household_id = current_household_id());
create policy "kids write" on kids for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- settings: scoped to caller's household
create policy "settings read" on household_settings for select using (household_id = current_household_id());
create policy "settings write" on household_settings for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());
