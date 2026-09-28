// 단어은행 STEP 1 검증: 정규화 / 입력 검사 / 중복 / 상태 이동 / 교사값 보호 / migration 파일 정적 점검.
// DB에 접속하지 않는다 (로컬 코드와 migration 파일 글자만 검사).
//
// 실행: npm run test-vocabulary-rules

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  activeDuplicateKey,
  canTransition,
  findActiveDuplicates,
  normalizeExpressionKey,
  normalizeMeaningKey,
  planAutoFill,
  planBulkApprove,
  SCRIPT_ENTRY_STATE,
  scriptEntryStateErrors,
  sourceLinkKey,
  undecidedCount,
  validateEntryInput,
  validateSourceInput,
  VOCABULARY_SELECTABLE_REJECT_REASONS,
  VOCABULARY_STATUS_LABELS,
  vocabularyDbErrorMessage,
  vocabularyViewState,
} from '../lib/vocabulary.ts'
import {
  anchorLabels,
  DIFFICULTY_ANCHORS,
  effectiveDifficulty,
  findDifficultyBand,
  gradeDifficultyRange,
  gradeRangePosition,
  VOCABULARY_DIFFICULTY_BANDS,
} from '../config/vocabularyLevels.ts'
import { exclusionConfirmText, exclusionWarnings, type ExclusionFacts } from '../lib/vocabularyExclusion.ts'
import type { VocabularyEntryInput, VocabularySourceInput } from '../types/vocabulary'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.log(`❌ ${name}`)
    throw err
  }
}

function entry(overrides: Partial<VocabularyEntryInput> = {}): VocabularyEntryInput {
  return {
    expression: 'maintain',
    lemma: 'maintain',
    entry_type: 'word',
    pos: 'verb',
    meaning_ko: '유지하다',
    accepted_meanings: [],
    sense_note: null,
    example_sentence: null,
    base_difficulty: null,
    ko_en_difficulty: null,
    ko_en_allowed: false,
    status: 'pending',
    reject_reason: null,
    reject_note: null,
    approval_origin: null,
    teacher_reviewed_at: null,
    archived_at: null,
    deferred_at: null,
    deleted_at: null,
    ...overrides,
  }
}

function source(overrides: Partial<VocabularySourceInput> = {}): VocabularySourceInput {
  return {
    entry_id: 'entry-1',
    source_type: 'external_passage',
    source_ref: 'passage-1',
    surface_form: 'secrets',
    source_sentence: 'She kept the secrets.',
    context_meaning: '비밀',
    suggested_difficulty: 30,
    rationale: null,
    created_by: 'claude',
    official_source_name: null,
    official_source_version: null,
    official_grade: null,
    ...overrides,
  }
}

// ── 정규화 ──
test('영어 key: 소문자 + 앞뒤 공백 + 연속 공백 1칸', () => {
  assert.equal(normalizeExpressionKey('  Take   Care\tOf  '), 'take care of')
})
test('영어 key: 유니코드 따옴표/dash/특수공백 형식 정리', () => {
  assert.equal(normalizeExpressionKey('don\u2019t'), "don't")
  assert.equal(normalizeExpressionKey('\u201Cwell\u2014known\u201D'), '"well-known"')
  assert.equal(normalizeExpressionKey('look\u00A0after'), 'look after')
})
test('영어 key: hyphen 을 공백으로 바꾸지 않고, 원형 추론도 하지 않는다', () => {
  assert.equal(normalizeExpressionKey('well-known'), 'well-known')
  assert.notEqual(normalizeExpressionKey('well-known'), normalizeExpressionKey('well known'))
  assert.equal(normalizeExpressionKey('Secrets'), 'secrets')
})
test('한국어 key: 앞뒤 공백 + 연속 공백만 정리 (띄어쓰기·조사는 유지)', () => {
  assert.equal(normalizeMeaningKey('  문제를   다루다 '), '문제를 다루다')
  assert.notEqual(normalizeMeaningKey('문제를 다루다'), normalizeMeaningKey('문제를다루다'))
  assert.notEqual(normalizeMeaningKey('유지하다'), normalizeMeaningKey('계속 유지하다'))
})

