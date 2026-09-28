-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- (편집창에서 일부가 선택돼 있으면 그 부분만 실행되니, 새 창에서 선택 없이 Run)
-- 학업관리 개편 3단계: 공식 기본어휘 기준표(official_vocabulary) 새 표 하나만 만든다.
--   원천: 2022 개정 영어과 교육과정 [별표 3] 기본어휘 3,000개 (list_version = 'kr-curriculum-2022')
--   단어은행(vocabulary_entries)과 별개다. 뜻·난이도가 없는 "기준표"라 시험에 직접 나오지 않는다.
-- 기존 표·기존 데이터는 하나도 바꾸지 않는다. 여러 번 실행해도 안전하다.

begin;

create table if not exists official_vocabulary (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  list_version text not null check (btrim(list_version) <> ''),  -- 'kr-curriculum-2022'
  list_no integer not null check (list_no > 0),                  -- 원본 번호 (1~3000)
  headword text not null check (btrim(headword) <> ''),          -- 표제어 (원본 표기)
  -- 단어은행과 맞춰 보기 위한 기준표기. vocabulary_entries.expression_key 와 같은 규칙으로 DB가 계산한다.
  headword_key text generated always as (
    lower(btrim(regexp_replace(
      translate(headword,
        E'‘’“”‐‑–—− 　',
        E'\'\'""-----  '),
      '[ \t\n\r\f\v]+', ' ', 'g')))
  ) stored,
  variants text[] not null default '{}',                         -- 다른 철자 (analyse 등)
  derivatives text[] not null default '{}',                      -- 원본 괄호 안 파생어 (참고용, 표제어 아님)
  tier_code text not null check (tier_code in ('elementary', 'common', 'elective')),
  tier_mark text not null default '',                            -- 원본 표시 (*, **, 없음)
  tier_label text not null,                                      -- 원본 설명 (초등학교 권장(*) 등)
  source_raw text not null,                                      -- 원본 줄 그대로

  created_at timestamptz default now()
);

create unique index if not exists official_vocabulary_no_unique
  on official_vocabulary (user_id, list_version, list_no);
create unique index if not exists official_vocabulary_headword_unique
  on official_vocabulary (user_id, list_version, headword_key);
create index if not exists official_vocabulary_tier_idx
  on official_vocabulary (user_id, list_version, tier_code);

alter table official_vocabulary enable row level security;

-- 기준표는 넣고 읽기만 한다 (수정 정책 없음 → 원본 값이 바뀌지 않는다). 잘못 넣었을 때를 위해 삭제만 허용.
drop policy if exists "official_vocabulary_own_select" on official_vocabulary;
create policy "official_vocabulary_own_select" on official_vocabulary for select using (auth.uid() = user_id);
drop policy if exists "official_vocabulary_own_insert" on official_vocabulary;
create policy "official_vocabulary_own_insert" on official_vocabulary for insert with check (auth.uid() = user_id);
drop policy if exists "official_vocabulary_own_delete" on official_vocabulary;
create policy "official_vocabulary_own_delete" on official_vocabulary for delete using (auth.uid() = user_id);

commit;

notify pgrst, 'reload schema';

select exists (select 1 from information_schema.tables where table_name = 'official_vocabulary') as 기준표생김;
