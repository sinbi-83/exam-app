-- 반 관리 1단계 (2026-11-01, docs/class-management-plan.md): 학생 상태 칸 + 새 표 3개 + 퇴원 함수.
-- 아직 적용하지 않았다. 적용 순서: 백업 → 아래 "적용 전 확인" → 이 SQL → 확인 → 배포. 되돌리기는 class-management-rollback.sql.
-- 이 SQL 을 실행하기 전에도 앱은 그대로 동작한다 (화면에 "반 관리 준비 중(DB 적용 필요)"만 보임).
-- 기존 표 중 students 만 바꾼다 (칸 3개 추가, 기존 학생은 자동으로 재원). 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다.
--
-- ■ 적용 전 확인: students.id 를 가리키는 외래키가 실패할 수 있는지
--   [사실] 2026-11-01 학생 한 건을 읽어 확인: id 는 uuid 형식의 값이다. 다만 DB 의 칸 타입과 기본키 여부는 이 계정으로 볼 수 없다.
--   [사실] students 를 만드는 SQL 파일이 저장소에 없다. [추정] exam-assignments-migration.sql 이 같은 외래키로 적용되어 있어 기본키일 가능성이 높다.
--   기본키(또는 고유 조건)가 아니거나 uuid 타입이 아니면 이 SQL 은 외래키에서 실패한다. 먼저 아래 읽기 전용 한 줄을 SQL Editor 에서 실행한다.
--   결과가 id_type = uuid, id_is_unique = true 여야 한다. 다르면 적용하지 말고 결과를 알려 준다.
--
-- select a.atttypid::regtype as id_type, exists (select 1 from pg_constraint c where c.conrelid = 'public.students'::regclass and c.contype in ('p', 'u') and c.conkey = array[a.attnum]) as id_is_unique from pg_attribute a where a.attrelid = 'public.students'::regclass and a.attname = 'id';
--
-- ■ 정한 값
--   weekday: 1=월 ~ 7=일. target_grades: 초3~고3 코드 (lib/gradeNormalize.ts 와 같은 목록).
--   외래키는 모두 삭제 제한(RESTRICT). classes·class_students 에는 삭제 정책이 없다 (반은 종료만, 소속은 left_on 으로 기록을 남김).
--   퇴원일이 입반일보다 빠르면 그 소속의 left_on 은 입반일로 채운다 (left_on >= joined_on 검사를 지키기 위해).
--
-- Supabase SQL Editor 에는 아래 한 줄짜리를 붙여넣어 실행한다 (여러 줄 SQL 은 선택 영역 문제로 실패한 적 있음).
--
-- begin; alter table students add column if not exists status text not null default 'active'; alter table students add column if not exists withdrawn_on date; alter table students add column if not exists withdraw_note text; alter table students drop constraint if exists students_status_check; alter table students add constraint students_status_check check (status in ('active', 'paused', 'withdrawn')); create table if not exists classes ( id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict, name text not null check (length(btrim(name)) > 0), target_grades text[] not null default '{}' check (target_grades <@ array['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']::text[]), teacher_name text, status text not null default 'active' check (status in ('active', 'closed')), closed_on date, note text, created_at timestamptz not null default now(), check ((status = 'closed') = (closed_on is not null)) ); create table if not exists class_schedules ( id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict, class_id uuid not null references classes(id) on delete restrict, weekday smallint not null check (weekday between 1 and 7), start_time time not null, end_time time not null, check (end_time > start_time) ); create table if not exists class_students ( id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict, class_id uuid not null references classes(id) on delete restrict, student_id uuid not null references students(id) on delete restrict, joined_on date not null default ((now() at time zone 'Asia/Seoul')::date), left_on date, check (left_on is null or left_on >= joined_on) ); create unique index if not exists class_students_one_open on class_students (class_id, student_id) where left_on is null; create index if not exists classes_user_id_idx on classes (user_id); create index if not exists class_schedules_class_id_idx on class_schedules (class_id); create index if not exists class_students_student_id_idx on class_students (student_id); alter table classes enable row level security; alter table class_schedules enable row level security; alter table class_students enable row level security; grant select, insert, update on classes to authenticated; grant select, insert, update, delete on class_schedules to authenticated; grant select, insert, update on class_students to authenticated; drop policy if exists "classes_select_own" on classes; create policy "classes_select_own" on classes for select to authenticated using (user_id = auth.uid()); drop policy if exists "classes_insert_own" on classes; create policy "classes_insert_own" on classes for insert to authenticated with check (user_id = auth.uid()); drop policy if exists "classes_update_own" on classes; create policy "classes_update_own" on classes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid()); drop policy if exists "class_schedules_own" on class_schedules; create policy "class_schedules_own" on class_schedules for all to authenticated using (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid())) with check (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid())); drop policy if exists "class_students_select_own" on class_students; create policy "class_students_select_own" on class_students for select to authenticated using (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid())); drop policy if exists "class_students_insert_own" on class_students; create policy "class_students_insert_own" on class_students for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid())); drop policy if exists "class_students_update_own" on class_students; create policy "class_students_update_own" on class_students for update to authenticated using (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid())) with check (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid())); create or replace function withdraw_student(p_student_id uuid, p_withdrawn_on date, p_note text default null) returns integer language plpgsql security invoker set search_path = public as $$ declare closed_count integer; begin if p_withdrawn_on is null then raise exception 'withdrawn_on is required' using errcode = '22023'; end if; update students set status = 'withdrawn', withdrawn_on = p_withdrawn_on, withdraw_note = nullif(btrim(p_note), '') where id = p_student_id and user_id = auth.uid() and status <> 'withdrawn'; if not found then raise exception 'student not found or already withdrawn' using errcode = 'P0002'; end if; update class_students set left_on = greatest(joined_on, p_withdrawn_on) where student_id = p_student_id and user_id = auth.uid() and left_on is null; get diagnostics closed_count = row_count; return closed_count; end; $$; revoke all on function withdraw_student(uuid, date, text) from public, anon; grant execute on function withdraw_student(uuid, date, text) to authenticated; commit;
--

