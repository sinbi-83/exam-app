-- STEP 6 보관함 기능을 위한 DB 준비. 아직 실행하지 마세요 — 향미님이 검토 후 실행하세요.
-- Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- 기존 지문 데이터는 하나도 바꾸지 않습니다 (새 칸은 전부 기본값 false로 시작 = "보관 안 됨").
-- 여러 번 실행해도 안전합니다.
--
-- 보관 상태의 기준은 한 곳입니다.
--   - 그룹(4단계 세트): passage_groups.archived 만 본다.
--   - 단독 지문(group_id 없음): passages.archived 만 본다.
--   - 그룹에 속한 지문(school/academy/advanced/prestudy)은 자기 칸을 쓰지 않고
--     항상 부모 묶음(passage_groups.archived)을 따른다. 그래서 그 칸에 값을 직접
--     넣을 수 없도록 3번에서 DB가 막는다 (부모/자식 값이 어긋나는 사고를 원천 차단).

-- 1) 지문에 보관 칸 추가 (단독 지문 전용)
alter table passages
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

-- 2) 묶음(4단계 세트)에 보관 칸 추가 (그룹 지문의 유일한 기준)
alter table passage_groups
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

-- 3) 안전장치: 그룹에 속한 지문(group_id 있음)은 archived를 true로 저장하는 것 자체를 막는다.
--    (단독 지문은 group_id가 없으므로 이 제약과 무관하게 자유롭게 보관 가능)
alter table passages drop constraint if exists passages_grouped_archived_check;
alter table passages
  add constraint passages_grouped_archived_check
  check (group_id is null or archived = false);

-- 4) 목록 조회 속도용 색인
create index if not exists passages_archived_idx on passages (archived);
create index if not exists passage_groups_archived_idx on passage_groups (archived);