// ── 중복 ──
test('같은 철자라도 품사/뜻이 다르면 다른 항목', () => {
  const noun = { expression: 'address', pos: 'noun', meaning_ko: '주소' }
  const verb = { expression: 'address', pos: 'verb', meaning_ko: '문제를 다루다' }
  assert.notEqual(activeDuplicateKey(noun), activeDuplicateKey(verb))
})
test('완전 동일(형식 차이만) 활성 항목은 중복으로 잡힌다', () => {
  const dups = findActiveDuplicates(
    [{ expression: ' Maintain ', pos: 'verb', meaning_ko: '유지하다 ' }],
    [{ expression: 'maintain', pos: 'verb', meaning_ko: '유지하다', deleted_at: null }],
  )
  assert.equal(dups.length, 1)
  assert.equal(dups[0].reason, 'existing')
})
test('비슷한 뜻은 자동으로 합치지 않는다 (중복 아님)', () => {
  const dups = findActiveDuplicates(
    [{ expression: 'maintain', pos: 'verb', meaning_ko: '계속 유지하다' }],
    [{ expression: 'maintain', pos: 'verb', meaning_ko: '유지하다', deleted_at: null }],
  )
  assert.equal(dups.length, 0)
})
test('삭제된 항목은 중복 검사에서 빠진다 (재등록 가능)', () => {
  const dups = findActiveDuplicates(
    [{ expression: 'maintain', pos: 'verb', meaning_ko: '유지하다' }],
    [{ expression: 'maintain', pos: 'verb', meaning_ko: '유지하다', deleted_at: '2026-09-27T00:00:00Z' }],
  )
  assert.equal(dups.length, 0)
})
test('한 번에 넣는 후보 목록 안의 중복도 잡는다', () => {
  const dups = findActiveDuplicates([
    { expression: 'trust', pos: 'noun', meaning_ko: '신뢰' },
    { expression: 'Trust', pos: 'noun', meaning_ko: '신뢰' },
  ])
  assert.equal(dups.length, 1)
  assert.equal(dups[0].reason, 'within_batch')
})
test('출처 중복 key: 어휘 + 출처종류 + 출처식별값', () => {
  assert.equal(sourceLinkKey(source()), sourceLinkKey(source({ surface_form: 'secret' })))
  assert.notEqual(sourceLinkKey(source()), sourceLinkKey(source({ source_ref: 'passage-2' })))
})

// ── 입력 검사 ──
test('검토대기 항목은 난이도 없이 통과', () => {
  assert.deepEqual(validateEntryInput(entry()), [])
})
test('승인 항목은 난이도·승인경로가 없으면 오류', () => {
  const errors = validateEntryInput(entry({ status: 'approved' }))
  assert.ok(errors.some((e) => e.includes('기본 난이도')))
  assert.ok(errors.some((e) => e.includes('승인 경로')))
  assert.deepEqual(validateEntryInput(entry({ status: 'approved', base_difficulty: 40, approval_origin: 'batch' })), [])
})
test('난이도는 1~100 정수만', () => {
  assert.ok(validateEntryInput(entry({ base_difficulty: 0 })).length > 0)
  assert.ok(validateEntryInput(entry({ base_difficulty: 101 })).length > 0)
  assert.ok(validateEntryInput(entry({ base_difficulty: 12.5 })).length > 0)
  assert.deepEqual(validateEntryInput(entry({ base_difficulty: 1, ko_en_difficulty: 100 })), [])
})
test('아카이브 상태 ↔ archived_at 짝이 맞아야 한다', () => {
  assert.ok(validateEntryInput(entry({ status: 'archived', base_difficulty: 40, approval_origin: 'individual' })).length > 0)
  assert.ok(validateEntryInput(entry({ archived_at: '2026-09-27T00:00:00Z' })).length > 0)
  assert.deepEqual(
    validateEntryInput(entry({ status: 'archived', base_difficulty: 40, approval_origin: 'individual', archived_at: '2026-09-27T00:00:00Z' })),
    [],
  )
})
test('삭제(deleted_at)는 상태와 독립: 어느 상태든 삭제 표시 가능', () => {
  assert.deepEqual(validateEntryInput(entry({ deleted_at: '2026-09-27T00:00:00Z' })), [])
  assert.deepEqual(
    validateEntryInput(entry({ status: 'rejected', reject_reason: 'too_easy', deleted_at: '2026-09-27T00:00:00Z' })),
    [],
  )
})
test('반려 사유는 반려 상태에서만', () => {
  assert.ok(validateEntryInput(entry({ reject_reason: 'too_easy' })).length > 0)
  assert.deepEqual(validateEntryInput(entry({ status: 'rejected', reject_reason: 'too_easy' })), [])
})
test('출처 검사: 공식 출처는 원본명·버전 필수, 비공식 출처는 공식 칸 금지', () => {
  assert.deepEqual(validateSourceInput(source()), [])
  assert.ok(validateSourceInput(source({ source_type: 'official', source_ref: 'kr-curriculum-2022' })).length > 0)
  assert.deepEqual(
    validateSourceInput(source({
      source_type: 'official', source_ref: 'kr-curriculum-2022', created_by: 'import',
      official_source_name: '2022 개정 영어과 교육과정', official_source_version: '2022',
    })),
    [],
  )
  assert.ok(validateSourceInput(source({ official_grade: '초등' })).length > 0)
})

