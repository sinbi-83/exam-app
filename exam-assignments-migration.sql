-- 시험 응시 대상 (2026-10-28, docs/dashboard-new-tables-design.md ④): 새 표만 추가한다 (기존 표는 바꾸지 않음).
-- 시험(exams)마다 볼 학생을 정해 두면, 성적(exam_results)이 아직 없는 학생을 "채점 대기"로 센다.
-- 채점 여부는 따로 저장하지 않고 같은 시험·학생의 성적 기록이 있는지로 판단한다 (성적을 지우면 다시 채점 대기).
-- 이 SQL 을 실행하기 전에도 앱은 그대로 동작한다 (응시 대상 고르기·채점 대기만 안 보임).
-- Supabase SQL Editor 에는 아래 한 줄짜리를 붙여넣어 실행한다 (여러 줄 SQL 은 선택 영역 문제로 실패한 적 있음).
--
-- create table if not exists exam_assignments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, exam_id uuid not null references exams(id) on delete cascade, student_id uuid not null references students(id) on delete cascade, absent boolean not null default false, created_at timestamptz not null default now(), unique (exam_id, student_id)); alter table exam_assignments enable row level security; drop policy if exists "exam_assignments_own" on exam_assignments; create policy "exam_assignments_own" on exam_assignments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--

create table if not exists exam_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  absent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

alter table exam_assignments enable row level security;

drop policy if exists "exam_assignments_own" on exam_assignments;
create policy "exam_assignments_own"
  on exam_assignments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
