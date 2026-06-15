-- Ownership column on households
alter table households add column if not exists created_by uuid references auth.users(id) default auth.uid();

-- Households: only the creator may insert; readable by members OR creator
drop policy if exists "household insert" on households;
create policy "household insert" on households for insert with check (created_by = auth.uid());
drop policy if exists "household read" on households;
create policy "household read" on households for select using (id = current_household_id() or created_by = auth.uid());

-- Profiles: a user may update only their OWN row, and clients may change only display_name
-- (household_id is set exclusively by the SECURITY DEFINER onboarding function below).
drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (display_name) on profiles to authenticated;

-- Cap display_name length
alter table profiles add constraint display_name_len check (display_name is null or char_length(display_name) <= 100);

-- Transactional, RLS-safe onboarding: creates household, links profile, writes settings + kids atomically.
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

  return v_household_id;
end;
$$;

grant execute on function create_household_with_setup(text, text, text[], int, int, int, time, time) to authenticated;
