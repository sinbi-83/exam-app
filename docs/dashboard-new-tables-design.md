# 대시보드용 새 표 설계안 (2026-10-28)

> **진행 상황**: ⑤⑥은 향미님 승인(2026-10-28)으로 앱 코드 반영 완료 → SQL 파일 `report-status-level-test-review-migration.sql`
> (SQL Editor 실행은 향미님). ①②③④는 아직 설계안만.

> 이 문서는 **설계안만** 담는다. Supabase 에는 아무것도 만들지 않았다.
> 향미님이 승인하시면 그때 `*-migration.sql` 파일로 만들고, SQL Editor 실행은 향미님이 한다.
> 기존 표를 고치는 부분(⚠️ 표시)은 기존 표 migration 이라 별도 승인이 필요하다.

## 왜 필요한가

대시보드 검토서(2026-10-27)가 원한 항목 중 **지금 자료로는 셀 수 없는 것**이 있다.

| 원하는 항목 | 지금 못 세는 이유 | 해결하는 표 |
|---|---|---|
| 반·수업별 출결 | 반 표가 없다. `attendance` 는 학생·날짜만 있고, `schedule_events` 는 학생과 연결이 없다 | ① `classes` ② `class_students` ③ `schedule_events.class_id` |
| 채점 대기 / 시험 진행 현황 | 시험(`exams`)을 누가 봐야 하는지 기록이 없다. 결과(`exam_results`)가 생겨야만 안다 | ④ `exam_assignments` |
| 보고서 확인·발송 상태 | `reports` 에 상태 칸이 없다 | ⑤ `reports` 에 상태 칸 추가 ⚠️ |
| 레벨테스트 확인 상태 | `level_test_results` 에 "선생님이 봤음" 칸이 없다 | ⑥ `level_test_results.reviewed_at` 추가 ⚠️ |

이번 설계에 넣지 않은 것: 원비 납부 기한(향미님 결정: 지금처럼 이번 달 미납만 셈), 성취도 하락(비교 기준을 먼저 정해야 함, 3차).

## 공통 규칙 (기존 표와 같음)

- 모든 표에 `user_id uuid not null references auth.users(id) on delete cascade` 를 두고 RLS 로 본인 것만 다룬다 (`auth.uid() = user_id`).
- 학생을 지워도 기록이 사라지면 안 되는 곳은 `on delete set null`, 학생에 딸린 연결은 `on delete cascade`.
- 날짜는 `date`, 시각은 기존 `schedule_events` 처럼 `text`('15:30') 로 맞춘다.

## ① classes — 반

```sql
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                 -- 예: '중2 월수금 6시반'
  grade text,                         -- 예: '중2' (students.grade 와 같은 표기)
  level_band text,                    -- 학교형/일반형/상위형/선행형/기초반 (config/levelTestBands.ts 와 같은 이름), 비워도 됨
  weekdays smallint[] not null default '{}',  -- 0=일 … 6=토
  start_time text,
  end_time text,
  active boolean not null default true,       -- 끝난 반은 지우지 않고 false
  memo text,
  created_at timestamptz not null default now()
);
alter table classes enable row level security;
create policy "classes_own" on classes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## ② class_students — 반에 속한 학생

```sql
create table if not exists class_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  joined_on date not null default current_date,
  left_on date,                       -- 반을 옮기면 날짜만 적는다 (지난 출결이 남도록)
  created_at timestamptz not null default now(),
  unique (class_id, student_id, joined_on)
);
alter table class_students enable row level security;
create policy "class_students_own" on class_students for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- 한 학생이 여러 반에 들어갈 수 있다.

## ③ schedule_events.class_id — 수업 일정과 반 연결 ⚠️ 기존 표

```sql
alter table schedule_events add column if not exists class_id uuid references classes(id) on delete set null;
```

- 비어 있어도 된다. 지금 있는 일정은 그대로 두고, 새로 만들 때만 반을 고른다.
- 이렇게 되면 대시보드에서 "오늘 수업(반) → 그 반 학생 → 오늘 `attendance`" 를 따라가 **반별 출석 ○/○명**을 셀 수 있다.

