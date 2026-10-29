-- 학교 정보 (2026-10-29): 새 표만 추가한다 (기존 표는 바꾸지 않음).
-- 지역·학교 목록과 기본정보(이름·주소·공립/사립)는 config/schools.ts 에 있고,
-- 여기에는 선생님이 화면에서 고쳐 쓰는 칸(교과서·시험 일정·평가 비율·출제 경향 등)만 저장한다.
-- 이 SQL 을 실행하기 전에도 학교 목록·상세 화면은 보인다 (칸 저장만 안 됨).
-- Supabase SQL Editor 에는 아래 한 줄짜리를 붙여넣어 실행한다 (여러 줄 SQL 은 선택 영역 문제로 실패한 적 있음).
--
-- create table if not exists school_profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, region text not null, school_slug text not null, content jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, region, school_slug)); alter table school_profiles enable row level security; drop policy if exists "school_profiles_own" on school_profiles; create policy "school_profiles_own" on school_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- content = { "textbooks": { "text": "1학년 동아(윤정미)", "status": "confirmed" }, … }  (status: confirmed=확인됨, estimated=추정, ''=표시 없음)

create table if not exists school_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  region text not null,
  school_slug text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, region, school_slug)
);

alter table school_profiles enable row level security;

drop policy if exists "school_profiles_own" on school_profiles;
create policy "school_profiles_own"
  on school_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
