-- Household staples: "always available at home" ingredients that never enter the Shop list.
create table household_staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index household_staples_household_name_idx on household_staples (household_id, lower(name));
create index household_staples_household_idx on household_staples (household_id);

alter table household_staples enable row level security;

create policy "household_staples read" on household_staples for select
  using (household_id = current_household_id());
create policy "household_staples insert" on household_staples for insert
  with check (household_id = current_household_id());
create policy "household_staples delete" on household_staples for delete
  using (household_id = current_household_id());

-- Extend onboarding to seed a default staples set for new households.
create or replace function create_household_with_setup(
  p_name text,
  p_display_name text,
  p_kids text[],
  p_calories int,
  p_protein int,
  p_fiber int,
  p_evening time,
  p_morning time
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_kid text;
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

  insert into household_settings
    (household_id, target_calories, target_protein, target_fiber, evening_reminder_time, morning_reminder_time)
    values (v_household_id, p_calories, p_protein, p_fiber, p_evening, p_morning);

  if p_kids is not null then
    foreach v_kid in array p_kids loop
      if length(trim(v_kid)) > 0 then
        insert into kids (household_id, name) values (v_household_id, v_kid);
      end if;
    end loop;
  end if;

  foreach v_staple in array v_default_staples loop
    insert into household_staples (household_id, name) values (v_household_id, v_staple)
      on conflict do nothing;
  end loop;

  return v_household_id;
end;
$$;

grant execute on function create_household_with_setup(text, text, text[], int, int, int, time, time) to authenticated;