// ── 상태 이동 ──
test('상태 이동 (C-1): 사용 중은 사용 중단만, 사용 중단은 다시 사용하기·영구 제외', () => {
  assert.ok(canTransition('pending', 'approved'))
  assert.ok(canTransition('pending', 'rejected'))
  assert.ok(!canTransition('pending', 'archived'))
  assert.ok(!canTransition('approved', 'rejected'))
  assert.ok(canTransition('approved', 'archived'))
  assert.ok(canTransition('archived', 'approved'))
  assert.ok(canTransition('archived', 'rejected'))
  assert.ok(canTransition('rejected', 'pending'))
  assert.ok(!canTransition('rejected', 'approved'))
})
test('화면 이름 (C-1)', () => {
  assert.deepEqual(VOCABULARY_STATUS_LABELS, { pending: '확인 필요', approved: '사용 중', rejected: '영구 제외', archived: '사용 중단' })
})
test("'나중에 결정' = pending + 보류 표시, 결정 안 된 단어 = 확인 필요 + 나중에 결정", () => {
  assert.equal(vocabularyViewState({ status: 'pending', deferred_at: null }), 'pending')
  assert.equal(vocabularyViewState({ status: 'pending', deferred_at: '2026-09-28T00:00:00Z' }), 'deferred')
  assert.equal(vocabularyViewState({ status: 'approved', deferred_at: null }), 'approved')
  const list = [
    { status: 'pending' as const, deleted_at: null },
    { status: 'pending' as const, deleted_at: null },
    { status: 'pending' as const, deleted_at: '2026-09-28T00:00:00Z' },
    { status: 'approved' as const, deleted_at: null },
    { status: 'archived' as const, deleted_at: null },
  ]
  assert.equal(undecidedCount(list), 2)
})
test('보류 표시는 확인 필요 상태에서만', () => {
  assert.deepEqual(validateEntryInput(entry({ deferred_at: '2026-09-28T00:00:00Z' })), [])
  assert.ok(validateEntryInput(entry({ status: 'approved', base_difficulty: 40, approval_origin: 'individual', deferred_at: '2026-09-28T00:00:00Z' })).length > 0)
})
test("영구 제외 사유: 4개만 고를 수 있고 '너무 쉬움'·'너무 어려움'은 없다", () => {
  assert.deepEqual([...VOCABULARY_SELECTABLE_REJECT_REASONS], ['meaning_wrong', 'duplicate', 'low_value', 'other'])
  assert.ok(!VOCABULARY_SELECTABLE_REJECT_REASONS.includes('too_easy'))
  assert.ok(!VOCABULARY_SELECTABLE_REJECT_REASONS.includes('too_hard'))
})
test('승인 경로 새 값: 기존 검수 인정 / 소유자 명시 승인', () => {
  assert.deepEqual(validateEntryInput(entry({ status: 'approved', base_difficulty: 40, approval_origin: 'legacy_review' })), [])
  assert.deepEqual(validateEntryInput(entry({ status: 'approved', base_difficulty: 40, approval_origin: 'owner_approval' })), [])
})
test("등록 스크립트는 '확인 필요'로만 넣는다", () => {
  assert.equal(SCRIPT_ENTRY_STATE.status, 'pending')
  assert.equal(SCRIPT_ENTRY_STATE.approval_origin, null)
  assert.deepEqual(scriptEntryStateErrors(entry({ ...SCRIPT_ENTRY_STATE, base_difficulty: 40 })), [])
  assert.ok(scriptEntryStateErrors(entry({ status: 'approved', approval_origin: 'batch' })).length >= 2)
  assert.ok(scriptEntryStateErrors(entry({ teacher_reviewed_at: '2026-09-28T00:00:00Z' })).length > 0)
})
test('등록 스크립트 파일이 approved 로 넣는 코드를 갖고 있지 않다', () => {
  const seedScript = readFileSync(resolve(process.cwd(), 'scripts/add-vocabulary-seed.ts'), 'utf-8')
  assert.ok(!/status:\s*'approved'/.test(seedScript))
  assert.ok(/SCRIPT_ENTRY_STATE/.test(seedScript))
  assert.ok(/scriptEntryStateErrors/.test(seedScript))
})

