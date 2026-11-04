-- 반 관리 1단계 되돌리기 (class-management-migration.sql 을 취소한다).
-- ⚠️ 반, 시간표, 반 소속 기록, 학생 상태·퇴원일·퇴원 사유가 모두 지워지고 복구되지 않는다. 다른 표와 학생 기본 정보는 그대로다.
-- students 의 수정 정책 update_own_students 는 일부러 지우지 않는다 (반 관리와 별개로 학생 정보 수정에 필요하다).
-- 순서: 앱 코드는 그대로 둬도 된다(칸이 없으면 "반 관리 준비 중"으로 돌아감) → 백업 → 이 SQL.
-- 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 지워지지 않는다.
-- ■ 이 SQL 은 마지막 수단이다. 문제가 생기면 먼저 docs/class-management-plan.md "6. 복구" 의 앱만 되돌리기(자료 손실 없음)를 쓴다.
-- ■ 안전장치: 반·시간표·소속 자료가 1건이라도 있거나, 재원이 아닌 학생·퇴원 기록이 있으면 오류를 내고 아무것도 지우지 않는다.
--   백업을 확인한 뒤에도 지워야 하면, 아래 한 줄의 begin; 바로 뒤에 다음을 직접 넣어 실행한다: set local class_rollback.confirm = 'backed-up';
-- Supabase SQL Editor 에는 아래 한 줄짜리를 맨 앞의 "-- " 를 빼고 붙여넣어 실행한다.
--
-- begin; do $$ declare t text; c bigint; total bigint := 0; begin if current_setting('class_rollback.confirm', true) is distinct from 'backed-up' then foreach t in array array['classes', 'class_schedules', 'class_students'] loop if to_regclass('public.' || t) is not null then execute format('select count(*) from public.%I', t) into c; total := total + c; end if; end loop; if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'status') then execute 'select count(*) from public.students where status <> ''active'' or withdrawn_on is not null or withdraw_note is not null' into c; total := total + c; end if; if total > 0 then raise exception 'class rollback blocked: % rows would be lost. Back up first; see docs/class-management-plan.md section 6', total; end if; end if; end; $$; drop function if exists withdraw_student(uuid, date, text); drop table if exists class_students; drop table if exists class_schedules; drop table if exists classes; alter table students drop constraint if exists students_status_check; alter table students drop column if exists withdraw_note; alter table students drop column if exists withdrawn_on; alter table students drop column if exists status; commit;
--

begin;

do $$ declare t text; c bigint; total bigint := 0; begin if current_setting('class_rollback.confirm', true) is distinct from 'backed-up' then foreach t in array array['classes', 'class_schedules', 'class_students'] loop if to_regclass('public.' || t) is not null then execute format('select count(*) from public.%I', t) into c; total := total + c; end if; end loop; if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'status') then execute 'select count(*) from public.students where status <> ''active'' or withdrawn_on is not null or withdraw_note is not null' into c; total := total + c; end if; if total > 0 then raise exception 'class rollback blocked: % rows would be lost. Back up first; see docs/class-management-plan.md section 6', total; end if; end if; end; $$;

drop function if exists withdraw_student(uuid, date, text);
drop table if exists class_students;
drop table if exists class_schedules;
drop table if exists classes;
alter table students drop constraint if exists students_status_check;
alter table students drop column if exists withdraw_note;
alter table students drop column if exists withdrawn_on;
alter table students drop column if exists status;

commit;
