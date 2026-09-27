-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- 단어은행 STEP 1: 어휘 항목(vocabulary_entries) + 출처 기록(vocabulary_sources) 두 표를 새로 만든다.
-- 기존 표(passages, questions, exams, exam_questions 등)와 기존 데이터는 하나도 바꾸지 않는다.
-- 여러 번 실행해도 안전하다.
-- 전체를 하나의 transaction 으로 묶었다: 중간에 한 문장이라도 실패하면 전부 취소되고, 절반만 적용된 상태가 남지 않는다.
-- (이 파일에는 transaction 안에서 쓸 수 없는 문장(CREATE INDEX CONCURRENTLY, VACUUM 등)이 없다.)

begin;

-- =============================================
-- 1) 어휘 항목: 한 줄 = "표현 + 의미 + 품사"
--    address/noun/주소 와 address/verb/(문제를) 다루다 는 서로 다른 두 줄이다.
-- =============================================
create table if not exists vocabulary_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  expression text not null check (btrim(expression) <> ''),   -- 보이는 그대로의 표기
  -- 중복검사/검색용 기준표기. DB가 직접 계산한다 (형식만 정리, 의미 판단 없음):
  --   유니코드 따옴표 → ' "   /   각종 dash·hyphen 변형 → -   /   특수 공백 → 일반 공백
  --   연속 공백 1칸 → 앞뒤 공백 제거 → 소문자
  --   (lib/vocabulary.ts 의 normalizeExpressionKey 와 같은 규칙)
  expression_key text generated always as (
    lower(btrim(regexp_replace(
      translate(expression,
        E'\u2018\u2019\u201C\u201D\u2010\u2011\u2013\u2014\u2212\u00A0\u3000',
        E'\'\'""-----  '),
      '[ \t\n\r\f\v]+', ' ', 'g')))
  ) stored,
  lemma text,                                                 -- 원형 (secret, study). 자동추론하지 않는다
  entry_type text not null default 'word'
    check (entry_type in ('word', 'phrasal_verb', 'collocation', 'idiom', 'phrase')),
  pos text
    check (pos is null or pos in (
      'noun', 'pronoun', 'verb', 'auxiliary', 'adjective', 'adverb',
      'preposition', 'conjunction', 'determiner', 'interjection', 'numeral'
    )),

  meaning_ko text not null check (btrim(meaning_ko) <> ''),   -- 대표 뜻 (시험 기본 정답)
  -- 대표 뜻 중복검사 key: 특수 공백 → 일반 공백, 연속 공백 1칸, 앞뒤 공백 제거. 그 외(조사·띄어쓰기)는 건드리지 않는다.
  meaning_key text generated always as (
    btrim(regexp_replace(
      translate(meaning_ko, E'\u00A0\u3000', '  '),
      '[ \t\n\r\f\v]+', ' ', 'g'))
  ) stored,
  accepted_meanings text[] not null default '{}',             -- 정답으로 인정할 추가 뜻
  sense_note text,                                            -- 같은 철자의 다른 뜻을 사람이 구분하기 위한 메모
  example_sentence text,

  base_difficulty smallint check (base_difficulty between 1 and 100),    -- 보스턴S 내부 좌표. 판단 전이면 null
  ko_en_difficulty smallint check (ko_en_difficulty between 1 and 100),  -- 한→영 예외 난이도 (보통 null)
  ko_en_allowed boolean not null default false,               -- 한→영 출제 가능 (정답이 하나로 정해지는 항목만 true)

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'archived')),
  reject_reason text
    check (reject_reason is null or reject_reason in (
      'level_mismatch', 'meaning_wrong', 'too_easy', 'too_hard',
      'low_value', 'duplicate', 'extraction_error', 'other'
    )),
  reject_note text,
  approval_origin text
    check (approval_origin is null or approval_origin in ('individual', 'batch')),
  teacher_reviewed_at timestamptz,                            -- 교사가 직접 확인/수정한 시각. 있으면 제작스크립트가 값을 채우지 않는다
  archived_at timestamptz,
  deleted_at timestamptz,                                     -- 삭제 = 상태가 아니라 "숨김" (soft delete)

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 정규화 후 key 가 빈 값이 되는 입력을 막는다 (예: 전각공백·nbsp 만 입력된 표현/뜻).
-- btrim 은 일반 공백만 지우므로, 칸 자체의 비어있음 검사만으로는 이 경우가 빠져나간다.
alter table vocabulary_entries drop constraint if exists vocabulary_entries_expression_key_not_empty_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_expression_key_not_empty_check
  check (expression_key <> '');

alter table vocabulary_entries drop constraint if exists vocabulary_entries_meaning_key_not_empty_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_meaning_key_not_empty_check
  check (meaning_key <> '');

-- 아카이브 상태와 archived_at 이 어긋나지 않게 한다.
alter table vocabulary_entries drop constraint if exists vocabulary_entries_archived_pair_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_archived_pair_check
  check ((status = 'archived') = (archived_at is not null));

-- 승인(및 승인됐다가 은퇴한 아카이브) 항목은 기본 난이도가 반드시 있어야 한다
-- (승인됐는데 난이도가 없어 자동시험에 영원히 안 나오는 "유령 데이터" 방지. 아카이브 복원 시에도 같은 이유).
alter table vocabulary_entries drop constraint if exists vocabulary_entries_difficulty_required_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_difficulty_required_check
  check (status not in ('approved', 'archived') or base_difficulty is not null);

