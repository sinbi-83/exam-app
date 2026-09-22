-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- STEP 6-B: 보관함(아카이브) 기능을 위한 준비.
-- 기존 데이터는 하나도 바꾸지 않는다 (archived 없는 기존 행은 모두 archived = false / archived_at = null 로 채워진다).
-- 여러 번 실행해도 안전하다.

-- 1) 그룹 보관 상태
alter table passage_groups
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

-- 2) 단독 지문(및 그룹 자식 passage 모두 컬럼은 생김) 보관 상태
alter table passages
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

-- 3) 그룹에 속한 passage(학교형/일반학원형/상위학원형/선행형)는
--    개별적으로 archived = true 가 될 수 없다. 보관은 항상 부모 그룹 단위.
alter table passages drop constraint if exists passages_group_archived_check;
alter table passages
  add constraint passages_group_archived_check
  check (group_id is null or archived = false);

-- 4) archived 와 archived_at 이 서로 어긋나지 않도록 강제한다.
--    archived = false 이면 archived_at 은 반드시 null,
--    archived = true 이면 archived_at 은 반드시 값이 있어야 한다.
--    (그룹 자식 passage는 3번 제약으로 항상 archived=false 이므로, 이 제약과 함께
--     archived_at 도 항상 null 로 강제된다.)
alter table passage_groups drop constraint if exists passage_groups_archived_pair_check;
alter table passage_groups
  add constraint passage_groups_archived_pair_check
  check ((archived = false and archived_at is null) or (archived = true and archived_at is not null));

alter table passages drop constraint if exists passages_archived_pair_check;
alter table passages
  add constraint passages_archived_pair_check
  check ((archived = false and archived_at is null) or (archived = true and archived_at is not null));

-- 5) 목록에서 archived 로 필터할 때 쓰는 색인
create index if not exists passage_groups_archived_idx on passage_groups (archived);
create index if not exists passages_archived_idx on passages (archived);
