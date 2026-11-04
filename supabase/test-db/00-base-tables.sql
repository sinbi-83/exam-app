-- 시험용 DB 전용. 운영 DB 에 실행하지 않는다 (직접 붙여넣지 말고 01-schema.oneline.sql 을 쓴다. 그 파일이 운영 DB 를 막아 준다).
-- 저장소에 CREATE TABLE 이 없는 표 5개 + academies + get_student_report 를 복원한다.
-- 근거:
--   [사실] 칸 이름: docs/class-management-review.md 2-2 (실제 행으로 확인)
--   [사실] 외래키·기본키·정책 이름·명령·함수 정의: 2026-11-02 운영 DB 읽기 조회 결과 CSV
--   [사실] students 정책 조건: auth.uid() = user_id, 역할 public (2026-11-02 확인)
--   [추정] 칸 타입, NOT NULL, 기본값: 코드가 넣는 값으로 판단. 운영과 다를 수 있다
--   [추정] students 외 표의 정책 조건: students 와 같은 형태로 판단
--   [모름] academies 의 칸: 코드가 쓰지 않아 id 만 둔다
-- 일부러 넣지 않은 것: students 수정 정책 (운영에 없음, class-management-migration.sql 이 추가한다)

create table academies (
  id uuid primary key default gen_random_uuid()
);
alter table academies enable row level security;

create table students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  academy_id uuid,
  name text not null,
  grade text,
  pin text,
  school_name text,
  student_phone text,
  parent_phone text,
  enrolled_at date,
  notes text,
  created_at timestamptz default now()
);
alter table students enable row level security;
create policy "select_own_students" on students for select using (auth.uid() = user_id);
create policy "insert_own_students" on students for insert with check (auth.uid() = user_id);
create policy "delete_own_students" on students for delete using (auth.uid() = user_id);

create table question_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  academy_id uuid,
  grade text,
  topic text,
  passage text,
  translation text,
  items jsonb,
  questions jsonb,
  sentences jsonb,
  essay_questions jsonb,
  summary_questions jsonb,
  reading_questions jsonb,
  created_at timestamptz default now()
);
alter table question_sets enable row level security;
create policy "본인 명의로만 추가 가능" on question_sets for insert with check (auth.uid() = user_id);
create policy "본인 문제 세트만 삭제" on question_sets for delete using (auth.uid() = user_id);
create policy "본인 문제 세트만 조회" on question_sets for select using (auth.uid() = user_id);

create table questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  academy_id uuid,
  question_set_id uuid references question_sets(id),
  question_type text,
  question_text text,
  passage_blank_text text,
  choices jsonb,
  correct_answer text,
  explanation text,
  grade text,
  topic text,
  difficulty integer,
  tags text[] default '{}',
  weakness_tags text[] default '{}',
  status text,
  review_note text,
  last_used_at timestamptz,
  usage_count integer default 0,
  essay_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table questions enable row level security;
create policy "questions_select_own" on questions for select using (auth.uid() = user_id);
create policy "questions_insert_own" on questions for insert with check (auth.uid() = user_id);
create policy "questions_update_own" on questions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "questions_delete_own" on questions for delete using (auth.uid() = user_id);

create table exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  academy_id uuid,
  title text not null,
  exam_date date,
  question_set_id uuid references question_sets(id),
  total_questions integer,
  max_score integer,
  created_at timestamptz default now()
);
alter table exams enable row level security;
create policy "exams_select_own" on exams for select using (auth.uid() = user_id);
create policy "exams_insert_own" on exams for insert with check (auth.uid() = user_id);
create policy "exams_update_own" on exams for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exams_delete_own" on exams for delete using (auth.uid() = user_id);

create table exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  student_id uuid not null references students(id) on delete cascade,
  exam_id uuid references exams(id),
  exam_title text,
  score numeric,
  max_score numeric,
  exam_date date,
  created_at timestamptz default now()
);
alter table exam_results enable row level security;
create policy "select_own_exam_results" on exam_results for select using (auth.uid() = user_id);
create policy "insert_own_exam_results" on exam_results for insert with check (auth.uid() = user_id);
create policy "delete_own_exam_results" on exam_results for delete using (auth.uid() = user_id);

-- 운영 DB 의 정의를 그대로 옮겼다 (security definer, search_path 지정 없음). 보안 개선은 docs/security-backlog.md 소관이다.
create or replace function public.get_student_report(p_student_id uuid, p_pin text)
 returns json
 language plpgsql
 security definer
as $function$
declare
  v_student record;
  v_results json;
begin
  select id, name, grade into v_student
  from students
  where id = p_student_id and pin = p_pin;

  if v_student.id is null then
    return json_build_object('found', false);
  end if;

  select json_agg(
    json_build_object(
      'exam_title', exam_title,
      'score', score,
      'max_score', max_score,
      'exam_date', exam_date
    ) order by exam_date asc
  ) into v_results
  from exam_results
  where student_id = v_student.id;

  return json_build_object(
    'found', true,
    'name', v_student.name,
    'grade', v_student.grade,
    'results', coalesce(v_results, '[]'::json)
  );
end;
$function$;
