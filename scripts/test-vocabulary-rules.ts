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
  sourceLinkKey,
  validateEntryInput,
  validateSourceInput,
  vocabularyDbErrorMessage,
} from '../lib/vocabulary.ts'
import { effectiveDifficulty, findDifficultyBand, VOCABULARY_DIFFICULTY_BANDS } from '../config/vocabularyLevels.ts'
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
test('상태 이동: 승인 항목은 반려가 아니라 아카이브, 아카이브 복원은 승인으로', () => {
  assert.ok(canTransition('pending', 'approved'))
  assert.ok(canTransition('pending', 'rejected'))
  assert.ok(!canTransition('approved', 'rejected'))
  assert.ok(canTransition('approved', 'archived'))
  assert.ok(canTransition('archived', 'approved'))
  assert.ok(canTransition('rejected', 'pending'))
  assert.ok(!canTransition('rejected', 'approved'))
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
test('변환표는 중1 임시 기준만 있고, 기준이 없는 학년은 null (임의 범위 출제 금지)', () => {
  assert.equal(VOCABULARY_DIFFICULTY_BANDS.length, 8)
  assert.ok(VOCABULARY_DIFFICULTY_BANDS.every((b) => b.grade === '중1' && b.min >= 1 && b.max <= 100 && b.min <= b.max))
  assert.deepEqual(findDifficultyBand('중1', 'advanced', 'en_ko'), { grade: '중1', level: 'advanced', direction: 'en_ko', min: 30, max: 60 })
  assert.equal(findDifficultyBand('중2', 'advanced', 'en_ko'), null)
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

console.log(`\n모두 통과: ${passed}개`)
