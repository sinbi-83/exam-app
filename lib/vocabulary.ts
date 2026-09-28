// 단어은행 규칙 모음: 형식 정규화, 입력 검사, 상태 이동, 교사값 보호.
//
// - 정규화는 "형식"만 정리한다 (의미 판단·lemma 추론·자동 병합 없음).
//   DB 의 expression_key / meaning_key 계산 칸(vocabulary-bank-migration.sql)과 같은 규칙이다.
//   최종 기준은 DB 이고, 이 함수들은 저장 전에 미리 중복을 확인하거나 검사 보고서를 만드는 데 쓴다.
// - 제작 스크립트(공식어휘 가져오기, 백필 등)는 "새 어휘 추가 + 새 출처 추가"만 한다.
//   기존 어휘 항목의 값을 바꿀 수 있는 유일한 예외는 planAutoFill 이 허락한 빈 칸 채우기이고,
//   그것도 변경 예정 내용을 먼저 보고하고 승인받은 뒤에만 실행한다.
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱, scripts/, 테스트 스크립트에서 모두 그대로 쓰기 위해).

import type {
  VocabularyApprovalOrigin,
  VocabularyEntryInput,
  VocabularyEntryRecord,
  VocabularyEntryType,
  VocabularyPos,
  VocabularyRejectReason,
  VocabularySourceCreatedBy,
  VocabularySourceInput,
  VocabularySourceType,
  VocabularyStatus,
} from '../types/vocabulary'

export const VOCABULARY_STATUSES: readonly VocabularyStatus[] = ['pending', 'approved', 'rejected', 'archived']

// 화면 이름 (설계도 C-1). 내부 값은 그대로 두고 이름만 바꾼다.
export const VOCABULARY_STATUS_LABELS: Record<VocabularyStatus, string> = {
  pending: '확인 필요',
  approved: '사용 중',
  rejected: '영구 제외',
  archived: '사용 중단',
}

// ── 화면 상태 (탭) ──
// '나중에 결정'은 별도 상태가 아니라 pending + deferred_at(보류 표시)이다.
export type VocabularyViewState = 'pending' | 'deferred' | 'approved' | 'archived' | 'rejected'

export const VOCABULARY_VIEW_STATES: readonly VocabularyViewState[] = ['pending', 'deferred', 'approved', 'archived', 'rejected']

export const VOCABULARY_VIEW_STATE_LABELS: Record<VocabularyViewState, string> = {
  pending: '확인 필요',
  deferred: '나중에 결정',
  approved: '사용 중',
  archived: '사용 중단',
  rejected: '영구 제외',
}

// 탭 아래 설명
export const VOCABULARY_VIEW_STATE_HINTS: Record<VocabularyViewState, string> = {
  pending: '아직 아무도 안 본 단어 · 시험에 안 나옴',
  deferred: '봤지만 판단을 미룬 단어 · 시험에 안 나옴',
  approved: '시험에 나오는 단어',
  archived: '쓰다가 멈춤, 언제든 다시 사용 가능 · 시험에 안 나옴',
  rejected: '쓸모없음 · 시험에 안 나오고, 같은 표현+품사+뜻은 다시 자동으로 들어오지 않음',
}

export function vocabularyViewState(entry: { status: VocabularyStatus; deferred_at: string | null }): VocabularyViewState {
  if (entry.status === 'pending') return entry.deferred_at ? 'deferred' : 'pending'
  return entry.status
}

// "결정 안 된 단어" = 확인 필요 + 나중에 결정 (삭제된 항목 제외)
export function undecidedCount(entries: { status: VocabularyStatus; deleted_at: string | null }[]): number {
  return entries.filter((e) => e.status === 'pending' && e.deleted_at === null).length
}

export const VOCABULARY_ENTRY_TYPES: readonly VocabularyEntryType[] = ['word', 'phrasal_verb', 'collocation', 'idiom', 'phrase']

