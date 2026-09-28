-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- 학업관리 개편 1단계: 칸 추가만 한다. 기존 칸 삭제·이름 변경·기존 데이터 수정 없음.
--   1) vocabulary_entries.deferred_at   — '나중에 결정' 보류 표시 (확인 필요 상태에서만)
--   2) vocabulary_entries.approval_origin 값 추가 — 'legacy_review'(기존 검수 인정), 'owner_approval'(소유자 명시 승인)
--   3) exams.exam_type                  — 시험 종류 'problem' / 'word' (빈 값 허용: 비어 있으면 화면이 문항으로 추론)
-- 여러 번 실행해도 안전하다. 전체가 하나의 transaction 이라 중간에 실패하면 전부 취소된다.

begin;

-- =============================================
-- 1) 나중에 결정 (보류 표시)
-- =============================================
alter table vocabulary_entries add column if not exists deferred_at timestamptz;

-- 보류 표시는 '확인 필요(pending)' 상태에서만 있을 수 있다
alter table vocabulary_entries drop constraint if exists vocabulary_entries_deferred_pending_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_deferred_pending_check
  check (deferred_at is null or status = 'pending');

-- =============================================
-- 2) 승인 경로 값 추가
--    처음 만든 값 목록 검사('individual','batch')가 남아 있으면 지우고, 4개 값 목록으로 다시 만든다.
--    "승인/아카이브면 승인 경로 필수" 검사(vocabulary_entries_approval_origin_check)는 그대로 둔다.
-- =============================================
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'vocabulary_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%approval_origin%'
      and pg_get_constraintdef(oid) like '%''batch''%'
      and pg_get_constraintdef(oid) not like '%legacy_review%'
  loop
    execute format('alter table vocabulary_entries drop constraint %I', c.conname);
  end loop;
end $$;

alter table vocabulary_entries drop constraint if exists vocabulary_entries_approval_origin_values_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_approval_origin_values_check
  check (approval_origin is null or approval_origin in ('individual', 'batch', 'legacy_review', 'owner_approval'));

-- =============================================
-- 3) 시험 종류
-- =============================================
alter table exams add column if not exists exam_type text;

alter table exams drop constraint if exists exams_exam_type_check;
alter table exams
  add constraint exams_exam_type_check
  check (exam_type is null or exam_type in ('problem', 'word'));

commit;

-- 실행 후 확인 (결과 3줄이 나오면 성공)
select 'vocabulary_entries.deferred_at' as added, count(*) filter (where deferred_at is not null) as non_null from vocabulary_entries
union all
select 'exams.exam_type', count(*) filter (where exam_type is not null) from exams
union all
select 'approval_origin_values_check', count(*) from pg_constraint where conname = 'vocabulary_entries_approval_origin_values_check';
