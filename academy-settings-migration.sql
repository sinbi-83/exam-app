-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- 학원 이름 + 로고/서명 이미지를 파일시스템(public/brand) 대신 DB + Storage로 옮긴다.

create table if not exists academy_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  academy_name text,
  logo_url text,
  signature_url text,
  updated_at timestamptz default now()
);

alter table academy_settings enable row level security;

drop policy if exists "academy_settings_own" on academy_settings;
create policy "academy_settings_own"
  on academy_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 로고/서명 이미지를 저장할 Storage 버킷 (한 번만 생성됨)
insert into storage.buckets (id, name, public)
values ('brand', 'brand', true)
on conflict (id) do nothing;

drop policy if exists "brand_read_public" on storage.objects;
create policy "brand_read_public"
  on storage.objects
  for select
  using (bucket_id = 'brand');

drop policy if exists "brand_write_own_folder" on storage.objects;
create policy "brand_write_own_folder"
  on storage.objects
  for insert
  with check (bucket_id = 'brand' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_update_own_folder" on storage.objects;
create policy "brand_update_own_folder"
  on storage.objects
  for update
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = auth.uid()::text);