// ── 학년 범위 (C-2) ──
test('학년 범위: 레벨 전체 합친 구간, 초5·중3도 기준 있음, 기준 없는 학년은 null(기준 미설정)', () => {
  assert.deepEqual(gradeDifficultyRange('중1'), { min: 15, max: 58 })
  assert.deepEqual(gradeDifficultyRange('초5'), { min: 1, max: 40 })
  assert.deepEqual(gradeDifficultyRange('중3'), { min: 30, max: 72 })
  assert.equal(gradeDifficultyRange('중2'), null)
  assert.equal(gradeRangePosition(80, { min: 1, max: 75 }), 'above')
  assert.equal(gradeRangePosition(75, { min: 1, max: 75 }), 'within')
  assert.equal(gradeRangePosition(1, { min: 10, max: 75 }), 'below')
  assert.equal(gradeRangePosition(null, { min: 1, max: 75 }), null)
})

// ── 영구 제외 경고 (C-1) ──
const noFacts: ExclusionFacts = {
  base_difficulty: null, official_source_count: 0, official_tier_label: null, grade_bands: [], exam_count: 0, exam_question_count: 0,
  same_spelling_meanings: [], source_count: 0, approval_origin_label: null,
}
test('영구 제외 경고: 해당하는 것만', () => {
  assert.deepEqual(exclusionWarnings(noFacts), [])
  const w = exclusionWarnings({
    ...noFacts, base_difficulty: 20, official_source_count: 1, grade_bands: ['중1 학교형'], exam_count: 2, exam_question_count: 3,
    same_spelling_meanings: ['계획하다'], source_count: 2, approval_origin_label: '기존 검수 인정',
  })
  assert.equal(w.length, 6)
  assert.match(w[0], /공식 기본어휘에 포함/)
  assert.match(exclusionWarnings({ ...noFacts, official_tier_label: '중·고 공통(**)' })[0], /공식 기본어휘\(중·고 공통\(\*\*\)\)/)
  assert.match(w[1], /중1 학교형/)
  assert.match(w[2], /시험 2개\(3문항\)/)
  assert.match(w[3], /계획하다/)
  assert.match(w[4], /출처가 2개/)
  assert.match(w[5], /기존 검수 인정/)
  assert.deepEqual(exclusionWarnings({ ...noFacts, base_difficulty: 90 }), [])
})
test('영구 제외 확인 문구에 사유와 경고가 들어간다', () => {
  const text = exclusionConfirmText('plan', '중복', ['출처가 1개 있습니다.'])
  assert.match(text, /plan/)
  assert.match(text, /사유: 중복/)
  assert.match(text, /• 출처가 1개 있습니다\./)
})

// ── 교사값 보호 ──
test('교사가 확인한 항목은 제작스크립트가 아무것도 채우지 않는다', () => {
  const reviewed = { teacher_reviewed_at: '2026-09-27T00:00:00Z', lemma: null, pos: null, sense_note: null, example_sentence: null, base_difficulty: null }
  assert.deepEqual(planAutoFill(reviewed, { pos: 'verb', base_difficulty: 50 }), {})
})
test('교사 확인 전 항목도 이미 있는 값은 바꾸지 않고 빈 칸만 채운다', () => {
  const draft = { teacher_reviewed_at: null, lemma: null, pos: 'verb' as const, sense_note: null, example_sentence: null, base_difficulty: 30 }
  assert.deepEqual(planAutoFill(draft, { pos: 'noun', base_difficulty: 70, lemma: 'maintain' }), { lemma: 'maintain' })
})