export const VOCABULARY_POS: readonly VocabularyPos[] = [
  'noun', 'pronoun', 'verb', 'auxiliary', 'adjective', 'adverb',
  'preposition', 'conjunction', 'determiner', 'interjection', 'numeral',
]

// 영구 제외 사유 이름. 예전 값(레벨 부적합·너무 쉬움 등)은 기존 기록 표시용으로만 남긴다.
export const VOCABULARY_REJECT_REASON_LABELS: Record<VocabularyRejectReason, string> = {
  level_mismatch: '레벨 부적합',
  meaning_wrong: '뜻 오류',
  too_easy: '너무 쉬움',
  too_hard: '너무 어려움',
  low_value: '고유명사·시험 가치 없음',
  duplicate: '중복',
  extraction_error: '잘못 추출',
  other: '기타',
}

// 새로 영구 제외할 때 고를 수 있는 사유 (설계도 C-1). 쉬움·어려움은 학년 범위가 처리하므로 사유가 아니다.
export const VOCABULARY_SELECTABLE_REJECT_REASONS: readonly VocabularyRejectReason[] = [
  'meaning_wrong', 'duplicate', 'low_value', 'other',
]

export function isSelectableRejectReason(value: unknown): value is VocabularyRejectReason {
  return typeof value === 'string' && (VOCABULARY_SELECTABLE_REJECT_REASONS as readonly string[]).includes(value)
}

export const VOCABULARY_APPROVAL_ORIGINS: readonly VocabularyApprovalOrigin[] = ['individual', 'batch', 'legacy_review', 'owner_approval']

export const VOCABULARY_APPROVAL_ORIGIN_LABELS: Record<VocabularyApprovalOrigin, string> = {
  individual: '교사 개별 승인',
  batch: '일괄 승인',
  legacy_review: '기존 검수 인정',
  owner_approval: '소유자 명시 승인',
}

export const VOCABULARY_SOURCE_TYPES: readonly VocabularySourceType[] = [
  'official', 'external_passage', 'question_bank', 'teacher', 'manual_test',
]

export const VOCABULARY_SOURCE_CREATED_BY: readonly VocabularySourceCreatedBy[] = ['claude', 'teacher', 'import']

export const DIFFICULTY_MIN = 1
export const DIFFICULTY_MAX = 100

// ── 형식 정규화 (DB 계산 칸과 같은 규칙) ──

// 유니코드 따옴표 → ' "  /  hyphen·dash 변형 → -  /  특수 공백(nbsp, 전각) → 일반 공백
const EXPRESSION_CHAR_MAP: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
  '\u2010': '-', '\u2011': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
  '\u00A0': ' ', '\u3000': ' ',
}
const EXPRESSION_CHAR_RE = /[\u2018\u2019\u201C\u201D\u2010\u2011\u2013\u2014\u2212\u00A0\u3000]/g
const SPECIAL_SPACE_RE = /[\u00A0\u3000]/g
// DB 쪽 정규식 '[ \t\n\r\f\v]+' 와 같은 글자 집합 (JS \s 는 더 넓어서 쓰지 않는다)
const WHITESPACE_RUN_RE = /[ \t\n\r\f\v]+/g

// 영어 표현의 중복검사/검색 key. hyphen 을 공백으로 바꾸거나 원형으로 바꾸지 않는다.
export function normalizeExpressionKey(expression: string): string {
  return expression
    .replace(EXPRESSION_CHAR_RE, (ch) => EXPRESSION_CHAR_MAP[ch])
    .replace(WHITESPACE_RUN_RE, ' ')
    .trim()
    .toLowerCase()
}

// 한국어 대표 뜻의 중복검사 key. 앞뒤 공백 제거 + 연속 공백 1칸만 한다 (조사·띄어쓰기·표현은 그대로).
export function normalizeMeaningKey(meaning: string): string {
  return meaning.replace(SPECIAL_SPACE_RE, ' ').replace(WHITESPACE_RUN_RE, ' ').trim()
}

