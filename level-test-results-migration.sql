-- 레벨테스트 응시 결과 (2026-10-25): 새 표만 추가한다 (기존 표는 바꾸지 않음).
-- 시험지 내용은 data/level-tests/*.json 에 있고, 여기에는 응시 결과(학생 답·점수·추천 반)만 저장한다.
-- Supabase SQL Editor 에는 아래 한 줄짜리를 붙여넣어 실행한다 (여러 줄 SQL 은 선택 영역 문제로 실패한 적 있음).
--
-- create table if not exists level_test_results (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, test_id text not null, grade text not null, form text not null, student_id uuid references students(id) on delete set null, student_name text not null, mode text not null default 'paper', answers jsonb not null default '{}'::jsonb, overrides jsonb not null default '{}'::jsonb, score jsonb not null default '{}'::jsonb, recommendation jsonb not null default '{}'::jsonb, memo text, taken_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()); alter table level_test_results enable row level security; drop policy if exists "level_test_results_own" on level_test_results; create policy "level_test_results_own" on level_test_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- answers   = { "v1": 0, "w2": "book", … }  (객관식은 보기 번호 0~3, 쓰기는 쓴 글자)
-- overrides = { "w2": true }                (쓰기 문항을 선생님이 맞음/틀림으로 바꾼 것)
-- score / recommendation = types/levelTest.ts 의 LevelTestScore / LevelTestRecommendation

create table if not exists level_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id text not null,
  grade text not null,
  form text not null,
  student_id uuid references students(id) on delete set null,
  student_name text not null,
  mode text not null default 'paper',
  answers jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  score jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  memo text,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table level_test_results enable row level security;

drop policy if exists "level_test_results_own" on level_test_results;
create policy "level_test_results_own"
  on level_test_results
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
