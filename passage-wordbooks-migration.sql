-- 지문 단어장 (2026-10-19): 지문(passages) 한 개당 단어장 한 개. 새 표만 추가한다 (기존 표는 바꾸지 않음).
-- Supabase SQL Editor 에는 아래 한 줄짜리를 붙여넣어 실행한다 (여러 줄 SQL 은 선택 영역 문제로 실패한 적 있음).
--
-- create table if not exists passage_wordbooks (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, passage_id uuid not null references passages(id) on delete cascade, words jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, passage_id)); alter table passage_wordbooks enable row level security; drop policy if exists "passage_wordbooks_own" on passage_wordbooks; create policy "passage_wordbooks_own" on passage_wordbooks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- words 한 칸 = [{ "word": "capital", "surface": "capital", "pos": "명", "meaning": "수도", "sentence": "Hanoi is the capital of Vietnam." }, …]
-- (types/wordbook.ts 의 WordbookWord)

create table if not exists passage_wordbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  passage_id uuid not null references passages(id) on delete cascade,
  words jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, passage_id)
);

alter table passage_wordbooks enable row level security;

drop policy if exists "passage_wordbooks_own" on passage_wordbooks;
create policy "passage_wordbooks_own"
  on passage_wordbooks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
