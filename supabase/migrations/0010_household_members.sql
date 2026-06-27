-- supabase/migrations/0010_household_members.sql
-- Personalized per-member nutrition targets.
-- household_members replaces the kids table and the flat settings targets.
-- Clean cutover (consistent with 0009): existing kids rows are dropped.

-- 1. New members table.
create table if not exists household_members (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  name           text,
  sex            text not null check (sex in ('male','female')),
  age            int  not null check (age >= 0 and age < 130),
  weight_kg      numeric not null check (weight_kg > 0),
  activity_level text not null check (activity_level in ('sedentary','moderate','strength','fat_loss')),
  overrides      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

alter table household_members enable row level security;

create policy "household_members read" on household_members for select
  using (household_id = current_household_id());
create policy "household_members write" on household_members for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- 2. Settings: drop the flat targets + adults count (members are the source of truth now).
alter table household_settings drop column if exists targets_adult;
alter table household_settings drop column if exists targets_kid;
alter table household_settings drop column if exists adults;

-- 3. Drop the kids table (superseded by household_members; nothing FK-references it).
drop table if exists kids cascade;

-- 4. Re-sign the onboarding RPC: members come in as a jsonb array; no kids/adults params.
drop function if exists create_household_with_setup(text, text, text[], int, time, time);

create or replace function create_household_with_setup(
  p_name text,
  p_display_name text,
  p_members jsonb,
  p_evening time,
  p_morning time
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_staple text;
  v_default_staples text[] := array[
    'salt', 'sugar', 'oil', 'ghee', 'cumin', 'mustard seeds', 'turmeric',
    'chili powder', 'coriander powder', 'garam masala', 'ginger-garlic paste',
    'black pepper', 'water'
  ];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into households (name, created_by) values (p_name, auth.uid())
    returning id into v_household_id;

  update profiles set household_id = v_household_id, display_name = p_display_name
    where id = auth.uid();
  if not found then
    raise exception 'profile row missing for current user';
  end if;

  insert into household_settings (household_id, evening_reminder_time, morning_reminder_time)
    values (v_household_id, p_evening, p_morning);

  insert into household_members (household_id, name, sex, age, weight_kg, activity_level)
  select v_household_id,
         nullif(m->>'name', ''),
         m->>'sex',
         (m->>'age')::int,
         (m->>'weight_kg')::numeric,
         m->>'activity_level'
  from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as m;

  -- Seed the default staples set (preserved from migration 0008/0009).
  foreach v_staple in array v_default_staples loop
    insert into household_staples (household_id, name) values (v_household_id, v_staple)
      on conflict do nothing;
  end loop;

  return v_household_id;
end;
$$;

grant execute on function create_household_with_setup(text, text, jsonb, time, time) to authenticated;