// ── DB 오류 문장 ──
test('활성 중복/출처 중복 오류를 사람이 읽는 문장으로', () => {
  assert.equal(
    vocabularyDbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "vocabulary_entries_active_unique"' }),
    '동일 어휘가 이미 존재합니다.',
  )
  assert.equal(
    vocabularyDbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "vocabulary_sources_entry_source_unique"' }),
    '이미 연결된 출처입니다.',
  )
})

// ── 변환표 ──
test('변환표는 초5·중1·중3 초안, 기준이 없는 학년은 null (임의 범위 출제 금지)', () => {
  assert.equal(VOCABULARY_DIFFICULTY_BANDS.length, 24)
  assert.deepEqual([...new Set(VOCABULARY_DIFFICULTY_BANDS.map((b) => b.grade))], ['초5', '중1', '중3'])
  assert.ok(VOCABULARY_DIFFICULTY_BANDS.every((b) => b.min >= 1 && b.max <= 100 && b.min <= b.max))
  assert.deepEqual(findDifficultyBand('중1', 'advanced', 'en_ko'), { grade: '중1', level: 'advanced', direction: 'en_ko', min: 25, max: 50 })
  assert.deepEqual(findDifficultyBand('초5', 'school', 'ko_en'), { grade: '초5', level: 'school', direction: 'ko_en', min: 1, max: 20 })
  assert.equal(findDifficultyBand('중2', 'advanced', 'en_ko'), null)
})
test('레벨 범위는 학년 기준점(초안)과 맞물린다: 상위학원형 = 학년 기준점 전체', () => {
  const anchor = (label: string) => DIFFICULTY_ANCHORS.find((a) => a.label === label)!
  for (const [grade, label] of [['초5', '초5~6'], ['중1', '중1~2'], ['중3', '중3']] as const) {
    const b = findDifficultyBand(grade, 'advanced', 'en_ko')!
    assert.deepEqual([b.min, b.max], [anchor(label).min, anchor(label).max], grade)
    // 학교형 < 일반학원형 < 상위학원형 < 선행형 (시작점 기준)
    const starts = (['school', 'academy', 'advanced', 'prestudy'] as const).map((l) => findDifficultyBand(grade, l, 'en_ko')!.min)
    assert.deepEqual([...starts].sort((x, y) => x - y), starts)
  }
})
test('절대 난이도 기준점 (설계도 C-2 초안)', () => {
  assert.deepEqual(DIFFICULTY_ANCHORS.map((a) => [a.label, a.min, a.max]), [
    ['초3~4', 1, 15], ['초5~6', 10, 30], ['중1~2', 25, 50], ['중3', 40, 65], ['고1~2', 55, 80], ['고3·고난도', 75, 100],
  ])
  assert.deepEqual(anchorLabels(42), ['중1~2', '중3'])
  assert.deepEqual(anchorLabels(1), ['초3~4'])
  assert.deepEqual(anchorLabels(null), [])
})
test('한→영은 예외 난이도가 있으면 그것을 쓴다', () => {
  assert.equal(effectiveDifficulty({ base_difficulty: 40, ko_en_difficulty: null }, 'ko_en'), 40)
  assert.equal(effectiveDifficulty({ base_difficulty: 40, ko_en_difficulty: 65 }, 'ko_en'), 65)
  assert.equal(effectiveDifficulty({ base_difficulty: 40, ko_en_difficulty: 65 }, 'en_ko'), 40)
})

// ── migration 파일 정적 점검 ──
const sql = readFileSync(resolve(process.cwd(), 'vocabulary-bank-migration.sql'), 'utf-8')
const sqlCode = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase()

