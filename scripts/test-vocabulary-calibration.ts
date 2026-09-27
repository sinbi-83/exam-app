// 단어은행 영점 보정(calibration) v1 규칙 검사 (DB 접속 없음).
// 실행: npm run test-vocabulary-calibration

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  calibrationZone,
  CEILING_MIN,
  DIFFICULTY_NUDGE_STEP,
  FLOOR_MAX,
  isReviewNoteRef,
  nextUnreviewedId,
  nudgeDifficulty,
  REVIEW_DONE_REF_PREFIX,
  REVIEW_NOTE_ONLY_REF_PREFIX,
  generalTestCandidates,
  isCalibrationOnly,
  isCalibrationReviewed,
  reviewState,
  reviewNoteText,
  SEED_SOURCE_REFS,
} from '../lib/vocabularyCalibration.ts'
import { findActiveDuplicates, validateEntryInput } from '../lib/vocabulary.ts'
import { bandsContaining, VOCABULARY_DIFFICULTY_BANDS } from '../config/vocabularyLevels.ts'
import type { VocabularyEntryInput } from '../types/vocabulary'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.error(`❌ ${name}`)
    throw err
  }
}

test('조금 쉽게/어렵게: 기본 폭 5, 1~100 을 넘지 않는다', () => {
  assert.equal(DIFFICULTY_NUDGE_STEP, 5)
  assert.equal(nudgeDifficulty(42, -5), 37)
  assert.equal(nudgeDifficulty(42, 5), 47)
  assert.equal(nudgeDifficulty(3, -5), 1)
  assert.equal(nudgeDifficulty(98, 5), 100)
})
test('구간: Floor 1~10 / 중간 / Ceiling 80+', () => {
  assert.equal(FLOOR_MAX, 10)
  assert.equal(CEILING_MIN, 80)
  assert.equal(calibrationZone(1), 'floor')
  assert.equal(calibrationZone(10), 'floor')
  assert.equal(calibrationZone(11), 'middle')
  assert.equal(calibrationZone(79), 'middle')
  assert.equal(calibrationZone(80), 'ceiling')
  assert.equal(calibrationZone(null), null)
})
test('레벨 표시: 겹치는 구간 모두, 80+ 는 현재 중1 기준 밖 (Cut 은 그대로)', () => {
  assert.deepEqual(bandsContaining(42, 'en_ko').map((b) => b.level), ['academy', 'advanced'])
  assert.deepEqual(bandsContaining(58, 'en_ko').map((b) => b.level), ['advanced', 'prestudy'])
  assert.equal(bandsContaining(85, 'en_ko').length, 0)
  const cuts = VOCABULARY_DIFFICULTY_BANDS.filter((b) => b.direction === 'en_ko').map((b) => [b.level, b.min, b.max])
  assert.deepEqual(cuts, [['school', 1, 30], ['academy', 15, 45], ['advanced', 30, 60], ['prestudy', 45, 75]])
})
test('검수 메모: 이유/메모 둘 다 없으면 만들지 않는다', () => {
  assert.equal(reviewNoteText(null, ''), null)
  assert.equal(reviewNoteText('too_easy', null), '너무 쉬움')
  assert.equal(reviewNoteText('polysemy', ' 문맥 필요 '), '다의어 문제 · 문맥 필요')
  assert.equal(reviewNoteText('unknown', 'x'), 'x')
  assert.ok(isReviewNoteRef(`${REVIEW_DONE_REF_PREFIX}2026-09-27T00:00:00Z`))
  assert.ok(isReviewNoteRef(`${REVIEW_NOTE_ONLY_REF_PREFIX}2026-09-27T00:00:00Z`))
  assert.ok(!isReviewNoteRef(SEED_SOURCE_REFS.middle))
})
const done = [{ source_ref: `${REVIEW_DONE_REF_PREFIX}t` }]
const noteOnly = [{ source_ref: `${REVIEW_NOTE_ONLY_REF_PREFIX}t` }]
test('저장 + 다음: 현재 뒤의 첫 미검수(검수 완료 기록 없음), 없으면 앞에서, 모두 끝나면 null', () => {
  const l = [
    { id: 'a', vocabulary_sources: [] },
    { id: 'b', vocabulary_sources: done },
    { id: 'c', vocabulary_sources: noteOnly }, // 수정 메모만 있으면 아직 미검수
    { id: 'd', vocabulary_sources: [] },
  ]
  assert.equal(nextUnreviewedId(l, 'a'), 'c')
  assert.equal(nextUnreviewedId(l, 'd'), 'a')
  assert.equal(nextUnreviewedId([{ id: 'a', vocabulary_sources: [] }], 'a'), null)
})
test('수정함 ≠ 검수 완료: teacher_reviewed_at 만 있으면 "수정함", teacher-review 기록이 있어야 "검수 완료"', () => {
  assert.equal(reviewState({ teacher_reviewed_at: null, vocabulary_sources: [] }), 'unreviewed')
  assert.equal(reviewState({ teacher_reviewed_at: '2026-09-27', vocabulary_sources: [] }), 'edited')
  assert.equal(reviewState({ teacher_reviewed_at: '2026-09-27', vocabulary_sources: noteOnly }), 'edited')
  assert.equal(reviewState({ teacher_reviewed_at: '2026-09-27', vocabulary_sources: done }), 'reviewed')
  assert.equal(isCalibrationReviewed({ vocabulary_sources: done }), true)
})
test('Calibration 전용 항목은 일반 자동시험 후보에서 제외, 다른 출처가 생기면 후보', () => {
  const floorOnly = { vocabulary_sources: [{ source_ref: SEED_SOURCE_REFS.floor }] }
  const ceilingReviewed = { vocabulary_sources: [{ source_ref: SEED_SOURCE_REFS.ceiling }, ...done] }
  const seed = { vocabulary_sources: [{ source_ref: SEED_SOURCE_REFS.middle }] }
  const both = { vocabulary_sources: [{ source_ref: SEED_SOURCE_REFS.floor }, { source_ref: 'passage-uuid' }] }
  const none = { vocabulary_sources: [] }
  assert.equal(isCalibrationOnly(floorOnly), true)
  assert.equal(isCalibrationOnly(ceilingReviewed), true) // 검수 기록은 출처가 아니다
  assert.equal(isCalibrationOnly(seed), false)
  assert.equal(isCalibrationOnly(both), false)
  assert.equal(isCalibrationOnly(none), false)
  assert.deepEqual(generalTestCandidates([floorOnly, seed, both, ceilingReviewed, none]), [seed, both, none])
})