// "완전 동일 중복" 판정 key: 기준표기 + 품사 + 대표 뜻 (DB 부분 unique 색인과 같은 조합, 삭제된 항목은 비교 대상 아님)
export function activeDuplicateKey(entry: { expression: string; pos: string | null; meaning_ko: string }): string {
  return [normalizeExpressionKey(entry.expression), entry.pos ?? '', normalizeMeaningKey(entry.meaning_ko)].join('\u0000')
}

// 새 후보 목록 안 / 기존 활성 항목과의 완전 동일 중복을 찾는다 (저장 전 검사 보고용). 뜻이 "비슷한" 것은 잡지 않는다.
export function findActiveDuplicates<T extends { expression: string; pos: string | null; meaning_ko: string }>(
  candidates: T[],
  existing: { expression: string; pos: string | null; meaning_ko: string; deleted_at: string | null }[] = [],
): { candidate: T; reason: 'existing' | 'within_batch' }[] {
  const existingKeys = new Set(existing.filter((e) => e.deleted_at === null).map(activeDuplicateKey))
  const seen = new Set<string>()
  const dups: { candidate: T; reason: 'existing' | 'within_batch' }[] = []
  for (const c of candidates) {
    const key = activeDuplicateKey(c)
    if (existingKeys.has(key)) dups.push({ candidate: c, reason: 'existing' })
    else if (seen.has(key)) dups.push({ candidate: c, reason: 'within_batch' })
    seen.add(key)
  }
  return dups
}

// ── 입력 검사 (DB 제약과 같은 내용을 저장 전에 한국어 문장으로 알려준다) ──

function isDifficulty(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && (value as number) >= DIFFICULTY_MIN && (value as number) <= DIFFICULTY_MAX)
}

export function validateEntryInput(entry: VocabularyEntryInput): string[] {
  const errors: string[] = []
  // 정규화 후 key 가 비면 거부 (DB 의 expression_key / meaning_key 빈 값 방지 CHECK 와 같은 기준. 특수공백만 있는 입력 포함)
  if (!entry.expression || !entry.expression.trim() || normalizeExpressionKey(entry.expression) === '') {
    errors.push('표현이 비어 있습니다.')
  }
  if (!entry.meaning_ko || !entry.meaning_ko.trim() || normalizeMeaningKey(entry.meaning_ko) === '') {
    errors.push('대표 뜻이 비어 있습니다.')
  }
  if (!VOCABULARY_ENTRY_TYPES.includes(entry.entry_type)) errors.push(`항목 종류가 올바르지 않습니다: ${entry.entry_type}`)
  if (entry.pos !== null && !VOCABULARY_POS.includes(entry.pos)) errors.push(`품사가 올바르지 않습니다: ${entry.pos}`)
  if (!VOCABULARY_STATUSES.includes(entry.status)) errors.push(`상태가 올바르지 않습니다: ${entry.status}`)
  if (!isDifficulty(entry.base_difficulty)) errors.push('기본 난이도는 1~100 정수이거나 비어 있어야 합니다.')
  if (!isDifficulty(entry.ko_en_difficulty)) errors.push('한→영 예외 난이도는 1~100 정수이거나 비어 있어야 합니다.')

  const approvedLike = entry.status === 'approved' || entry.status === 'archived'
  if (approvedLike && entry.base_difficulty === null) errors.push('승인/아카이브 항목은 기본 난이도가 있어야 합니다.')
  if (approvedLike && entry.approval_origin === null) errors.push('승인/아카이브 항목은 승인 경로(개별/일괄)가 있어야 합니다.')
  if (entry.approval_origin !== null && !VOCABULARY_APPROVAL_ORIGINS.includes(entry.approval_origin)) {
    errors.push(`승인 경로가 올바르지 않습니다: ${entry.approval_origin}`)
  }
  if ((entry.status === 'archived') !== (entry.archived_at !== null)) {
    errors.push('아카이브 상태와 archived_at 이 서로 맞지 않습니다.')
  }
  if (entry.status !== 'rejected' && (entry.reject_reason !== null || entry.reject_note !== null)) {
    errors.push('반려 사유는 반려 상태에서만 남길 수 있습니다.')
  }
  if (entry.reject_reason !== null && !(entry.reject_reason in VOCABULARY_REJECT_REASON_LABELS)) {
    errors.push(`반려 사유가 올바르지 않습니다: ${entry.reject_reason}`)
  }
  if (entry.deferred_at !== null && entry.status !== 'pending') {
    errors.push("'나중에 결정' 표시는 확인 필요 상태에서만 남길 수 있습니다.")
  }
  return errors
}