test('migration 은 신규 vocabulary_* 표만 만들고/바꾼다 (기존 표 변경 0)', () => {
  const touched = Array.from(sqlCode.matchAll(/(?:create table if not exists|alter table|\bon)\s+([a-z_.]+)/g))
    .map((m) => m[1])
    .filter((t) => t !== 'delete' && t !== 'update') // "on delete cascade" 등 키워드
  const unexpected = touched.filter((t) => !t.startsWith('vocabulary_'))
  assert.deepEqual(unexpected, [])
  // 데이터를 바꾸는 문장(update/insert/delete/drop table/truncate)이 한 줄도 없다
  assert.ok(!/^\s*(update|insert|delete|drop table|truncate)\b/m.test(sqlCode))
})
test('migration: 활성 중복 부분 unique / 출처 중복 unique / RLS', () => {
  assert.match(sqlCode, /create unique index if not exists vocabulary_entries_active_unique[\s\S]*?where deleted_at is null;/)
  assert.match(sqlCode, /create unique index if not exists vocabulary_sources_entry_source_unique\s+on vocabulary_sources \(entry_id, source_type, source_ref\)/)
  assert.match(sqlCode, /alter table vocabulary_entries enable row level security/)
  assert.match(sqlCode, /alter table vocabulary_sources enable row level security/)
})
test('migration: 출처 기록에는 update 정책이 없다 (출처 기록 불변)', () => {
  assert.ok(!/on vocabulary_sources\s+for (update|all)/.test(sqlCode))
})
test('migration 전체가 BEGIN; … COMMIT; transaction 으로 감싸져 있다', () => {
  const statements = sqlCode.split('\n').map((l) => l.trim()).filter(Boolean)
  assert.equal(statements[0], 'begin;', '첫 실행 문장이 begin; 이어야 합니다')
  assert.equal(statements[statements.length - 1], 'commit;', '마지막 실행 문장이 commit; 이어야 합니다')
  assert.equal(statements.filter((s) => s === 'begin;').length, 1)
  assert.equal(statements.filter((s) => s === 'commit;').length, 1)
  assert.ok(!/\b(rollback|concurrently|vacuum)\b/.test(sqlCode), 'transaction 안에서 쓸 수 없는 문장이 있습니다')
})
test('migration: expression_key 빈 값 방지 CHECK', () => {
  assert.match(sqlCode, /add constraint vocabulary_entries_expression_key_not_empty_check\s+check \(expression_key <> ''\);/)
})
test('migration: meaning_key 빈 값 방지 CHECK', () => {
  assert.match(sqlCode, /add constraint vocabulary_entries_meaning_key_not_empty_check\s+check \(meaning_key <> ''\);/)
})
test('특수공백만 있는 표현/뜻은 key 가 빈 값 → 검사에서 거부 (DB CHECK 와 같은 기준)', () => {
  for (const blank of ['\u3000', '\u00A0', ' \u3000\u00A0 ', '\t\n']) {
    assert.equal(normalizeExpressionKey(blank), '')
    assert.equal(normalizeMeaningKey(blank), '')
    assert.ok(validateEntryInput(entry({ expression: blank })).includes('표현이 비어 있습니다.'))
    assert.ok(validateEntryInput(entry({ meaning_ko: blank })).includes('대표 뜻이 비어 있습니다.'))
  }
})
test('migration 의 형식 정리 글자표가 lib 정규화와 같다', () => {
  const m = sql.match(/translate\(expression,\s*E'([^']+)',/)
  assert.ok(m, 'expression translate 구문을 찾지 못했습니다')
  const fromChars = m![1].split('\\u').filter(Boolean).map((h) => String.fromCharCode(parseInt(h, 16)))
  const input = fromChars.join('')
  // DB: 각 글자를 ' ' " " - - - - - 공백 공백 으로 → 연속 공백 정리 → trim → 소문자
  assert.equal(normalizeExpressionKey(`a${input}b`), `a''""----- b`)
})

// ── 일괄 사용하기 ──
test('일괄 사용하기: 확인 필요 + 난이도 있음만, 나머지는 이유와 함께 건너뜀, 중복 id 는 한 번', () => {
  const rows = [
    { id: 'a', status: 'pending' as const, base_difficulty: 10, deleted_at: null },
    { id: 'b', status: 'pending' as const, base_difficulty: null, deleted_at: null },
    { id: 'c', status: 'approved' as const, base_difficulty: 10, deleted_at: null },
    { id: 'd', status: 'pending' as const, base_difficulty: 10, deleted_at: '2026-09-28T00:00:00Z' },
  ]
  const plan = planBulkApprove(['a', 'a', 'b', 'c', 'd', 'x'], rows)
  assert.deepEqual(plan.approve, ['a'])
  assert.deepEqual(plan.skipped, [
    { id: 'b', reason: 'no_difficulty' },
    { id: 'c', reason: 'not_pending' },
    { id: 'd', reason: 'not_found' },
    { id: 'x', reason: 'not_found' },
  ])
})

console.log(`\n모두 통과: ${passed}개`)
