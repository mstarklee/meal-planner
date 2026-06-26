-- Per-person nutrition model + family scaling.
-- Existing recipes are deleted for a clean cutover to the nutrients JSON map.

-- 1. Recipes: replace flat nutrition columns with a per-person nutrients map.
delete from recipes;
alter table recipes drop column if exists calories;
alter table recipes drop column if exists protein;
alter table recipes drop column if exists fiber;
alter table recipes add column if not exists nutrients jsonb not null default '{}'::jsonb;

-- 2. Household settings: adults count + editable Adult/Kid target maps.
alter table household_settings add column if not exists adults int not null default 2;

alter table household_settings add column if not exists targets_adult jsonb not null default
  '{"calories":2000,"protein":90,"carbs":275,"healthy_fats":70,"fiber":28,"vitamin_a":900,"vitamin_c":90,"vitamin_d":20,"folate":400,"choline":550,"vitamin_b12":2.4,"iron":18,"calcium":1300,"potassium":4700,"zinc":11,"magnesium":420,"omega_3":1.6}'::jsonb;

alter table household_settings add column if not exists targets_kid jsonb not null default
  '{"calories":1400,"protein":19,"carbs":130,"healthy_fats":50,"fiber":25,"vitamin_a":400,"vitamin_c":25,"vitamin_d":15,"folate":200,"choline":250,"vitamin_b12":1.2,"iron":10,"calcium":1000,"potassium":2300,"zinc":5,"magnesium":130,"omega_3":0.9}'::jsonb;

-- Old per-nutrient columns are now redundant (targets live in the JSON maps).
alter table household_settings drop column if exists target_calories;
alter table household_settings drop column if exists target_protein;
alter table household_settings drop column if exists target_fiber;

-- 3. Replace onboarding RPC: drop the 3 nutrition params, add adults.
drop function if exists create_household_with_setup(text, text, text[], int, int, int, time, time);

create or replace function create_household_with_setup(
  p_name text,
  p_display_name text,
  p_kids text[],
  p_adults int,
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

  -- targets_adult / targets_kid use their column defaults (seeded above).
  insert into household_settings (household_id, adults, evening_reminder_time, morning_reminder_time)
    values (v_household_id, coalesce(p_adults, 2), p_evening, p_morning);

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

grant execute on function create_household_with_setup(text, text, text[], int, time, time) to authenticated;