-- 승인(아카이브 포함) 항목은 승인 경로(개별/일괄)가 기록돼 있어야 한다.
alter table vocabulary_entries drop constraint if exists vocabulary_entries_approval_origin_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_approval_origin_check
  check (status not in ('approved', 'archived') or approval_origin is not null);

-- 반려 사유는 반려 상태에서만 남는다 (재검토로 돌리면 비운다).
alter table vocabulary_entries drop constraint if exists vocabulary_entries_reject_reason_check;
alter table vocabulary_entries
  add constraint vocabulary_entries_reject_reason_check
  check (status = 'rejected' or (reject_reason is null and reject_note is null));

-- 완전 동일 중복 금지: 기준표기 + 품사 + 대표 뜻이 모두 같고 삭제되지 않은 항목은 하나만.
-- 삭제된 항목은 제외 → 삭제 후 같은 항목을 새로 등록할 수 있다.
-- 삭제된 항목을 복원(deleted_at = null)하려는데 같은 활성 항목이 이미 있으면 이 색인이 막는다.
create unique index if not exists vocabulary_entries_active_unique
  on vocabulary_entries (user_id, expression_key, coalesce(pos, ''), meaning_key)
  where deleted_at is null;

-- 목록 탭(상태별)과 자동시험 후보 조회용 색인
create index if not exists vocabulary_entries_user_status_idx
  on vocabulary_entries (user_id, status)
  where deleted_at is null;
create index if not exists vocabulary_entries_approved_difficulty_idx
  on vocabulary_entries (user_id, base_difficulty)
  where status = 'approved' and deleted_at is null;
create index if not exists vocabulary_entries_lemma_idx
  on vocabulary_entries (user_id, lemma)
  where lemma is not null;

alter table vocabulary_entries enable row level security;

drop policy if exists "vocabulary_entries_own" on vocabulary_entries;
create policy "vocabulary_entries_own"
  on vocabulary_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at 자동 갱신 (wrong-answers-migration.sql 과 같은 방식)
create or replace function update_vocabulary_entries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_vocabulary_entries_updated_at on vocabulary_entries;
create trigger trg_vocabulary_entries_updated_at
  before update on vocabulary_entries
  for each row execute function update_vocabulary_entries_updated_at();

-- =============================================
-- 2) 출처 기록: 어휘 하나에 여러 출처. 어휘 항목을 수정해도 출처 기록(원문 형태·공식 원본 정보)은 그대로 남는다.
--    Claude 가 제안한 난이도·근거는 어휘 항목이 아니라 여기에 "참고값"으로 쌓인다.
-- =============================================
create table if not exists vocabulary_sources (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references vocabulary_entries(id) on delete cascade,

  source_type text not null
    check (source_type in ('official', 'external_passage', 'question_bank', 'teacher', 'manual_test')),
  -- 출처 식별값: 외부지문 = passages.id, 문제은행 = questions.id, 공식어휘 = 'kr-curriculum-2022' 같은 목록 ID
  source_ref text not null check (btrim(source_ref) <> ''),

  surface_form text,                -- 자료에 실제로 나온 형태 (예: canonical secret ← 원문 secrets)
  source_sentence text,             -- 원문 문장
  context_meaning text,             -- 그 문맥에서의 뜻
  suggested_difficulty smallint check (suggested_difficulty between 1 and 100),  -- Claude 임시 난이도 제안 (참고값)
  rationale text,                   -- 짧은 판단 근거
  created_by text not null check (created_by in ('claude', 'teacher', 'import')),

  -- 공식 자료일 때만: 원본명 / 버전 / 원본에 적힌 등급값 (등급값은 원본 확보 전이라 형식을 고정하지 않는다)
  official_source_name text,
  official_source_version text,
  official_grade text,

  created_at timestamptz default now()
);

-- 공식 출처는 원본명·버전이 반드시 있고, 공식이 아닌 출처에는 공식 정보 칸을 쓰지 않는다.
alter table vocabulary_sources drop constraint if exists vocabulary_sources_official_fields_check;
alter table vocabulary_sources
  add constraint vocabulary_sources_official_fields_check
  check (
    (source_type = 'official' and official_source_name is not null and official_source_version is not null)
    or (source_type <> 'official' and official_source_name is null and official_source_version is null and official_grade is null)
  );

-- 같은 어휘 + 같은 출처는 한 번만 연결된다.
create unique index if not exists vocabulary_sources_entry_source_unique
  on vocabulary_sources (entry_id, source_type, source_ref);

-- "이 지문/문제에서 나온 어휘" 역조회용
create index if not exists vocabulary_sources_ref_idx
  on vocabulary_sources (user_id, source_type, source_ref);

alter table vocabulary_sources enable row level security;

-- 출처 기록은 "추가/조회/삭제"만 한다. 수정(update) 정책은 일부러 만들지 않는다 → 한 번 남긴 출처 기록은 바뀌지 않는다.
-- 추가할 때는 연결할 어휘 항목도 본인 것인지 확인한다.
drop policy if exists "vocabulary_sources_own_select" on vocabulary_sources;
create policy "vocabulary_sources_own_select"
  on vocabulary_sources
  for select
  using (auth.uid() = user_id);

drop policy if exists "vocabulary_sources_own_insert" on vocabulary_sources;
create policy "vocabulary_sources_own_insert"
  on vocabulary_sources
  for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from vocabulary_entries e where e.id = entry_id and e.user_id = auth.uid())
  );

drop policy if exists "vocabulary_sources_own_delete" on vocabulary_sources;
create policy "vocabulary_sources_own_delete"
  on vocabulary_sources
  for delete
  using (auth.uid() = user_id);

commit;
