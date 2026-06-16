-- Recipes: owned by a household, optionally shared to a cross-household library
create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  photo_url text not null default '',
  link_url text not null default '',
  meal_types text[] not null default '{}',
  tags text[] not null default '{}',
  calories int,
  protein int,
  fiber int,
  nutrition_estimated boolean not null default false,
  ingredients jsonb not null default '[]'::jsonb,   -- [{ "amount": "200g", "item": "chicken" }]
  steps jsonb not null default '[]'::jsonb,          -- ["Step one", "Step two"]
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create index recipes_household_idx on recipes (household_id);
create index recipes_shared_idx on recipes (is_shared) where is_shared = true;

alter table recipes enable row level security;

-- read: your household's recipes OR any shared recipe
create policy "recipes read" on recipes for select
  using (household_id = current_household_id() or is_shared = true);

-- insert: only into your own household, as yourself
create policy "recipes insert" on recipes for insert
  with check (created_by = auth.uid() and household_id = current_household_id());

-- update/delete: only the creator; an update must keep the recipe in the caller's household
create policy "recipes update" on recipes for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and household_id = current_household_id());
create policy "recipes delete" on recipes for delete
  using (created_by = auth.uid());

-- Storage bucket for recipe photos (public read, images only, 5 MB cap)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('recipe-photos', 'recipe-photos', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do nothing;

-- read is public; authenticated users may upload only into their own uid-prefixed folder
drop policy if exists "recipe photos read" on storage.objects;
create policy "recipe photos read" on storage.objects for select
  using (bucket_id = 'recipe-photos');
drop policy if exists "recipe photos insert" on storage.objects;
create policy "recipe photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