// ── anchor seed 파일 점검 ──
type SeedEntry = Partial<VocabularyEntryInput> & { expression: string; meaning_ko: string; base_difficulty: number }
type SeedFile = { seed_id: string; source_rationale?: string; entries: SeedEntry[] }
const read = (f: string): SeedFile => JSON.parse(readFileSync(new URL(`../data/vocabulary/${f}`, import.meta.url), 'utf-8'))
const floor = read('bostons-calibration-floor-v1.json')
const ceiling = read('bostons-calibration-ceiling-v1.json')
const middle = read('bostons-teacher-seed-v1.json')
const asInput = (e: SeedEntry): VocabularyEntryInput => ({
  lemma: e.lemma ?? null, entry_type: e.entry_type ?? 'word', pos: e.pos ?? null, accepted_meanings: e.accepted_meanings ?? [],
  sense_note: e.sense_note ?? null, example_sentence: null, ko_en_difficulty: null, ko_en_allowed: e.ko_en_allowed ?? false,
  expression: e.expression, meaning_ko: e.meaning_ko, base_difficulty: e.base_difficulty,
  reject_reason: null, reject_note: null, teacher_reviewed_at: null, archived_at: null, deleted_at: null,
  status: 'approved', approval_origin: 'batch',
})

test('anchor 파일: 출처 id·공식어휘 아님 표시', () => {
  assert.equal(floor.seed_id, SEED_SOURCE_REFS.floor)
  assert.equal(ceiling.seed_id, SEED_SOURCE_REFS.ceiling)
  for (const f of [floor, ceiling]) {
    assert.ok(f.source_rationale?.includes('BostonS calibration anchor'))
    assert.ok(f.source_rationale?.includes('공식어휘 아님'))
  }
})
test('Floor anchor: 1~10, 기존 seed 의 1~10 과 합쳐 10~15개', () => {
  assert.ok(floor.entries.every((e) => e.base_difficulty >= 1 && e.base_difficulty <= 10))
  const total = floor.entries.length + middle.entries.filter((e) => e.base_difficulty <= 10).length
  assert.ok(total >= 10 && total <= 15, `Floor 합계 ${total}`)
})
test('Ceiling anchor: 20~30개, 85~100', () => {
  assert.ok(ceiling.entries.length >= 20 && ceiling.entries.length <= 30, `Ceiling ${ceiling.entries.length}`)
  assert.ok(ceiling.entries.every((e) => e.base_difficulty >= 85 && e.base_difficulty <= 100))
})
test('anchor 항목: 입력 검사 통과, 기존 seed 및 서로 간 완전중복 없음', () => {
  const all = [...middle.entries, ...floor.entries, ...ceiling.entries].map(asInput)
  for (const e of all) assert.deepEqual(validateEntryInput(e), [], e.expression)
  assert.deepEqual(findActiveDuplicates(all), [])
})
test('같은 철자 다른 뜻은 별도 항목·별도 난이도 (account for)', () => {
  const af = ceiling.entries.filter((e) => e.expression === 'account for')
  assert.equal(af.length, 2)
  assert.notEqual(af[0].meaning_ko, af[1].meaning_ko)
  assert.notEqual(af[0].base_difficulty, af[1].base_difficulty)
})

console.log(`\n모두 통과: ${passed}개`)
