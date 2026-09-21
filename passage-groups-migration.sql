-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- 같은 주제의 난이도 4단계 지문(학교형/일반학원형/상위학원형/선행형)을 한 묶음으로 관리하기 위한 DB 준비.
-- 기존 passages 데이터는 하나도 바꾸지 않는다 (새 칸 두 개는 비어 있는 상태로 시작).
-- 여러 번 실행해도 안전하다.

-- 1) 묶음(그룹) 표: 한 주제 세트의 "표지". 사용자가 붙여넣은 원본 지문과 생성 상태를 보관한다.
create table if not exists passage_groups (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  level text,                          -- 학년 (passages.level 과 같은 표기, 예: "초6")
  topic text,
  source_body text not null,           -- 사용자가 붙여넣은 원본 지문
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'completed', 'partial', 'failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table passage_groups enable row level security;

drop policy if exists "passage_groups_own" on passage_groups;
create policy "passage_groups_own"
  on passage_groups
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2) 기존 passages 표에 칸 두 개 추가 (기존 지문은 둘 다 비어 있음 = 단독 지문)
alter table passages
  add column if not exists group_id uuid references passage_groups(id) on delete cascade,
  add column if not exists variant_level text;

-- 3) variant_level 은 네 가지 값만 허용 (비어 있는 것도 허용)
alter table passages drop constraint if exists passages_variant_level_check;
alter table passages
  add constraint passages_variant_level_check
  check (variant_level is null or variant_level in ('school', 'academy', 'advanced', 'prestudy'));

-- 4) group_id 와 variant_level 은 함께 채우거나 함께 비워야 한다
alter table passages drop constraint if exists passages_group_variant_pair_check;
alter table passages
  add constraint passages_group_variant_pair_check
  check ((group_id is null) = (variant_level is null));

-- 5) 한 묶음 안에 같은 난이도가 두 번 저장되지 않게 막는다 (단독 지문은 해당 없음)
create unique index if not exists passages_group_variant_unique
  on passages (group_id, variant_level)
  where group_id is not null;

-- 6) 묶음으로 지문을 빨리 찾기 위한 색인
create index if not exists passages_group_id_idx on passages (group_id);
