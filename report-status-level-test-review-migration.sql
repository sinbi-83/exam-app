-- 보고서 상태 · 레벨테스트 확인 (2026-10-28, docs/dashboard-new-tables-design.md ⑤⑥): 기존 표에 칸만 더한다 (지우는 것 없음).
-- 대시보드 "처리할 일"에 확인 전 보고서 / 보낼 보고서 / 확인 안 한 레벨테스트가 나오게 한다.
-- 이 SQL 을 실행하기 전에도 앱은 그대로 동작한다 (새 칸이 없으면 상태 버튼·대시보드 항목만 안 보임).
-- Supabase SQL Editor 에는 아래 한 줄짜리를 붙여넣어 실행한다 (여러 줄 SQL 은 선택 영역 문제로 실패한 적 있음).
--
-- alter table reports add column if not exists status text not null default 'draft' check (status in ('draft', 'checked', 'sent')), add column if not exists checked_at timestamptz, add column if not exists sent_at timestamptz, add column if not exists sent_via text check (sent_via is null or sent_via in ('print', 'parent_link', 'message')); update reports set status = 'sent' where sent_at is null and status = 'draft' and created_at < now(); alter table level_test_results add column if not exists reviewed_at timestamptz; update level_test_results set reviewed_at = coalesce(updated_at, created_at) where reviewed_at is null;
--
-- 이미 있던 보고서는 이미 전달한 것으로 보고 '보냄'(방법은 비움)으로, 이미 있던 레벨테스트 결과는 '확인함'으로 둔다
-- (그러지 않으면 대시보드에 지난 보고서·결과가 전부 "처리할 일"로 쌓인다). 화면에서 언제든 되돌릴 수 있다.

alter table reports
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'checked', 'sent')),
  add column if not exists checked_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_via text
    check (sent_via is null or sent_via in ('print', 'parent_link', 'message'));

update reports set status = 'sent' where sent_at is null and status = 'draft' and created_at < now();

alter table level_test_results add column if not exists reviewed_at timestamptz;

update level_test_results set reviewed_at = coalesce(updated_at, created_at) where reviewed_at is null;