export function validateSourceInput(source: VocabularySourceInput): string[] {
  const errors: string[] = []
  if (!source.entry_id) errors.push('연결할 어휘 항목(entry_id)이 없습니다.')
  if (!VOCABULARY_SOURCE_TYPES.includes(source.source_type)) errors.push(`출처 종류가 올바르지 않습니다: ${source.source_type}`)
  if (!source.source_ref || !source.source_ref.trim()) errors.push('출처 식별값(source_ref)이 비어 있습니다.')
  if (!VOCABULARY_SOURCE_CREATED_BY.includes(source.created_by)) errors.push(`작성 주체가 올바르지 않습니다: ${source.created_by}`)
  if (!isDifficulty(source.suggested_difficulty)) errors.push('제안 난이도는 1~100 정수이거나 비어 있어야 합니다.')
  if (source.source_type === 'official') {
    if (!source.official_source_name || !source.official_source_version) errors.push('공식 출처는 원본명과 버전이 있어야 합니다.')
  } else if (source.official_source_name !== null || source.official_source_version !== null || source.official_grade !== null) {
    errors.push('공식 출처가 아닌데 공식 원본 정보가 들어 있습니다.')
  }
  return errors
}

// 같은 어휘 + 같은 출처 중복 연결 판정 key (DB unique 색인과 같은 조합)
export function sourceLinkKey(source: { entry_id: string; source_type: string; source_ref: string }): string {
  return [source.entry_id, source.source_type, source.source_ref].join('\u0000')
}

// ── 상태 이동 (교사 작업 버튼의 기준) ──
// 삭제(deleted_at)는 상태가 아니므로 여기에 없다. 삭제/복원은 어느 상태에서든 deleted_at 만 바꾼다.
// ── 등록 스크립트 규칙 (설계도 C-1) ──
// 가져오기·등록 스크립트는 '확인 필요'로만 넣는다. 사용 여부(승인)는 교사가 화면에서 정한다.
export const SCRIPT_ENTRY_STATE = {
  status: 'pending',
  approval_origin: null,
  reject_reason: null,
  reject_note: null,
  teacher_reviewed_at: null,
  archived_at: null,
  deferred_at: null,
  deleted_at: null,
} as const satisfies Partial<VocabularyEntryInput>

// 스크립트 입력이 규칙을 지키는지 (어기면 오류 문장)
export function scriptEntryStateErrors(entry: Pick<VocabularyEntryInput, 'status' | 'approval_origin' | 'teacher_reviewed_at' | 'deferred_at'>): string[] {
  const errors: string[] = []
  if (entry.status !== 'pending') errors.push(`스크립트는 '확인 필요'로만 넣을 수 있습니다 (지금: ${entry.status}).`)
  if (entry.approval_origin !== null) errors.push('스크립트는 승인 경로를 채울 수 없습니다.')
  if (entry.teacher_reviewed_at !== null) errors.push('스크립트는 교사 확인 시각을 채울 수 없습니다.')
  if (entry.deferred_at !== null) errors.push("스크립트는 '나중에 결정' 표시를 채울 수 없습니다.")
  return errors
}

// ── 일괄 사용하기 (교사가 '확인 필요' 목록에서 여러 개를 골라 누름) ──
// '확인 필요'(나중에 결정 포함) + 난이도 있음 + 삭제 안 됨 → 사용하기. 나머지는 이유와 함께 건너뛴다.
export type BulkSkipReason = 'not_found' | 'not_pending' | 'no_difficulty'