## ④ exam_assignments — 시험 응시 대상

```sql
create table if not exists exam_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  due_date date,                      -- 이날까지 봐야 함 (없어도 됨)
  status text not null default 'assigned'
    check (status in ('assigned', 'taken', 'graded', 'absent')),
  exam_result_id uuid references exam_results(id) on delete set null,  -- 채점이 끝나면 연결
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, student_id)
);
alter table exam_assignments enable row level security;
create policy "exam_assignments_own" on exam_assignments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- 대시보드 숫자:
  - **채점 대기** = `status = 'taken'` (시험은 봤지만 점수 입력 전)
  - **시험 진행** = 시험별 `graded 수 / 전체 대상 수`
  - **미응시** = `due_date < 오늘` 이면서 `status = 'assigned'`
- 반을 고르면 그 반 학생 전부를 한 번에 대상으로 넣는다 (② 사용).
- 채점 화면에서 점수를 저장하면 `graded` 로 바꾸고 `exam_result_id` 를 채운다. 앱 코드만 고치면 되고 `exam_results` 는 건드리지 않는다.

## ⑤ reports 상태 칸 ⚠️ 기존 표

```sql
alter table reports
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'checked', 'sent')),
  add column if not exists checked_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_via text
    check (sent_via is null or sent_via in ('print', 'parent_link', 'message'));
```

- 지금 있는 보고서는 이미 전달한 것으로 보고 `sent`(방법 비움)로 바꾼다. 그러지 않으면 대시보드에 지난 보고서가 전부 쌓인다. 화면에서 되돌릴 수 있다.
- 대시보드 숫자: **확인 안 한 보고서** = `draft`, **보낼 보고서** = `checked`.
- 따로 발송 기록 표를 만들지 않고 칸만 더한 이유: 보고서 하나를 여러 번 보내는 일이 드물다. 여러 번 보내게 되면 그때 `report_deliveries` 표로 나눈다.

## ⑥ level_test_results.reviewed_at ⚠️ 기존 표

```sql
alter table level_test_results add column if not exists reviewed_at timestamptz;
```

- 비어 있으면 선생님이 아직 안 본 결과다. 종이 답은 선생님이 입력하므로 저장할 때 바로 채우고, 태블릿 응시만 비어 있다.
- 지금 있는 결과는 모두 확인함으로 채운다.
- 대시보드 숫자: **확인 안 한 레벨테스트** = `reviewed_at is null`. 1차 조정에서 뺀 "최근 7일 건수" 대신 이걸 쓴다.

## 만드는 순서 (추천)

1. ⑤ `reports` 상태 칸, ⑥ `reviewed_at`: 칸만 더하는 것이라 가장 간단하다. 바로 대시보드 "처리할 일"에 들어갈 수 있다.
2. ④ `exam_assignments`: 채점 대기를 셀 수 있게 된다. 반이 없어도 학생을 하나씩 골라 쓸 수 있다.
3. ①②③ 반: 반 관리 화면을 새로 만들어야 해서 가장 크다. 반이 생기면 ④에서 반을 통째로 고를 수 있다.

## 향미님 답 (2026-10-28)

1. 반: **고정된 반 위주** → ①② 설계 그대로 간다.
2. 보고서 발송: **인쇄, 학부모 조회 링크, 문자·카톡 모두 씀** → `sent_via` 값은 `'print' | 'parent_link' | 'message'` 세 가지로 정한다.
3. 순서: **⑤ 보고서 상태 · ⑥ 레벨테스트 확인부터**.

## 처음 물었던 것

1. **반**: 반이 요일·시간이 고정된 묶음인가요? (예: '중2 월수금 6시반') 아니면 학생마다 시간이 다른 개인 수업이 많은가요? 개인 수업이 많으면 ①② 대신 학생별 시간표가 맞다.
2. **보고서 발송**: 보고서를 주로 어떻게 보내시나요? (인쇄해서 전달 / 학부모 조회 링크 / 문자·카톡) `sent_via` 에 넣을 값을 정한다.
3. **순서**: 위 "만드는 순서"대로 ⑤⑥부터 시작해도 될까요?
