-- 반 관리 1단계 되돌리기 (class-management-migration.sql 을 취소한다).
-- ⚠️ 반, 시간표, 반 소속 기록, 학생 상태·퇴원일·퇴원 사유가 모두 지워지고 복구되지 않는다. 다른 표와 학생 기본 정보는 그대로다.
-- 순서: 앱 코드는 그대로 둬도 된다(칸이 없으면 "반 관리 준비 중"으로 돌아감) → 백업 → 이 SQL.
-- 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 지워지지 않는다.
-- Supabase SQL Editor 에는 아래 한 줄짜리를 붙여넣어 실행한다.
--
-- begin; drop function if exists withdraw_student(uuid, date, text); drop table if exists class_students; drop table if exists class_schedules; drop table if exists classes; alter table students drop constraint if exists students_status_check; alter table students drop column if exists withdraw_note; alter table students drop column if exists withdrawn_on; alter table students drop column if exists status; commit;
--

begin;

drop function if exists withdraw_student(uuid, date, text);
drop table if exists class_students;
drop table if exists class_schedules;
drop table if exists classes;
alter table students drop constraint if exists students_status_check;
alter table students drop column if exists withdraw_note;
alter table students drop column if exists withdrawn_on;
alter table students drop column if exists status;

commit;