export const BULK_SKIP_REASON_LABELS: Record<BulkSkipReason, string> = {
  not_found: '찾을 수 없음',
  not_pending: '확인 필요 상태가 아님',
  no_difficulty: '난이도 없음',
}

export function planBulkApprove(
  ids: string[],
  rows: Pick<VocabularyEntryRecord, 'id' | 'status' | 'base_difficulty' | 'deleted_at'>[],
): { approve: string[]; skipped: { id: string; reason: BulkSkipReason }[] } {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const approve: string[] = []
  const skipped: { id: string; reason: BulkSkipReason }[] = []
  for (const id of [...new Set(ids)]) {
    const r = byId.get(id)
    if (!r || r.deleted_at !== null) skipped.push({ id, reason: 'not_found' })
    else if (r.status !== 'pending') skipped.push({ id, reason: 'not_pending' })
    else if (r.base_difficulty === null) skipped.push({ id, reason: 'no_difficulty' })
    else approve.push(id)
  }
  return { approve, skipped }
}

// ('나중에 결정'은 상태 이동이 아니라 pending 안에서 보류 표시만 켠다 → 여기에 없음)
export const VOCABULARY_STATUS_TRANSITIONS: Record<VocabularyStatus, readonly VocabularyStatus[]> = {
  pending: ['approved', 'rejected'], // 사용하기 / 영구 제외
  approved: ['archived'], // 사용 중단 (사용 중인 단어는 바로 영구 제외하지 않는다)
  rejected: ['pending'], // 다시 검토하기
  archived: ['approved', 'rejected'], // 다시 사용하기 / 영구 제외
}

export function canTransition(from: VocabularyStatus, to: VocabularyStatus): boolean {
  return VOCABULARY_STATUS_TRANSITIONS[from].includes(to)
}

// ── 교사값 보호 ──
// 제작 스크립트가 기존 어휘 항목의 빈 칸을 채우려 할 때, 실제로 채워도 되는 칸만 골라준다.
// - 교사가 한 번이라도 확인/수정한 항목(teacher_reviewed_at 있음)은 아무것도 채우지 않는다.
// - 이미 값이 있는 칸은 절대 바꾸지 않는다 (빈 칸만).
// - 상태·승인·삭제 관련 칸은 채우기 대상이 아니다.
// 결과는 "변경 예정 내용 보고"에 쓰고, 승인받은 뒤에만 실제로 저장한다.
export const AUTO_FILLABLE_FIELDS = ['lemma', 'pos', 'sense_note', 'example_sentence', 'base_difficulty'] as const
export type AutoFillableField = (typeof AUTO_FILLABLE_FIELDS)[number]

export function planAutoFill(
  entry: Pick<VocabularyEntryRecord, 'teacher_reviewed_at' | AutoFillableField>,
  proposed: Partial<Pick<VocabularyEntryRecord, AutoFillableField>>,
): Partial<Pick<VocabularyEntryRecord, AutoFillableField>> {
  if (entry.teacher_reviewed_at !== null) return {}
  const plan: Partial<Record<AutoFillableField, unknown>> = {}
  for (const field of AUTO_FILLABLE_FIELDS) {
    const value = proposed[field]
    if (value === undefined || value === null) continue
    if (entry[field] !== null) continue
    plan[field] = value
  }
  return plan as Partial<Pick<VocabularyEntryRecord, AutoFillableField>>
}

// ── DB 오류를 사람이 읽는 문장으로 ──
// 부분 unique 색인에 걸리면(새 등록, 수정, 삭제 항목 복원 모두) "동일 어휘가 이미 존재합니다."
export function vocabularyDbErrorMessage(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null
  const message = error.message ?? ''
  if (error.code === '23505' && message.includes('vocabulary_entries_active_unique')) return '동일 어휘가 이미 존재합니다.'
  if (error.code === '23505' && message.includes('vocabulary_sources_entry_source_unique')) return '이미 연결된 출처입니다.'
  return message || '저장 중 오류가 발생했습니다.'
}
