// 단어은행(vocabulary_entries / vocabulary_sources) 타입. DB 구조는 vocabulary-bank-migration.sql 참고.
// 단어은행은 AI API를 호출하지 않는다 — 후보 자료는 제작 단계(Claude Code)에서 만들어 스크립트로 넣고,
// 프로그램은 DB + 일반 코드로만 동작한다.

export type VocabularyStatus = "pending" | "approved" | "rejected" | "archived";

export type VocabularyEntryType = "word" | "phrasal_verb" | "collocation" | "idiom" | "phrase";

export type VocabularyPos =
  | "noun"
  | "pronoun"
  | "verb"
  | "auxiliary"
  | "adjective"
  | "adverb"
  | "preposition"
  | "conjunction"
  | "determiner"
  | "interjection"
  | "numeral";

export type VocabularyRejectReason =
  | "level_mismatch"
  | "meaning_wrong"
  | "too_easy"
  | "too_hard"
  | "low_value"
  | "duplicate"
  | "extraction_error"
  | "other";

// individual = 교사가 화면에서 한 단어씩 승인 / batch = 교사가 화면에서 여러 개를 골라 일괄 승인
// (1단계 전에는 스크립트 일괄 승인에 썼지만 그 101개는 legacy_review / owner_approval 로 바뀌었다)
// legacy_review = 기존 검수 인정 (스크립트 승인 + 교사 검수 완료 기록) / owner_approval = 소유자 명시 승인
export type VocabularyApprovalOrigin = "individual" | "batch" | "legacy_review" | "owner_approval";

export type VocabularySourceType = "official" | "external_passage" | "question_bank" | "teacher" | "manual_test";

export type VocabularySourceCreatedBy = "claude" | "teacher" | "import";

// 출제 방향
export type VocabularyDirection = "en_ko" | "ko_en";

// vocabulary_entries 한 줄. expression_key / meaning_key 는 DB가 계산하는 값(직접 쓰지 않는다).
export interface VocabularyEntryRecord {
  id: string;
  user_id: string;
  expression: string;
  expression_key: string;
  lemma: string | null;
  entry_type: VocabularyEntryType;
  pos: VocabularyPos | null;
  meaning_ko: string;
  meaning_key: string;
  accepted_meanings: string[];
  sense_note: string | null;
  example_sentence: string | null;
  base_difficulty: number | null; // 1~100, 판단 전이면 null
  ko_en_difficulty: number | null; // 한→영 예외 난이도 (보통 null)
  ko_en_allowed: boolean;
  status: VocabularyStatus;
  reject_reason: VocabularyRejectReason | null;
  reject_note: string | null;
  approval_origin: VocabularyApprovalOrigin | null;
  teacher_reviewed_at: string | null;
  archived_at: string | null;
  deferred_at: string | null; // '나중에 결정' 보류 표시 (status = 'pending' 일 때만)
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// 새 어휘 항목을 넣을 때의 입력 (id / 계산 칸 / 시각 칸 제외)
export type VocabularyEntryInput = Omit<
  VocabularyEntryRecord,
  "id" | "user_id" | "expression_key" | "meaning_key" | "created_at" | "updated_at"
>;

// vocabulary_sources 한 줄. 한 번 남기면 수정하지 않는다 (DB에 update 정책 없음).
export interface VocabularySourceRecord {
  id: string;
  user_id: string;
  entry_id: string;
  source_type: VocabularySourceType;
  source_ref: string; // 외부지문 = passages.id, 문제은행 = questions.id, 공식어휘 = 'kr-curriculum-2022' 등
  surface_form: string | null; // 원문에 나온 형태 (secrets 등)
  source_sentence: string | null;
  context_meaning: string | null;
  suggested_difficulty: number | null; // Claude 임시 제안 (참고값, 1~100)
  rationale: string | null;
  created_by: VocabularySourceCreatedBy;
  official_source_name: string | null; // 공식 출처일 때만
  official_source_version: string | null;
  official_grade: string | null;
  created_at: string;
}

export type VocabularySourceInput = Omit<VocabularySourceRecord, "id" | "user_id" | "created_at">;
