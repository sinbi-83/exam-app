-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.

create table if not exists exam_sheets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid, -- 나중에 로그인 기능 붙일 때 사용, 지금은 비워둠 (nullable)
  title text,
  style_preset text,
  style_params jsonb,
  grade_level text,
  question_config jsonb,
  questions_data jsonb
);

-- 혹시 테이블이 이미 있었다면(과거 버전), 누락된 컬럼만 추가
alter table exam_sheets
  add column if not exists user_id uuid,
  add column if not exists style_preset text,
  add column if not exists style_params jsonb,
  add column if not exists grade_level text,
  add column if not exists question_config jsonb,
  add column if not exists questions_data jsonb,
  add column if not exists title text;

-- RLS(행 단위 보안)는 켜두되, 지금은 개인용이라 누구나(anon key로) 읽고 쓸 수 있게 허용
alter table exam_sheets enable row level security;

drop policy if exists "Allow all for now" on exam_sheets;
create policy "Allow all for now"
  on exam_sheets
  for all
  using (true)
  with check (true);