begin;

alter table students add column if not exists status text not null default 'active';
alter table students add column if not exists withdrawn_on date;
alter table students add column if not exists withdraw_note text;
alter table students drop constraint if exists students_status_check;
alter table students add constraint students_status_check check (status in ('active', 'paused', 'withdrawn'));

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  target_grades text[] not null default '{}' check (target_grades <@ array['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']::text[]),
  teacher_name text,
  status text not null default 'active' check (status in ('active', 'closed')),
  closed_on date,
  note text,
  created_at timestamptz not null default now(),
  check ((status = 'closed') = (closed_on is not null))
);

create table if not exists class_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  class_id uuid not null references classes(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table if not exists class_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  class_id uuid not null references classes(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  joined_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  left_on date,
  check (left_on is null or left_on >= joined_on)
);

create unique index if not exists class_students_one_open on class_students (class_id, student_id) where left_on is null;
create index if not exists classes_user_id_idx on classes (user_id);
create index if not exists class_schedules_class_id_idx on class_schedules (class_id);
create index if not exists class_students_student_id_idx on class_students (student_id);

alter table classes enable row level security;
alter table class_schedules enable row level security;
alter table class_students enable row level security;

grant select, insert, update on classes to authenticated;
grant select, insert, update, delete on class_schedules to authenticated;
grant select, insert, update on class_students to authenticated;

drop policy if exists "classes_select_own" on classes;
create policy "classes_select_own" on classes for select to authenticated using (user_id = auth.uid());
drop policy if exists "classes_insert_own" on classes;
create policy "classes_insert_own" on classes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "classes_update_own" on classes;
create policy "classes_update_own" on classes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "class_schedules_own" on class_schedules;
create policy "class_schedules_own" on class_schedules for all to authenticated using (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid())) with check (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()));

drop policy if exists "class_students_select_own" on class_students;
create policy "class_students_select_own" on class_students for select to authenticated using (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid()));
drop policy if exists "class_students_insert_own" on class_students;
create policy "class_students_insert_own" on class_students for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid()));
drop policy if exists "class_students_update_own" on class_students;
create policy "class_students_update_own" on class_students for update to authenticated using (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid())) with check (user_id = auth.uid() and exists (select 1 from classes c where c.id = class_id and c.user_id = auth.uid()) and exists (select 1 from students s where s.id = student_id and s.user_id = auth.uid()));

create or replace function withdraw_student(p_student_id uuid, p_withdrawn_on date, p_note text default null) returns integer language plpgsql security invoker set search_path = public as $$ declare closed_count integer; begin if p_withdrawn_on is null then raise exception 'withdrawn_on is required' using errcode = '22023'; end if; update students set status = 'withdrawn', withdrawn_on = p_withdrawn_on, withdraw_note = nullif(btrim(p_note), '') where id = p_student_id and user_id = auth.uid() and status <> 'withdrawn'; if not found then raise exception 'student not found or already withdrawn' using errcode = 'P0002'; end if; update class_students set left_on = greatest(joined_on, p_withdrawn_on) where student_id = p_student_id and user_id = auth.uid() and left_on is null; get diagnostics closed_count = row_count; return closed_count; end; $$;
revoke all on function withdraw_student(uuid, date, text) from public, anon;
grant execute on function withdraw_student(uuid, date, text) to authenticated;

commit;
